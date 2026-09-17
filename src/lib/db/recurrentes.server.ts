// Facturación recurrente: plantillas que se repiten periódicamente.
//
//   recursive_invoices         -> la plantilla (cliente, moneda, frecuencia, vigencia)
//   recursive_invoices_detail  -> los servicios/productos a facturar
//
// Reglas del ciclo:
//   - Las condiciones de pago, el vendedor y la secuencia de comprobante se
//     toman del cliente en el momento de emitir (la tabla no los guarda).
//   - La emisión es manual: la aplicación avisa cuáles están vencidas.
//   - Cada emisión crea el pedido YA FACTURADO (orders + invoices con su NCF).
//   - Multimoneda: la tasa se toma de exchange_rate a la fecha del documento.
//   - El texto del detalle admite las marcas <INICIO_MES> y <FIN_MES>.

import {
  calcularTotales,
  hoyISO,
  round2,
  textoRecurrente,
  type EmisionRecurrente,
  type Factura,
  type FrecuenciaRecurrente,
  type LineaEntrada,
  type LineaRecurrente,
  type NuevaPlantillaRecurrente,
  type PlantillaRecurrente,
} from "@/lib/erp-types";
import { ejecutar, sql } from "./mysql.server";
import { crearPedido, obtenerCliente, usarMysql } from "./repo.server";

/** Valor guardado en last_release cuando la plantilla nunca se ha emitido. */
const SIN_EMISION = "1900-01-01";

const txt = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* ------------------------------- Calendario ------------------------------- */

function aUTC(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

function aISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Suma `cada` períodos a una fecha según la frecuencia. */
export function sumarPeriodos(iso: string, cada: number, frecuencia: FrecuenciaRecurrente): string {
  const d = aUTC(iso);
  const paso = Math.max(1, Math.trunc(cada || 1));
  if (frecuencia === "D") {
    d.setUTCDate(d.getUTCDate() + paso);
    return aISO(d);
  }
  const meses = frecuencia === "A" ? paso * 12 : paso;
  const dia = d.getUTCDate();
  const objetivo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + meses, 1));
  const ultimo = new Date(
    Date.UTC(objetivo.getUTCFullYear(), objetivo.getUTCMonth() + 1, 0),
  ).getUTCDate();
  objetivo.setUTCDate(Math.min(dia, ultimo));
  return aISO(objetivo);
}

type Vigencia = {
  cada: number;
  frecuencia: FrecuenciaRecurrente;
  inicio: string;
  fin?: string | undefined;
  sin_fin: boolean;
  repeticiones: number;
  ultima?: string | undefined;
};

/** Emisiones ya realizadas y fecha de la siguiente (vacío si la plantilla terminó). */
export function calendario(v: Vigencia): { emitidas: number; proxima?: string | undefined } {
  const ultima = v.ultima && v.ultima > SIN_EMISION ? v.ultima : undefined;
  if (!ultima) {
    return { emitidas: 0, ...(dentro(v, v.inicio) ? { proxima: v.inicio } : {}) };
  }
  // Cantidad de períodos transcurridos desde el inicio hasta la última emisión.
  let cursor = v.inicio;
  let emitidas = 1;
  while (cursor < ultima && emitidas < 5000) {
    const siguiente = sumarPeriodos(cursor, v.cada, v.frecuencia);
    if (siguiente > ultima) break;
    cursor = siguiente;
    emitidas += 1;
  }
  const proxima = sumarPeriodos(ultima, v.cada, v.frecuencia);
  if (!v.sin_fin && v.repeticiones > 0 && emitidas >= v.repeticiones) return { emitidas };
  return { emitidas, ...(dentro(v, proxima) ? { proxima } : {}) };
}

function dentro(v: Vigencia, fecha: string): boolean {
  if (!v.sin_fin && v.fin && fecha > v.fin) return false;
  return true;
}

/* -------------------------------- Consultas ------------------------------- */

