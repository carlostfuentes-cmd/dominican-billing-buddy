// Cuentas por cobrar sobre las tablas existentes:
//   ar            -> cabecera del movimiento (factura, recibo, nota, avance…)
//   ar_reference  -> aplicación del movimiento a un documento (referencia)
//   ar_detail     -> asiento contable del movimiento
//   ar_kinds      -> tipos de transacción, payment_kinds -> formas de pago
//
// El sistema es multimoneda: cada movimiento guarda su moneda y su tasa
// (columnas currency_id / exchange de ar).

import {
  round2,
  type BalanceClienteCxC,
  type DocPendienteCxC,
  type FiltroCxC,
  type ListasCxC,
  type Moneda,
  type MovimientoCxC,
  type NuevoMovimientoCxC,
  type OpcionId,
  type TipoMovimientoCxC,
} from "@/lib/erp-types";
import { ejecutar, sql } from "./mysql.server";
import { defectos, usarMysql } from "./repo.server";

/** Cuentas contables usadas por el asiento de CxC. */
const CUENTA_ITBIS_RETENIDO = "214201";
const CUENTA_ANTICIPO_RETENIDO = "2166";

const txt = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* ------------------------------- Consultas ------------------------------- */

const SQL_MOVIMIENTOS = `
  SELECT a.ar_id AS id,
         DATE_FORMAT(a.date, '%Y-%m-%d') AS fecha,
         a.doc_number AS documento,
         a.ar_kind_id AS tipo_id,
         COALESCE(k.name, a.ar_kind_id) AS tipo,
         COALESCE(k.kind, 'D') AS signo,
         a.customer_id AS cliente_id,
         COALESCE(NULLIF(c.name, ''), '') AS cliente,
         COALESCE(NULLIF(a.currency_id, ''), 'DOP') AS moneda,
         COALESCE(a.exchange, 1) AS tasa_cambio,
         COALESCE(a.description, '') AS descripcion,
         COALESCE(pk.name, '') AS forma_pago,
         COALESCE(b.name, '') AS banco,
         COALESCE(a.payment_doc, '') AS pago_doc,
         COALESCE(r.monto, 0) AS monto_ref,
         COALESCE(d.monto, 0) AS monto_asiento
  FROM ar a
  LEFT JOIN ar_kinds k ON k.ar_kind_id = a.ar_kind_id
  LEFT JOIN customers c ON c.customer_id = a.customer_id
  LEFT JOIN payment_kinds pk ON pk.payment_kind_id = a.payment_kind_id
  LEFT JOIN banks b ON b.bank_id = a.bank_id
  LEFT JOIN (SELECT ar_id, ABS(SUM(amount)) AS monto FROM ar_reference GROUP BY ar_id) r
         ON r.ar_id = a.ar_id
  LEFT JOIN (SELECT ar_id, SUM(debit) AS monto FROM ar_detail GROUP BY ar_id) d
         ON d.ar_id = a.ar_id
`;

export async function listarMovimientos(filtro: FiltroCxC = {}): Promise<MovimientoCxC[]> {
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
  if (filtro.clienteId) {
    cond.push("a.customer_id = ?");
    params.push(filtro.clienteId);
  }
  if (filtro.tipoId) {
    cond.push("a.ar_kind_id = ?");
    params.push(filtro.tipoId);
  }
  const where = cond.length ? ` WHERE ${cond.join(" AND ")}` : "";
  const filas = await sql<Record<string, unknown>>(
    `${SQL_MOVIMIENTOS}${where} ORDER BY a.date DESC, a.ar_id DESC LIMIT 500`,
    params,
  );
  return filas.map((r) => {
    const ref = round2(num(r["monto_ref"]));
    const asiento = round2(num(r["monto_asiento"]));
    return {
      id: num(r["id"]),
      fecha: txt(r["fecha"]),
      documento: num(r["documento"]),
      tipo_id: txt(r["tipo_id"]),
      tipo: txt(r["tipo"]),
      signo: txt(r["signo"]) === "C" ? "C" : "D",
      cliente_id: txt(r["cliente_id"]),
      cliente: txt(r["cliente"]),
      moneda: txt(r["moneda"]) || "DOP",
      tasa_cambio: num(r["tasa_cambio"]) || 1,
      monto: ref || asiento,
      descripcion: txt(r["descripcion"]).replace(/\r?\n/g, " ").trim(),
      forma_pago: txt(r["forma_pago"]),
      banco: txt(r["banco"]),
      pago_doc: txt(r["pago_doc"]),
    };
  });
}

