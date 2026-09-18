// Compras sobre las tablas existentes:
//   purchases         -> cabecera de la orden de compra
//   purchases_detail  -> líneas (cantidad solicitada, recibida y costo)
//   inventory         -> movimientos generados por la recepción (operación 7)
//   ap / ap_detail    -> factura del suplidor cuando recibe contabilidad
//
// El sistema es multimoneda: la orden guarda su moneda y su tasa
// (columnas currency_id / currency_rate de purchases).

import {
  round2,
  type EstadoOrdenCompra,
  type EstadoRecepcion,
  type FiltroCompras,
  type LineaAsiento,
  type LineaCompra,
  type ListasCompras,
  type Moneda,
  type NuevaOrdenCompra,
  type NuevaRecepcion,
  type OpcionId,
  type OrdenCompra,
  type ResultadoRecepcion,
} from "@/lib/erp-types";
import { ejecutar, sql } from "./mysql.server";
import { usarMysql } from "./repo.server";

/** Operación de inventario "COMPRA" (entrada). */
export const OP_COMPRA = 7;

const txt = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* -------------------------------- Listas --------------------------------- */

export async function listasCompras(): Promise<ListasCompras> {
  const vacio: ListasCompras = {
    suplidores: [],
    almacenes: [],
    sucursales: [],
    departamentos: [],
    proyectos: [],
    formas: [],
    monedas: [{ id: "DOP", nombre: "PESOS DOMINICANOS", simbolo: "RD$" }],
    gastos: [],
    retenciones: [],
    comprobantes: [],
    tipos_cxp: [],
  };
  if (!(await usarMysql())) return vacio;

  const opciones = async (consulta: string): Promise<OpcionId[]> => {
    try {
      const filas = await sql<Record<string, unknown>>(consulta);
      return filas.map((r) => ({ id: txt(r["id"]), nombre: txt(r["nombre"]) || txt(r["id"]) }));
    } catch {
      return [];
    }
  };

  const [
    suplidores,
    almacenes,
    sucursales,
    departamentos,
    proyectos,
    formas,
    gastos,
    comprobantes,
    tipos,
    isr,
    monedas,
  ] = await Promise.all([
    opciones(
      `SELECT supplier_id AS id, name AS nombre FROM suppliers
       WHERE COALESCE(status,'A') <> 'I' ORDER BY name LIMIT 1000`,
    ),
    opciones("SELECT warehouse_id AS id, name AS nombre FROM warehouse ORDER BY name"),
    opciones("SELECT branch_id AS id, name AS nombre FROM branchs ORDER BY name LIMIT 100"),
    opciones("SELECT department_id AS id, name AS nombre FROM gl_department ORDER BY name"),
    opciones(
      "SELECT project_id AS id, name AS nombre FROM projects WHERE status = 'ABIERTO' ORDER BY name LIMIT 300",
    ),
    opciones("SELECT payment_kind_id AS id, name AS nombre FROM payment_kinds ORDER BY name"),
    opciones("SELECT expense_id AS id, name AS nombre FROM expenses_kinds ORDER BY name"),
    opciones("SELECT ncf_id AS id, name AS nombre FROM ncf_kinds ORDER BY ncf_id"),
    opciones("SELECT ap_kind_id AS id, name AS nombre FROM ap_kinds ORDER BY name"),
    (async () => {
      try {
        return await sql<Record<string, unknown>>(
          "SELECT isr_id AS id, name AS nombre, rate FROM isr ORDER BY name",
        );
      } catch {
        return [];
      }
    })(),
    (async () => {
      try {
        return await sql<Record<string, unknown>>(
          `SELECT currency_id AS id, name AS nombre, COALESCE(symbol,'') AS simbolo
           FROM currencies ORDER BY currency_id`,
        );
      } catch {
        return [];
      }
    })(),
  ]);

  const listaMonedas: Moneda[] = monedas.map((m) => ({
    id: txt(m["id"]),
    nombre: txt(m["nombre"]),
    simbolo: txt(m["simbolo"]),
  }));

  return {
    suplidores,
    almacenes,
    sucursales,
    departamentos,
    proyectos,
    formas,
    gastos,
    comprobantes,
    tipos_cxp: tipos,
    retenciones: isr.map((r) => ({
      id: txt(r["id"]),
      nombre: txt(r["nombre"]),
      tasa: num(r["rate"]),
    })),
    monedas: listaMonedas.length ? listaMonedas : vacio.monedas,
  };
}

