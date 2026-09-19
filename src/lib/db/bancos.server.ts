// Bancos sobre las tablas existentes del sistema:
//   bank_kinds        -> tipos de cuenta bancaria
//   banks             -> maestra de caja y bancos
//   banks_book        -> cabecera de la operación bancaria
//   banks_book_detail -> asiento contable de la operación (gl_catalog)
//   bbd_has_gld       -> reparto del asiento por centro de costo (gl_department)
//   banks_book_entry  -> tipos de operación con su entrada contable
//   banks_concept     -> conceptos de cargos bancarios
//
// El sistema es multimoneda: la moneda la define la cuenta bancaria y cada
// operación guarda su tasa de cambio (banks_book.exchange).

import {
  round2,
  type AplicacionCxP,
  type ConceptoBancario,
  type CuentaBancaria,
  type DisponibilidadBanco,
  type FiltroBancos,
  type LineaAsiento,
  type ListasBancos,
  type MovimientoBanco,
  type NuevoMovimientoBanco,
  type PropuestaAsiento,
  type ResultadoMovimientoBanco,
  type TipoOperacionBanco,
} from "@/lib/erp-types";
import { CUENTA_CXP_SUPLIDORES, CUENTA_ITBIS_COMPRAS, cuentasSuplidor } from "./cuentas.server";
import { ejecutar, sql } from "./mysql.server";
import { usarMysql } from "./repo.server";

const txt = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Tipo de operación que mueve dinero hacia un suplidor. */
export const TIPOS_PAGO_SUPLIDOR = ["TS", "TC", "CP", "CB", "CK"];
/** Transferencia entre cuentas bancarias propias. */
export const TIPO_TRANSFERENCIA_BANCOS = "TB";
/** Movimiento espejo que se crea en el banco que recibe la transferencia. */
export const TIPO_TRANSFERENCIA_RECIBIDA = "TE";
/** Tipos de CxP: pago al suplidor y avance no aplicado. */
const AP_PAGO = "P";
const AP_AVANCE = "A";

/* -------------------------------- Maestras -------------------------------- */

const SQL_BANCOS = `
  SELECT b.bank_id AS id, b.name AS nombre, b.account AS numero_cuenta,
         COALESCE(b.short_name, '') AS nombre_corto, b.bank_kind_id AS tipo_id,
         COALESCE(k.name, '') AS tipo, COALESCE(b.officer, '') AS oficial,
         COALESCE(b.telephone, '') AS telefono, COALESCE(b.address, '') AS direccion,
         b.catalog_account AS cuenta_contable, COALESCE(c.name, '') AS cuenta_contable_nombre,
         b.currency_id AS moneda, b.branch_id AS sucursal_id,
         COALESCE(b.rnc, '') AS rnc, COALESCE(b.company_number, '') AS numero_empresa,
         b.status AS estatus, b.deposit_number AS ultimo_deposito,
         b.check_number AS ultimo_cheque, b.credit_number AS ultima_nota_credito,
         b.debit_number AS ultima_nota_debito, b.deposit_ck_limit AS limite_cheques,
         b.deposit_amount_limit AS limite_monto,
         COALESCE(b.credit_card_tax, 0) AS cargo_tc, COALESCE(b.tax, 0) AS itbis_tc
  FROM banks b
  LEFT JOIN bank_kinds k ON k.bank_kind_id = b.bank_kind_id
  LEFT JOIN gl_catalog c ON c.catalog_account = b.catalog_account
`;

function mapBanco(r: Record<string, unknown>): CuentaBancaria {
  return {
    id: txt(num(r["id"])),
    nombre: txt(r["nombre"]),
    numero_cuenta: txt(r["numero_cuenta"]),
    nombre_corto: txt(r["nombre_corto"]),
    tipo_id: txt(r["tipo_id"]),
    tipo: txt(r["tipo"]),
    oficial: txt(r["oficial"]),
    telefono: txt(r["telefono"]),
    direccion: txt(r["direccion"]),
    cuenta_contable: txt(r["cuenta_contable"]),
    cuenta_contable_nombre: txt(r["cuenta_contable_nombre"]),
    moneda: txt(r["moneda"]) || "DOP",
    sucursal_id: txt(num(r["sucursal_id"])),
    rnc: txt(r["rnc"]),
    numero_empresa: txt(r["numero_empresa"]),
    activa: txt(r["estatus"]) === "A",
    ultimo_deposito: num(r["ultimo_deposito"]),
    ultimo_cheque: num(r["ultimo_cheque"]),
    ultima_nota_credito: num(r["ultima_nota_credito"]),
    ultima_nota_debito: num(r["ultima_nota_debito"]),
    limite_cheques: num(r["limite_cheques"]),
    limite_monto: num(r["limite_monto"]),
    cargo_tc: num(r["cargo_tc"]),
    itbis_tc: num(r["itbis_tc"]),
  };
}

