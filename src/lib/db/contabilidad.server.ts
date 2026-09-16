// Contabilidad general sobre las tablas existentes del sistema:
//   gl_catalog                        -> catálogo de cuentas (jerárquico)
//   gl_entry                          -> cabecera del asiento
//   gl_entry_detail_has_gl_department -> líneas del asiento (con departamento)
//   diario                            -> libro diario / mayor consolidado
//   gl_entradas -> tipos de entrada, gl_status -> estados, gl_department -> deptos.
//
// El asiento manual se registra con entrada_id 901 (ENTRADA CONTABLE),
// kind 'N', status 'C' (contabilizado) y origen 'ED' en el diario.
// Multimoneda: la cabecera guarda la moneda y los importes del diario se
// registran en pesos usando la tasa capturada en el asiento.

import {
  round2,
  type AsientoContable,
  type CuentaCatalogo,
  type FiltroAsientos,
  type FiltroMayor,
  type LineaAsiento,
  type LineaBalance,
  type LineaMayor,
  type ListasContabilidad,
  type MayorGeneral,
  type Moneda,
  type NuevoAsiento,
  type OpcionId,
} from "@/lib/erp-types";
import { ejecutar, sql } from "./mysql.server";
import { usarMysql } from "./repo.server";

export const ENTRADA_CONTABLE = 901;
const ORIGEN_DIARIO = "ED";
const ENTIDAD = "1";
const FONDO = 1001;

const txt = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* -------------------------------- Listas -------------------------------- */

const LISTAS_DEMO: ListasContabilidad = {
  tipos: [
    { id: "901", nombre: "ENTRADA CONTABLE" },
    { id: "902", nombre: "ENTRADA CIERRE" },
  ],
  estados: [
    { id: "C", nombre: "CONTABILIZADO" },
    { id: "D", nombre: "DIFERIDO" },
  ],
  departamentos: [{ id: "1", nombre: "GENERAL" }],
  monedas: [{ id: "DOP", nombre: "PESOS DOMINICANOS", simbolo: "RD$" }],
  cuentas: [
    { cuenta: "11100102", nombre: "CAJA GENERAL MONEDA LOCAL", nivel: 5, naturaleza: "D", detalle: true },
    { cuenta: "1120101", nombre: "CUENTAS POR COBRAR CLIENTES", nivel: 5, naturaleza: "D", detalle: true },
  ],
};

export async function listasContabilidad(): Promise<ListasContabilidad> {
  if (!(await usarMysql())) return LISTAS_DEMO;

  const [tipos, estados, departamentos, monedas, cuentas] = await Promise.all([
    sql<Record<string, unknown>>(
      `SELECT entrada_id AS id, name FROM gl_entradas WHERE entrada_id >= 900 ORDER BY entrada_id`,
    ),
    sql<Record<string, unknown>>(`SELECT status_id AS id, name FROM gl_status ORDER BY status_id`),
    sql<Record<string, unknown>>(`SELECT department_id AS id, name FROM gl_department ORDER BY name`),
    sql<Record<string, unknown>>(
      `SELECT currency_id AS id, name AS nombre, symbol AS simbolo
       FROM currencies WHERE currency_id <> '000' ORDER BY currency_id`,
    ),
    cuentasDetalle(),
  ]);

  const opcion = (f: Record<string, unknown>): OpcionId => ({
    id: txt(f["id"]),
    nombre: txt(f["name"]),
  });

  return {
    tipos: tipos.map(opcion),
    estados: estados.map(opcion),
    departamentos: departamentos.map(opcion),
    monedas: monedas.map(
      (f): Moneda => ({
        id: txt(f["id"]),
        nombre: txt(f["nombre"]),
        simbolo: txt(f["simbolo"]),
      }),
    ),
    cuentas,
  };
}

/** Cuentas que reciben movimiento: las que no tienen cuentas hijas. */
async function cuentasDetalle(): Promise<CuentaCatalogo[]> {
  const filas = await sql<Record<string, unknown>>(
    `SELECT c.catalog_account AS cuenta, c.name AS nombre, c.level AS nivel,
            COALESCE(c.nature,'D') AS naturaleza, COALESCE(k.name,'') AS clasificacion,
            COALESCE(c.currency_id,'') AS moneda
     FROM gl_catalog c
     LEFT JOIN gl_kinds k ON k.gl_kind_id = c.gl_kind_id
     WHERE NOT EXISTS (SELECT 1 FROM gl_catalog h WHERE h.parent_account = c.catalog_account)
     ORDER BY c.catalog_account`,
  );
  return filas.map(mapearCuenta);
}

