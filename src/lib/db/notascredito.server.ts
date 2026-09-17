// Notas de crédito formales sobre una factura emitida.
//
//   reverse_invoices / reverse_invoices_detail -> la nota de crédito (NCF B04)
//   ar / ar_reference / ar_detail              -> rebaja el balance de la factura
//   gl_journal (crearAsiento)                  -> asiento contable
//   inventory                                  -> reposición de la mercancía devuelta
//
// Reglas del ciclo:
//   - Solo sobre facturas emitidas (orders.invoice_id asignado) y no anuladas.
//   - Nunca se edita ni se borra: la corrección es la anulación (asiento reverso).
//   - No puede rebajar más de lo que queda disponible en la factura.
//   - Todo en la moneda y la tasa de la factura original (multimoneda).

import {
  calcularTotales,
  round2,
  type FacturaAcreditable,
  type FiltroNotasCredito,
  type LineaAsiento,
  type LineaFactura,
  type LineaNotaCredito,
  type NotaCredito,
  type NuevaNotaCredito,
} from "@/lib/erp-types";
import { ejecutar, sql } from "./mysql.server";
import { defectos, NCF_ID_POR_TIPO, obtenerFactura, reservarNCF, usarMysql } from "./repo.server";

/** Tipos de movimiento de cuentas por cobrar (ar_kinds). */
const AR_NOTA_CREDITO = "R"; // NOTA DE CREDITO POR DEVOLUCION (crédito)
const AR_REVERSO_NOTA = "T"; // REVERSOS NOTA DE CREDITO POR DEVOLUCION (débito)
/** Operaciones de inventario (inventory_operations). */
const OP_DEVOLUCION_VENTA = 6; // DEVOLUCION DE VENTA (entrada, origen FAC)

const txt = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const opc = (v: unknown): number | undefined => {
  const n = Number(v);
  return v === null || v === undefined || !Number.isFinite(n) || n === 0 ? undefined : n;
};

/* -------------------------------- Consultas ------------------------------- */

const SQL_NOTAS = `
  SELECT r.reverse_invoice_id AS id,
         DATE_FORMAT(r.date, '%Y-%m-%d') AS fecha,
         COALESCE(r.ncf_doc, '') AS ncf,
         r.invoice_id AS factura_id,
         o.order_id AS pedido_id,
         COALESCE(i.ncf_doc, '') AS factura_ncf,
         r.customer_id AS cliente_id,
         COALESCE(NULLIF(c.name, ''), r.customer_name, '') AS cliente_nombre,
         COALESCE(c.rnc, '') AS cliente_rnc,
         COALESCE(c.address1, '') AS cliente_direccion,
         COALESCE(c.phone1, '') AS cliente_telefono,
         COALESCE(NULLIF(r.currency_id, ''), 'DOP') AS moneda,
         COALESCE(r.currency_rate, 1) AS tasa_cambio,
         r.motivo_dgii AS motivo_id,
         COALESCE(m.name, '') AS motivo,
         COALESCE(r.notes, '') AS notas,
         r.warehouse_id AS almacen_id,
         COALESCE(r.void, 0) AS anulada,
         COALESCE(t.subtotal, 0) AS subtotal,
         COALESCE(t.descuento, 0) AS descuento,
         COALESCE(t.itbis, 0) AS itbis,
         COALESCE(t.total, 0) AS total
  FROM reverse_invoices r
  LEFT JOIN customers c ON c.customer_id = r.customer_id
  LEFT JOIN invoices i ON i.invoice_id = r.invoice_id
  LEFT JOIN orders o ON o.invoice_id = r.invoice_id
  LEFT JOIN reverse_invoices_motives m ON m.ri_motive_id = r.motivo_dgii
  LEFT JOIN (
    SELECT reverse_invoice_id AS ref,
           ROUND(SUM(quantity * price - discount), 2) AS subtotal,
           ROUND(SUM(discount), 2) AS descuento,
           ROUND(SUM(tax1 + tax2 + tax3), 2) AS itbis,
           ROUND(SUM(quantity * price - discount + tax1 + tax2 + tax3), 2) AS total
    FROM reverse_invoices_detail GROUP BY reverse_invoice_id
  ) t ON t.ref = r.reverse_invoice_id
`;

