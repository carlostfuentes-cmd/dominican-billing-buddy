// Caja chica sobre las tablas existentes del sistema:
//   petty_cash                            -> maestra de cajas chicas
//   petty_cash_detail                     -> comprobantes (aperturas y gastos)
//   petty_cash_detail_has_gl_department    -> asiento contable por centro de costo
//
// En el sistema heredado los egresos se guardan con monto negativo en `amount`
// y `tax`; en la interfaz siempre se manejan montos absolutos y el signo se
// aplica al guardar. La reposición del fondo se registra como una operación
// bancaria (banks_book) y su número/fecha se copian a los comprobantes.

import {
  round2,
  totalComprobanteCaja,
  type ComprobanteCaja,
  type CajaChica,
  type FiltroCajaChica,
  type LineaAsiento,
  type ListasCajaChica,
  type NuevaReposicionCaja,
  type NuevoComprobanteCaja,
  type PropuestaAsiento,
  type ResumenCajaChica,
} from "@/lib/erp-types";
import { crearMovimientoBanco } from "./bancos.server";
import { CUENTA_ITBIS_COMPRAS, CUENTA_ISR_RETENIDO_CXP, CUENTA_ITBIS_RETENIDO_CXP } from "./cuentas.server";
import { ejecutar, sql } from "./mysql.server";
import { usarMysql } from "./repo.server";

const txt = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const abs = (v: unknown): number => Math.abs(round2(num(v)));
const fechaTxt = (v: unknown): string => (v ? txt(v).slice(0, 10) : "");

/* -------------------------------- Maestras -------------------------------- */

const SQL_CAJAS = `
  SELECT p.cash_id AS id, p.name AS nombre, p.date AS fecha, p.status AS estatus,
         p.branch_id AS sucursal_id, COALESCE(b.name, '') AS sucursal,
         p.catalog_account AS cuenta, COALESCE(g.name, '') AS cuenta_nombre,
         COALESCE((SELECT SUM(d.amount) FROM petty_cash_detail d
                    WHERE d.cash_id = p.cash_id AND d.kind = 'A'), 0) AS fondo
  FROM petty_cash p
  LEFT JOIN branchs b ON b.branch_id = p.branch_id
  LEFT JOIN gl_catalog g ON g.catalog_account = p.catalog_account
  ORDER BY p.name
`;

export async function listarCajas(): Promise<CajaChica[]> {
  if (!(await usarMysql())) return [];
  const filas = await sql<Record<string, unknown>>(SQL_CAJAS);
  return filas.map((r) => ({
    id: txt(num(r["id"])),
    nombre: txt(r["nombre"]),
    fecha: fechaTxt(r["fecha"]),
    activa: txt(r["estatus"]) === "A",
    sucursal_id: txt(num(r["sucursal_id"])),
    sucursal: txt(r["sucursal"]),
    cuenta_contable: txt(r["cuenta"]),
    cuenta_contable_nombre: txt(r["cuenta_nombre"]),
    fondo: abs(r["fondo"]),
  }));
}