/** Documentos con balance pendiente de un cliente. */
export async function documentosPendientes(clienteId: string): Promise<DocPendienteCxC[]> {
  if (!(await usarMysql()) || !clienteId) return [];
  const filas = await sql<Record<string, unknown>>(
    `SELECT r.reference AS referencia,
            DATE_FORMAT(MIN(a.date), '%Y-%m-%d') AS fecha,
            ROUND(SUM(r.amount), 2) AS balance,
            COALESCE(NULLIF(MAX(a.currency_id), ''), 'DOP') AS moneda
     FROM ar a
     JOIN ar_reference r ON r.ar_id = a.ar_id
     WHERE a.customer_id = ?
     GROUP BY r.reference
     HAVING ROUND(SUM(r.amount), 2) <> 0
     ORDER BY MIN(a.date), r.reference
     LIMIT 500`,
    [clienteId],
  );
  return filas.map((r) => ({
    referencia: num(r["referencia"]),
    fecha: txt(r["fecha"]),
    balance: round2(num(r["balance"])),
    moneda: txt(r["moneda"]) || "DOP",
  }));
}

/** Clientes con balance pendiente (antigüedad y total por moneda). */
export async function balancesClientes(): Promise<BalanceClienteCxC[]> {
  if (!(await usarMysql())) return [];
  const filas = await sql<Record<string, unknown>>(
    `SELECT cliente_id, cliente, moneda,
            ROUND(SUM(balance), 2) AS balance,
            COUNT(*) AS documentos,
            MIN(fecha) AS mas_antiguo
     FROM (
       SELECT a.customer_id AS cliente_id,
              COALESCE(NULLIF(MAX(c.name), ''), a.customer_id) AS cliente,
              COALESCE(NULLIF(MAX(a.currency_id), ''), 'DOP') AS moneda,
              ROUND(SUM(r.amount), 2) AS balance,
              DATE_FORMAT(MIN(a.date), '%Y-%m-%d') AS fecha
       FROM ar a
       JOIN ar_reference r ON r.ar_id = a.ar_id
       LEFT JOIN customers c ON c.customer_id = a.customer_id
       GROUP BY a.customer_id, r.reference
       HAVING ROUND(SUM(r.amount), 2) <> 0
     ) p
     GROUP BY cliente_id, cliente, moneda
     ORDER BY balance DESC
     LIMIT 300`,
  );
  return filas.map((r) => ({
    cliente_id: txt(r["cliente_id"]),
    cliente: txt(r["cliente"]),
    moneda: txt(r["moneda"]) || "DOP",
    balance: round2(num(r["balance"])),
    documentos: num(r["documentos"]),
    mas_antiguo: txt(r["mas_antiguo"]),
  }));
}

