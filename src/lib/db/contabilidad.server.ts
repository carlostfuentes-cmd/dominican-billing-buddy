// Contabilidad general sobre la estructura recomendada (ver db/gl-schema.sql):
//   gl_accounts        -> catálogo de cuentas (nivel, naturaleza, detalle)
//   gl_periods         -> períodos contables (abierto / cerrado)
//   gl_journal         -> cabecera del asiento (moneda, tasa, totales, estado)
//   gl_journal_detail  -> líneas del asiento (débito/crédito + equivalente DOP)
//
// El histórico de `diario` fue migrado a gl_journal/gl_journal_detail. Los
// asientos nuevos se guardan en la estructura nueva y se reflejan también en
// `diario` para que los reportes del sistema anterior sigan cuadrando.
//
// Multimoneda: la cabecera guarda moneda y tasa; cada línea guarda el importe
// en la moneda del asiento y su equivalente en pesos (amount_dop).

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
const estadoDe = (posted: unknown, anulado: unknown): { id: string; nombre: string } =>
  num(anulado) === 1
    ? { id: "X", nombre: "ANULADO" }
    : num(posted) === 1
      ? { id: "C", nombre: "CONTABILIZADO" }
      : { id: "D", nombre: "DIFERIDO" };

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

  const [tipos, departamentos, monedas, cuentas] = await Promise.all([
    sql<Record<string, unknown>>(
      `SELECT entrada_id AS id, name FROM gl_entradas WHERE entrada_id >= 900 ORDER BY entrada_id`,
    ),
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
    estados: [
      { id: "C", nombre: "CONTABILIZADO" },
      { id: "D", nombre: "DIFERIDO" },
      { id: "X", nombre: "ANULADO" },
    ],
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

/** Cuentas que reciben movimiento (is_detail = 1). */
async function cuentasDetalle(): Promise<CuentaCatalogo[]> {
  const filas = await sql<Record<string, unknown>>(
    `SELECT account AS cuenta, name AS nombre, level AS nivel, nature AS naturaleza,
            kind AS clasificacion, COALESCE(currency,'') AS moneda,
            COALESCE(parent_account,'') AS padre, is_detail AS detalle
     FROM gl_accounts
     WHERE is_detail = 1 AND status = 'A'
     ORDER BY account`,
  );
  return filas.map(mapearCuenta);
}

function mapearCuenta(f: Record<string, unknown>): CuentaCatalogo {
  return {
    cuenta: txt(f["cuenta"]),
    nombre: txt(f["nombre"]),
    nivel: num(f["nivel"]),
    naturaleza: txt(f["naturaleza"]) === "C" ? "C" : "D",
    detalle: num(f["detalle"]) === 1,
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
    cond = "(account LIKE ? OR name LIKE ?)";
    params.push(`%${busqueda.trim()}%`, `%${busqueda.trim()}%`);
  }
  const filas = await sql<Record<string, unknown>>(
    `SELECT account AS cuenta, name AS nombre, level AS nivel, nature AS naturaleza,
            kind AS clasificacion, COALESCE(currency,'') AS moneda,
            COALESCE(parent_account,'') AS padre, is_detail AS detalle
     FROM gl_accounts
     WHERE ${cond}
     ORDER BY account
     LIMIT 1000`,
    params,
  );
  return filas.map(mapearCuenta);
}

/* ------------------------------- Períodos -------------------------------- */

/** Verifica que la fecha caiga en un período abierto. */
async function periodoAbierto(fecha: string): Promise<boolean> {
  const filas = await sql<Record<string, unknown>>(
    `SELECT status FROM gl_periods WHERE year = ? AND month = ?`,
    [Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7))],
  );
  const estado = txt(filas[0]?.["status"]);
  return estado === "" || estado === "ABIERTO";
}

/* ------------------------------- Asientos -------------------------------- */

const SELECT_CABECERA = `
  SELECT j.journal_id AS id, j.entry_no AS numero, j.year AS ano,
         DATE_FORMAT(j.date, '%Y-%m-%d') AS fecha,
         COALESCE(j.description,'') AS descripcion, COALESCE(j.kind,'N') AS clase,
         j.posted, j.void, COALESCE(j.entry_kind_id, 901) AS tipo_id,
         COALESCE(t.name,'') AS tipo, COALESCE(j.currency,'DOP') AS moneda,
         COALESCE(j.exchange_rate,1) AS tasa, COALESCE(j.source_app,'') AS origen,
         COALESCE(j.document,'') AS documento,
         COALESCE(j.total_debit,0) AS debito, COALESCE(j.total_credit,0) AS credito
  FROM gl_journal j
  LEFT JOIN gl_entradas t ON t.entrada_id = j.entry_kind_id`;