export async function listasCajaChica(): Promise<ListasCajaChica> {
  const vacio: ListasCajaChica = {
    cajas: [],
    comprobantes_fiscales: [],
    gastos: [],
    retenciones: [],
    departamentos: [],
    proyectos: [],
    cuentas: [],
  };
  if (!(await usarMysql())) return vacio;

  const [cajas, ncf, gastos, isr, departamentos, proyectos, cuentas] = await Promise.all([
    listarCajas(),
    sql<Record<string, unknown>>("SELECT ncf_id AS id, name AS nombre FROM ncf_kinds ORDER BY ncf_id"),
    sql<Record<string, unknown>>(
      "SELECT expense_id AS id, name AS nombre FROM expenses_kinds ORDER BY expense_id",
    ),
    sql<Record<string, unknown>>("SELECT isr_id AS id, name AS nombre, rate FROM isr ORDER BY name"),
    sql<Record<string, unknown>>(
      "SELECT department_id AS id, name AS nombre FROM gl_department ORDER BY name",
    ),
    sql<Record<string, unknown>>(
      "SELECT project_id AS id, name AS nombre FROM projects WHERE status = 'ABIERTO' ORDER BY name",
    ),
    sql<Record<string, unknown>>(
      `SELECT account AS cuenta, name AS nombre, level AS nivel, nature AS naturaleza,
              COALESCE(kind,'') AS clasificacion
         FROM gl_accounts WHERE is_detail = 1 AND status = 'A' ORDER BY account`,
    ),
  ]);

  return {
    cajas,
    comprobantes_fiscales: ncf.map((r) => ({ id: txt(num(r["id"])), nombre: txt(r["nombre"]) })),
    gastos: gastos.map((r) => ({ id: txt(num(r["id"])), nombre: txt(r["nombre"]) })),
    retenciones: isr.map((r) => ({
      id: txt(num(r["id"])),
      nombre: txt(r["nombre"]),
      tasa: num(r["rate"]),
    })),
    departamentos: departamentos.map((r) => ({
      id: txt(num(r["id"])),
      nombre: txt(r["nombre"]),
    })),
    proyectos: proyectos.map((r) => ({ id: txt(num(r["id"])), nombre: txt(r["nombre"]) })),
    cuentas: cuentas.map((r) => ({
      cuenta: txt(r["cuenta"]),
      nombre: txt(r["nombre"]),
      nivel: num(r["nivel"]),
      naturaleza: txt(r["naturaleza"]) === "C" ? ("C" as const) : ("D" as const),
      detalle: true,
      clasificacion: txt(r["clasificacion"]),
    })),
  };
}

/* ------------------------------ Comprobantes ------------------------------ */

const SQL_COMPROBANTES = `
  SELECT d.ID AS id, d.cash_id AS caja_id, COALESCE(p.name,'') AS caja, d.kind AS tipo,
         d.date AS fecha, COALESCE(d.reference,'') AS referencia,
         COALESCE(d.description,'') AS descripcion,
         COALESCE(d.bienes,0) AS bienes, COALESCE(d.servicios,0) AS servicios,
         COALESCE(d.amount,0) AS amount, COALESCE(d.tax,0) AS tax,
         d.tax_retention, d.islr_retention, d.propina, d.isc, d.otrosimp,
         COALESCE(d.status,'') AS estado, COALESCE(d.citizen_id,'') AS cedula,
         COALESCE(d.rnc,'') AS rnc, COALESCE(d.beneficiary,'') AS beneficiario,
         COALESCE(d.ncf_doc,'') AS ncf, COALESCE(d.autorizacion,'') AS autorizacion,
         d.vigencia, d.ncf_id, COALESCE(k.name,'') AS ncf_tipo,
         d.expense_id, COALESCE(e.name,'') AS gasto, d.gasto_menor, d.isr_id,
         d.project_id, COALESCE(d.catalog_account,'') AS cuenta_gasto,
         COALESCE(d.tax_account,'') AS cuenta_itbis, COALESCE(d.islr_account,'') AS cuenta_isr,
         COALESCE(d.post_number,'') AS reposicion_numero, d.post_date AS reposicion_fecha,
         COALESCE(d.bank_book_id,0) AS reposicion_banco_id
  FROM petty_cash_detail d
  LEFT JOIN petty_cash p ON p.cash_id = d.cash_id
  LEFT JOIN ncf_kinds k ON k.ncf_id = d.ncf_id
  LEFT JOIN expenses_kinds e ON e.expense_id = d.expense_id
`;

