// Cuentas por pagar sobre las tablas existentes:
//   ap            -> cabecera del movimiento (factura del suplidor, nota, pago…)
//   ap_reference  -> registro único del documento (balance por documento)
//   ap_detail     -> asiento contable del movimiento (cuentas de gl_catalog)
//   ap_kinds      -> tipos de transacción; 'I' = FACTURA SUPLIDORES
//
// El sistema es multimoneda: cada movimiento guarda su moneda y su tasa
// (columnas currency_id / exchange de ap).

import {
  round2,
  totalFacturaSuplidor,
  type BalanceSuplidorCxP,
  type DatosFacturaSuplidor,
  type FiltroCxP,
  type LineaAsiento,
  type MovimientoCxP,
  type NuevaFacturaSuplidor,
} from "@/lib/erp-types";
import { ejecutar, sql } from "./mysql.server";
import { usarMysql } from "./repo.server";

export const TIPO_FACTURA_SUPLIDOR = "I";

const txt = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* ------------------------------- Consultas ------------------------------- */

const SQL_MOVIMIENTOS = `
  SELECT a.ap_id AS id,
         DATE_FORMAT(a.date, '%Y-%m-%d') AS fecha,
         DATE_FORMAT(a.due_date, '%Y-%m-%d') AS vencimiento,
         a.doc_number AS documento,
         COALESCE(a.ncf_doc, '') AS ncf,
         a.ap_kind_id AS tipo_id,
         COALESCE(k.name, a.ap_kind_id) AS tipo,
         COALESCE(k.kind, 'D') AS signo,
         a.supplier_id AS suplidor_id,
         COALESCE(NULLIF(s.name, ''), a.rnc_name, '') AS suplidor,
         COALESCE(NULLIF(a.currency_id, ''), 'DOP') AS moneda,
         COALESCE(a.exchange, 1) AS tasa_cambio,
         COALESCE(a.description, '') AS descripcion,
         COALESCE(e.name, '') AS gasto,
         COALESCE(a.purchase_id, '') AS orden_id,
         ROUND(a.bienes + a.servicios + a.propina + a.isc + a.otrosimp
               + a.purchase_tax - a.tax_retention - a.islr_retention, 2) AS monto_cab,
         COALESCE(r.monto, 0) AS monto_ref,
         COALESCE(bal.balance, 0) AS balance
  FROM ap a
  LEFT JOIN ap_kinds k ON k.ap_kind_id = a.ap_kind_id
  LEFT JOIN suppliers s ON s.supplier_id = a.supplier_id
  LEFT JOIN expenses_kinds e ON e.expense_id = a.expense_id
  LEFT JOIN (SELECT ap_id, ABS(SUM(amount)) AS monto FROM ap_reference GROUP BY ap_id) r
         ON r.ap_id = a.ap_id
  LEFT JOIN (
    SELECT x.supplier_id, r2.reference, ROUND(SUM(r2.amount), 2) AS balance
    FROM ap x JOIN ap_reference r2 ON r2.ap_id = x.ap_id
    GROUP BY x.supplier_id, r2.reference
  ) bal ON bal.supplier_id = a.supplier_id AND bal.reference = a.doc_number
`;