const SQL_LINEAS = `
  SELECT l.product_id AS item_id, l.product_id AS codigo,
         COALESCE(NULLIF(p.name, ''), l.product_id) AS descripcion,
         l.quantity AS cantidad, l.price AS precio,
         CASE WHEN l.quantity * l.price > 0
              THEN ROUND(l.discount / (l.quantity * l.price) * 100, 2) ELSE 0 END AS descuento_pct,
         CASE WHEN l.quantity * l.price - l.discount > 0
              THEN ROUND((l.tax1 + l.tax2 + l.tax3) / (l.quantity * l.price - l.discount) * 100)
              ELSE 0 END AS tasa_itbis,
         ROUND(l.quantity * l.price - l.discount, 2) AS subtotal,
         ROUND(l.tax1 + l.tax2 + l.tax3, 2) AS itbis,
         ROUND(l.quantity * l.price - l.discount + l.tax1 + l.tax2 + l.tax3, 2) AS total
  FROM reverse_invoices_detail l
  LEFT JOIN products p ON p.product_id = l.product_id
  WHERE l.reverse_invoice_id = ? ORDER BY l.position, l.reverse_invoice_detail_id
`;

function mapear(f: Record<string, unknown>): NotaCredito {
  return {
    id: num(f["id"]),
    fecha: txt(f["fecha"]),
    ncf: txt(f["ncf"]),
    factura_id: opc(f["factura_id"]),
    pedido_id: opc(f["pedido_id"]),
    factura_ncf: txt(f["factura_ncf"]) || undefined,
    cliente_id: txt(f["cliente_id"]),
    cliente_nombre: txt(f["cliente_nombre"]),
    cliente_rnc: txt(f["cliente_rnc"]),
    cliente_direccion: txt(f["cliente_direccion"]) || undefined,
    cliente_telefono: txt(f["cliente_telefono"]) || undefined,
    moneda: (txt(f["moneda"]) || "DOP").toUpperCase(),
    tasa_cambio: num(f["tasa_cambio"]) || 1,
    motivo_id: opc(f["motivo_id"]),
    motivo: txt(f["motivo"]),
    notas: txt(f["notas"]),
    almacen_id: txt(f["almacen_id"]) || undefined,
    subtotal: round2(num(f["subtotal"])),
    descuento: round2(num(f["descuento"])),
    itbis: round2(num(f["itbis"])),
    total: round2(num(f["total"])),
    anulada: num(f["anulada"]) === 1,
    lineas: [],
  };
}

function mapearLineas(filas: Record<string, unknown>[]): LineaFactura[] {
  return filas.map((l) => ({
    item_id: l["item_id"] === null ? null : txt(l["item_id"]),
    codigo: txt(l["codigo"]),
    descripcion: txt(l["descripcion"]),
    cantidad: num(l["cantidad"]),
    precio: num(l["precio"]),
    descuento_pct: num(l["descuento_pct"]),
    tasa_itbis: num(l["tasa_itbis"]),
    subtotal: round2(num(l["subtotal"])),
    itbis: round2(num(l["itbis"])),
    total: round2(num(l["total"])),
  }));
}

export async function listarNotasCredito(
  filtro: FiltroNotasCredito = {},
): Promise<NotaCredito[]> {
  if (!(await usarMysql())) return [];
  const cond: string[] = [];
  const params: unknown[] = [];
  if (filtro.desde) {
    cond.push("r.date >= ?");
    params.push(filtro.desde);
  }
  if (filtro.hasta) {
    cond.push("r.date <= ?");
    params.push(filtro.hasta);
  }
  if (filtro.clienteId) {
    cond.push("r.customer_id = ?");
    params.push(filtro.clienteId);
  }
  if (filtro.pedidoId) {
    cond.push("o.order_id = ?");
    params.push(filtro.pedidoId);
  }
  const filas = await sql<Record<string, unknown>>(
    `${SQL_NOTAS} ${cond.length ? `WHERE ${cond.join(" AND ")}` : ""}
     ORDER BY r.date DESC, r.reverse_invoice_id DESC LIMIT 500`,
    params,
  );
  return filas.map(mapear);
}