/* ------------------------------- Consultas ------------------------------- */

function estadoRecepcion(solicitado: number, recibido: number): EstadoRecepcion {
  if (recibido <= 0) return "pendiente";
  return round2(recibido) >= round2(solicitado) ? "completa" : "parcial";
}

const SQL_ORDENES = `
  SELECT p.purchase_id AS id,
         DATE_FORMAT(p.date, '%Y-%m-%d') AS fecha,
         p.supplier_id AS suplidor_id,
         COALESCE(NULLIF(s.name, ''), p.supplier_name, '') AS suplidor,
         COALESCE(s.rnc, '') AS suplidor_rnc,
         COALESCE(s.address, '') AS suplidor_direccion,
         COALESCE(s.phone, '') AS suplidor_telefono,
         COALESCE(NULLIF(p.currency_id, ''), 'DOP') AS moneda,
         COALESCE(p.currency_rate, 1) AS tasa_cambio,
         p.branch_id AS sucursal_id,
         p.warehouse_id AS almacen_id,
         COALESCE(w.name, '') AS almacen,
         COALESCE(p.destino, '') AS destino,
         COALESCE(p.lugar, '') AS lugar,
         COALESCE(p.uso, '') AS uso,
         COALESCE(p.cotizacion, '') AS cotizacion,
         COALESCE(p.order_no, '') AS requisicion,
         DATE_FORMAT(p.date_require, '%Y-%m-%d') AS fecha_requisicion,
         p.credit_days AS dias_credito,
         COALESCE(p.request_by, '') AS solicitante_id,
         COALESCE(p.project_id, '') AS proyecto_id,
         COALESCE(p.department_id, '') AS departamento_id,
         COALESCE(p.payment_kind_id, '') AS forma_pago_id,
         COALESCE(p.notes, '') AS notas,
         COALESCE(p.status, 'A') AS estado,
         COALESCE(p.invoice_id, '') AS factura_suplidor,
         COALESCE(d.solicitado, 0) AS solicitado,
         COALESCE(d.recibido, 0) AS recibido
  FROM purchases p
  LEFT JOIN suppliers s ON s.supplier_id = p.supplier_id
  LEFT JOIN warehouse w ON w.warehouse_id = p.warehouse_id
  LEFT JOIN (
    SELECT purchase_id, SUM(quantity) AS solicitado, SUM(receipt) AS recibido
    FROM purchases_detail GROUP BY purchase_id
  ) d ON d.purchase_id = p.purchase_id
`;

function mapearOrden(f: Record<string, unknown>, lineas: LineaCompra[]): OrdenCompra {
  const subtotal = round2(lineas.reduce((a, l) => a + l.subtotal, 0));
  const descuento = round2(
    lineas.reduce((a, l) => a + (l.cantidad * l.precio * l.descuento_pct) / 100, 0),
  );
  const itbis = round2(lineas.reduce((a, l) => a + l.itbis, 0));
  const estado = txt(f["estado"]);
  return {
    id: num(f["id"]),
    fecha: txt(f["fecha"]),
    suplidor_id: txt(f["suplidor_id"]),
    suplidor: txt(f["suplidor"]),
    suplidor_rnc: txt(f["suplidor_rnc"]),
    suplidor_direccion: txt(f["suplidor_direccion"]),
    suplidor_telefono: txt(f["suplidor_telefono"]),
    moneda: txt(f["moneda"]) || "DOP",
    tasa_cambio: num(f["tasa_cambio"]) || 1,
    sucursal_id: txt(f["sucursal_id"]),
    almacen_id: txt(f["almacen_id"]),
    almacen: txt(f["almacen"]),
    destino: txt(f["destino"]),
    lugar: txt(f["lugar"]),
    uso: txt(f["uso"]),
    cotizacion: txt(f["cotizacion"]),
    requisicion: txt(f["requisicion"]),
    fecha_requisicion: txt(f["fecha_requisicion"]),
    dias_credito: num(f["dias_credito"]),
    descuento_pct: 0,
    solicitante_id: txt(f["solicitante_id"]),
    proyecto_id: txt(f["proyecto_id"]),
    departamento_id: txt(f["departamento_id"]),
    forma_pago_id: txt(f["forma_pago_id"]),
    notas: txt(f["notas"]),
    estado: (estado === "I" || estado === "N" ? estado : "A") as EstadoOrdenCompra,
    recepcion: estadoRecepcion(num(f["solicitado"]), num(f["recibido"])),
    factura_suplidor: txt(f["factura_suplidor"]),
    subtotal,
    descuento,
    itbis,
    total: round2(subtotal + itbis),
    lineas,
  };
}