export async function listarCuentasBancarias(): Promise<CuentaBancaria[]> {
  if (!(await usarMysql())) return [];
  const filas = await sql<Record<string, unknown>>(`${SQL_BANCOS} ORDER BY b.bank_id`);
  return filas.map(mapBanco);
}

export async function guardarCuentaBancaria(c: CuentaBancaria): Promise<CuentaBancaria> {
  if (!(await usarMysql())) throw new Error("Sin conexión a la base de datos");
  const existe = c.id
    ? (await sql("SELECT bank_id FROM banks WHERE bank_id = ? LIMIT 1", [Number(c.id)])).length > 0
    : false;
  const id = existe
    ? Number(c.id)
    : num(
        (
          await sql<Record<string, unknown>>(
            "SELECT COALESCE(MAX(bank_id), 0) + 1 AS n FROM banks",
          )
        )[0]?.["n"],
      ) || 1;

  const valores = [
    c.nombre.slice(0, 50),
    c.numero_cuenta.slice(0, 25),
    c.direccion.slice(0, 30),
    c.telefono.slice(0, 20),
    c.oficial.slice(0, 30),
    c.nombre_corto.slice(0, 10),
    Math.max(0, Math.trunc(c.ultima_nota_debito)),
    Math.max(0, Math.trunc(c.ultima_nota_credito)),
    Math.max(0, Math.trunc(c.ultimo_deposito)),
    Math.max(0, Math.trunc(c.ultimo_cheque)),
    Math.max(0, Math.trunc(c.limite_cheques)),
    round2(Math.max(0, c.limite_monto)),
    round2(Math.max(0, c.cargo_tc)),
    round2(Math.max(0, c.itbis_tc)),
    c.activa ? "A" : "I",
    c.moneda || "DOP",
    c.cuenta_contable,
    c.tipo_id || "C",
    Number(c.sucursal_id || 1) || 1,
    c.rnc.slice(0, 15),
    c.numero_empresa.slice(0, 15),
  ];

  if (existe) {
    await ejecutar(
      `UPDATE banks SET name=?, account=?, address=?, telephone=?, officer=?, short_name=?,
         debit_number=?, credit_number=?, deposit_number=?, check_number=?,
         deposit_ck_limit=?, deposit_amount_limit=?, credit_card_tax=?, tax=?,
         status=?, currency_id=?, catalog_account=?, bank_kind_id=?, branch_id=?,
         rnc=?, company_number=?
       WHERE bank_id = ?`,
      [...valores, id],
    );
  } else {
    await ejecutar(
      `INSERT INTO banks
         (name, account, address, telephone, officer, short_name, debit_number,
          credit_number, deposit_number, check_number, deposit_ck_limit,
          deposit_amount_limit, credit_card_tax, tax, status, currency_id,
          catalog_account, bank_kind_id, branch_id, rnc, company_number, bank_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [...valores, id],
    );
  }
  const filas = await sql<Record<string, unknown>>(`${SQL_BANCOS} WHERE b.bank_id = ? LIMIT 1`, [
    id,
  ]);
  const f = filas[0];
  if (!f) throw new Error("No se pudo leer la cuenta bancaria guardada");
  return mapBanco(f);
}

export async function listarConceptosBancarios(): Promise<ConceptoBancario[]> {
  if (!(await usarMysql())) return [];
  const filas = await sql<Record<string, unknown>>(
    `SELECT c.concept_id AS id, c.name AS nombre,
            COALESCE(c.catalog_account, '') AS cuenta, COALESCE(g.name, '') AS cuenta_nombre
     FROM banks_concept c
     LEFT JOIN gl_catalog g ON g.catalog_account = c.catalog_account
     ORDER BY c.name`,
  );
  return filas.map((r) => ({
    id: txt(num(r["id"])),
    nombre: txt(r["nombre"]),
    cuenta: txt(r["cuenta"]),
    cuenta_nombre: txt(r["cuenta_nombre"]),
  }));
}

export async function guardarConceptoBancario(c: ConceptoBancario): Promise<void> {
  if (!(await usarMysql())) throw new Error("Sin conexión a la base de datos");
  if (c.id) {
    await ejecutar("UPDATE banks_concept SET name = ?, catalog_account = ? WHERE concept_id = ?", [
      c.nombre.slice(0, 50),
      c.cuenta || null,
      Number(c.id),
    ]);
  } else {
    await ejecutar("INSERT INTO banks_concept (name, catalog_account) VALUES (?,?)", [
      c.nombre.slice(0, 50),
      c.cuenta || null,
    ]);
  }
}

export async function listasBancos(): Promise<ListasBancos> {
  const vacio: ListasBancos = {
    bancos: [],
    tipos: [],
    conceptos: [],
    tipos_cuenta: [],
    suplidores: [],
    sucursales: [],
    monedas: [{ id: "DOP", nombre: "PESOS DOMINICANOS", simbolo: "RD$" }],
  };
  if (!(await usarMysql())) return vacio;

  const [bancos, conceptos, tipos, kinds, suplidores, sucursales, monedas] = await Promise.all([
    listarCuentasBancarias(),
    listarConceptosBancarios(),
    sql<Record<string, unknown>>(
      "SELECT entry_id, name, type, entrada_id FROM banks_book_entry ORDER BY name",
    ),
    sql<Record<string, unknown>>("SELECT bank_kind_id, name FROM bank_kinds ORDER BY name"),
    sql<Record<string, unknown>>(
      "SELECT supplier_id, name FROM suppliers ORDER BY name LIMIT 3000",
    ),
    sql<Record<string, unknown>>("SELECT branch_id, name FROM branchs ORDER BY name"),
    sql<Record<string, unknown>>(
      "SELECT currency_id, name, COALESCE(symbol,'') AS symbol FROM currencies",
    ),
  ]);

  const listaTipos: TipoOperacionBanco[] = tipos.map((r) => ({
    id: txt(r["entry_id"]),
    nombre: txt(r["name"]),
    signo: txt(r["type"]) === "D" ? "D" : "C",
    entrada_id: txt(r["entrada_id"]),
  }));

  return {
    bancos,
    conceptos,
    tipos: listaTipos,
    tipos_cuenta: kinds.map((r) => ({ id: txt(r["bank_kind_id"]), nombre: txt(r["name"]) })),
    suplidores: suplidores.map((r) => ({
      id: txt(num(r["supplier_id"])),
      nombre: txt(r["name"]),
    })),
    sucursales: sucursales.map((r) => ({ id: txt(num(r["branch_id"])), nombre: txt(r["name"]) })),
    monedas: monedas.length
      ? monedas.map((r) => ({
          id: txt(r["currency_id"]),
          nombre: txt(r["name"]),
          simbolo: txt(r["symbol"]),
        }))
      : vacio.monedas,
  };
}

/* ------------------------------- Operaciones ------------------------------ */

const SQL_MOVIMIENTOS = `
  SELECT b.bank_book_id AS id, DATE_FORMAT(b.date, '%Y-%m-%d') AS fecha,
         b.number AS numero, COALESCE(b.beneficiary, '') AS beneficiario,
         COALESCE(b.description, '') AS descripcion, b.amount AS monto,
         b.tax AS itbis, b.fee AS comision, b.ncfamount AS monto_ncf,
         COALESCE(b.ncf_doc, '') AS ncf, b.exchange AS tasa_cambio,
         b.bank_id AS banco_id, COALESCE(k.name, '') AS banco,
         COALESCE(k.currency_id, 'DOP') AS moneda,
         b.entry_id AS tipo_id, COALESCE(e.name, b.entry_id) AS tipo,
         COALESCE(e.type, 'C') AS signo,
         COALESCE(b.concept_id, '') AS concepto_id, COALESCE(c.name, '') AS concepto,
         COALESCE(b.supplier_id, '') AS suplidor_id, COALESCE(s.name, '') AS suplidor,
         b.status AS estado,
         COALESCE(DATE_FORMAT(b.bank_reconciliation, '%Y-%m-%d'), '') AS conciliado
  FROM banks_book b
  LEFT JOIN banks k ON k.bank_id = b.bank_id
  LEFT JOIN banks_book_entry e ON e.entry_id = b.entry_id
  LEFT JOIN banks_concept c ON c.concept_id = b.concept_id
  LEFT JOIN suppliers s ON s.supplier_id = b.supplier_id
`;

function mapMovimiento(r: Record<string, unknown>): MovimientoBanco {
  const estado = txt(r["estado"]);
  return {
    id: num(r["id"]),
    fecha: txt(r["fecha"]),
    numero: txt(r["numero"]),
    beneficiario: txt(r["beneficiario"]),
    descripcion: txt(r["descripcion"]),
    monto: round2(num(r["monto"])),
    itbis: round2(num(r["itbis"])),
    comision: round2(num(r["comision"])),
    monto_ncf: round2(num(r["monto_ncf"])),
    ncf: txt(r["ncf"]),
    tasa_cambio: num(r["tasa_cambio"]) || 1,
    moneda: txt(r["moneda"]) || "DOP",
    banco_id: txt(num(r["banco_id"])),
    banco: txt(r["banco"]),
    tipo_id: txt(r["tipo_id"]),
    tipo: txt(r["tipo"]),
    signo: txt(r["signo"]) === "D" ? "D" : "C",
    concepto_id: r["concepto_id"] ? txt(num(r["concepto_id"])) : "",
    concepto: txt(r["concepto"]),
    suplidor_id: r["suplidor_id"] ? txt(num(r["suplidor_id"])) : "",
    suplidor: txt(r["suplidor"]),
    estado: estado === "I" ? "I" : estado === "P" ? "P" : "A",
    conciliado: txt(r["conciliado"]),
  };
}

export async function listarMovimientosBanco(
  filtro: FiltroBancos = {},
): Promise<MovimientoBanco[]> {
  if (!(await usarMysql())) return [];
  const cond: string[] = [];
  const params: unknown[] = [];
  if (filtro.desde) {
    cond.push("b.date >= ?");
    params.push(filtro.desde);
  }
  if (filtro.hasta) {
    cond.push("b.date <= ?");
    params.push(filtro.hasta);
  }
  if (filtro.bancoId) {
    cond.push("b.bank_id = ?");
    params.push(Number(filtro.bancoId));
  }
  if (filtro.tipoId) {
    cond.push("b.entry_id = ?");
    params.push(filtro.tipoId);
  }
  if (filtro.suplidorId) {
    cond.push("b.supplier_id = ?");
    params.push(Number(filtro.suplidorId));
  }
  if (filtro.estado) {
    cond.push("b.status = ?");
    params.push(filtro.estado);
  }
  if (filtro.busqueda) {
    cond.push("(b.number LIKE ? OR b.beneficiary LIKE ? OR b.description LIKE ?)");
    const like = `%${filtro.busqueda}%`;
    params.push(like, like, like);
  }
  const where = cond.length ? ` WHERE ${cond.join(" AND ")}` : "";
  const filas = await sql<Record<string, unknown>>(
    `${SQL_MOVIMIENTOS}${where} ORDER BY b.date DESC, b.bank_book_id DESC LIMIT 500`,
    params,
  );
  return filas.map(mapMovimiento);
}

export async function obtenerMovimientoBanco(
  id: number,
): Promise<(MovimientoBanco & { lineas: LineaAsiento[] }) | null> {
  if (!(await usarMysql())) return null;
  const filas = await sql<Record<string, unknown>>(
    `${SQL_MOVIMIENTOS} WHERE b.bank_book_id = ? LIMIT 1`,
    [id],
  );
  const f = filas[0];
  if (!f) return null;
  const det = await sql<Record<string, unknown>>(
    `SELECT d.bank_book_detail_id AS did, d.catalog_account AS cuenta,
            COALESCE(g.name, '') AS nombre, COALESCE(d.description, '') AS descripcion,
            d.debit AS debito, d.credit AS credito,
            COALESCE(h.department_id, '') AS departamento_id,
            COALESCE(dep.name, '') AS departamento
     FROM banks_book_detail d
     LEFT JOIN gl_catalog g ON g.catalog_account = d.catalog_account
     LEFT JOIN bbd_has_gld h ON h.bank_book_detail_id = d.bank_book_detail_id
     LEFT JOIN gl_department dep ON dep.department_id = h.department_id
     WHERE d.bank_book_id = ?
     ORDER BY d.bank_book_detail_id`,
    [id],
  );
  return {
    ...mapMovimiento(f),
    lineas: det.map((d) => ({
      cuenta: txt(d["cuenta"]),
      cuenta_nombre: txt(d["nombre"]),
      descripcion: txt(d["descripcion"]),
      departamento_id: d["departamento_id"] ? txt(num(d["departamento_id"])) : undefined,
      departamento: txt(d["departamento"]),
      debito: round2(num(d["debito"])),
      credito: round2(num(d["credito"])),
    })),
  };
}

/** Saldo del libro de bancos por cuenta bancaria (solo movimientos activos). */
export async function disponibilidadBancaria(): Promise<DisponibilidadBanco[]> {
  if (!(await usarMysql())) return [];
  const filas = await sql<Record<string, unknown>>(
    `SELECT k.bank_id AS banco_id, k.name AS banco, k.account AS numero_cuenta,
            k.currency_id AS moneda,
            ROUND(COALESCE(SUM(CASE WHEN e.type = 'D' THEN b.amount ELSE -b.amount END), 0), 2) AS saldo,
            COUNT(b.bank_book_id) AS movimientos,
            COALESCE(DATE_FORMAT(MAX(b.date), '%Y-%m-%d'), '') AS ultimo
     FROM banks k
     LEFT JOIN banks_book b ON b.bank_id = k.bank_id AND b.status = 'A'
     LEFT JOIN banks_book_entry e ON e.entry_id = b.entry_id
     WHERE k.status = 'A'
     GROUP BY k.bank_id, k.name, k.account, k.currency_id
     ORDER BY k.bank_id`,
  );
  return filas.map((r) => ({
    banco_id: txt(num(r["banco_id"])),
    banco: txt(r["banco"]),
    numero_cuenta: txt(r["numero_cuenta"]),
    moneda: txt(r["moneda"]) || "DOP",
    saldo: round2(num(r["saldo"])),
    movimientos: num(r["movimientos"]),
    ultimo: txt(r["ultimo"]),
  }));
}

/* ------------------------- Propuesta del asiento -------------------------- */

async function datosBanco(
  id: string,
): Promise<{ cuenta: string; nombre: string; moneda: string } | null> {
  if (!id) return null;
  const filas = await sql<Record<string, unknown>>(
    "SELECT catalog_account, name, currency_id FROM banks WHERE bank_id = ? LIMIT 1",
    [Number(id)],
  );
  const f = filas[0];
  if (!f) return null;
  return {
    cuenta: txt(f["catalog_account"]),
    nombre: txt(f["name"]),
    moneda: txt(f["currency_id"]) || "DOP",
  };
}

/**
 * Cuentas propuestas para la operación bancaria. El banco va de un lado y la
 * contrapartida se resuelve por el tipo de operación: banco destino en las
 * transferencias, cuentas por pagar del suplidor en pagos y avances, o la
 * cuenta del concepto bancario. El usuario puede cambiarlas antes de guardar.
 */
export async function propuestaAsientoBanco(
  entrada: NuevoMovimientoBanco,
): Promise<PropuestaAsiento> {
  const advertencias: string[] = [];
  const lineas: LineaAsiento[] = [];
  if (!(await usarMysql())) return { lineas, advertencias: ["Sin conexión a la base de datos"] };

  const banco = await datosBanco(entrada.banco_id);
  if (!banco) return { lineas, advertencias: ["Selecciona la cuenta bancaria."] };

  const [tipo] = await sql<Record<string, unknown>>(
    "SELECT entry_id, name, type FROM banks_book_entry WHERE entry_id = ? LIMIT 1",
    [entrada.tipo_id],
  );
  if (!tipo) return { lineas, advertencias: ["Selecciona el tipo de operación."] };
  const entra = txt(tipo["type"]) === "D";

  const monto = round2(entrada.monto);
  const itbis = round2(entrada.itbis);
  const comision = round2(entrada.comision);
  const itbisRet = round2(entrada.itbis_retenido);
  const isrRet = round2(entrada.isr_retenido);
  const concepto = entrada.concepto_id
    ? (
        await sql<Record<string, unknown>>(
          "SELECT name, COALESCE(catalog_account,'') AS cuenta FROM banks_concept WHERE concept_id = ? LIMIT 1",
          [Number(entrada.concepto_id)],
        )
      )[0]
    : undefined;

  const concepto_texto = txt(tipo["name"]);

  // Lado del banco
  const montoBanco = round2(entra ? monto : monto + itbis + comision);
  lineas.push({
    cuenta: banco.cuenta,
    descripcion: banco.nombre,
    debito: entra ? montoBanco : 0,
    credito: entra ? 0 : montoBanco,
  });

  // Contrapartida
  let contrapartida = "";
  let contrapartidaTexto = concepto_texto;

  if (entrada.tipo_id === TIPO_TRANSFERENCIA_BANCOS) {
    const destino = await datosBanco(entrada.banco_destino_id ?? "");
    if (!destino) advertencias.push("Selecciona el banco destino de la transferencia.");
    else {
      contrapartida = destino.cuenta;
      contrapartidaTexto = `Transferencia a ${destino.nombre}`;
    }
  } else if (entrada.avance?.suplidor_id) {
    contrapartida =
      entrada.avance.cuenta_cxp ||
      (await cuentasSuplidor(entrada.avance.suplidor_id)).cxp ||
      CUENTA_CXP_SUPLIDORES;
    contrapartidaTexto = "Avance al suplidor";
  } else if (entrada.suplidor_id) {
    const ct = await cuentasSuplidor(entrada.suplidor_id);
    contrapartida = ct.cxp || CUENTA_CXP_SUPLIDORES;
    contrapartidaTexto = "Pago a suplidor";
  } else if (concepto) {
    contrapartida = txt(concepto["cuenta"]);
    contrapartidaTexto = txt(concepto["name"]);
    if (!contrapartida)
      advertencias.push(
        `El concepto ${txt(concepto["name"])} no tiene cuenta contable configurada.`,
      );
  } else {
    advertencias.push("Indica la cuenta de la contrapartida de esta operación.");
  }

  const montoContra = round2(monto - itbisRet - isrRet);
  lineas.push({
    cuenta: contrapartida,
    descripcion: contrapartidaTexto,
    debito: entra ? 0 : montoContra,
    credito: entra ? montoContra : 0,
  });

  if (itbisRet > 0)
    lineas.push({
      cuenta: "",
      descripcion: "ITBIS retenido",
      debito: entra ? itbisRet : 0,
      credito: entra ? 0 : itbisRet,
    });
  if (isrRet > 0)
    lineas.push({
      cuenta: "",
      descripcion: "ISR retenido",
      debito: entra ? isrRet : 0,
      credito: entra ? 0 : isrRet,
    });

  if (comision > 0)
    lineas.push({
      cuenta: concepto ? txt(concepto["cuenta"]) : "",
      descripcion: "Comisión bancaria",
      debito: comision,
      credito: 0,
    });
  if (itbis > 0)
    lineas.push({
      cuenta: CUENTA_ITBIS_COMPRAS,
      descripcion: "ITBIS en cargos bancarios",
      debito: itbis,
      credito: 0,
    });

  const faltantes = lineas.filter((l) => !l.cuenta).length;
  if (faltantes)
    advertencias.push(
      `Hay ${faltantes} línea(s) sin cuenta contable. Selecciónalas antes de guardar.`,
    );

  return { lineas, advertencias };
}

/* -------------------------------- Registro -------------------------------- */

async function cuentasValidas(cuentas: string[]): Promise<Set<string>> {
  const unicas = [...new Set(cuentas.filter(Boolean))];
  if (!unicas.length) return new Set();
  const filas = await sql<Record<string, unknown>>(
    `SELECT catalog_account FROM gl_catalog
     WHERE catalog_account IN (${unicas.map(() => "?").join(",")})`,
    unicas,
  );
  return new Set(filas.map((f) => txt(f["catalog_account"])));
}

async function guardarDetalleContable(
  bankBookId: number,
  lineas: LineaAsiento[],
): Promise<void> {
  const utiles = lineas.filter(
    (l) => l.cuenta && (round2(l.debito) > 0 || round2(l.credito) > 0),
  );
  if (!utiles.length) return;
  const validas = await cuentasValidas(utiles.map((l) => l.cuenta));
  const invalidas = utiles.filter((l) => !validas.has(l.cuenta)).map((l) => l.cuenta);
  if (invalidas.length)
    throw new Error(`Cuentas contables no encontradas en el catálogo: ${invalidas.join(", ")}`);

  for (const l of utiles) {
    const ins = await ejecutar(
      `INSERT INTO banks_book_detail (description, debit, credit, bank_book_id, catalog_account)
       VALUES (?,?,?,?,?)`,
      [
        (l.descripcion || l.cuenta_nombre || "").slice(0, 240),
        round2(l.debito),
        round2(l.credito),
        bankBookId,
        l.cuenta,
      ],
    );
    if (l.departamento_id) {
      // El reparto por centro de costo se guarda al 100% del monto de la línea.
      await ejecutar(
        `INSERT INTO bbd_has_gld (bank_book_detail_id, department_id, percentage, debit, credit)
         VALUES (?,?,?,?,?)`,
        [ins.insertId, Number(l.departamento_id), 100, round2(l.debito), round2(l.credito)],
      );
    }
  }
}

async function insertarCabecera(
  entrada: NuevoMovimientoBanco,
  opciones: { bancoId: string; tipoId: string; descripcion?: string },
): Promise<number> {
  const ins = await ejecutar(
    `INSERT INTO banks_book
       (date, number, beneficiary, description, amount, tax, fee, ncfamount, exchange,
        source, status, ncf_doc, rnc, bank_id, entry_id, concept_id, supplier_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      entrada.fecha,
      entrada.numero.slice(0, 15),
      entrada.beneficiario.slice(0, 50),
      (opciones.descripcion ?? entrada.descripcion).slice(0, 240),
      round2(entrada.monto),
      round2(entrada.itbis),
      round2(entrada.comision),
      round2(entrada.monto_ncf),
      entrada.tasa_cambio || 1,
      "WEB",
      "A",
      entrada.ncf.trim().slice(0, 20) || null,
      null,
      Number(opciones.bancoId),
      opciones.tipoId,
      entrada.concepto_id ? Number(entrada.concepto_id) : null,
      entrada.suplidor_id
        ? Number(entrada.suplidor_id)
        : entrada.avance?.suplidor_id
          ? Number(entrada.avance.suplidor_id)
          : null,
    ],
  );
  return ins.insertId;
}

/** Crea el pago (o el avance) del suplidor en cuentas por pagar. */
async function registrarCxP(
  entrada: NuevoMovimientoBanco,
  aplicaciones: AplicacionCxP[],
  avance: boolean,
): Promise<number | undefined> {
  const suplidorId = avance ? entrada.avance?.suplidor_id : entrada.suplidor_id;
  if (!suplidorId) return undefined;
  if (!avance && aplicaciones.length === 0) return undefined;

  const [sup] = await sql<Record<string, unknown>>(
    "SELECT name, COALESCE(rnc,'') AS rnc FROM suppliers WHERE supplier_id = ? LIMIT 1",
    [Number(suplidorId)],
  );
  if (!sup) throw new Error("Suplidor no encontrado");

  const monto = avance
    ? round2(entrada.monto)
    : round2(aplicaciones.reduce((s, a) => s + a.monto, 0));

  const [banco] = await sql<Record<string, unknown>>(
    "SELECT currency_id FROM banks WHERE bank_id = ? LIMIT 1",
    [Number(entrada.banco_id)],
  );

  const ins = await ejecutar(
    `INSERT INTO ap
       (date, due_date, doc_number, description, exchange, bienes, servicios,
        rnc, rnc_name, supplier_id, currency_id, payment_currency, ap_kind_id, branch_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      entrada.fecha,
      entrada.fecha,
      entrada.numero.slice(0, 15),
      (avance
        ? `Avance al suplidor — ${entrada.descripcion || entrada.numero}`
        : `Pago con ${entrada.tipo_id} No. ${entrada.numero}`
      ).slice(0, 100),
      entrada.tasa_cambio || 1,
      0,
      0,
      txt(sup["rnc"]).slice(0, 15),
      txt(sup["name"]).slice(0, 60),
      Number(suplidorId),
      txt(banco?.["currency_id"]) || "DOP",
      txt(banco?.["currency_id"]) || "DOP",
      avance ? AP_AVANCE : AP_PAGO,
      1,
    ],
  );
  const apId = ins.insertId;

  if (avance) {
    await ejecutar("INSERT INTO ap_reference (reference, amount, ap_id) VALUES (?,?,?)", [
      entrada.numero.slice(0, 15),
      -monto,
      apId,
    ]);
  } else {
    for (const a of aplicaciones) {
      if (round2(a.monto) <= 0) continue;
      await ejecutar("INSERT INTO ap_reference (reference, amount, ap_id) VALUES (?,?,?)", [
        a.referencia.slice(0, 15),
        -round2(a.monto),
        apId,
      ]);
    }
  }
  return apId;
}

/**
 * Registra la operación bancaria: cabecera en `banks_book`, asiento en
 * `banks_book_detail` con su reparto por centro de costo, el movimiento de
 * cuentas por pagar cuando corresponde (pago aplicado a facturas o avance) y,
 * en las transferencias entre bancos, el movimiento espejo en el banco destino.
 */
export async function crearMovimientoBanco(
  entrada: NuevoMovimientoBanco,
): Promise<ResultadoMovimientoBanco> {
  if (!(await usarMysql())) throw new Error("Sin conexión a la base de datos");
  if (!entrada.banco_id) throw new Error("Selecciona la cuenta bancaria");
  if (!entrada.numero.trim()) throw new Error("Escribe el número del documento");
  if (round2(entrada.monto) <= 0) throw new Error("El monto debe ser mayor que cero");

  const [tipo] = await sql<Record<string, unknown>>(
    "SELECT entry_id, name, type FROM banks_book_entry WHERE entry_id = ? LIMIT 1",
    [entrada.tipo_id],
  );
  if (!tipo) throw new Error("Tipo de operación bancaria no válido");

  const esTransferencia = entrada.tipo_id === TIPO_TRANSFERENCIA_BANCOS;
  if (esTransferencia) {
    if (!entrada.banco_destino_id) throw new Error("Selecciona el banco destino");
    if (entrada.banco_destino_id === entrada.banco_id)
      throw new Error("El banco destino debe ser distinto al de origen");
  }

  const aplicaciones = (entrada.aplicaciones ?? []).filter((a) => round2(a.monto) > 0);
  if (aplicaciones.length) {
    const aplicado = round2(aplicaciones.reduce((s, a) => s + a.monto, 0));
    if (aplicado > round2(entrada.monto))
      throw new Error("Lo aplicado a facturas no puede ser mayor que el monto de la operación");
    if (!entrada.suplidor_id) throw new Error("Selecciona el suplidor para aplicar el pago");
  }

  const asiento = (entrada.asiento ?? []).filter(
    (l) => l.cuenta && (round2(l.debito) > 0 || round2(l.credito) > 0),
  );
  if (asiento.length) {
    const debito = round2(asiento.reduce((s, l) => s + l.debito, 0));
    const credito = round2(asiento.reduce((s, l) => s + l.credito, 0));
    if (Math.abs(debito - credito) > 0.01)
      throw new Error(
        `El asiento no está cuadrado: débito ${debito.toFixed(2)} vs crédito ${credito.toFixed(2)}`,
      );
  }

  const id = await insertarCabecera(entrada, {
    bancoId: entrada.banco_id,
    tipoId: entrada.tipo_id,
  });
  await guardarDetalleContable(id, asiento);

  let idDestino: number | undefined;
  if (esTransferencia && entrada.banco_destino_id) {
    // El movimiento espejo entra al banco destino; el asiento contable ya quedó
    // completo en el movimiento de origen.
    idDestino = await insertarCabecera(entrada, {
      bancoId: entrada.banco_destino_id,
      tipoId: TIPO_TRANSFERENCIA_RECIBIDA,
      descripcion: `Transferencia recibida — ${entrada.descripcion || `No. ${entrada.numero}`}`,
    });
  }

  const apId =
    (await registrarCxP(entrada, aplicaciones, false)) ??
    (entrada.avance?.suplidor_id ? await registrarCxP(entrada, [], true) : undefined);

  return { id, numero: entrada.numero, id_destino: idDestino, ap_id: apId };
}

/** Anula la operación bancaria (queda inactiva y sale del libro de bancos). */
export async function anularMovimientoBanco(id: number): Promise<void> {
  if (!(await usarMysql())) throw new Error("Sin conexión a la base de datos");
  await ejecutar("UPDATE banks_book SET status = 'I' WHERE bank_book_id = ?", [id]);
}