export async function obtenerNotaCredito(id: number): Promise<NotaCredito | null> {
  if (!(await usarMysql())) return null;
  const filas = await sql<Record<string, unknown>>(
    `${SQL_NOTAS} WHERE r.reverse_invoice_id = ?`,
    [id],
  );
  const fila = filas[0];
  if (!fila) return null;
  const nota = mapear(fila);
  nota.lineas = mapearLineas(await sql<Record<string, unknown>>(SQL_LINEAS, [id]));
  return nota;
}

/** Factura con lo ya acreditado y el disponible para nuevas notas de crédito. */
export async function facturaAcreditable(pedidoId: number): Promise<FacturaAcreditable | null> {
  const factura = await obtenerFactura(pedidoId);
  if (!factura) return null;
  const notas = (await usarMysql())
    ? (await listarNotasCredito({ pedidoId })).filter((n) => !n.anulada)
    : [];
  const acreditado = round2(notas.reduce((a, n) => a + n.total, 0));

  const acreditadoPorItem = new Map<string, number>();
  if (notas.length) {
    const ids = notas.map((n) => n.id);
    const filas = await sql<Record<string, unknown>>(
      `SELECT product_id AS codigo, SUM(quantity) AS cantidad
       FROM reverse_invoices_detail
       WHERE reverse_invoice_id IN (${ids.map(() => "?").join(",")})
       GROUP BY product_id`,
      ids,
    );
    for (const f of filas) acreditadoPorItem.set(txt(f["codigo"]), num(f["cantidad"]));
  }

  const lineas: LineaNotaCredito[] = factura.lineas.map((l) => ({
    item_id: l.item_id,
    codigo: l.codigo,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precio: l.precio,
    descuento_pct: l.descuento_pct,
    tasa_itbis: l.tasa_itbis,
    cantidad_facturada: l.cantidad,
    cantidad_acreditada: round2(acreditadoPorItem.get(l.codigo) ?? 0),
  }));

  return {
    factura,
    acreditado,
    disponible: round2(Math.max(0, factura.total - acreditado)),
    notas,
    lineas,
  };
}

/* -------------------------------- Registro -------------------------------- */

/** Costo unitario en pesos de los productos (products.cost). */
async function costos(ids: string[]): Promise<Map<string, { costo: number; servicio: boolean }>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return new Map();
  const filas = await sql<Record<string, unknown>>(
    `SELECT product_id AS id, COALESCE(cost, 0) AS costo, COALESCE(is_service, 0) AS servicio
     FROM products WHERE product_id IN (${unicos.map(() => "?").join(",")})`,
    unicos,
  );
  return new Map(
    filas.map((f) => [
      txt(f["id"]),
      { costo: num(f["costo"]), servicio: num(f["servicio"]) === 1 },
    ]),
  );
}

