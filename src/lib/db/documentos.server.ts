// Cotizaciones, conduces y devoluciones sobre las tablas existentes:
//   cotizaciones -> quotations + quotations_detail
//   conduces     -> delivery_orders + delivery_orders_detail
//   devoluciones -> reverse_invoices + reverse_invoices_detail
//                   (nota de crédito B04, motivo en reverse_invoices_motives)
//
// El sistema es multimoneda: todo documento guarda su moneda y su tasa.

import {
  calcularTotales,
  round2,
  type Documento,
  type FiltroDocumentos,
  type LineaFactura,
  type NuevoDocumento,
  type OpcionId,
  type TipoDocumento,
} from "@/lib/erp-types";
import { ejecutar, sql } from "./mysql.server";
import { defectos, NCF_ID_POR_TIPO, obtenerFactura, reservarNCF, usarMysql } from "./repo.server";

/* ------------------------------- Consultas ------------------------------- */

const TOTALES = (tabla: string, fk: string) => `
  LEFT JOIN (
    SELECT ${fk} AS ref,
           ROUND(SUM(quantity * price - discount), 2) AS subtotal,
           ROUND(SUM(discount), 2) AS descuento,
           ROUND(SUM(tax1 + tax2 + tax3), 2) AS itbis,
           ROUND(SUM(quantity * price - discount + tax1 + tax2 + tax3), 2) AS total
    FROM ${tabla} GROUP BY ${fk}
  ) t`;

const SQL_COTIZACIONES = `
  SELECT * FROM (
    SELECT q.quotation_id AS id, q.branch_id AS sucursal_id,
           DATE_FORMAT(q.date, '%Y-%m-%d') AS fecha, NULL AS fecha_entrega,
           q.customer_id AS cliente_id,
           COALESCE(NULLIF(c.name, ''), q.customer_name, '') AS cliente_nombre,
           COALESCE(NULLIF(c.rnc, ''), '') AS cliente_rnc,
           COALESCE(NULLIF(c.address1, ''), '') AS cliente_direccion,
           COALESCE(NULLIF(c.phone1, ''), '') AS cliente_telefono,
           COALESCE(NULLIF(c.main_email, ''), '') AS cliente_email,
           COALESCE(NULLIF(q.currency_id, ''), 'DOP') AS moneda,
           COALESCE(q.currency_rate, 1) AS tasa_cambio,
           q.credit_days AS dias_credito, COALESCE(q.notes, '') AS notas,
           COALESCE(q.contact, '') AS contacto,
           q.salesman_id AS vendedor_id,
           TRIM(CONCAT(COALESCE(sm.first_name, ''), ' ', COALESCE(sm.last_name, ''))) AS vendedor,
           q.tech_id AS tecnico_id, NULL AS almacen_id, NULL AS almacen,
           q.project_id AS proyecto_id, q.department_id AS departamento_id,
           COALESCE(q.customer_order, '') AS orden_cliente,
           NULL AS pedido_id, NULL AS cotizacion_id, NULL AS factura_id,
           '' AS ncf, NULL AS motivo_id, '' AS motivo,
           q.void AS anulado, 0 AS aplicada,
           COALESCE(t.subtotal, 0) AS subtotal, COALESCE(t.descuento, 0) AS descuento,
           COALESCE(t.itbis, 0) AS itbis, COALESCE(t.total, 0) AS total
    FROM quotations q
    LEFT JOIN customers c ON c.customer_id = q.customer_id
    LEFT JOIN salesmen sm ON sm.salesman_id = q.salesman_id
    ${TOTALES("quotations_detail", "quotation_id")} ON t.ref = q.quotation_id
  ) d`;