export async function listarMovimientosCxP(filtro: FiltroCxP = {}): Promise<MovimientoCxP[]> {
  if (!(await usarMysql())) return [];
  const cond: string[] = [];
  const params: unknown[] = [];
  if (filtro.desde) {
    cond.push("a.date >= ?");
    params.push(filtro.desde);
  }
  if (filtro.hasta) {
    cond.push("a.date <= ?");
    params.push(filtro.hasta);
  }
  if (filtro.suplidorId) {
    cond.push("a.supplier_id = ?");
    params.push(Number(filtro.suplidorId));
  }
  if (filtro.tipoId) {
    cond.push("a.ap_kind_id = ?");
    params.push(filtro.tipoId);
  }
  if (filtro.ncf) {
    cond.push("a.ncf_doc LIKE ?");
    params.push(`%${filtro.ncf}%`);
  }
  const where = cond.length ? ` WHERE ${cond.join(" AND ")}` : "";
  const filas = await sql<Record<string, unknown>>(
    `${SQL_MOVIMIENTOS}${where} ORDER BY a.date DESC, a.ap_id DESC LIMIT 500`,
    params,
  );
  return filas.map((r) => ({
    id: num(r["id"]),
    fecha: txt(r["fecha"]),
    vencimiento: txt(r["vencimiento"]),
    documento: txt(r["documento"]),
    ncf: txt(r["ncf"]),
    tipo_id: txt(r["tipo_id"]),
    tipo: txt(r["tipo"]),
    signo: txt(r["signo"]) === "C" ? "C" : "D",
    suplidor_id: txt(r["suplidor_id"]),
    suplidor: txt(r["suplidor"]),
    moneda: txt(r["moneda"]) || "DOP",
    tasa_cambio: num(r["tasa_cambio"]) || 1,
    monto: round2(num(r["monto_ref"]) || num(r["monto_cab"])),
    balance: round2(num(r["balance"])),
    descripcion: txt(r["descripcion"]).replace(/\r?\n/g, " ").trim(),
    gasto: txt(r["gasto"]),
    orden_id: txt(r["orden_id"]),
  }));
}

/** Suplidores con balance pendiente, agrupado por moneda. */
export async function balancesSuplidores(): Promise<BalanceSuplidorCxP[]> {
  if (!(await usarMysql())) return [];
  const filas = await sql<Record<string, unknown>>(
    `SELECT suplidor_id, suplidor, moneda,
            ROUND(SUM(balance), 2) AS balance,
            COUNT(*) AS documentos,
            MIN(fecha) AS mas_antiguo
     FROM (
       SELECT a.supplier_id AS suplidor_id,
              COALESCE(NULLIF(MAX(s.name), ''), a.supplier_id) AS suplidor,
              COALESCE(NULLIF(MAX(a.currency_id), ''), 'DOP') AS moneda,
              ROUND(SUM(r.amount), 2) AS balance,
              DATE_FORMAT(MIN(a.date), '%Y-%m-%d') AS fecha
       FROM ap a
       JOIN ap_reference r ON r.ap_id = a.ap_id
       LEFT JOIN suppliers s ON s.supplier_id = a.supplier_id
       GROUP BY a.supplier_id, r.reference
       HAVING ROUND(SUM(r.amount), 2) <> 0
     ) p
     GROUP BY suplidor_id, suplidor, moneda
     ORDER BY balance DESC
     LIMIT 300`,
  );
  return filas.map((r) => ({
    suplidor_id: txt(r["suplidor_id"]),
    suplidor: txt(r["suplidor"]),
    moneda: txt(r["moneda"]) || "DOP",
    balance: round2(num(r["balance"])),
    documentos: num(r["documentos"]),
    mas_antiguo: txt(r["mas_antiguo"]),
  }));
}

/** Documentos con balance pendiente de un suplidor. */
export async function documentosPendientesCxP(
  suplidorId: string,
): Promise<{ referencia: string; fecha: string; balance: number; moneda: string }[]> {
  if (!(await usarMysql()) || !suplidorId) return [];
  const filas = await sql<Record<string, unknown>>(
    `SELECT r.reference AS referencia,
            DATE_FORMAT(MIN(a.date), '%Y-%m-%d') AS fecha,
            ROUND(SUM(r.amount), 2) AS balance,
            COALESCE(NULLIF(MAX(a.currency_id), ''), 'DOP') AS moneda
     FROM ap a
     JOIN ap_reference r ON r.ap_id = a.ap_id
     WHERE a.supplier_id = ?
     GROUP BY r.reference
     HAVING ROUND(SUM(r.amount), 2) > 0
     ORDER BY MIN(a.date), r.reference
     LIMIT 500`,
    [Number(suplidorId)],
  );
  return filas.map((r) => ({
    referencia: txt(r["referencia"]),
    fecha: txt(r["fecha"]),
    balance: round2(num(r["balance"])),
    moneda: txt(r["moneda"]) || "DOP",
  }));
}