function mapearLinea(f: Record<string, unknown>): LineaCompra {
  const cantidad = round2(num(f["cantidad"]));
  const precio = round2(num(f["cost"]));
  const descuentoPct = num(f["descuento_pct"]);
  const bruto = round2(cantidad * precio);
  const subtotal = round2(bruto - (bruto * descuentoPct) / 100);
  const itbis = round2(num(f["itbis"]));
  return {
    id: num(f["id"]),
    producto_id: txt(f["producto_id"]),
    codigo: txt(f["codigo"]) || txt(f["producto_id"]),
    descripcion: txt(f["descripcion"]),
    cantidad,
    recibida: round2(num(f["recibida"])),
    precio,
    descuento_pct: descuentoPct,
    tasa_itbis: subtotal > 0 ? round2((itbis / subtotal) * 100) : 0,
    subtotal,
    itbis,
    total: round2(subtotal + itbis),
    notas: txt(f["notas"]),
    serial: txt(f["serial"]),
  };
}

async function lineasDeOrden(ids: number[]): Promise<Map<number, LineaCompra[]>> {
  const mapa = new Map<number, LineaCompra[]>();
  if (!ids.length) return mapa;
  const filas = await sql<Record<string, unknown>>(
    `SELECT d.purchase_detail_id AS id, d.purchase_id AS orden,
            d.product_id AS producto_id,
            COALESCE(pr.code, d.product_id) AS codigo,
            COALESCE(NULLIF(d.product_name, ''), pr.name, '') AS descripcion,
            d.quantity AS cantidad, d.receipt AS recibida, d.cost,
            d.discount_percent AS descuento_pct, d.tax1 AS itbis,
            COALESCE(d.notes, '') AS notas, COALESCE(d.serial, '') AS serial
     FROM purchases_detail d
     LEFT JOIN products pr ON pr.product_id = d.product_id
     WHERE d.purchase_id IN (${ids.map(() => "?").join(",")})
     ORDER BY d.purchase_id, d.position, d.purchase_detail_id`,
    ids,
  );
  for (const f of filas) {
    const orden = num(f["orden"]);
    const lista = mapa.get(orden) ?? [];
    lista.push(mapearLinea(f));
    mapa.set(orden, lista);
  }
  return mapa;
}

export async function listarCompras(filtro: FiltroCompras = {}): Promise<OrdenCompra[]> {
  if (!(await usarMysql())) return [];
  const cond: string[] = [];
  const params: unknown[] = [];
  if (filtro.desde) {
    cond.push("p.date >= ?");
    params.push(filtro.desde);
  }
  if (filtro.hasta) {
    cond.push("p.date <= ?");
    params.push(filtro.hasta);
  }
  if (filtro.suplidorId) {
    cond.push("p.supplier_id = ?");
    params.push(Number(filtro.suplidorId));
  }
  if (filtro.estado) {
    cond.push("p.status = ?");
    params.push(filtro.estado);
  }
  if (filtro.busqueda) {
    cond.push("(s.name LIKE ? OR CAST(p.purchase_id AS CHAR) LIKE ?)");
    params.push(`%${filtro.busqueda}%`, `%${filtro.busqueda}%`);
  }
  const where = cond.length ? ` WHERE ${cond.join(" AND ")}` : "";
  const filas = await sql<Record<string, unknown>>(
    `${SQL_ORDENES}${where} ORDER BY p.date DESC, p.purchase_id DESC LIMIT 300`,
    params,
  );
  const lineas = await lineasDeOrden(filas.map((f) => num(f["id"])));
  const ordenes = filas.map((f) => mapearOrden(f, lineas.get(num(f["id"])) ?? []));
  return filtro.recepcion ? ordenes.filter((o) => o.recepcion === filtro.recepcion) : ordenes;
}