interface FilaPlantilla {
  id: number;
  status: string;
  nombre: string | null;
  cada: number | null;
  frecuencia: string | null;
  inicio: string | null;
  fin: string | null;
  sin_fin: number | null;
  repeticiones: number | null;
  ultima: string | null;
  mailto: string | null;
  notas: string | null;
  cliente_id: string | null;
  cliente_nombre: string | null;
  cliente_rnc: string | null;
  dias_credito: number | null;
  moneda: string | null;
}

const SQL_PLANTILLAS = `
  SELECT r.r_invoice_id AS id,
         r.status,
         COALESCE(r.name, '') AS nombre,
         COALESCE(r.repeat_value, 1) AS cada,
         COALESCE(r.frequency, 'M') AS frecuencia,
         DATE_FORMAT(r.start_date, '%Y-%m-%d') AS inicio,
         DATE_FORMAT(r.end_date, '%Y-%m-%d') AS fin,
         COALESCE(r.no_end_date, 0) AS sin_fin,
         COALESCE(r.repeat_times, 0) AS repeticiones,
         DATE_FORMAT(r.last_release, '%Y-%m-%d') AS ultima,
         COALESCE(r.mailto, '') AS mailto,
         COALESCE(r.notes, '') AS notas,
         r.customer_id AS cliente_id,
         COALESCE(c.name, '') AS cliente_nombre,
         COALESCE(c.rnc, '') AS cliente_rnc,
         COALESCE(c.credit_days, 0) AS dias_credito,
         COALESCE(NULLIF(r.currency_id, ''), 'DOP') AS moneda
  FROM recursive_invoices r
  LEFT JOIN customers c ON c.customer_id = r.customer_id
`;

interface FilaLinea {
  plantilla_id: number;
  item_id: string | null;
  codigo: string | null;
  descripcion: string | null;
  detalle: string | null;
  cantidad: number | null;
  precio: number | null;
  descuento: number | null;
  tasa_itbis: number | null;
}

async function lineasDe(ids: number[]): Promise<Map<number, LineaRecurrente[]>> {
  const mapa = new Map<number, LineaRecurrente[]>();
  if (!ids.length) return mapa;
  const marcas = ids.map(() => "?").join(",");
  const filas = await sql<FilaLinea>(
    `SELECT d.r_invoice_id AS plantilla_id,
            d.product_id AS item_id,
            d.product_id AS codigo,
            COALESCE(p.name, '') AS descripcion,
            COALESCE(d.notes, '') AS detalle,
            COALESCE(d.quantity, 0) AS cantidad,
            COALESCE(d.price, 0) AS precio,
            COALESCE(d.discount, 0) AS descuento,
            CASE WHEN p.tax = 1 THEN COALESCE(p.tax_rate, 18) ELSE 0 END AS tasa_itbis
     FROM recursive_invoices_detail d
     LEFT JOIN products p ON p.product_id = d.product_id
     WHERE d.r_invoice_id IN (${marcas})
     ORDER BY d.r_invoice_id, d.r_invoice_detail_id`,
    ids,
  );
  for (const f of filas) {
    const id = num(f.plantilla_id);
    const lista = mapa.get(id) ?? [];
    lista.push({
      item_id: txt(f.item_id),
      codigo: txt(f.codigo),
      descripcion: txt(f.descripcion),
      detalle: txt(f.detalle),
      cantidad: num(f.cantidad),
      precio: num(f.precio),
      descuento_pct: num(f.descuento),
      tasa_itbis: num(f.tasa_itbis),
    });
    mapa.set(id, lista);
  }
  return mapa;
}

function entradas(lineas: LineaRecurrente[]): LineaEntrada[] {
  return lineas.map((l) => ({
    item_id: l.item_id,
    codigo: l.codigo,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precio: l.precio,
    descuento_pct: l.descuento_pct,
    tasa_itbis: l.tasa_itbis,
  }));
}