/** Emite la nota de crédito sobre la factura del pedido indicado. */
export async function crearNotaCredito(entrada: NuevaNotaCredito): Promise<NotaCredito> {
  if (!(await usarMysql()))
    throw new Error("Sin conexión a la base de datos: no se puede emitir la nota de crédito.");

  const info = await facturaAcreditable(entrada.pedido_id);
  if (!info) throw new Error("Factura no encontrada.");
  const factura = info.factura;
  if (!factura.invoice_id)
    throw new Error("Solo se puede emitir una nota de crédito sobre una factura ya emitida.");
  if (factura.estado === "anulada")
    throw new Error("La factura está anulada: no admite notas de crédito.");

  const { lineas, totales } = calcularTotales(entrada.lineas);
  if (!lineas.length) throw new Error("Agrega al menos una línea a la nota de crédito.");

  // Control por línea: no se puede acreditar más de lo facturado.
  for (const l of lineas) {
    const original = info.lineas.find((o) => o.codigo === l.codigo);
    if (!original)
      throw new Error(`El ítem ${l.codigo} no está en la factura ${factura.ncf}.`);
    const restante = round2(original.cantidad_facturada - original.cantidad_acreditada);
    if (l.cantidad > restante + 0.001)
      throw new Error(
        `Del ítem ${l.codigo} solo quedan ${restante} unidades por acreditar en la factura.`,
      );
  }
  if (totales.total > info.disponible + 0.01)
    throw new Error(
      `La nota de crédito (${totales.total.toFixed(2)}) excede el disponible de la factura (${info.disponible.toFixed(2)}).`,
    );

  const moneda = (factura.moneda || "DOP").toUpperCase();
  const tasa = factura.tasa_cambio && factura.tasa_cambio > 0 ? factura.tasa_cambio : 1;
  const d = await defectos();
  const sucursal = Number(factura.sucursal_id ?? 1) || 1;
  const vendedor = Number(factura.vendedor_id ?? d.salesman_id) || d.salesman_id;
  const almacen = Number(entrada.almacen_id ?? factura.almacen_id ?? d.warehouse_id) || d.warehouse_id;

  // El NCF es obligatorio: la nota de crédito es un documento fiscal.
  const ncf = await reservarNCF("B04");

  const [maximo] = await sql<Record<string, unknown>>(
    "SELECT COALESCE(MAX(reverse_invoice_id), 0) + 1 AS n FROM reverse_invoices",
  );
  const id = num(maximo?.["n"]) || 1;

  await ejecutar(
    `INSERT INTO reverse_invoices
       (reverse_invoice_id, branch_id, posted, number, date, time, customer_name,
        customer_order, currency_rate, sales_comision, notes, authorized, open_ri,
        ncf_id, ncf_doc, user_id, customer_id, salesman_id, currency_id,
        warehouse_id, invoice_id, apply_to, motivo_dgii, \`void\`)
     VALUES (?, ?, 1, ?, ?, CURTIME(), ?, ?, ?, 0, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      id,
      sucursal,
      id,
      entrada.fecha,
      factura.cliente_nombre,
      (factura.orden_cliente ?? "").slice(0, 10),
      tasa,
      entrada.notas,
      NCF_ID_POR_TIPO["B04"],
      ncf,
      d.user_id,
      factura.cliente_id,
      vendedor,
      moneda,
      almacen,
      factura.invoice_id,
      factura.invoice_id,
      entrada.motivo_id ?? null,
    ],
  );

  for (const [pos, l] of lineas.entries()) {
    const descuento = round2(l.cantidad * l.precio * ((l.descuento_pct || 0) / 100));
    await ejecutar(
      `INSERT INTO reverse_invoices_detail
         (reverse_invoice_id, branch_id, position, product_id, quantity, bonus,
          price, tax1, tax2, tax3, discount, cost, ri_motive_id)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, 0, 0, ?, 0, ?)`,
      [
        id,
        sucursal,
        pos + 1,
        l.item_id ?? l.codigo,
        l.cantidad,
        l.precio,
        l.itbis,
        descuento,
        entrada.motivo_id ?? 0,
      ],
    );
  }

  // Asiento contable (si el usuario no envía cuentas, se toman de la clasificación).
  const asiento = await asientoNota(entrada, factura, lineas, ncf);

  // Rebaja el balance de la factura en cuentas por cobrar.
  await movimientoCxC({
    tipo: AR_NOTA_CREDITO,
    signo: "C",
    fecha: entrada.fecha,
    documento: id,
    concepto: `Nota de crédito ${ncf} s/factura ${factura.ncf}`,
    clienteId: factura.cliente_id,
    referencia: String(factura.invoice_id),
    monto: totales.total,
    moneda,
    tasa,
    vendedor,
    sucursal,
    asiento,
  });

  // Reposición al inventario de la mercancía devuelta.
  if (entrada.reponer_inventario) {
    await moverInventario({
      fecha: entrada.fecha,
      documento: String(id),
      referencia: String(factura.invoice_id ?? ""),
      almacen,
      notas: `Nota de crédito ${ncf}`,
      lineas: lineas.map((l) => ({ producto_id: l.codigo, cantidad: l.cantidad })),
      signo: 1,
    });
  }

  const creada = await obtenerNotaCredito(id);
  if (!creada) throw new Error("No se pudo leer la nota de crédito creada.");
  return creada;
}

/** Anula la nota de crédito: reversa el balance, el asiento y el inventario. */
export async function anularNotaCredito(id: number, motivo = ""): Promise<void> {
  if (!(await usarMysql()))
    throw new Error("Sin conexión a la base de datos: no se puede anular la nota de crédito.");
  const nota = await obtenerNotaCredito(id);
  if (!nota) throw new Error("Nota de crédito no encontrada.");
  if (nota.anulada) throw new Error("La nota de crédito ya está anulada.");

  await ejecutar("UPDATE reverse_invoices SET `void` = 1 WHERE reverse_invoice_id = ?", [id]);

  const d = await defectos();
  const asiento = await propuesta(nota, false);
  // El asiento reverso invierte débitos y créditos.
  const reverso: LineaAsiento[] = asiento.map((l) => ({
    ...l,
    debito: l.credito,
    credito: l.debito,
  }));

  await movimientoCxC({
    tipo: AR_REVERSO_NOTA,
    signo: "D",
    fecha: new Date().toISOString().slice(0, 10),
    documento: id,
    concepto: `Anulación nota de crédito ${nota.ncf}${motivo ? ` — ${motivo}` : ""}`,
    clienteId: nota.cliente_id,
    referencia: String(nota.factura_id ?? ""),
    monto: nota.total,
    moneda: nota.moneda,
    tasa: nota.tasa_cambio,
    vendedor: d.salesman_id,
    sucursal: 1,
    asiento: reverso,
  });

  // Si la mercancía se había repuesto, se saca de nuevo del inventario.
  const repuestas = await sql<Record<string, unknown>>(
    `SELECT product_id AS producto, SUM(quantity) AS cantidad FROM inventory
     WHERE inventory_op_id = ? AND source_app = 'FAC' AND source_doc = ? AND status = 'A'
     GROUP BY product_id`,
    [OP_DEVOLUCION_VENTA, String(id)],
  );
  if (repuestas.length) {
    await moverInventario({
      fecha: new Date().toISOString().slice(0, 10),
      documento: String(id),
      referencia: String(nota.factura_id ?? ""),
      almacen: Number(nota.almacen_id ?? 1) || 1,
      notas: `Anulación nota de crédito ${nota.ncf}`,
      lineas: repuestas.map((r) => ({
        producto_id: txt(r["producto"]),
        cantidad: num(r["cantidad"]),
      })),
      signo: -1,
    });
  }
}

/* ------------------------------ Contabilidad ------------------------------ */

async function propuesta(
  nota: NotaCredito,
  reponer: boolean,
): Promise<LineaAsiento[]> {
  const { propuestaNotaCredito } = await import("./cuentas.server");
  const p = await propuestaNotaCredito({
    cliente_id: nota.cliente_id,
    moneda: nota.moneda,
    tasa_cambio: nota.tasa_cambio,
    reponer_inventario: reponer,
    lineas: nota.lineas.map((l) => ({
      producto_id: l.codigo,
      cantidad: l.cantidad,
      precio: l.precio,
      descuento: round2(l.cantidad * l.precio - l.subtotal),
      itbis: l.itbis,
    })),
  });
  return p.lineas;
}

async function asientoNota(
  entrada: NuevaNotaCredito,
  factura: { cliente_id: string; cliente_nombre: string; moneda?: string | undefined; tasa_cambio?: number | undefined; ncf: string },
  lineas: LineaFactura[],
  ncf: string,
): Promise<LineaAsiento[]> {
  let cuentas = (entrada.asiento ?? []).filter((l) => l.cuenta && (l.debito > 0 || l.credito > 0));
  if (!cuentas.length) {
    const { propuestaNotaCredito } = await import("./cuentas.server");
    const p = await propuestaNotaCredito({
      cliente_id: factura.cliente_id,
      moneda: factura.moneda,
      tasa_cambio: factura.tasa_cambio,
      reponer_inventario: entrada.reponer_inventario,
      lineas: lineas.map((l) => ({
        producto_id: l.codigo,
        cantidad: l.cantidad,
        precio: l.precio,
        descuento: round2(l.cantidad * l.precio - l.subtotal),
        itbis: l.itbis,
      })),
    });
    cuentas = p.lineas;
  }
  if (cuentas.length < 2) return cuentas;
  const debito = round2(cuentas.reduce((a, l) => a + l.debito, 0));
  const credito = round2(cuentas.reduce((a, l) => a + l.credito, 0));
  if (debito <= 0 || Math.abs(debito - credito) > 0.01) return cuentas;

  try {
    const { crearAsiento } = await import("./contabilidad.server");
    await crearAsiento({
      fecha: entrada.fecha,
      descripcion: `Nota de crédito ${ncf} s/factura ${factura.ncf} — ${factura.cliente_nombre}`,
      documento: ncf,
      moneda: factura.moneda,
      tasa_cambio: factura.tasa_cambio,
      lineas: cuentas,
    });
  } catch (error) {
    // La nota ya está emitida: el asiento no debe impedir su registro.
    console.error("No se pudo registrar el asiento de la nota de crédito", error);
  }
  return cuentas;
}

/* --------------------------- Cuentas por cobrar --------------------------- */

interface EntradaCxC {
  tipo: string;
  signo: "C" | "D";
  fecha: string;
  documento: number;
  concepto: string;
  clienteId: string;
  referencia: string;
  monto: number;
  moneda: string;
  tasa: number;
  vendedor: number;
  sucursal: number;
  asiento: LineaAsiento[];
}

async function movimientoCxC(e: EntradaCxC): Promise<void> {
  if (e.monto <= 0) return;
  try {
    const ins = await ejecutar(
      `INSERT INTO ar
         (date, collection_date, doc_number, description, exchange, payment_doc,
          customer_id, currency_id, ar_kind_id, salesman_id, branch_id)
       VALUES (?,?,?,?,?,'',?,?,?,?,?)`,
      [
        e.fecha,
        e.fecha,
        e.documento,
        e.concepto.slice(0, 100),
        e.tasa,
        e.clienteId,
        e.moneda,
        e.tipo,
        e.vendedor,
        e.sucursal,
      ],
    );
    const arId = ins.insertId;
    if (e.referencia) {
      await ejecutar("INSERT INTO ar_reference (reference, amount, ar_id) VALUES (?,?,?)", [
        e.referencia,
        e.signo === "C" ? -round2(e.monto) : round2(e.monto),
        arId,
      ]);
    }
    for (const l of e.asiento) {
      if (round2(l.debito) === 0 && round2(l.credito) === 0) continue;
      await ejecutar(
        "INSERT INTO ar_detail (debit, credit, kind, ar_id, catalog_account) VALUES (?,?,NULL,?,?)",
        [round2(l.debito), round2(l.credito), arId, l.cuenta],
      );
    }
  } catch (error) {
    console.error("No se pudo registrar el movimiento de cuentas por cobrar", error);
  }
}

/* -------------------------------- Inventario ------------------------------ */

interface EntradaInventario {
  fecha: string;
  documento: string;
  referencia: string;
  almacen: number;
  notas: string;
  lineas: { producto_id: string; cantidad: number }[];
  /** 1 repone la mercancía, -1 la vuelve a sacar (anulación). */
  signo: 1 | -1;
}

async function moverInventario(e: EntradaInventario): Promise<void> {
  try {
    const datos = await costos(e.lineas.map((l) => l.producto_id));
    for (const l of e.lineas) {
      const p = datos.get(l.producto_id);
      if (!p || p.servicio) continue;
      const cantidad = round2(Math.abs(l.cantidad) * e.signo);
      if (!cantidad) continue;
      await ejecutar(
        `INSERT INTO inventory
           (date, time, quantity, value, cost, discount, taxes, source_app, source_doc,
            reference, status, inventory_op_id, warehouse_id, product_id, notes)
         VALUES (?, CURTIME(), ?, 0, ?, 0, 0, 'FAC', ?, ?, 'A', ?, ?, ?, ?)`,
        [
          e.fecha,
          cantidad,
          round2(p.costo),
          e.documento.slice(0, 10),
          e.referencia.slice(0, 10),
          OP_DEVOLUCION_VENTA,
          e.almacen,
          l.producto_id,
          e.notas.slice(0, 200),
        ],
      );
    }
  } catch (error) {
    console.error("No se pudo mover el inventario de la nota de crédito", error);
  }
}