export async function obtenerCompra(id: number): Promise<OrdenCompra | null> {
  if (!(await usarMysql())) return null;
  const filas = await sql<Record<string, unknown>>(
    `${SQL_ORDENES} WHERE p.purchase_id = ? LIMIT 1`,
    [id],
  );
  const f = filas[0];
  if (!f) return null;
  const lineas = await lineasDeOrden([id]);
  return mapearOrden(f, lineas.get(id) ?? []);
}

/* -------------------------- Orden de compra ------------------------------ */

function totalesLinea(l: NuevaOrdenCompra["lineas"][number]) {
  const bruto = round2(l.cantidad * l.precio);
  const subtotal = round2(bruto - (bruto * l.descuento_pct) / 100);
  const itbis = round2((subtotal * l.tasa_itbis) / 100);
  return { bruto, subtotal, itbis, descuento: round2(bruto - subtotal) };
}

/** Crea o modifica la orden de compra. Una orden ya recibida no se modifica. */
export async function guardarCompra(entrada: NuevaOrdenCompra): Promise<OrdenCompra> {
  if (!(await usarMysql())) throw new Error("Sin conexión a la base de datos");
  const lineas = entrada.lineas.filter((l) => l.producto_id && l.cantidad > 0);
  if (!lineas.length) throw new Error("Agrega al menos una línea con producto y cantidad.");

  const campos = [
    entrada.fecha,
    Number(entrada.suplidor_id),
    entrada.moneda || "DOP",
    entrada.tasa_cambio || 1,
    Number(entrada.almacen_id || 1) || 1,
    Number(entrada.sucursal_id || 1) || 1,
    entrada.proyecto_id ? Number(entrada.proyecto_id) : null,
    entrada.departamento_id ? Number(entrada.departamento_id) : null,
    entrada.dias_credito,
    entrada.forma_pago_id || null,
    (entrada.destino ?? "").slice(0, 100),
    (entrada.lugar ?? "").slice(0, 100),
    (entrada.uso ?? "").slice(0, 200),
    (entrada.cotizacion ?? "").slice(0, 20),
    (entrada.requisicion ?? "").slice(0, 20),
    entrada.fecha_requisicion || null,
    entrada.solicitante_id ? Number(entrada.solicitante_id) : null,
    entrada.notas ?? "",
    entrada.estado,
  ];

  let id = entrada.id ?? 0;
  if (id) {
    const actual = await obtenerCompra(id);
    if (!actual) throw new Error("Orden de compra no encontrada");
    if (actual.recepcion !== "pendiente")
      throw new Error("La orden ya tiene mercancía recibida: no se puede modificar.");
    await ejecutar(
      `UPDATE purchases SET date = ?, supplier_id = ?, currency_id = ?, currency_rate = ?,
         warehouse_id = ?, branch_id = ?, project_id = ?, department_id = ?, credit_days = ?,
         payment_kind_id = ?, destino = ?, lugar = ?, uso = ?, cotizacion = ?, order_no = ?,
         date_require = ?, request_by = ?, notes = ?, status = ?
       WHERE purchase_id = ?`,
      [...campos, id],
    );
    await ejecutar("DELETE FROM purchases_detail WHERE purchase_id = ?", [id]);
  } else {
    const ins = await ejecutar(
      `INSERT INTO purchases
         (date, supplier_id, currency_id, currency_rate, warehouse_id, branch_id,
          project_id, department_id, credit_days, payment_kind_id, destino, lugar, uso,
          cotizacion, order_no, date_require, request_by, notes, status, time)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURTIME())`,
      campos,
    );
    id = ins.insertId;
  }

  let posicion = 1;
  for (const l of lineas) {
    const t = totalesLinea(l);
    await ejecutar(
      `INSERT INTO purchases_detail
         (quantity, ordered_qtty, receipt, cost, tax1, discount_value, discount_percent,
          notes, position, purchase_id, product_id, product_name, exchange)
       VALUES (?,?,0,?,?,?,?,?,?,?,?,?,?)`,
      [
        l.cantidad,
        l.cantidad,
        l.precio,
        t.itbis,
        t.descuento,
        l.descuento_pct,
        l.notas ?? "",
        posicion++,
        id,
        l.producto_id,
        (l.descripcion || "").slice(0, 200),
        entrada.tasa_cambio || 1,
      ],
    );
  }

  const orden = await obtenerCompra(id);
  if (!orden) throw new Error("No se pudo leer la orden de compra guardada");
  return orden;
}