export async function obtenerMovimientoCxP(id: number): Promise<
  (MovimientoCxP & { lineas: LineaAsiento[] }) | null
> {
  if (!(await usarMysql())) return null;
  const filas = await sql<Record<string, unknown>>(
    `${SQL_MOVIMIENTOS} WHERE a.ap_id = ? LIMIT 1`,
    [id],
  );
  const f = filas[0];
  if (!f) return null;
  const det = await sql<Record<string, unknown>>(
    `SELECT d.catalog_account AS cuenta, COALESCE(c.name, '') AS nombre,
            COALESCE(d.debit, 0) AS debito, COALESCE(d.credit, 0) AS credito
     FROM ap_detail d
     LEFT JOIN gl_catalog c ON c.catalog_account = d.catalog_account
     WHERE d.ap_id = ?
     ORDER BY d.ap_detail_id`,
    [id],
  );
  const mov: MovimientoCxP = {
    id: num(f["id"]),
    fecha: txt(f["fecha"]),
    vencimiento: txt(f["vencimiento"]),
    documento: txt(f["documento"]),
    ncf: txt(f["ncf"]),
    tipo_id: txt(f["tipo_id"]),
    tipo: txt(f["tipo"]),
    signo: txt(f["signo"]) === "C" ? "C" : "D",
    suplidor_id: txt(f["suplidor_id"]),
    suplidor: txt(f["suplidor"]),
    moneda: txt(f["moneda"]) || "DOP",
    tasa_cambio: num(f["tasa_cambio"]) || 1,
    monto: round2(num(f["monto_ref"]) || num(f["monto_cab"])),
    balance: round2(num(f["balance"])),
    descripcion: txt(f["descripcion"]),
    gasto: txt(f["gasto"]),
    orden_id: txt(f["orden_id"]),
  };
  return {
    ...mov,
    lineas: det.map((d) => ({
      cuenta: txt(d["cuenta"]),
      cuenta_nombre: txt(d["nombre"]),
      descripcion: mov.descripcion,
      debito: round2(num(d["debito"])),
      credito: round2(num(d["credito"])),
    })),
  };
}

/* ------------------------------- Registro -------------------------------- */

/** Cuentas válidas para `ap_detail` (FK contra gl_catalog). */
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

/** Clasificación de la línea del asiento para `ap_detail.kind`. */
function tipoLinea(l: LineaAsiento): "C" | "I" | "R" | null {
  const d = (l.descripcion || "").toUpperCase();
  if (d.includes("ITBIS RETENIDO")) return "I";
  if (d.includes("ISR RETENIDO")) return "R";
  if (l.credito > 0) return "C";
  return null;
}

async function proximoDocumentoCxP(tipoId: string): Promise<string> {
  const [ultimo] = await sql<Record<string, unknown>>(
    `SELECT COALESCE(MAX(CAST(doc_number AS UNSIGNED)), 0) + 1 AS n
     FROM ap WHERE ap_kind_id = ? AND doc_number REGEXP '^[0-9]+$'`,
    [tipoId],
  );
  return String(num(ultimo?.["n"]) || 1);
}

/**
 * Registra la factura del suplidor: cabecera en `ap`, registro único en
 * `ap_reference` y asiento contable en `ap_detail`. No toca inventario.
 */