const SQL_CONDUCES = `
  SELECT * FROM (
    SELECT o.do_id AS id, o.branch_id AS sucursal_id,
           DATE_FORMAT(o.date, '%Y-%m-%d') AS fecha,
           DATE_FORMAT(o.delivery_date, '%Y-%m-%d') AS fecha_entrega,
           o.customer_id AS cliente_id,
           COALESCE(NULLIF(c.name, ''), o.customer_name, '') AS cliente_nombre,
           COALESCE(NULLIF(c.rnc, ''), '') AS cliente_rnc,
           COALESCE(NULLIF(c.address1, ''), '') AS cliente_direccion,
           COALESCE(NULLIF(c.phone1, ''), '') AS cliente_telefono,
           COALESCE(NULLIF(c.main_email, ''), '') AS cliente_email,
           COALESCE(NULLIF(o.currency_id, ''), 'DOP') AS moneda,
           COALESCE(o.currency_rate, 1) AS tasa_cambio,
           o.credit_days AS dias_credito, COALESCE(o.notes, '') AS notas,
           '' AS contacto,
           o.salesman_id AS vendedor_id,
           TRIM(CONCAT(COALESCE(sm.first_name, ''), ' ', COALESCE(sm.last_name, ''))) AS vendedor,
           NULL AS tecnico_id, o.warehouse_id AS almacen_id, w.name AS almacen,
           o.project_id AS proyecto_id, NULL AS departamento_id,
           '' AS orden_cliente,
           o.order_id AS pedido_id, o.quotation_id AS cotizacion_id, NULL AS factura_id,
           '' AS ncf, NULL AS motivo_id, COALESCE(o.motivo, '') AS motivo,
           0 AS anulado, CASE WHEN o.open = 1 THEN 0 ELSE 1 END AS aplicada,
           COALESCE(t.subtotal, 0) AS subtotal, COALESCE(t.descuento, 0) AS descuento,
           COALESCE(t.itbis, 0) AS itbis, COALESCE(t.total, 0) AS total
    FROM delivery_orders o
    LEFT JOIN customers c ON c.customer_id = o.customer_id
    LEFT JOIN salesmen sm ON sm.salesman_id = o.salesman_id
    LEFT JOIN warehouse w ON w.warehouse_id = o.warehouse_id
    ${TOTALES("delivery_orders_detail", "do_id")} ON t.ref = o.do_id
  ) d`;

const SQL_DEVOLUCIONES = `
  SELECT * FROM (
    SELECT r.reverse_invoice_id AS id, r.branch_id AS sucursal_id,
           DATE_FORMAT(r.date, '%Y-%m-%d') AS fecha, NULL AS fecha_entrega,
           r.customer_id AS cliente_id,
           COALESCE(NULLIF(c.name, ''), r.customer_name, '') AS cliente_nombre,
           COALESCE(NULLIF(c.rnc, ''), '') AS cliente_rnc,
           COALESCE(NULLIF(c.address1, ''), '') AS cliente_direccion,
           COALESCE(NULLIF(c.phone1, ''), '') AS cliente_telefono,
           COALESCE(NULLIF(c.main_email, ''), '') AS cliente_email,
           COALESCE(NULLIF(r.currency_id, ''), 'DOP') AS moneda,
           COALESCE(r.currency_rate, 1) AS tasa_cambio,
           0 AS dias_credito, COALESCE(r.notes, '') AS notas,
           '' AS contacto,
           r.salesman_id AS vendedor_id,
           TRIM(CONCAT(COALESCE(sm.first_name, ''), ' ', COALESCE(sm.last_name, ''))) AS vendedor,
           r.tech_id AS tecnico_id, r.warehouse_id AS almacen_id, w.name AS almacen,
           r.project_id AS proyecto_id, NULL AS departamento_id,
           COALESCE(r.customer_order, '') AS orden_cliente,
           NULL AS pedido_id, NULL AS cotizacion_id, r.invoice_id AS factura_id,
           COALESCE(r.ncf_doc, '') AS ncf, r.motivo_dgii AS motivo_id, '' AS motivo,
           0 AS anulado, COALESCE(r.posted, 0) AS aplicada,
           COALESCE(t.subtotal, 0) AS subtotal, COALESCE(t.descuento, 0) AS descuento,
           COALESCE(t.itbis, 0) AS itbis, COALESCE(t.total, 0) AS total
    FROM reverse_invoices r
    LEFT JOIN customers c ON c.customer_id = r.customer_id
    LEFT JOIN salesmen sm ON sm.salesman_id = r.salesman_id
    LEFT JOIN warehouse w ON w.warehouse_id = r.warehouse_id
    ${TOTALES("reverse_invoices_detail", "reverse_invoice_id")} ON t.ref = r.reverse_invoice_id
  ) d`;