function mapear(f: FilaPlantilla, lineas: LineaRecurrente[]): PlantillaRecurrente {
  const frecuencia = (["D", "M", "A"].includes(txt(f.frecuencia))
    ? txt(f.frecuencia)
    : "M") as FrecuenciaRecurrente;
  const inicio = txt(f.inicio) || hoyISO();
  const fin = txt(f.fin);
  const ultimaCruda = txt(f.ultima);
  const sinFin = Boolean(num(f.sin_fin));
  const v: Vigencia = {
    cada: Math.max(1, num(f.cada) || 1),
    frecuencia,
    inicio,
    ...(fin ? { fin } : {}),
    sin_fin: sinFin,
    repeticiones: num(f.repeticiones),
    ...(ultimaCruda && ultimaCruda > SIN_EMISION ? { ultima: ultimaCruda } : {}),
  };
  const { emitidas, proxima } = calendario(v);
  const { totales } = calcularTotales(entradas(lineas));
  return {
    id: num(f.id),
    activa: txt(f.status) === "A",
    nombre: txt(f.nombre),
    cliente_id: txt(f.cliente_id),
    cliente_nombre: txt(f.cliente_nombre),
    cliente_rnc: txt(f.cliente_rnc),
    moneda: txt(f.moneda) || "DOP",
    cada: v.cada,
    frecuencia,
    inicio,
    ...(fin ? { fin } : {}),
    sin_fin: sinFin,
    repeticiones: v.repeticiones,
    ...(v.ultima ? { ultima_emision: v.ultima } : {}),
    ...(proxima ? { proxima } : {}),
    vencida: Boolean(proxima && txt(f.status) === "A" && proxima <= hoyISO()),
    emitidas,
    notificar: txt(f.mailto),
    notas: txt(f.notas),
    dias_credito: num(f.dias_credito),
    subtotal: totales.subtotal,
    descuento: totales.descuento,
    itbis: totales.itbis,
    total: totales.total,
    lineas,
  };
}

export interface FiltroRecurrentes {
  clienteId?: string | undefined;
  estado?: "todas" | "activas" | "inactivas" | "vencidas" | undefined;
  busqueda?: string | undefined;
}

export async function listarRecurrentes(
  filtro: FiltroRecurrentes = {},
): Promise<PlantillaRecurrente[]> {
  if (!(await usarMysql())) return [];
  const donde: string[] = [];
  const args: unknown[] = [];
  if (filtro.clienteId) {
    donde.push("r.customer_id = ?");
    args.push(filtro.clienteId);
  }
  if (filtro.estado === "activas") donde.push("r.status = 'A'");
  if (filtro.estado === "inactivas") donde.push("r.status <> 'A'");
  if (filtro.busqueda) {
    donde.push("(r.name LIKE ? OR c.name LIKE ?)");
    args.push(`%${filtro.busqueda}%`, `%${filtro.busqueda}%`);
  }
  const filas = await sql<FilaPlantilla>(
    `${SQL_PLANTILLAS} ${donde.length ? `WHERE ${donde.join(" AND ")}` : ""}
     ORDER BY r.status DESC, r.r_invoice_id DESC
     LIMIT 500`,
    args,
  );
  const lineas = await lineasDe(filas.map((f) => num(f.id)));
  const lista = filas.map((f) => mapear(f, lineas.get(num(f.id)) ?? []));
  return filtro.estado === "vencidas" ? lista.filter((p) => p.vencida) : lista;
}

export async function obtenerRecurrente(id: number): Promise<PlantillaRecurrente | null> {
  if (!(await usarMysql())) return null;
  const filas = await sql<FilaPlantilla>(`${SQL_PLANTILLAS} WHERE r.r_invoice_id = ?`, [id]);
  const f = filas[0];
  if (!f) return null;
  const lineas = await lineasDe([id]);
  return mapear(f, lineas.get(id) ?? []);
}

/** Cantidad de plantillas activas con emisión vencida (para el aviso del panel). */
export async function recurrentesVencidas(): Promise<number> {
  const lista = await listarRecurrentes({ estado: "activas" });
  return lista.filter((p) => p.vencida).length;
}

/* --------------------------------- Guardar -------------------------------- */