export async function crearFacturaSuplidor(
  entrada: NuevaFacturaSuplidor,
): Promise<{ ap_id: number; documento: string; total: number }> {
  if (!(await usarMysql())) throw new Error("Sin conexión a la base de datos");

  const tipoId = entrada.tipo_id || TIPO_FACTURA_SUPLIDOR;
  const [tipo] = await sql<Record<string, unknown>>(
    "SELECT ap_kind_id, name, kind, ncf FROM ap_kinds WHERE ap_kind_id = ? LIMIT 1",
    [tipoId],
  );
  if (!tipo) throw new Error("Tipo de transacción de CxP no válido");

  const [sup] = await sql<Record<string, unknown>>(
    `SELECT supplier_id, name, COALESCE(rnc,'') AS rnc FROM suppliers WHERE supplier_id = ? LIMIT 1`,
    [Number(entrada.suplidor_id)],
  );
  if (!sup) throw new Error("Suplidor no encontrado");

  const f: DatosFacturaSuplidor = entrada.factura;
  const total = totalFacturaSuplidor({
    bienes: f.bienes,
    servicios: f.servicios,
    propina: f.propina,
    isc: f.isc,
    otros_impuestos: f.otros_impuestos,
    itbis: f.itbis,
    itbis_retenido: f.itbis_retenido,
    isr_retenido: f.isr_retenido,
  });
  if (total <= 0) throw new Error("El valor de la factura debe ser mayor que cero");
  if (!f.numero.trim() && !f.ncf.trim())
    throw new Error("Indica el número de la factura del suplidor.");

  const documento = f.numero.trim() || (await proximoDocumentoCxP(tipoId));

  const ins = await ejecutar(
    `INSERT INTO ap
       (date, due_date, doc_number, ncf_doc, description, exchange, purchase_tax,
        bienes, servicios, propina, isc, otrosimp, tax_retention, islr_retention,
        itbis_proporc, itbis_costo, itbis_adelantado, llevado, rnc, rnc_name,
        conduce, supplier_id, uso, currency_id, payment_kind_id, payment_currency,
        ncf_id, expense_id, branch_id, ap_kind_id, isr_id, project_id,
        department_id, purchase_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      f.fecha,
      f.vencimiento || f.fecha,
      documento.slice(0, 15),
      f.ncf.trim().slice(0, 19) || null,
      (f.notas || `Factura del suplidor ${txt(sup["name"])}`).slice(0, 100),
      f.tasa_cambio || 1,
      round2(f.itbis),
      round2(f.bienes),
      round2(f.servicios),
      round2(f.propina),
      round2(f.isc),
      round2(f.otros_impuestos),
      round2(f.itbis_retenido),
      round2(f.isr_retenido),
      round2(f.itbis_proporcional),
      round2(f.itbis_costo),
      round2(Math.max(f.itbis - f.itbis_costo, 0)),
      round2(f.itbis_costo),
      txt(sup["rnc"]).slice(0, 15),
      txt(sup["name"]).slice(0, 60),
      f.conduce ? 1 : 0,
      Number(entrada.suplidor_id),
      (f.uso || "").slice(0, 200),
      f.moneda || "DOP",
      f.forma_pago_id || null,
      f.moneda || "DOP",
      f.comprobante_id ? Number(f.comprobante_id) : null,
      f.gasto_id ? Number(f.gasto_id) : null,
      Number(f.sucursal_id || 1) || 1,
      tipoId,
      f.isr_id ? Number(f.isr_id) : null,
      null,
      null,
      entrada.orden_id ?? null,
    ],
  );
  const apId = ins.insertId;

  await ejecutar("INSERT INTO ap_reference (reference, amount, ap_id) VALUES (?,?,?)", [
    documento.slice(0, 15),
    total,
    apId,
  ]);

  const lineas = (entrada.asiento ?? []).filter(
    (l) => l.cuenta && (round2(l.debito) > 0 || round2(l.credito) > 0),
  );
  if (lineas.length) {
    const validas = await cuentasValidas(lineas.map((l) => l.cuenta));
    for (const l of lineas) {
      if (!validas.has(l.cuenta)) continue;
      await ejecutar(
        "INSERT INTO ap_detail (debit, credit, kind, ap_id, catalog_account) VALUES (?,?,?,?,?)",
        [round2(l.debito), round2(l.credito), tipoLinea(l), apId, l.cuenta],
      );
    }
  }

  return { ap_id: apId, documento, total };
}