function mapearCabecera(f: Record<string, unknown>): AsientoContable {
  const estado = estadoDe(f["posted"], f["void"]);
  return {
    id: num(f["id"]),
    numero: num(f["numero"]),
    ano: num(f["ano"]),
    fecha: txt(f["fecha"]),
    descripcion: txt(f["descripcion"]),
    clase: txt(f["clase"]) || "N",
    estado_id: estado.id,
    estado: estado.nombre,
    tipo_id: txt(f["tipo_id"]),
    tipo: txt(f["tipo"]) || txt(f["origen"]),
    moneda: txt(f["moneda"]) || "DOP",
    debito: round2(num(f["debito"])),
    credito: round2(num(f["credito"])),
    lineas: [],
  };
}

export async function listarAsientos(filtro: FiltroAsientos): Promise<AsientoContable[]> {
  if (!(await usarMysql())) return [];
  const cond: string[] = ["1=1"];
  const params: unknown[] = [];
  if (filtro.desde) {
    cond.push("j.date >= ?");
    params.push(filtro.desde);
  }
  if (filtro.hasta) {
    cond.push("j.date <= ?");
    params.push(filtro.hasta);
  }
  if (filtro.tipoId) {
    cond.push("j.entry_kind_id = ?");
    params.push(Number(filtro.tipoId));
  }
  if (filtro.estadoId === "C") cond.push("j.posted = 1 AND j.void = 0");
  if (filtro.estadoId === "D") cond.push("j.posted = 0 AND j.void = 0");
  if (filtro.estadoId === "X") cond.push("j.void = 1");
  if (filtro.busqueda && filtro.busqueda.trim()) {
    cond.push("(j.description LIKE ? OR j.document LIKE ? OR j.entry_no = ?)");
    params.push(
      `%${filtro.busqueda.trim()}%`,
      `%${filtro.busqueda.trim()}%`,
      Number(filtro.busqueda.trim()) || 0,
    );
  }

  const filas = await sql<Record<string, unknown>>(
    `${SELECT_CABECERA}
     WHERE ${cond.join(" AND ")}
     ORDER BY j.date DESC, j.journal_id DESC
     LIMIT 500`,
    params,
  );
  return filas.map(mapearCabecera);
}