function mapComprobante(r: Record<string, unknown>): ComprobanteCaja {
  const montos = {
    bienes: abs(r["bienes"]),
    servicios: abs(r["servicios"]),
    itbis: abs(r["tax"]),
    propina: abs(r["propina"]),
    isc: abs(r["isc"]),
    otros_impuestos: abs(r["otrosimp"]),
    retencion_itbis: abs(r["tax_retention"]),
    retencion_isr: abs(r["islr_retention"]),
  };
  // Las aperturas no tienen desglose de bienes/servicios: el monto es el fondo.
  const base = montos.bienes + montos.servicios > 0 ? montos : { ...montos, servicios: abs(r["amount"]) };
  const reposicion = txt(r["reposicion_numero"]);
  return {
    id: num(r["id"]),
    caja_id: txt(num(r["caja_id"])),
    caja: txt(r["caja"]),
    tipo: txt(r["tipo"]) || "E",
    fecha: fechaTxt(r["fecha"]),
    referencia: txt(r["referencia"]),
    descripcion: txt(r["descripcion"]),
    bienes: base.bienes,
    servicios: base.servicios,
    itbis: base.itbis,
    retencion_itbis: base.retencion_itbis,
    retencion_isr: base.retencion_isr,
    propina: base.propina,
    isc: base.isc,
    otros_impuestos: base.otros_impuestos,
    total: totalComprobanteCaja(base),
    estado: txt(r["estado"]) || "A",
    cedula: txt(r["cedula"]),
    rnc: txt(r["rnc"]),
    beneficiario: txt(r["beneficiario"]),
    ncf: txt(r["ncf"]),
    autorizacion: txt(r["autorizacion"]),
    vigencia: fechaTxt(r["vigencia"]),
    ncf_id: r["ncf_id"] === null || r["ncf_id"] === undefined ? "" : txt(num(r["ncf_id"])),
    ncf_tipo: txt(r["ncf_tipo"]),
    gasto_id:
      r["expense_id"] === null || r["expense_id"] === undefined ? "" : txt(num(r["expense_id"])),
    gasto: txt(r["gasto"]),
    gasto_menor: num(r["gasto_menor"]) === 1,
    isr_id: r["isr_id"] === null || r["isr_id"] === undefined ? "" : txt(num(r["isr_id"])),
    proyecto_id:
      r["project_id"] === null || r["project_id"] === undefined ? "" : txt(num(r["project_id"])),
    cuenta_gasto: txt(r["cuenta_gasto"]),
    cuenta_itbis: txt(r["cuenta_itbis"]),
    cuenta_isr: txt(r["cuenta_isr"]),
    reposicion_numero: reposicion,
    reposicion_fecha: fechaTxt(r["reposicion_fecha"]),
    reposicion_banco_id: num(r["reposicion_banco_id"]),
    editable: !reposicion,
    asiento: [],
  };
}

export async function listarComprobantes(f: FiltroCajaChica): Promise<ComprobanteCaja[]> {
  if (!(await usarMysql())) return [];
  const cond: string[] = [];
  const params: unknown[] = [];
  if (f.cajaId) {
    cond.push("d.cash_id = ?");
    params.push(Number(f.cajaId));
  }
  if (f.desde) {
    cond.push("d.date >= ?");
    params.push(f.desde);
  }
  if (f.hasta) {
    cond.push("d.date <= ?");
    params.push(f.hasta);
  }
  if (f.gastoId) {
    cond.push("d.expense_id = ?");
    params.push(Number(f.gastoId));
  }
  if (f.estado === "pendiente") cond.push("(d.post_number IS NULL OR d.post_number = '')");
  if (f.estado === "repuesto") cond.push("(d.post_number IS NOT NULL AND d.post_number <> '')");
  if (f.estado === "borrador") cond.push("d.status = 'P'");
  if (f.busqueda) {
    cond.push(
      "(d.description LIKE ? OR d.beneficiary LIKE ? OR d.ncf_doc LIKE ? OR d.rnc LIKE ? OR d.reference LIKE ?)",
    );
    const q = `%${f.busqueda}%`;
    params.push(q, q, q, q, q);
  }
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  const filas = await sql<Record<string, unknown>>(
    `${SQL_COMPROBANTES} ${where} ORDER BY d.date DESC, d.ID DESC LIMIT 500`,
    params,
  );
  return filas.map(mapComprobante);
}