/** Anula la orden (status = 'N'). Solo si no tiene mercancía recibida. */
export async function anularCompra(id: number): Promise<void> {
  if (!(await usarMysql())) throw new Error("Sin conexión a la base de datos");
  const orden = await obtenerCompra(id);
  if (!orden) throw new Error("Orden de compra no encontrada");
  if (orden.recepcion !== "pendiente")
    throw new Error("La orden ya tiene mercancía recibida: no se puede anular.");
  await ejecutar("UPDATE purchases SET status = 'N' WHERE purchase_id = ?", [id]);
}

/* ---------------------------- Recepción --------------------------------- */

/** Próximo número de documento de inventario para la operación de compra. */
async function proximoDocumentoCompra(): Promise<string> {
  const [f] = await sql<Record<string, unknown>>(
    `SELECT COALESCE(MAX(CAST(source_doc AS UNSIGNED)), 0) + 1 AS n
     FROM inventory WHERE inventory_op_id = ? AND source_doc REGEXP '^[0-9]+$'`,
    [OP_COMPRA],
  );
  return String(num(f?.["n"]) || 1);
}

/**
 * Registra la recepción de mercancías.
 * - Modalidad "almacen": afecta inventario y genera el asiento de inventario.
 * - Modalidad "contabilidad": además crea la factura del suplidor en CxP.
 */
export async function registrarRecepcion(
  entrada: NuevaRecepcion,
): Promise<ResultadoRecepcion> {
  if (!(await usarMysql())) throw new Error("Sin conexión a la base de datos");

  const orden = await obtenerCompra(entrada.orden_id);
  if (!orden) throw new Error("Orden de compra no encontrada");
  if (orden.estado === "N") throw new Error("La orden de compra está anulada.");

  const porId = new Map(orden.lineas.map((l) => [l.id ?? 0, l]));
  const recibir = entrada.lineas
    .map((l) => ({ ...l, linea: porId.get(l.linea_id) }))
    .filter((l) => l.linea && l.recibida > 0);
  if (!recibir.length) throw new Error("Indica la cantidad recibida de al menos un producto.");

  for (const r of recibir) {
    const pendiente = round2((r.linea?.cantidad ?? 0) - (r.linea?.recibida ?? 0));
    if (round2(r.recibida) > pendiente + 0.0001)
      throw new Error(
        `El producto ${r.linea?.codigo} solo tiene ${pendiente} pendiente de recibir.`,
      );
  }

  const almacen = Number(entrada.almacen_id || orden.almacen_id || 1) || 1;
  const documento = await proximoDocumentoCompra();

  // Movimientos de inventario (entrada por compra).
  for (const r of recibir) {
    const costo = round2(r.precio > 0 ? r.precio : (r.linea?.precio ?? 0));
    await ejecutar(
      `INSERT INTO inventory
         (date, time, quantity, value, cost, discount, taxes, source_app, source_doc,
          reference, status, inventory_op_id, warehouse_id, product_id, department_id, notes)
       VALUES (?, CURTIME(), ?, ?, ?, 0, 0, 'COM', ?, ?, 'A', ?, ?, ?, ?, ?)`,
      [
        entrada.fecha,
        round2(r.recibida),
        round2(r.recibida * costo),
        costo,
        documento.slice(0, 10),
        String(orden.id).slice(0, 10),
        OP_COMPRA,
        almacen,
        r.producto_id,
        orden.departamento_id ? Number(orden.departamento_id) : null,
        (entrada.notas || `Recepción de la orden de compra ${orden.id}`).slice(0, 200),
      ],
    );
    await ejecutar(
      `UPDATE purchases_detail
         SET receipt = receipt + ?, cost = ?, receipt_date = ?, invoice_id = ?
       WHERE purchase_detail_id = ?`,
      [
        round2(r.recibida),
        costo,
        entrada.fecha,
        entrada.factura?.numero?.slice(0, 15) ?? null,
        r.linea_id,
      ],
    );
  }

  // Factura del suplidor (solo cuando recibe contabilidad).
  let apId: number | undefined;
  let factura: string | undefined;
  if (entrada.modalidad === "contabilidad" && entrada.factura) {
    const { crearFacturaSuplidor, TIPO_FACTURA_SUPLIDOR } = await import("./cxp.server");
    const res = await crearFacturaSuplidor({
      suplidor_id: orden.suplidor_id,
      tipo_id: TIPO_FACTURA_SUPLIDOR,
      factura: entrada.factura,
      orden_id: orden.id,
      asiento: entrada.asiento,
    });
    apId = res.ap_id;
    factura = res.documento;
    const numero = Number(factura.replace(/\D/g, ""));
    if (numero)
      await ejecutar("UPDATE purchases SET invoice_id = ? WHERE purchase_id = ?", [
        numero,
        orden.id,
      ]);
  }

  await contabilizarRecepcion(entrada, orden.id, documento);

  const actualizada = await obtenerCompra(orden.id);
  return {
    orden_id: orden.id,
    documento_inventario: documento,
    ap_id: apId,
    factura,
    recepcion: actualizada?.recepcion ?? "parcial",
  };
}