function consultaBase(tipo: TipoDocumento): string {
  if (tipo === "cotizacion") return SQL_COTIZACIONES;
  if (tipo === "conduce") return SQL_CONDUCES;
  return SQL_DEVOLUCIONES;
}

function consultaLineas(tipo: TipoDocumento): string {
  if (tipo === "cotizacion") {
    return `
      SELECT l.product_id AS item_id, l.product_id AS codigo,
             COALESCE(NULLIF(l.name, ''), NULLIF(p.name, ''), l.product_id) AS descripcion,
             l.notes AS observacion,
             l.quantity AS cantidad, l.bonus AS oferta, l.price AS precio,
             l.discount_rate AS descuento_pct,
             CASE WHEN l.quantity * l.price - l.discount > 0
                  THEN ROUND((l.tax1 + l.tax2 + l.tax3) / (l.quantity * l.price - l.discount) * 100)
                  ELSE 0 END AS tasa_itbis,
             ROUND(l.quantity * l.price - l.discount, 2) AS subtotal,
             ROUND(l.tax1 + l.tax2 + l.tax3, 2) AS itbis,
             ROUND(l.quantity * l.price - l.discount + l.tax1 + l.tax2 + l.tax3, 2) AS total
      FROM quotations_detail l
      LEFT JOIN products p ON p.product_id = l.product_id
      WHERE l.quotation_id = ? ORDER BY l.position, l.quotation_detail_id`;
  }
  if (tipo === "conduce") {
    return `
      SELECT l.product_id AS item_id, l.product_id AS codigo,
             COALESCE(NULLIF(l.name, ''), NULLIF(p.name, ''), l.product_id) AS descripcion,
             l.notes AS observacion,
             l.quantity AS cantidad, 0 AS oferta, l.price AS precio,
             l.discount_rate AS descuento_pct,
             CASE WHEN l.quantity * l.price - l.discount > 0
                  THEN ROUND((l.tax1 + l.tax2 + l.tax3) / (l.quantity * l.price - l.discount) * 100)
                  ELSE 0 END AS tasa_itbis,
             ROUND(l.quantity * l.price - l.discount, 2) AS subtotal,
             ROUND(l.tax1 + l.tax2 + l.tax3, 2) AS itbis,
             ROUND(l.quantity * l.price - l.discount + l.tax1 + l.tax2 + l.tax3, 2) AS total
      FROM delivery_orders_detail l
      LEFT JOIN products p ON p.product_id = l.product_id
      WHERE l.do_id = ? ORDER BY l.position, l.do_detail_id`;
  }
  return `
    SELECT l.product_id AS item_id, l.product_id AS codigo,
           COALESCE(NULLIF(p.name, ''), l.product_id) AS descripcion,
           l.quantity AS cantidad, l.bonus AS oferta, l.price AS precio,
           CASE WHEN l.quantity * l.price > 0
                THEN ROUND(l.discount / (l.quantity * l.price) * 100, 2)
                ELSE 0 END AS descuento_pct,
           CASE WHEN l.quantity * l.price - l.discount > 0
                THEN ROUND((l.tax1 + l.tax2 + l.tax3) / (l.quantity * l.price - l.discount) * 100)
                ELSE 0 END AS tasa_itbis,
           ROUND(l.quantity * l.price - l.discount, 2) AS subtotal,
           ROUND(l.tax1 + l.tax2 + l.tax3, 2) AS itbis,
           ROUND(l.quantity * l.price - l.discount + l.tax1 + l.tax2 + l.tax3, 2) AS total
    FROM reverse_invoices_detail l
    LEFT JOIN products p ON p.product_id = l.product_id
    WHERE l.reverse_invoice_id = ? ORDER BY l.position, l.reverse_invoice_detail_id`;
}