export async function obtenerComprobante(id: number): Promise<ComprobanteCaja | null> {
  if (!(await usarMysql())) return null;
  const [fila] = await sql<Record<string, unknown>>(
    `${SQL_COMPROBANTES} WHERE d.ID = ? LIMIT 1`,
    [id],
  );
  if (!fila) return null;
  const c = mapComprobante(fila);
  const lineas = await sql<Record<string, unknown>>(
    `SELECT h.catalog_account AS cuenta, COALESCE(g.name,'') AS nombre, h.department_id AS dep,
            h.debit, h.credit
       FROM petty_cash_detail_has_gl_department h
       LEFT JOIN gl_catalog g ON g.catalog_account = h.catalog_account
      WHERE h.ID = ? ORDER BY h.NMID`,
    [id],
  );
  c.asiento = lineas.map((l) => ({
    cuenta: txt(l["cuenta"]),
    cuenta_nombre: txt(l["nombre"]),
    descripcion: txt(l["nombre"]) || c.descripcion,
    departamento_id: num(l["dep"]) ? txt(num(l["dep"])) : undefined,
    debito: abs(l["debit"]),
    credito: abs(l["credit"]),
  }));
  return c;
}

export async function resumenCajaChica(
  cajaId: string,
  desde?: string,
  hasta?: string,
): Promise<ResumenCajaChica> {
  const vacio: ResumenCajaChica = {
    fondo: 0,
    pendiente: 0,
    disponible: 0,
    repuesto: 0,
    comprobantes_pendientes: 0,
  };
  if (!(await usarMysql()) || !cajaId) return vacio;

  const [fila] = await sql<Record<string, unknown>>(
    `SELECT
       COALESCE(SUM(CASE WHEN kind IN ('A','I') THEN ABS(amount) ELSE 0 END), 0) AS fondo,
       COALESCE(SUM(CASE WHEN kind = 'E' AND (post_number IS NULL OR post_number = '')
                         THEN ABS(amount) + ABS(tax) + propina + isc + otrosimp
                              - tax_retention - islr_retention ELSE 0 END), 0) AS pendiente,
       COALESCE(SUM(CASE WHEN kind = 'E' AND (post_number IS NULL OR post_number = '')
                         THEN 1 ELSE 0 END), 0) AS n_pendientes
     FROM petty_cash_detail WHERE cash_id = ?`,
    [Number(cajaId)],
  );

  const params: unknown[] = [Number(cajaId)];
  let rango = "";
  if (desde) {
    rango += " AND post_date >= ?";
    params.push(desde);
  }
  if (hasta) {
    rango += " AND post_date <= ?";
    params.push(hasta);
  }
  const [rep] = await sql<Record<string, unknown>>(
    `SELECT COALESCE(SUM(ABS(amount) + ABS(tax) + propina + isc + otrosimp
                          - tax_retention - islr_retention), 0) AS repuesto
       FROM petty_cash_detail
      WHERE cash_id = ? AND post_number IS NOT NULL AND post_number <> ''${rango}`,
    params,
  );

  const fondo = round2(num(fila?.["fondo"]));
  const pendiente = round2(num(fila?.["pendiente"]));
  return {
    fondo,
    pendiente,
    disponible: round2(fondo - pendiente),
    repuesto: round2(num(rep?.["repuesto"])),
    comprobantes_pendientes: num(fila?.["n_pendientes"]),
  };
}

/* ------------------------------ Asiento ------------------------------ */

async function cuentaDeCaja(cajaId: string): Promise<{ cuenta: string; nombre: string }> {
  const [f] = await sql<Record<string, unknown>>(
    `SELECT p.catalog_account AS cuenta, COALESCE(g.name,'') AS nombre, p.name AS caja
       FROM petty_cash p LEFT JOIN gl_catalog g ON g.catalog_account = p.catalog_account
      WHERE p.cash_id = ? LIMIT 1`,
    [Number(cajaId)],
  );
  return { cuenta: txt(f?.["cuenta"]), nombre: txt(f?.["nombre"]) || txt(f?.["caja"]) };
}