export async function listasCxC(): Promise<ListasCxC> {
  const vacio: ListasCxC = {
    tipos: [],
    formas: [],
    bancos: [],
    sucursales: [],
    vendedores: [],
    monedas: [{ id: "DOP", nombre: "PESOS DOMINICANOS", simbolo: "RD$" }],
  };
  if (!(await usarMysql())) return vacio;
  const opciones = async (consulta: string): Promise<OpcionId[]> => {
    try {
      const filas = await sql<Record<string, unknown>>(consulta);
      return filas.map((r) => ({
        id: txt(r["id"]),
        nombre: txt(r["nombre"]) || txt(r["id"]),
      }));
    } catch {
      return [];
    }
  };
  const [tiposRaw, formas, bancos, sucursales, vendedores, monedasRaw] = await Promise.all([
    (async () => {
      try {
        return await sql<Record<string, unknown>>(
          `SELECT ar_kind_id AS id, name AS nombre, kind AS signo, ncf
           FROM ar_kinds ORDER BY name`,
        );
      } catch {
        return [];
      }
    })(),
    opciones("SELECT payment_kind_id AS id, name AS nombre FROM payment_kinds ORDER BY name"),
    opciones(
      "SELECT bank_id AS id, name AS nombre FROM banks WHERE status = 'A' ORDER BY orden, name",
    ),
    opciones("SELECT branch_id AS id, name AS nombre FROM branchs ORDER BY name LIMIT 100"),
    opciones(
      `SELECT salesman_id AS id, TRIM(CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,''))) AS nombre
       FROM salesmen WHERE status = 'A' ORDER BY nombre LIMIT 300`,
    ),
    (async () => {
      try {
        return await sql<Record<string, unknown>>(
          `SELECT currency_id AS id, name AS nombre, symbol AS simbolo
           FROM currencies WHERE currency_id <> '000' ORDER BY is_base DESC, currency_id`,
        );
      } catch {
        return [];
      }
    })(),
  ]);
  const tipos: TipoMovimientoCxC[] = tiposRaw.map((r) => ({
    id: txt(r["id"]),
    nombre: txt(r["nombre"]),
    signo: txt(r["signo"]) === "C" ? "C" : "D",
    ncf: num(r["ncf"]) === 1,
  }));
  const monedas: Moneda[] = monedasRaw.map((r) => ({
    id: txt(r["id"]),
    nombre: txt(r["nombre"]) || txt(r["id"]),
    simbolo: txt(r["simbolo"]) || txt(r["id"]),
  }));
  return {
    tipos,
    formas,
    bancos,
    sucursales,
    vendedores,
    monedas: monedas.length ? monedas : vacio.monedas,
  };
}

/* ------------------------------ Registro -------------------------------- */

interface CuentasCxC {
  cliente: string;
  contrapartida: string;
}

async function cuentas(bancoId: string | undefined): Promise<CuentasCxC> {
  const [clase] = await sql<Record<string, unknown>>(
    `SELECT debit_account, credit_account FROM ar_classes
     WHERE kind = 'CLIENTE' AND debit_account IS NOT NULL ORDER BY class_id LIMIT 1`,
  );
  const cliente = txt(clase?.["debit_account"]) || "1120101";
  let contrapartida = txt(clase?.["credit_account"]);
  if (bancoId) {
    const [banco] = await sql<Record<string, unknown>>(
      "SELECT catalog_account FROM banks WHERE bank_id = ? LIMIT 1",
      [bancoId],
    );
    contrapartida = txt(banco?.["catalog_account"]) || contrapartida;
  }
  return { cliente, contrapartida: contrapartida || cliente };
}

/**
 * Registra un movimiento de CxC: cabecera en `ar`, aplicación a los
 * documentos en `ar_reference` y asiento en `ar_detail`.
 */