function mapearCuenta(f: Record<string, unknown>): CuentaCatalogo {
  return {
    cuenta: txt(f["cuenta"]),
    nombre: txt(f["nombre"]),
    nivel: num(f["nivel"]),
    naturaleza: txt(f["naturaleza"]) === "C" ? "C" : "D",
    detalle: true,
    padre: txt(f["padre"]) || undefined,
    clasificacion: txt(f["clasificacion"]) || undefined,
    moneda: txt(f["moneda"]) || undefined,
  };
}

/** Catálogo completo de cuentas (todos los niveles). */
export async function listarCatalogo(busqueda?: string): Promise<CuentaCatalogo[]> {
  if (!(await usarMysql())) return LISTAS_DEMO.cuentas;
  const params: unknown[] = [];
  let cond = "1=1";
  if (busqueda && busqueda.trim()) {
    cond = "(c.catalog_account LIKE ? OR c.name LIKE ?)";
    params.push(`%${busqueda.trim()}%`, `%${busqueda.trim()}%`);
  }
  const filas = await sql<Record<string, unknown>>(
    `SELECT c.catalog_account AS cuenta, c.name AS nombre, c.level AS nivel,
            COALESCE(c.parent_account,'') AS padre, COALESCE(c.nature,'D') AS naturaleza,
            COALESCE(k.name,'') AS clasificacion, COALESCE(c.currency_id,'') AS moneda,
            (SELECT COUNT(*) FROM gl_catalog h WHERE h.parent_account = c.catalog_account) AS hijas
     FROM gl_catalog c
     LEFT JOIN gl_kinds k ON k.gl_kind_id = c.gl_kind_id
     WHERE ${cond}
     ORDER BY c.catalog_account
     LIMIT 1000`,
    params,
  );
  return filas.map((f) => ({ ...mapearCuenta(f), detalle: num(f["hijas"]) === 0 }));
}

/* ------------------------------- Asientos -------------------------------- */

export async function listarAsientos(filtro: FiltroAsientos): Promise<AsientoContable[]> {
  if (!(await usarMysql())) return [];
  const cond: string[] = ["1=1"];
  const params: unknown[] = [];
  if (filtro.desde) {
    cond.push("e.date >= ?");
    params.push(filtro.desde);
  }
  if (filtro.hasta) {
    cond.push("e.date <= ?");
    params.push(filtro.hasta);
  }
  if (filtro.tipoId) {
    cond.push("e.entrada_id = ?");
    params.push(Number(filtro.tipoId));
  }
  if (filtro.estadoId) {
    cond.push("e.status_id = ?");
    params.push(filtro.estadoId);
  }
  if (filtro.busqueda && filtro.busqueda.trim()) {
    cond.push("(e.description LIKE ? OR e.number = ?)");
    params.push(`%${filtro.busqueda.trim()}%`, Number(filtro.busqueda.trim()) || 0);
  }

  const filas = await sql<Record<string, unknown>>(
    `SELECT e.entry_id AS id, e.number AS numero, e.fiscal_year AS ano,
            DATE_FORMAT(e.date, '%Y-%m-%d') AS fecha,
            COALESCE(e.description,'') AS descripcion,
            COALESCE(e.kind,'N') AS clase, e.status_id AS estado_id,
            COALESCE(s.name,'') AS estado, e.entrada_id AS tipo_id,
            COALESCE(t.name,'') AS tipo, COALESCE(e.currency_id,'DOP') AS moneda,
            COALESCE((SELECT SUM(d.debit) FROM gl_entry_detail_has_gl_department d
                      WHERE d.entry_id = e.entry_id), 0) AS debito,
            COALESCE((SELECT SUM(d.credit) FROM gl_entry_detail_has_gl_department d
                      WHERE d.entry_id = e.entry_id), 0) AS credito
     FROM gl_entry e
     LEFT JOIN gl_status s ON s.status_id = e.status_id
     LEFT JOIN gl_entradas t ON t.entrada_id = e.entrada_id
     WHERE ${cond.join(" AND ")}
     ORDER BY e.date DESC, e.entry_id DESC
     LIMIT 500`,
    params,
  );

  return filas.map((f) => ({
    id: num(f["id"]),
    numero: num(f["numero"]),
    ano: num(f["ano"]),
    fecha: txt(f["fecha"]),
    descripcion: txt(f["descripcion"]),
    clase: txt(f["clase"]) || "N",
    estado_id: txt(f["estado_id"]),
    estado: txt(f["estado"]),
    tipo_id: txt(f["tipo_id"]),
    tipo: txt(f["tipo"]),
    moneda: txt(f["moneda"]) || "DOP",
    debito: round2(num(f["debito"])),
    credito: round2(num(f["credito"])),
    lineas: [],
  }));
}