/**
 * Cuentas propuestas para el comprobante de caja chica: se debita el gasto y el
 * ITBIS adelantado y se acredita la caja chica, con las retenciones aparte.
 * El usuario puede cambiar cualquier cuenta antes de guardar.
 */
export async function propuestaAsientoCaja(
  entrada: NuevoComprobanteCaja,
): Promise<PropuestaAsiento> {
  const advertencias: string[] = [];
  const lineas: LineaAsiento[] = [];
  if (!(await usarMysql())) return { lineas, advertencias: ["Sin conexión a la base de datos"] };
  if (!entrada.caja_id) return { lineas, advertencias: ["Selecciona la caja chica."] };

  const caja = await cuentaDeCaja(entrada.caja_id);
  const gasto = round2(Math.abs(entrada.bienes) + Math.abs(entrada.servicios));
  const itbis = round2(Math.abs(entrada.itbis));
  const propina = round2(Math.abs(entrada.propina) + Math.abs(entrada.isc) + Math.abs(entrada.otros_impuestos));
  const retItbis = round2(Math.abs(entrada.retencion_itbis));
  const retIsr = round2(Math.abs(entrada.retencion_isr));
  const total = totalComprobanteCaja({
    bienes: entrada.bienes,
    servicios: entrada.servicios,
    itbis: entrada.itbis,
    propina: entrada.propina,
    isc: entrada.isc,
    otros_impuestos: entrada.otros_impuestos,
    retencion_itbis: entrada.retencion_itbis,
    retencion_isr: entrada.retencion_isr,
  });

  const apertura = entrada.tipo !== "E";
  if (apertura) {
    lineas.push({
      cuenta: caja.cuenta,
      descripcion: `Fondo de ${caja.nombre}`,
      debito: total,
      credito: 0,
    });
    lineas.push({
      cuenta: entrada.cuenta_gasto,
      descripcion: entrada.descripcion || "Contrapartida del fondo",
      debito: 0,
      credito: total,
    });
  } else {
    if (gasto + propina > 0)
      lineas.push({
        cuenta: entrada.cuenta_gasto,
        descripcion: entrada.descripcion || "Gasto de caja chica",
        departamento_id: undefined,
        debito: round2(gasto + propina),
        credito: 0,
      });
    if (itbis > 0)
      lineas.push({
        cuenta: CUENTA_ITBIS_COMPRAS,
        descripcion: "ITBIS adelantado",
        debito: itbis,
        credito: 0,
      });
    if (retItbis > 0)
      lineas.push({
        cuenta: entrada.cuenta_itbis || CUENTA_ITBIS_RETENIDO_CXP,
        descripcion: "Retención de ITBIS",
        debito: 0,
        credito: retItbis,
      });
    if (retIsr > 0)
      lineas.push({
        cuenta: entrada.cuenta_isr || CUENTA_ISR_RETENIDO_CXP,
        descripcion: "Retención de ISR",
        debito: 0,
        credito: retIsr,
      });
    lineas.push({
      cuenta: caja.cuenta,
      descripcion: caja.nombre || "Caja chica",
      debito: 0,
      credito: total,
    });
  }

  const faltantes = lineas.filter((l) => !l.cuenta).length;
  if (faltantes)
    advertencias.push(
      `Hay ${faltantes} línea(s) sin cuenta contable. Selecciónalas antes de guardar.`,
    );
  const debito = round2(lineas.reduce((s, l) => s + l.debito, 0));
  const credito = round2(lineas.reduce((s, l) => s + l.credito, 0));
  if (Math.abs(debito - credito) > 0.01)
    advertencias.push(
      `El asiento no está cuadrado: débito ${debito.toFixed(2)} vs crédito ${credito.toFixed(2)}.`,
    );
  return { lineas, advertencias };
}

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