export async function obtenerAsiento(id: number): Promise<AsientoContable | null> {
  if (!(await usarMysql())) return null;
  const cabeceras = await sql<Record<string, unknown>>(
    `${SELECT_CABECERA} WHERE j.journal_id = ?`,
    [id],
  );
  const primera = cabeceras[0];
  if (!primera) return null;
  const cabecera = mapearCabecera(primera);

  const filas = await sql<Record<string, unknown>>(
    `SELECT d.account AS cuenta, COALESCE(c.name,'') AS cuenta_nombre,
            d.department_id AS departamento_id, COALESCE(g.name,'') AS departamento,
            COALESCE(d.description,'') AS descripcion, COALESCE(d.reference,'') AS referencia,
            COALESCE(d.debit,0) AS debito, COALESCE(d.credit,0) AS credito
     FROM gl_journal_detail d
     LEFT JOIN gl_accounts c ON c.account = d.account
     LEFT JOIN gl_department g ON g.department_id = d.department_id
     WHERE d.journal_id = ?
     ORDER BY d.line_no, d.journal_detail_id`,
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

/** Registra el asiento en gl_journal + gl_journal_detail (y lo refleja en `diario`). */
export async function crearAsiento(entrada: NuevoAsiento): Promise<{ id: number; numero: number }> {
  if (!(await usarMysql()))
    throw new Error("Sin conexión a la base de datos: no se puede registrar el asiento.");

  const tasa = entrada.tasa_cambio && entrada.tasa_cambio > 0 ? entrada.tasa_cambio : 1;
  const lineas = entrada.lineas.filter((l) => l.cuenta && (l.debito > 0 || l.credito > 0));
  if (lineas.length < 2) throw new Error("El asiento necesita al menos dos líneas.");

  const debito = round2(lineas.reduce((a, l) => a + l.debito, 0));
  const credito = round2(lineas.reduce((a, l) => a + l.credito, 0));
  if (Math.abs(debito - credito) > 0.01)
    throw new Error(
      `El asiento no está cuadrado: débito ${debito.toFixed(2)} vs. crédito ${credito.toFixed(2)}.`,
    );

  if (!(await periodoAbierto(entrada.fecha)))
    throw new Error("El período contable de esa fecha está cerrado.");

  const cuentas = await sql<Record<string, unknown>>(
    `SELECT account, is_detail FROM gl_accounts
     WHERE account IN (${lineas.map(() => "?").join(",")})`,
    lineas.map((l) => l.cuenta),
  );
  const validas = new Map(cuentas.map((c) => [txt(c["account"]), num(c["is_detail"])]));
  for (const l of lineas) {
    const detalle = validas.get(l.cuenta);
    if (detalle === undefined) throw new Error(`La cuenta ${l.cuenta} no existe en el catálogo.`);
    if (detalle !== 1)
      throw new Error(`La cuenta ${l.cuenta} es de agrupación: no recibe movimientos.`);
  }

  const ano = Number(entrada.fecha.slice(0, 4));
  const mes = Number(entrada.fecha.slice(5, 7));
  const maximos = await sql<Record<string, unknown>>(
    `SELECT COALESCE(MAX(entry_no),0) + 1 AS numero FROM gl_journal WHERE year = ?`,
    [ano],
  );
  const numero = num(maximos[0]?.["numero"]) || 1;
  const tipoId = Number(entrada.tipo_id || ENTRADA_CONTABLE);
  const contabilizado = (entrada.estado_id || "C") === "C" ? 1 : 0;
  const departamentoCabecera = lineas.find((l) => l.departamento_id)?.departamento_id;

  const cabecera = await ejecutar(
    `INSERT INTO gl_journal
       (entry_no, date, year, month, source_app, document, kind, description, currency,
        exchange_rate, total_debit, total_credit, department_id, entry_kind_id,
        posted, void, created_at, posted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())`,
    [
      numero,
      entrada.fecha,
      ano,
      mes,
      ORIGEN_DIARIO,
      (entrada.documento ?? "").slice(0, 30) || null,
      entrada.clase || "N",
      entrada.descripcion.slice(0, 500),
      entrada.moneda || "DOP",
      tasa,
      debito,
      credito,
      departamentoCabecera ? Number(departamentoCabecera) : null,
      tipoId,
      contabilizado,
    ],
  );
  const journalId = cabecera.insertId;

  let linea = 0;
  for (const l of lineas) {
    linea += 1;
    const departamento = l.departamento_id ? Number(l.departamento_id) : null;
    const debitoDop = round2(l.debito * tasa);
    const creditoDop = round2(l.credito * tasa);
    const descripcion = (l.descripcion || entrada.descripcion).slice(0, 255);

    await ejecutar(
      `INSERT INTO gl_journal_detail
         (journal_id, line_no, account, debit, credit, amount_dop, description, reference,
          department_id, document, date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        journalId,
        linea,
        l.cuenta,
        round2(l.debito),
        round2(l.credito),
        round2(debitoDop - creditoDop),
        descripcion,
        (l.referencia || "").slice(0, 50) || null,
        departamento,
        (entrada.documento ?? "").slice(0, 30) || null,
        entrada.fecha,
      ],
    );

    // Reflejo en el libro anterior, en pesos, para no romper reportes heredados.
    await ejecutar(
      `INSERT INTO diario
         (entry_id, status_id, entidad, fondo, department_id, catalog_account, percentage,
          documento, fecha, time, descripcion, operacion, concepto, debit, credit,
          origen, entrada_id, id, id_number, suplidor)
       VALUES (?, ?, ?, ?, ?, ?, 100, ?, ?, CURTIME(), ?, 'ENTRADA DIARIO', ?, ?, ?, ?, ?, '0', 0, 0)`,
      [
        journalId,
        contabilizado === 1 ? "C" : "D",
        ENTIDAD,
        FONDO,
        departamento,
        l.cuenta,
        (entrada.documento ?? "").slice(0, 20),
        entrada.fecha,
        descripcion.slice(0, 60),
        entrada.descripcion.slice(0, 500),
        debitoDop,
        creditoDop,
        ORIGEN_DIARIO,
        tipoId,
      ],
    );
  }

  return { id: journalId, numero };
}

/** Anula un asiento (no se borra ni se edita el histórico). */
export async function anularAsiento(id: number): Promise<void> {
  if (!(await usarMysql())) throw new Error("Sin conexión a la base de datos.");
  await ejecutar(`UPDATE gl_journal SET void = 1, posted = 0 WHERE journal_id = ?`, [id]);
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
    `SELECT name FROM gl_accounts WHERE account = ?`,
    [filtro.cuenta],
  );
  const nombre = txt(cuentas[0]?.["name"]);

  const previos = filtro.desde
    ? await sql<Record<string, unknown>>(
        `SELECT COALESCE(SUM(d.debit),0) AS debito, COALESCE(SUM(d.credit),0) AS credito
         FROM gl_journal_detail d
         JOIN gl_journal j ON j.journal_id = d.journal_id AND j.void = 0
         WHERE d.account = ? AND j.date < ?`,
        [filtro.cuenta, filtro.desde],
      )
    : [];
  const saldoAnterior = round2(num(previos[0]?.["debito"]) - num(previos[0]?.["credito"]));

  const cond: string[] = ["d.account = ?", "j.void = 0"];
  const params: unknown[] = [filtro.cuenta];
  if (filtro.desde) {
    cond.push("j.date >= ?");
    params.push(filtro.desde);
  }
  if (filtro.hasta) {
    cond.push("j.date <= ?");
    params.push(filtro.hasta);
  }
  if (filtro.departamentoId) {
    cond.push("d.department_id = ?");
    params.push(Number(filtro.departamentoId));
  }

  const filas = await sql<Record<string, unknown>>(
    `SELECT d.journal_detail_id AS id, DATE_FORMAT(j.date, '%Y-%m-%d') AS fecha,
            j.journal_id AS asiento_id, COALESCE(j.document,'') AS documento,
            COALESCE(d.description,'') AS descripcion, COALESCE(d.reference,'') AS operacion,
            COALESCE(j.source_app,'') AS origen, COALESCE(d.debit,0) AS debito,
            COALESCE(d.credit,0) AS credito, COALESCE(g.name,'') AS departamento
     FROM gl_journal_detail d
     JOIN gl_journal j ON j.journal_id = d.journal_id
     LEFT JOIN gl_department g ON g.department_id = d.department_id
     WHERE ${cond.join(" AND ")}
     ORDER BY j.date, d.journal_detail_id
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
  const cond: string[] = ["j.void = 0"];
  const params: unknown[] = [];
  if (filtro.desde) {
    cond.push("j.date >= ?");
    params.push(filtro.desde);
  }
  if (filtro.hasta) {
    cond.push("j.date <= ?");
    params.push(filtro.hasta);
  }
  if (filtro.departamentoId) {
    cond.push("d.department_id = ?");
    params.push(Number(filtro.departamentoId));
  }

  const anterior = filtro.desde
    ? await sql<Record<string, unknown>>(
        `SELECT d.account AS cuenta,
                COALESCE(SUM(d.debit),0) - COALESCE(SUM(d.credit),0) AS saldo
         FROM gl_journal_detail d
         JOIN gl_journal j ON j.journal_id = d.journal_id AND j.void = 0
         WHERE j.date < ?
         GROUP BY d.account`,
        [filtro.desde],
      )
    : [];
  const saldosAnteriores = new Map<string, number>(
    anterior.map((f) => [txt(f["cuenta"]), round2(num(f["saldo"]))]),
  );

  const filas = await sql<Record<string, unknown>>(
    `SELECT d.account AS cuenta, COALESCE(c.name,'') AS nombre,
            COALESCE(SUM(d.debit),0) AS debito, COALESCE(SUM(d.credit),0) AS credito
     FROM gl_journal_detail d
     JOIN gl_journal j ON j.journal_id = d.journal_id
     LEFT JOIN gl_accounts c ON c.account = d.account
     WHERE ${cond.join(" AND ")}
     GROUP BY d.account, c.name
     HAVING SUM(d.debit) <> 0 OR SUM(d.credit) <> 0
     ORDER BY d.account
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