export async function obtenerAsiento(id: number): Promise<AsientoContable | null> {
  if (!(await usarMysql())) return null;
  const cabeceras = await listarAsientosPorId(id);
  const cabecera = cabeceras[0];
  if (!cabecera) return null;
  const filas = await sql<Record<string, unknown>>(
    `SELECT d.NMID AS id, d.catalog_account AS cuenta, COALESCE(c.name,'') AS cuenta_nombre,
            d.department_id AS departamento_id, COALESCE(g.name,'') AS departamento,
            COALESCE(d.subject,'') AS descripcion, COALESCE(d.reference,'') AS referencia,
            COALESCE(d.debit,0) AS debito, COALESCE(d.credit,0) AS credito
     FROM gl_entry_detail_has_gl_department d
     LEFT JOIN gl_catalog c ON c.catalog_account = d.catalog_account
     LEFT JOIN gl_department g ON g.department_id = d.department_id
     WHERE d.entry_id = ?
     ORDER BY d.NMID`,
    [id],
  );
  const lineas: LineaAsiento[] = filas.map((f) => ({
    cuenta: txt(f["cuenta"]),
    cuenta_nombre: txt(f["cuenta_nombre"]),
    departamento_id: txt(f["departamento_id"]),
    departamento: txt(f["departamento"]),
    descripcion: txt(f["descripcion"]),
    referencia: txt(f["referencia"]),
    debito: round2(num(f["debito"])),
    credito: round2(num(f["credito"])),
  }));
  return { ...cabecera, lineas };
}

async function listarAsientosPorId(id: number): Promise<AsientoContable[]> {
  const filas = await sql<Record<string, unknown>>(
    `SELECT e.entry_id AS id, e.number AS numero, e.fiscal_year AS ano,
            DATE_FORMAT(e.date, '%Y-%m-%d') AS fecha,
            COALESCE(e.description,'') AS descripcion, COALESCE(e.kind,'N') AS clase,
            e.status_id AS estado_id, COALESCE(s.name,'') AS estado,
            e.entrada_id AS tipo_id, COALESCE(t.name,'') AS tipo,
            COALESCE(e.currency_id,'DOP') AS moneda
     FROM gl_entry e
     LEFT JOIN gl_status s ON s.status_id = e.status_id
     LEFT JOIN gl_entradas t ON t.entrada_id = e.entrada_id
     WHERE e.entry_id = ?`,
    [id],
  );
  return filas.map((f) => ({
    id: num(f["id"]),
    numero: num(f["numero"]),
    ano: num(f["ano"]),
    fecha: txt(f["fecha"]),
    descripcion: txt(f["descripcion"]),
    clase: txt(f["clase"]) || "N",
    estado_id: txt(f["estado_id"]),
    estado: txt(f["estado"]),
    tipo_id: txt(f["tipo_id"]),
    tipo: txt(f["tipo"]),
    moneda: txt(f["moneda"]) || "DOP",
    debito: 0,
    credito: 0,
    lineas: [],
  }));
}