async function guardarAsientoCaja(id: number, lineas: LineaAsiento[]): Promise<void> {
  await ejecutar("DELETE FROM petty_cash_detail_has_gl_department WHERE ID = ?", [id]);
  const utiles = lineas.filter(
    (l) => l.cuenta && (round2(Math.abs(l.debito)) > 0 || round2(Math.abs(l.credito)) > 0),
  );
  if (!utiles.length) return;
  const validas = await cuentasValidas(utiles.map((l) => l.cuenta));
  const invalidas = utiles.filter((l) => !validas.has(l.cuenta)).map((l) => l.cuenta);
  if (invalidas.length)
    throw new Error(`Cuentas contables no encontradas en el catálogo: ${invalidas.join(", ")}`);

  for (const l of utiles) {
    await ejecutar(
      `INSERT INTO petty_cash_detail_has_gl_department
         (ID, catalog_account, department_id, percentage, debit, credit)
       VALUES (?,?,?,?,?,?)`,
      [
        id,
        l.cuenta,
        Number(l.departamento_id || 1),
        100,
        round2(Math.abs(l.debito)),
        round2(Math.abs(l.credito)),
      ],
    );
  }
}

/* ------------------------------- Guardado ------------------------------- */

export async function guardarComprobanteCaja(
  entrada: NuevoComprobanteCaja,
): Promise<{ id: number; total: number }> {
  if (!(await usarMysql())) throw new Error("Sin conexión a la base de datos");
  if (!entrada.caja_id) throw new Error("Selecciona la caja chica");
  if (!entrada.descripcion.trim()) throw new Error("Escribe el concepto del gasto");

  const total = totalComprobanteCaja(entrada);
  if (total <= 0) throw new Error("El total del comprobante debe ser mayor que cero");

  const egreso = entrada.tipo === "E";
  const signo = egreso ? -1 : 1;
  const bienes = round2(Math.abs(entrada.bienes));
  const servicios = round2(Math.abs(entrada.servicios));
  const monto = round2(signo * (bienes + servicios || total));
  const itbis = round2(signo * Math.abs(entrada.itbis));

  const asiento = (entrada.asiento ?? []).filter(
    (l) => l.cuenta && (Math.abs(l.debito) > 0 || Math.abs(l.credito) > 0),
  );
  if (asiento.length) {
    const debito = round2(asiento.reduce((s, l) => s + Math.abs(l.debito), 0));
    const credito = round2(asiento.reduce((s, l) => s + Math.abs(l.credito), 0));
    if (Math.abs(debito - credito) > 0.01)
      throw new Error(
        `El asiento no está cuadrado: débito ${debito.toFixed(2)} vs crédito ${credito.toFixed(2)}`,
      );
    // La cuenta del fondo es fija: el asiento siempre debe acreditar la caja chica.
    const cajas = await sql<Record<string, unknown>>(
      "SELECT catalog_account AS cuenta FROM petty_cash WHERE cash_id = ? LIMIT 1",
      [entrada.caja_id],
    );
    const cuentaCaja = txt(cajas[0]?.["cuenta"]);
    if (cuentaCaja && !asiento.some((l) => l.cuenta === cuentaCaja && Math.abs(l.credito) > 0))
      throw new Error(
        "El asiento debe incluir el crédito a la cuenta de la caja chica; esa línea no se puede quitar ni cambiar.",
      );
  }

  const valores = [
    entrada.fecha,
    entrada.tipo,
    entrada.referencia.slice(0, 15),
    entrada.descripcion.slice(0, 500),
    bienes,
    servicios,
    monto,
    itbis,
    round2(Math.abs(entrada.retencion_itbis)),
    round2(Math.abs(entrada.retencion_isr)),
    round2(Math.abs(entrada.propina)),
    round2(Math.abs(entrada.isc)),
    round2(Math.abs(entrada.otros_impuestos)),
    entrada.estado === "P" ? "P" : "A",
    entrada.cedula.slice(0, 15) || null,
    entrada.rnc.slice(0, 15) || null,
    entrada.beneficiario.slice(0, 50) || null,
    entrada.ncf.trim().slice(0, 19) || null,
    entrada.autorizacion.slice(0, 15) || null,
    entrada.vigencia || null,
    entrada.ncf_id ? Number(entrada.ncf_id) : null,
    Number(entrada.caja_id),
    entrada.cuenta_gasto || null,
    entrada.cuenta_itbis || null,
    entrada.cuenta_isr || null,
    entrada.proyecto_id ? Number(entrada.proyecto_id) : null,
    entrada.gasto_id ? Number(entrada.gasto_id) : null,
    entrada.gasto_menor ? 1 : 0,
    entrada.isr_id ? Number(entrada.isr_id) : null,
  ];

  let id = Number(entrada.id ?? 0);
  if (id > 0) {
    const [actual] = await sql<Record<string, unknown>>(
      "SELECT COALESCE(post_number,'') AS rep FROM petty_cash_detail WHERE ID = ? LIMIT 1",
      [id],
    );
    if (!actual) throw new Error("El comprobante ya no existe");
    if (txt(actual["rep"]))
      throw new Error("Este comprobante ya tiene reposición y no se puede modificar");
    await ejecutar(
      `UPDATE petty_cash_detail SET
         date = ?, kind = ?, reference = ?, description = ?, bienes = ?, servicios = ?,
         amount = ?, tax = ?, tax_retention = ?, islr_retention = ?, propina = ?, isc = ?,
         otrosimp = ?, status = ?, citizen_id = ?, rnc = ?, beneficiary = ?, ncf_doc = ?,
         autorizacion = ?, vigencia = ?, ncf_id = ?, cash_id = ?, catalog_account = ?,
         tax_account = ?, islr_account = ?, project_id = ?, expense_id = ?, gasto_menor = ?,
         isr_id = ?
       WHERE ID = ?`,
      [...valores, id],
    );
  } else {
    const ins = await ejecutar(
      `INSERT INTO petty_cash_detail
        (date, kind, reference, description, bienes, servicios, amount, tax, tax_retention,
         islr_retention, propina, isc, otrosimp, status, citizen_id, rnc, beneficiary, ncf_doc,
         autorizacion, vigencia, ncf_id, cash_id, catalog_account, tax_account, islr_account,
         project_id, expense_id, gasto_menor, isr_id)
       VALUES (${valores.map(() => "?").join(",")})`,
      valores,
    );
    id = ins.insertId;
  }

  await guardarAsientoCaja(id, asiento);
  return { id, total };
}