interface FilaDoc {
  id: number;
  sucursal_id: number | null;
  fecha: string;
  fecha_entrega: string | null;
  cliente_id: string;
  cliente_nombre: string;
  cliente_rnc: string;
  cliente_direccion: string | null;
  cliente_telefono: string | null;
  cliente_email: string | null;
  moneda: string | null;
  tasa_cambio: number | null;
  dias_credito: number | null;
  notas: string | null;
  contacto: string | null;
  vendedor_id: number | null;
  vendedor: string | null;
  tecnico_id: number | null;
  almacen_id: number | null;
  almacen: string | null;
  proyecto_id: number | null;
  departamento_id: number | null;
  orden_cliente: string | null;
  pedido_id: number | null;
  cotizacion_id: number | null;
  factura_id: number | null;
  ncf: string | null;
  motivo_id: number | null;
  motivo: string | null;
  anulado: number | null;
  aplicada: number | null;
  subtotal: number;
  descuento: number;
  itbis: number;
  total: number;
}

const opc = (v: number | null | undefined): string | undefined =>
  v === null || v === undefined ? undefined : String(v);

function mapear(tipo: TipoDocumento, f: FilaDoc): Documento {
  return {
    tipo,
    id: Number(f.id),
    sucursal_id: Number(f.sucursal_id ?? 1) || 1,
    fecha: String(f.fecha ?? "").slice(0, 10),
    fecha_entrega: f.fecha_entrega ? String(f.fecha_entrega).slice(0, 10) : undefined,
    cliente_id: String(f.cliente_id ?? ""),
    cliente_nombre: f.cliente_nombre ?? "",
    cliente_rnc: f.cliente_rnc ?? "",
    cliente_direccion: f.cliente_direccion ?? "",
    cliente_telefono: f.cliente_telefono ?? "",
    cliente_email: f.cliente_email ?? "",
    moneda: (f.moneda ?? "DOP").toUpperCase(),
    tasa_cambio: Number(f.tasa_cambio ?? 1) || 1,
    dias_credito: Number(f.dias_credito ?? 0),
    notas: f.notas ?? "",
    contacto: f.contacto ?? "",
    vendedor_id: opc(f.vendedor_id),
    vendedor: f.vendedor?.trim() || undefined,
    tecnico_id: opc(f.tecnico_id),
    almacen_id: opc(f.almacen_id),
    almacen: f.almacen ?? undefined,
    proyecto_id: opc(f.proyecto_id),
    departamento_id: opc(f.departamento_id),
    orden_cliente: f.orden_cliente ?? "",
    pedido_id: f.pedido_id === null || f.pedido_id === undefined ? undefined : Number(f.pedido_id),
    cotizacion_id:
      f.cotizacion_id === null || f.cotizacion_id === undefined ? undefined : Number(f.cotizacion_id),
    factura_id:
      f.factura_id === null || f.factura_id === undefined ? undefined : Number(f.factura_id),
    ncf: f.ncf ?? "",
    motivo_id: f.motivo_id === null || f.motivo_id === undefined ? undefined : Number(f.motivo_id),
    motivo: f.motivo ?? "",
    anulado: Number(f.anulado ?? 0) === 1,
    aplicada: Number(f.aplicada ?? 0) === 1,
    subtotal: Number(f.subtotal ?? 0),
    descuento: Number(f.descuento ?? 0),
    itbis: Number(f.itbis ?? 0),
    total: Number(f.total ?? 0),
    lineas: [],
  };
}

/* --------------------------- Modo demostración --------------------------- */

const demoDocs = new Map<TipoDocumento, Documento[]>([
  ["cotizacion", []],
  ["conduce", []],
  ["devolucion", []],
]);
let demoId = 1;

/* --------------------------------- Lectura ------------------------------- */