/** Registra el asiento en gl_entry + detalle + diario. Debe estar cuadrado. */
export async function crearAsiento(entrada: NuevoAsiento): Promise<{ id: number; numero: number }> {
  if (!(await usarMysql()))
    throw new Error("Sin conexión a la base de datos: no se puede registrar el asiento.");

  const tasa = entrada.tasa_cambio && entrada.tasa_cambio > 0 ? entrada.tasa_cambio : 1;
  const lineas = entrada.lineas
    .filter((l) => l.cuenta && (l.debito > 0 || l.credito > 0))
    .map((l) => ({
      ...l,
      debito: round2(l.debito * tasa),
      credito: round2(l.credito * tasa),
    }));
  if (lineas.length < 2) throw new Error("El asiento necesita al menos dos líneas.");

  const debito = round2(lineas.reduce((a, l) => a + l.debito, 0));
  const credito = round2(lineas.reduce((a, l) => a + l.credito, 0));
  if (Math.abs(debito - credito) > 0.01)
    throw new Error(
      `El asiento no está cuadrado: débito ${debito.toFixed(2)} vs. crédito ${credito.toFixed(2)}.`,
    );

  const cuentas = await sql<Record<string, unknown>>(
    `SELECT catalog_account FROM gl_catalog
     WHERE catalog_account IN (${lineas.map(() => "?").join(",")})`,
    lineas.map((l) => l.cuenta),
  );
  const validas = new Set(cuentas.map((c) => txt(c["catalog_account"])));
  for (const l of lineas)
    if (!validas.has(l.cuenta)) throw new Error(`La cuenta ${l.cuenta} no existe en el catálogo.`);

  const maximos = await sql<Record<string, unknown>>(
    `SELECT COALESCE(MAX(number),0) + 1 AS numero FROM gl_entry`,
  );
  const numero = num(maximos[0]?.["numero"]) || 1;
  const ano = Number(entrada.fecha.slice(0, 4));
  const tipoId = Number(entrada.tipo_id || ENTRADA_CONTABLE);
  const estado = entrada.estado_id || "C";

  const cabecera = await ejecutar(
    `INSERT INTO gl_entry
       (fiscal_year, date, collection_date, number, description, kind, status_id,
        user_id, currency_id, entrada_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    [
      ano,
      entrada.fecha,
      entrada.fecha,
      numero,
      entrada.descripcion.slice(0, 255),
      entrada.clase || "N",
      estado,
      entrada.moneda || "DOP",
      tipoId,
    ],
  );
  const entryId = cabecera.insertId;

  for (const l of lineas) {
    const departamento = l.departamento_id ? Number(l.departamento_id) : null;
    await ejecutar(
      `INSERT INTO gl_entry_detail_has_gl_department
         (gl_entry_detail_id, subject, reference, entry_id, catalog_account,
          department_id, percentage, debit, credit)
       VALUES (0, ?, ?, ?, ?, ?, 100, ?, ?)`,
      [
        (l.descripcion || entrada.descripcion).slice(0, 255),
        (l.referencia || "").slice(0, 50) || null,
        entryId,
        l.cuenta,
        departamento,
        l.debito,
        l.credito,
      ],
    );
    await ejecutar(
      `INSERT INTO diario
         (entry_id, status_id, entidad, fondo, department_id, catalog_account, percentage,
          documento, fecha, time, descripcion, operacion, concepto, debit, credit,
          origen, entrada_id, id, id_number, suplidor)
       VALUES (?, ?, ?, ?, ?, ?, 100, ?, ?, CURTIME(), ?, 'ENTRADA DIARIO', ?, ?, ?, ?, ?, '0', 0, 0)`,
      [
        entryId,
        estado,
        ENTIDAD,
        FONDO,
        departamento,
        l.cuenta,
        (entrada.documento ?? "").slice(0, 20),
        entrada.fecha,
        (l.descripcion || entrada.descripcion).slice(0, 60),
        entrada.descripcion.slice(0, 500),
        l.debito,
        l.credito,
        ORIGEN_DIARIO,
        tipoId,
      ],
    );
  }

  return { id: entryId, numero };
}

/* ----------------------------- Mayor general ----------------------------- */

export async function mayorGeneral(filtro: FiltroMayor): Promise<MayorGeneral> {
  const vacio: MayorGeneral = {
    cuenta: filtro.cuenta,
    cuenta_nombre: "",
    saldo_anterior: 0,
    debito: 0,
    credito: 0,
    saldo: 0,
    movimientos: [],
  };
  if (!(await usarMysql()) || !filtro.cuenta) return vacio;

  const cuentas = await sql<Record<string, unknown>>(
    `SELECT name, COALESCE(nature,'D') AS naturaleza FROM gl_catalog WHERE catalog_account = ?`,
    [filtro.cuenta],
  );
  const nombre = txt(cuentas[0]?.["name"]);

  const previos = filtro.desde
    ? await sql<Record<string, unknown>>(
        `SELECT COALESCE(SUM(debit),0) AS debito, COALESCE(SUM(credit),0) AS credito
         FROM diario WHERE catalog_account = ? AND fecha < ?`,
        [filtro.cuenta, filtro.desde],
      )
    : [];
  const saldoAnterior = round2(num(previos[0]?.["debito"]) - num(previos[0]?.["credito"]));

  const cond: string[] = ["d.catalog_account = ?"];
  const params: unknown[] = [filtro.cuenta];
  if (filtro.desde) {
    cond.push("d.fecha >= ?");
    params.push(filtro.desde);
  }
  if (filtro.hasta) {
    cond.push("d.fecha <= ?");
    params.push(filtro.hasta);
  }
  if (filtro.departamentoId) {
    cond.push("d.department_id = ?");
    params.push(Number(filtro.departamentoId));
  }

  const filas = await sql<Record<string, unknown>>(
    `SELECT d.nmid AS id, DATE_FORMAT(d.fecha, '%Y-%m-%d') AS fecha, d.entry_id AS asiento_id,
            COALESCE(d.documento,'') AS documento, COALESCE(d.descripcion,'') AS descripcion,
            COALESCE(d.operacion,'') AS operacion, COALESCE(d.origen,'') AS origen,
            COALESCE(d.debit,0) AS debito, COALESCE(d.credit,0) AS credito,
            d.department_id AS departamento_id, COALESCE(g.name,'') AS departamento
     FROM diario d
     LEFT JOIN gl_department g ON g.department_id = d.department_id
     WHERE ${cond.join(" AND ")}
     ORDER BY d.fecha, d.nmid
     LIMIT 2000`,
    params,
  );

  let saldo = saldoAnterior;
  const movimientos: LineaMayor[] = filas.map((f) => {
    const debito = round2(num(f["debito"]));
    const credito = round2(num(f["credito"]));
    saldo = round2(saldo + debito - credito);
    return {
      id: num(f["id"]),
      fecha: txt(f["fecha"]),
      asiento_id: num(f["asiento_id"]),
      documento: txt(f["documento"]),
      descripcion: txt(f["descripcion"]),
      operacion: txt(f["operacion"]),
      origen: txt(f["origen"]),
      departamento: txt(f["departamento"]),
      debito,
      credito,
      saldo,
    };
  });

  return {
    cuenta: filtro.cuenta,
    cuenta_nombre: nombre,
    saldo_anterior: saldoAnterior,
    debito: round2(movimientos.reduce((a, m) => a + m.debito, 0)),
    credito: round2(movimientos.reduce((a, m) => a + m.credito, 0)),
    saldo,
    movimientos,
  };
}

/* ------------------------ Balance de comprobación ------------------------ */

export async function balanceComprobacion(filtro: {
  desde?: string | undefined;
  hasta?: string | undefined;
  departamentoId?: string | undefined;
}): Promise<LineaBalance[]> {
  if (!(await usarMysql())) return [];
  const cond: string[] = ["1=1"];
  const params: unknown[] = [];
  if (filtro.desde) {
    cond.push("d.fecha >= ?");
    params.push(filtro.desde);
  }
  if (filtro.hasta) {
    cond.push("d.fecha <= ?");
    params.push(filtro.hasta);
  }
  if (filtro.departamentoId) {
    cond.push("d.department_id = ?");
    params.push(Number(filtro.departamentoId));
  }

  const anterior = filtro.desde
    ? await sql<Record<string, unknown>>(
        `SELECT catalog_account AS cuenta,
                COALESCE(SUM(debit),0) - COALESCE(SUM(credit),0) AS saldo
         FROM diario WHERE fecha < ? GROUP BY catalog_account`,
        [filtro.desde],
      )
    : [];
  const saldosAnteriores = new Map<string, number>(
    anterior.map((f) => [txt(f["cuenta"]), round2(num(f["saldo"]))]),
  );

  const filas = await sql<Record<string, unknown>>(
    `SELECT d.catalog_account AS cuenta, COALESCE(c.name,'') AS nombre,
            COALESCE(SUM(d.debit),0) AS debito, COALESCE(SUM(d.credit),0) AS credito
     FROM diario d
     LEFT JOIN gl_catalog c ON c.catalog_account = d.catalog_account
     WHERE ${cond.join(" AND ")}
     GROUP BY d.catalog_account, c.name
     HAVING SUM(d.debit) <> 0 OR SUM(d.credit) <> 0
     ORDER BY d.catalog_account
     LIMIT 1000`,
    params,
  );

  return filas.map((f) => {
    const cuenta = txt(f["cuenta"]);
    const debito = round2(num(f["debito"]));
    const credito = round2(num(f["credito"]));
    const anteriorSaldo = saldosAnteriores.get(cuenta) ?? 0;
    return {
      cuenta,
      nombre: txt(f["nombre"]),
      saldo_anterior: anteriorSaldo,
      debito,
      credito,
      saldo: round2(anteriorSaldo + debito - credito),
    };
  });
}