export async function eliminarComprobanteCaja(id: number): Promise<void> {
  if (!(await usarMysql())) throw new Error("Sin conexión a la base de datos");
  const [actual] = await sql<Record<string, unknown>>(
    "SELECT COALESCE(post_number,'') AS rep FROM petty_cash_detail WHERE ID = ? LIMIT 1",
    [id],
  );
  if (!actual) throw new Error("El comprobante ya no existe");
  if (txt(actual["rep"]))
    throw new Error("Este comprobante ya tiene reposición y no se puede eliminar");
  await ejecutar("DELETE FROM petty_cash_detail_has_gl_department WHERE ID = ?", [id]);
  await ejecutar("DELETE FROM petty_cash_detail WHERE ID = ?", [id]);
}

/* ------------------------------ Reposición ------------------------------ */

/** Asiento propuesto para la reposición: entra el efectivo, sale del banco. */
export async function propuestaAsientoReposicion(
  entrada: NuevaReposicionCaja,
): Promise<PropuestaAsiento> {
  const advertencias: string[] = [];
  const lineas: LineaAsiento[] = [];
  if (!(await usarMysql())) return { lineas, advertencias: ["Sin conexión a la base de datos"] };
  if (!entrada.caja_id) return { lineas, advertencias: ["Selecciona la caja chica."] };
  if (!entrada.comprobantes.length)
    return { lineas, advertencias: ["Selecciona los comprobantes a reponer."] };

  const caja = await cuentaDeCaja(entrada.caja_id);
  const total = await totalComprobantes(entrada.comprobantes);

  const [banco] = await sql<Record<string, unknown>>(
    `SELECT b.catalog_account AS cuenta, b.name AS nombre FROM banks b WHERE b.bank_id = ? LIMIT 1`,
    [Number(entrada.banco_id || 0)],
  );
  if (!banco) advertencias.push("Selecciona la cuenta bancaria del reembolso.");

  lineas.push({
    cuenta: caja.cuenta,
    descripcion: `Reposición de ${caja.nombre}`,
    debito: total,
    credito: 0,
  });
  lineas.push({
    cuenta: txt(banco?.["cuenta"]),
    descripcion: txt(banco?.["nombre"]) || "Banco",
    debito: 0,
    credito: total,
  });
  return { lineas, advertencias };
}