export async function crearMovimiento(entrada: NuevoMovimientoCxC): Promise<MovimientoCxC> {
  if (!(await usarMysql())) throw new Error("Sin conexión a la base de datos");

  const [tipo] = await sql<Record<string, unknown>>(
    "SELECT ar_kind_id, name, kind FROM ar_kinds WHERE ar_kind_id = ? LIMIT 1",
    [entrada.tipo_id],
  );
  if (!tipo) throw new Error("Tipo de transacción no válido");
  const signo: "D" | "C" = txt(tipo["kind"]) === "C" ? "C" : "D";

  const [cli] = await sql<Record<string, unknown>>(
    "SELECT customer_id, name FROM customers WHERE customer_id = ? LIMIT 1",
    [entrada.cliente_id],
  );
  if (!cli) throw new Error("Cliente no encontrado");

  const def = await defectos();
  const sucursal = Number(entrada.sucursal_id ?? 1) || 1;
  const vendedor = Number(entrada.vendedor_id ?? def.salesman_id) || def.salesman_id;
  const banco = entrada.banco_id ? String(entrada.banco_id) : "";

  let documento = entrada.documento ?? 0;
  if (!documento) {
    const [ultimo] = await sql<Record<string, unknown>>(
      "SELECT COALESCE(MAX(doc_number), 0) + 1 AS n FROM ar WHERE ar_kind_id = ?",
      [entrada.tipo_id],
    );
    documento = num(ultimo?.["n"]) || 1;
  }

  const aplicado = round2(
    entrada.aplicaciones.reduce((a, x) => a + (x.valor || 0) + (x.descuento || 0), 0),
  );
  const retenciones = round2((entrada.itbis_retenido || 0) + (entrada.anticipo_retenido || 0));
  const efectivo = round2(entrada.monto || 0);
  const total = aplicado || round2(efectivo + retenciones);
  if (total <= 0) throw new Error("El valor del movimiento debe ser mayor que cero");

  const ins = await ejecutar(
    `INSERT INTO ar
       (date, collection_date, doc_number, description, exchange, payment_doc,
        customer_id, currency_id, ar_kind_id, bank_id, payment_kind_id,
        payment_currency, salesman_id, branch_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      entrada.fecha,
      entrada.pago_fecha || entrada.fecha,
      documento,
      entrada.concepto.slice(0, 100),
      entrada.tasa_cambio || 1,
      entrada.pago_numero.slice(0, 20),
      entrada.cliente_id,
      entrada.moneda || "DOP",
      entrada.tipo_id,
      banco ? banco : null,
      entrada.forma_pago_id || null,
      entrada.moneda || "DOP",
      vendedor,
      sucursal,
    ],
  );
  const arId = ins.insertId;

  // Aplicación a los documentos: los abonos (C) reducen el balance.
  for (const a of entrada.aplicaciones) {
    const monto = round2((a.valor || 0) + (a.descuento || 0));
    if (!monto) continue;
    await ejecutar("INSERT INTO ar_reference (reference, amount, ar_id) VALUES (?,?,?)", [
      a.referencia,
      signo === "C" ? -monto : monto,
      arId,
    ]);
  }

  // Asiento contable.
  const ct = await cuentas(banco || undefined);
  const linea = async (
    debito: number,
    credito: number,
    cuenta: string,
    kind: "D" | "I" | "R" | null,
  ) => {
    if (round2(debito) === 0 && round2(credito) === 0) return;
    await ejecutar(
      "INSERT INTO ar_detail (debit, credit, kind, ar_id, catalog_account) VALUES (?,?,?,?,?)",
      [round2(debito), round2(credito), kind, arId, cuenta],
    );
  };

  if (signo === "C") {
    await linea(0, total, ct.cliente, null);
    await linea(round2(total - retenciones), 0, ct.contrapartida, null);
    await linea(entrada.itbis_retenido || 0, 0, CUENTA_ITBIS_RETENIDO, "I");
    await linea(entrada.anticipo_retenido || 0, 0, CUENTA_ANTICIPO_RETENIDO, "R");
  } else {
    await linea(total, 0, ct.cliente, null);
    await linea(0, round2(total - retenciones), ct.contrapartida, null);
    await linea(0, entrada.itbis_retenido || 0, CUENTA_ITBIS_RETENIDO, "I");
    await linea(0, entrada.anticipo_retenido || 0, CUENTA_ANTICIPO_RETENIDO, "R");
  }

  const [mov] = await listarMovimientos({ clienteId: entrada.cliente_id });
  return (
    mov ?? {
      id: arId,
      fecha: entrada.fecha,
      documento,
      tipo_id: entrada.tipo_id,
      tipo: txt(tipo["name"]),
      signo,
      cliente_id: entrada.cliente_id,
      cliente: txt(cli["name"]),
      moneda: entrada.moneda || "DOP",
      tasa_cambio: entrada.tasa_cambio || 1,
      monto: total,
      descripcion: entrada.concepto,
      forma_pago: entrada.forma_pago_id,
      banco,
      pago_doc: entrada.pago_numero,
    }
  );
}