function validar(p: NuevaPlantillaRecurrente): void {
  if (!p.cliente_id) throw new Error("Selecciona el cliente");
  if (!p.nombre.trim()) throw new Error("Escribe el concepto de la facturación");
  if (!p.lineas.length) throw new Error("Agrega al menos un servicio o producto");
  if (p.lineas.some((l) => !l.item_id)) throw new Error("Todas las líneas necesitan un producto");
  if (p.lineas.some((l) => l.cantidad <= 0)) throw new Error("La cantidad debe ser mayor que cero");
  if (p.cada <= 0) throw new Error("La frecuencia debe ser mayor que cero");
  if (!p.sin_fin && !p.fin && p.repeticiones <= 0) {
    throw new Error("Indica una fecha de finalización o la cantidad de repeticiones");
  }
  if (p.fin && p.fin < p.inicio) throw new Error("La fecha de finalización es anterior al inicio");
}

export async function guardarRecurrente(
  entrada: NuevaPlantillaRecurrente,
): Promise<PlantillaRecurrente> {
  validar(entrada);
  if (!(await usarMysql())) throw new Error("Sin conexión a la base de datos");

  const args = [
    entrada.activa ? "A" : "I",
    entrada.nombre.trim(),
    Math.trunc(entrada.cada),
    entrada.frecuencia,
    entrada.inicio,
    entrada.sin_fin ? null : entrada.fin || null,
    entrada.sin_fin ? 1 : 0,
    entrada.sin_fin ? 0 : Math.trunc(entrada.repeticiones || 0),
    entrada.notificar.trim(),
    entrada.notas.trim(),
    entrada.cliente_id,
    (entrada.moneda || "DOP").toUpperCase(),
  ];

  let id = entrada.id ?? 0;
  if (id > 0) {
    await ejecutar(
      `UPDATE recursive_invoices
          SET status = ?, name = ?, repeat_value = ?, frequency = ?, start_date = ?,
              end_date = ?, no_end_date = ?, repeat_times = ?, mailto = ?, notes = ?,
              customer_id = ?, currency_id = ?
        WHERE r_invoice_id = ?`,
      [...args, id],
    );
    await ejecutar("DELETE FROM recursive_invoices_detail WHERE r_invoice_id = ?", [id]);
  } else {
    const res = await ejecutar(
      `INSERT INTO recursive_invoices
         (status, name, repeat_value, frequency, start_date, end_date, no_end_date,
          repeat_times, mailto, notes, customer_id, currency_id, last_release)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...args, SIN_EMISION],
    );
    id = res.insertId;
  }

  for (const l of entrada.lineas) {
    await ejecutar(
      `INSERT INTO recursive_invoices_detail
         (r_invoice_id, product_id, quantity, price, discount, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, l.item_id, l.cantidad, l.precio, l.descuento_pct || 0, l.detalle ?? ""],
    );
  }

  const guardada = await obtenerRecurrente(id);
  if (!guardada) throw new Error("No se pudo leer la plantilla guardada");
  return guardada;
}

export async function cambiarEstadoRecurrente(id: number, activa: boolean): Promise<void> {
  if (!(await usarMysql())) throw new Error("Sin conexión a la base de datos");
  await ejecutar("UPDATE recursive_invoices SET status = ? WHERE r_invoice_id = ?", [
    activa ? "A" : "I",
    id,
  ]);
}

export async function eliminarRecurrente(id: number): Promise<void> {
  if (!(await usarMysql())) throw new Error("Sin conexión a la base de datos");
  await ejecutar("DELETE FROM recursive_invoices_detail WHERE r_invoice_id = ?", [id]);
  await ejecutar("DELETE FROM recursive_invoices WHERE r_invoice_id = ?", [id]);
}

/* --------------------------------- Emisión -------------------------------- */