async function totalComprobantes(ids: number[]): Promise<number> {
  if (!ids.length) return 0;
  const [f] = await sql<Record<string, unknown>>(
    `SELECT COALESCE(SUM(ABS(amount) + ABS(tax) + propina + isc + otrosimp
                          - tax_retention - islr_retention), 0) AS total
       FROM petty_cash_detail WHERE ID IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  return round2(num(f?.["total"]));
}

/**
 * Repone el fondo: registra la salida del banco y marca los comprobantes con el
 * número y la fecha de la reposición, con lo que dejan de ser modificables.
 */
export async function reponerFondoCaja(
  entrada: NuevaReposicionCaja,
): Promise<{ id: number; numero: string; total: number; comprobantes: number }> {
  if (!(await usarMysql())) throw new Error("Sin conexión a la base de datos");
  if (!entrada.banco_id) throw new Error("Selecciona la cuenta bancaria del reembolso");
  if (!entrada.numero.trim()) throw new Error("Escribe el número del cheque o transferencia");
  const ids = [...new Set(entrada.comprobantes.filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) throw new Error("Selecciona al menos un comprobante a reponer");

  const repuestos = await sql<Record<string, unknown>>(
    `SELECT ID FROM petty_cash_detail
      WHERE ID IN (${ids.map(() => "?").join(",")}) AND post_number IS NOT NULL AND post_number <> ''`,
    ids,
  );
  if (repuestos.length)
    throw new Error(
      `Los comprobantes ${repuestos.map((r) => num(r["ID"])).join(", ")} ya tienen reposición`,
    );

  const total = await totalComprobantes(ids);
  if (total <= 0) throw new Error("El total a reponer debe ser mayor que cero");

  const caja = await cuentaDeCaja(entrada.caja_id);
  const asiento = (entrada.asiento ?? []).length
    ? entrada.asiento!
    : (await propuestaAsientoReposicion({ ...entrada, comprobantes: ids })).lineas;

  const movimiento = await crearMovimientoBanco({
    banco_id: entrada.banco_id,
    tipo_id: entrada.tipo_id,
    fecha: entrada.fecha,
    numero: entrada.numero,
    monto: total,
    tasa_cambio: 1,
    beneficiario: `Reposición ${caja.nombre}`.slice(0, 50),
    descripcion:
      entrada.descripcion.trim() ||
      `Reposición de caja chica ${caja.nombre} (${ids.length} comprobante(s))`,
    ncf: "",
    monto_ncf: 0,
    itbis: 0,
    comision: 0,
    itbis_retenido: 0,
    isr_retenido: 0,
    asiento,
  });

  await ejecutar(
    `UPDATE petty_cash_detail
        SET post_number = ?, post_date = ?, bank_book_id = ?
      WHERE ID IN (${ids.map(() => "?").join(",")})`,
    [entrada.numero.slice(0, 5), entrada.fecha, movimiento.id, ...ids],
  );

  return { id: movimiento.id, numero: entrada.numero, total, comprobantes: ids.length };
}