export async function listarDocumentos(
  tipo: TipoDocumento,
  filtro: FiltroDocumentos = {},
): Promise<Documento[]> {
  if (await usarMysql()) {
    const cond: string[] = [];
    const params: unknown[] = [];
    if (filtro.desde) {
      cond.push("d.fecha >= ?");
      params.push(filtro.desde);
    }
    if (filtro.hasta) {
      cond.push("d.fecha <= ?");
      params.push(filtro.hasta);
    }
    if (filtro.clienteId) {
      cond.push("d.cliente_id = ?");
      params.push(filtro.clienteId);
    }
    const filas = await sql<FilaDoc>(
      `${consultaBase(tipo)}
       ${cond.length ? `WHERE ${cond.join(" AND ")}` : ""}
       ORDER BY d.fecha DESC, d.id DESC LIMIT 500`,
      params,
    );
    return filas.map((f) => mapear(tipo, f));
  }
  return (demoDocs.get(tipo) ?? []).filter(
    (d) =>
      (!filtro.desde || d.fecha >= filtro.desde) &&
      (!filtro.hasta || d.fecha <= filtro.hasta) &&
      (!filtro.clienteId || d.cliente_id === filtro.clienteId),
  );
}

export async function obtenerDocumento(
  tipo: TipoDocumento,
  id: number,
): Promise<Documento | null> {
  if (await usarMysql()) {
    const filas = await sql<FilaDoc>(`${consultaBase(tipo)} WHERE d.id = ?`, [id]);
    const fila = filas[0];
    if (!fila) return null;
    const doc = mapear(tipo, fila);
    const lineas = await sql<Record<string, unknown>>(consultaLineas(tipo), [id]);
    doc.lineas = lineas.map(
      (l): LineaFactura => ({
        item_id: l["item_id"] === null ? null : String(l["item_id"]),
        codigo: String(l["codigo"] ?? ""),
        descripcion: String(l["descripcion"] ?? ""),
        observacion: String(l["observacion"] ?? ""),
        cantidad: Number(l["cantidad"] ?? 0),
        oferta: Number(l["oferta"] ?? 0),
        precio: Number(l["precio"] ?? 0),
        descuento_pct: Number(l["descuento_pct"] ?? 0),
        tasa_itbis: Number(l["tasa_itbis"] ?? 0),
        subtotal: Number(l["subtotal"] ?? 0),
        itbis: Number(l["itbis"] ?? 0),
        total: Number(l["total"] ?? 0),
      }),
    );
    if (tipo === "devolucion" && doc.motivo_id !== undefined) {
      const m = await sql<{ name: string }>(
        "SELECT name FROM reverse_invoices_motives WHERE ri_motive_id = ?",
        [doc.motivo_id],
      );
      doc.motivo = m[0]?.name ?? "";
    }
    return doc;
  }
  return (demoDocs.get(tipo) ?? []).find((d) => d.id === id) ?? null;
}

export async function listarMotivosDevolucion(): Promise<OpcionId[]> {
  if (!(await usarMysql())) return [];
  try {
    const filas = await sql<{ id: number; nombre: string }>(
      "SELECT ri_motive_id AS id, name AS nombre FROM reverse_invoices_motives ORDER BY ri_motive_id",
    );
    return filas.map((f) => ({ id: String(Number(f.id)), nombre: f.nombre || String(f.id) }));
  } catch {
    return [];
  }
}

/* --------------------------------- Escritura ----------------------------- */

const num = (v: string | undefined, def: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
};