/** Tasa de cambio vigente de la moneda a la fecha indicada (1 para la local). */
async function tasaCambio(moneda: string, fecha: string): Promise<number> {
  if (!moneda || moneda.toUpperCase() === "DOP") return 1;
  try {
    const filas = await sql<{ valor: number }>(
      `SELECT COALESCE(NULLIF(foreign_to_local, 0), value) AS valor
       FROM exchange_rate
       WHERE currency_id = ? AND date <= ?
       ORDER BY date DESC, exchange_rate_id DESC LIMIT 1`,
      [moneda.toUpperCase(), fecha],
    );
    const v = num(filas[0]?.valor);
    return v > 0 ? v : 1;
  } catch {
    return 1;
  }
}

/** Vista previa del documento que se emitiría (sin guardar nada). */
export async function previaRecurrente(id: number): Promise<{
  plantilla: PlantillaRecurrente;
  fecha: string;
  tasa_cambio: number;
  lineas: LineaEntrada[];
} | null> {
  const p = await obtenerRecurrente(id);
  if (!p) return null;
  const fecha = p.proxima ?? hoyISO();
  const tasa = await tasaCambio(p.moneda, fecha);
  return { plantilla: p, fecha, tasa_cambio: tasa, lineas: lineasParaDocumento(p, fecha) };
}

function lineasParaDocumento(p: PlantillaRecurrente, fecha: string): LineaEntrada[] {
  return p.lineas.map((l) => {
    const detalle = textoRecurrente(l.detalle ?? "", fecha).trim();
    return {
      item_id: l.item_id,
      codigo: l.codigo,
      descripcion: detalle ? `${l.descripcion} ${detalle}`.trim() : l.descripcion,
      cantidad: l.cantidad,
      precio: l.precio,
      descuento_pct: l.descuento_pct,
      tasa_itbis: l.tasa_itbis,
    };
  });
}

export interface OpcionesEmision {
  ids: number[];
  /** Si es false crea el pedido sin facturar (sin NCF). */
  facturar?: boolean | undefined;
}

/**
 * Emite las plantillas indicadas: crea el pedido (ya facturado por omisión) y
 * mueve la última emisión al período correspondiente.
 */
export async function emitirRecurrentes(op: OpcionesEmision): Promise<EmisionRecurrente[]> {
  if (!(await usarMysql())) throw new Error("Sin conexión a la base de datos");
  const facturar = op.facturar !== false;
  const salida: EmisionRecurrente[] = [];

  for (const id of op.ids) {
    const p = await obtenerRecurrente(id);
    if (!p) {
      salida.push({ plantilla_id: id, nombre: "", cliente: "", fecha: "", error: "No existe" });
      continue;
    }
    const base = {
      plantilla_id: p.id,
      nombre: p.nombre,
      cliente: p.cliente_nombre,
      fecha: p.proxima ?? "",
    };
    if (!p.activa) {
      salida.push({ ...base, error: "La plantilla está inactiva" });
      continue;
    }
    if (!p.proxima) {
      salida.push({ ...base, error: "La plantilla ya completó su vigencia" });
      continue;
    }

    try {
      const fecha = p.proxima;
      const cliente = await obtenerCliente(p.cliente_id);
      if (!cliente) throw new Error("Cliente no encontrado");
      const tasa = await tasaCambio(p.moneda, fecha);
      const pedido: Factura = await crearPedido({
        cliente_id: p.cliente_id,
        tipo_ncf: cliente.tipo_ncf,
        fecha,
        dias_credito: cliente.dias_credito,
        notas: p.nombre,
        moneda: p.moneda,
        tasa_cambio: tasa,
        ...(cliente.vendedor_id ? { vendedor_id: String(cliente.vendedor_id) } : {}),
        lineas: lineasParaDocumento(p, fecha),
        facturar,
      });
      await ejecutar("UPDATE recursive_invoices SET last_release = ? WHERE r_invoice_id = ?", [
        fecha,
        p.id,
      ]);
      salida.push({
        ...base,
        pedido_id: pedido.id,
        ncf: pedido.ncf || undefined,
        total: round2(pedido.total),
        moneda: p.moneda,
      });
    } catch (error) {
      salida.push({ ...base, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return salida;
}