/**
 * Asiento contable de la recepción (siempre, reciba almacén o contabilidad).
 * Si el usuario no envía cuentas, se toman de la clasificación del producto y
 * de las cuentas del suplidor.
 */
async function contabilizarRecepcion(
  entrada: NuevaRecepcion,
  ordenId: number,
  documento: string,
): Promise<void> {
  let lineas: LineaAsiento[] = (entrada.asiento ?? []).filter(
    (l) => l.cuenta && (l.debito > 0 || l.credito > 0),
  );
  if (!lineas.length) {
    const propuesta = await propuestaAsientoRecepcion(entrada);
    lineas = propuesta.lineas;
  }
  if (lineas.length < 2) return;
  const debito = round2(lineas.reduce((a, l) => a + l.debito, 0));
  const credito = round2(lineas.reduce((a, l) => a + l.credito, 0));
  if (debito <= 0 || Math.abs(debito - credito) > 0.01) return;

  const { crearAsiento } = await import("./contabilidad.server");
  await crearAsiento({
    fecha: entrada.fecha,
    descripcion:
      (entrada.notas || "").trim() ||
      `Recepción de la orden de compra ${ordenId} (documento ${documento})`,
    documento,
    moneda: "DOP",
    tasa_cambio: 1,
    lineas,
  });
}

/** Asiento propuesto de la recepción, para mostrarlo antes de guardar. */
export async function propuestaAsientoRecepcion(
  entrada: NuevaRecepcion,
): Promise<{ lineas: LineaAsiento[]; advertencias: string[] }> {
  const orden = await obtenerCompra(entrada.orden_id);
  if (!orden) return { lineas: [], advertencias: ["Orden de compra no encontrada."] };
  const porId = new Map(orden.lineas.map((l) => [l.id ?? 0, l]));
  const lineas = entrada.lineas
    .filter((l) => l.recibida > 0)
    .map((l) => {
      const base = porId.get(l.linea_id);
      const costo = l.precio > 0 ? l.precio : (base?.precio ?? 0);
      return {
        producto_id: l.producto_id || (base?.producto_id ?? ""),
        cantidad: round2(l.recibida),
        costo_total: round2(l.recibida * costo),
      };
    });

  const f = entrada.factura;
  const { propuestaCompra } = await import("./cuentas.server");
  return propuestaCompra({
    suplidor_id: orden.suplidor_id,
    lineas,
    itbis: entrada.modalidad === "contabilidad" ? (f?.itbis ?? 0) : 0,
    itbis_costo: f?.itbis_costo ?? 0,
    itbis_retenido: entrada.modalidad === "contabilidad" ? (f?.itbis_retenido ?? 0) : 0,
    isr_retenido: entrada.modalidad === "contabilidad" ? (f?.isr_retenido ?? 0) : 0,
    otros:
      entrada.modalidad === "contabilidad"
        ? round2((f?.propina ?? 0) + (f?.isc ?? 0) + (f?.otros_impuestos ?? 0))
        : 0,
  });
}