export async function crearDocumento(entrada: NuevoDocumento): Promise<Documento> {
  const { lineas, totales } = calcularTotales(entrada.lineas);
  if (!lineas.length) throw new Error("El documento debe tener al menos una línea");

  const moneda = (entrada.moneda || "DOP").toUpperCase();
  const tasa = entrada.tasa_cambio && entrada.tasa_cambio > 0 ? entrada.tasa_cambio : 1;

  if (await usarMysql()) {
    const clientes = await sql<{ name: string; rnc: string | null }>(
      "SELECT name, rnc FROM customers WHERE customer_id = ?",
      [entrada.cliente_id],
    );
    const cliente = clientes[0];
    if (!cliente) throw new Error("Cliente no encontrado");

    const d = await defectos();
    const sucursal = num(entrada.sucursal_id, 1);
    const vendedor = num(entrada.vendedor_id, d.salesman_id);
    const almacen = num(entrada.almacen_id, d.warehouse_id);

    if (entrada.tipo === "cotizacion") {
      const ins = await ejecutar(
        `INSERT INTO quotations
           (date, customer_name, contact, customer_order, credit_days, currency_rate,
            sales_comision, notes, ship_id, customer_id, salesman_id, currency_id,
            user_id, branch_id, project_id, void, department_id, tech_id)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          entrada.fecha,
          cliente.name,
          entrada.contacto ?? "",
          entrada.orden_cliente ?? "",
          entrada.dias_credito,
          tasa,
          entrada.notas,
          entrada.cliente_id,
          vendedor,
          moneda,
          d.user_id,
          sucursal,
          entrada.proyecto_id ? Number(entrada.proyecto_id) : null,
          entrada.departamento_id ? Number(entrada.departamento_id) : null,
          entrada.tecnico_id ? Number(entrada.tecnico_id) : null,
        ],
      );
      const id = ins.insertId;
      for (const [pos, l] of lineas.entries()) {
        const descuento = round2(l.cantidad * l.precio * (l.descuento_pct / 100));
        await ejecutar(
          `INSERT INTO quotations_detail
             (quotation_id, position, product_id, name, quantity, bonus, price, ref_price,
              tax1, tax2, tax3, discount_rate, discount, cost, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 0, ?)`,
          [
            id,
            pos + 1,
            l.item_id ?? l.codigo ?? "",
            l.descripcion,
            l.cantidad,
            l.oferta ?? 0,
            l.precio,
            l.precio,
            l.itbis,
            l.descuento_pct,
            descuento,
            l.observacion ?? "",
          ],
        );
      }
      const creado = await obtenerDocumento("cotizacion", id);
      if (!creado) throw new Error("No se pudo leer la cotización creada");
      return creado;
    }

    if (entrada.tipo === "conduce") {
      const ins = await ejecutar(
        `INSERT INTO delivery_orders
           (branch_id, date, time, delivery_date, open, customer_name, credit_days,
            currency_rate, sales_comision, notes, user_id, ship_id, customer_id,
            salesman_id, currency_id, quotation_id, warehouse_id, project_id,
            order_id, motivo)
         VALUES (?, ?, CURTIME(), ?, 1, ?, ?, ?, 0, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, '')`,
        [
          sucursal,
          entrada.fecha,
          entrada.fecha_entrega || entrada.fecha,
          cliente.name,
          entrada.dias_credito,
          tasa,
          entrada.notas,
          d.user_id,
          entrada.cliente_id,
          vendedor,
          moneda,
          entrada.cotizacion_id ?? null,
          almacen,
          entrada.proyecto_id ? Number(entrada.proyecto_id) : null,
          entrada.pedido_id ?? null,
        ],
      );
      const id = ins.insertId;
      for (const [pos, l] of lineas.entries()) {
        const descuento = round2(l.cantidad * l.precio * (l.descuento_pct / 100));
        await ejecutar(
          `INSERT INTO delivery_orders_detail
             (do_id, branch_id, position, product_id, name, quantity, price,
              tax1, tax2, tax3, discount_rate, discount, cost, currency_rate, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 0, ?, ?)`,
          [
            id,
            sucursal,
            pos + 1,
            l.item_id ?? l.codigo ?? "",
            l.descripcion,
            l.cantidad,
            l.precio,
            l.itbis,
            l.descuento_pct,
            descuento,
            tasa,
            l.observacion ?? "",
          ],
        );
      }
      const creado = await obtenerDocumento("conduce", id);
      if (!creado) throw new Error("No se pudo leer el conduce creado");
      return creado;
    }

    // Devolución: nota de crédito B04 sobre una factura existente.
    const maximos = await sql<{ n: number }>(
      "SELECT COALESCE(MAX(reverse_invoice_id), 0) + 1 AS n FROM reverse_invoices",
    );
    const id = Number(maximos[0]?.n ?? 1);
    let ncf = "";
    try {
      ncf = await reservarNCF("B04");
    } catch {
      ncf = "";
    }
    await ejecutar(
      `INSERT INTO reverse_invoices
         (reverse_invoice_id, branch_id, posted, number, date, time, customer_name,
          customer_order, currency_rate, sales_comision, notes, authorized, open_ri,
          ncf_id, ncf_doc, user_id, customer_id, salesman_id, tech_id, currency_id,
          warehouse_id, project_id, invoice_id, apply_to, motivo_dgii)
       VALUES (?, ?, 0, ?, ?, CURTIME(), ?, ?, ?, 0, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        sucursal,
        id,
        entrada.fecha,
        cliente.name,
        entrada.orden_cliente ?? "",
        tasa,
        entrada.notas,
        NCF_ID_POR_TIPO["B04"],
        ncf,
        d.user_id,
        entrada.cliente_id,
        vendedor,
        entrada.tecnico_id ? Number(entrada.tecnico_id) : null,
        moneda,
        almacen,
        entrada.proyecto_id ? Number(entrada.proyecto_id) : null,
        entrada.factura_id ?? null,
        entrada.factura_id ?? null,
        entrada.motivo_id ?? null,
      ],
    );
    for (const [pos, l] of lineas.entries()) {
      const descuento = round2(l.cantidad * l.precio * (l.descuento_pct / 100));
      await ejecutar(
        `INSERT INTO reverse_invoices_detail
           (reverse_invoice_id, branch_id, position, product_id, quantity, bonus,
            price, tax1, tax2, tax3, discount, cost, ri_motive_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0, ?)`,
        [
          id,
          sucursal,
          pos + 1,
          l.item_id ?? l.codigo ?? "",
          l.cantidad,
          l.oferta ?? 0,
          l.precio,
          l.itbis,
          descuento,
          entrada.motivo_id ?? 0,
        ],
      );
    }
    const creado = await obtenerDocumento("devolucion", id);
    if (!creado) throw new Error("No se pudo leer la devolución creada");
    return creado;
  }

  // Modo demostración
  const doc: Documento = {
    tipo: entrada.tipo,
    id: demoId++,
    sucursal_id: Number(entrada.sucursal_id ?? 1) || 1,
    fecha: entrada.fecha,
    fecha_entrega: entrada.fecha_entrega,
    cliente_id: entrada.cliente_id,
    cliente_nombre: entrada.cliente_id,
    cliente_rnc: "",
    moneda,
    tasa_cambio: tasa,
    dias_credito: entrada.dias_credito,
    notas: entrada.notas,
    contacto: entrada.contacto ?? "",
    orden_cliente: entrada.orden_cliente ?? "",
    pedido_id: entrada.pedido_id,
    cotizacion_id: entrada.cotizacion_id,
    factura_id: entrada.factura_id,
    motivo_id: entrada.motivo_id,
    anulado: false,
    aplicada: false,
    subtotal: totales.subtotal,
    descuento: totales.descuento,
    itbis: totales.itbis,
    total: totales.total,
    lineas,
  };
  demoDocs.get(entrada.tipo)?.push(doc);
  return doc;
}

/** Actualiza una cotización existente (cabecera y líneas); no permitido si está anulada. */
export async function actualizarCotizacion(
  entrada: NuevoDocumento & { id: number },
): Promise<Documento> {
  const { lineas, totales } = calcularTotales(entrada.lineas);
  if (!lineas.length) throw new Error("El documento debe tener al menos una línea");

  const moneda = (entrada.moneda || "DOP").toUpperCase();
  const tasa = entrada.tasa_cambio && entrada.tasa_cambio > 0 ? entrada.tasa_cambio : 1;

  if (await usarMysql()) {
    const actuales = await sql<{ void: number | null }>(
      "SELECT void FROM quotations WHERE quotation_id = ?",
      [entrada.id],
    );
    if (!actuales.length) throw new Error("No encontramos esa cotización");
    if (Number(actuales[0]?.void ?? 0) === 1)
      throw new Error("La cotización está anulada y no puede editarse");

    const clientes = await sql<{ name: string }>(
      "SELECT name FROM customers WHERE customer_id = ?",
      [entrada.cliente_id],
    );
    const cliente = clientes[0];
    if (!cliente) throw new Error("Cliente no encontrado");

    const d = await defectos();
    const sucursal = num(entrada.sucursal_id, 1);
    const vendedor = num(entrada.vendedor_id, d.salesman_id);

    await ejecutar(
      `UPDATE quotations
          SET date = ?, customer_name = ?, contact = ?, customer_order = ?,
              credit_days = ?, currency_rate = ?, notes = ?, customer_id = ?,
              salesman_id = ?, currency_id = ?, branch_id = ?, project_id = ?,
              department_id = ?, tech_id = ?
        WHERE quotation_id = ?`,
      [
        entrada.fecha,
        cliente.name,
        entrada.contacto ?? "",
        entrada.orden_cliente ?? "",
        entrada.dias_credito,
        tasa,
        entrada.notas,
        entrada.cliente_id,
        vendedor,
        moneda,
        sucursal,
        entrada.proyecto_id ? Number(entrada.proyecto_id) : null,
        entrada.departamento_id ? Number(entrada.departamento_id) : null,
        entrada.tecnico_id ? Number(entrada.tecnico_id) : null,
        entrada.id,
      ],
    );
    await ejecutar("DELETE FROM quotations_detail WHERE quotation_id = ?", [entrada.id]);
    for (const [pos, l] of lineas.entries()) {
      const descuento = round2(l.cantidad * l.precio * (l.descuento_pct / 100));
      await ejecutar(
        `INSERT INTO quotations_detail
           (quotation_id, position, product_id, name, quantity, bonus, price, ref_price,
            tax1, tax2, tax3, discount_rate, discount, cost, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 0, ?)`,
        [
          entrada.id,
          pos + 1,
          l.item_id ?? l.codigo ?? "",
          l.descripcion,
          l.cantidad,
          l.oferta ?? 0,
          l.precio,
          l.precio,
          l.itbis,
          l.descuento_pct,
          descuento,
          l.observacion ?? "",
        ],
      );
    }
    const actualizada = await obtenerDocumento("cotizacion", entrada.id);
    if (!actualizada) throw new Error("No se pudo leer la cotización actualizada");
    return actualizada;
  }

  // Modo demostración
  const docs = demoDocs.get("cotizacion") ?? [];
  const doc = docs.find((d) => d.id === entrada.id);
  if (!doc) throw new Error("No encontramos esa cotización");
  if (doc.anulado) throw new Error("La cotización está anulada y no puede editarse");
  Object.assign(doc, {
    fecha: entrada.fecha,
    cliente_id: entrada.cliente_id,
    moneda,
    tasa_cambio: tasa,
    dias_credito: entrada.dias_credito,
    notas: entrada.notas,
    contacto: entrada.contacto ?? "",
    orden_cliente: entrada.orden_cliente ?? "",
    subtotal: totales.subtotal,
    descuento: totales.descuento,
    itbis: totales.itbis,
    total: totales.total,
    lineas,
  });
  return doc;
}

/** Anula una cotización (queda registrada, nunca se borra). */
export async function anularCotizacion(id: number): Promise<void> {
  if (await usarMysql()) {
    await ejecutar("UPDATE quotations SET void = 1 WHERE quotation_id = ?", [id]);
    return;
  }
  const doc = demoDocs.get("cotizacion")?.find((d) => d.id === id);
  if (doc) doc.anulado = true;
}

/** Copia las líneas de un pedido o factura existente para el nuevo documento. */
export async function lineasDesdePedido(pedidoId: number): Promise<LineaFactura[]> {
  const factura = await obtenerFactura(pedidoId);
  return factura?.lineas ?? [];
}
