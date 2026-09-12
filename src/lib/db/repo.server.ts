// Repositorio: una sola API para la aplicación, con dos implementaciones
// (MySQL externo o modo demostración en memoria).

import {
  calcularTotales,
  formatearNCF,
  hoyISO,
  round2,
  sumarDias,
  type Cliente,
  type Empresa,
  type EstadoFactura,
  type Factura,
  type Item,
  type LineaEntrada,
  type SecuenciaNCF,
  type TipoNCF,
} from "@/lib/erp-types";
import { demo } from "./demo.server";
import { ejecutar, mysqlActivo, sql, ultimoErrorMysql } from "./mysql.server";

export interface FiltroFacturas {
  desde?: string;
  hasta?: string;
  clienteId?: number;
  tipo?: TipoNCF;
  estado?: EstadoFactura;
}

export interface EstadoConexion {
  modo: "mysql" | "demo";
  error: string | null;
  // Tablas del esquema (db/schema.sql) que faltan en la base conectada.
  tablasFaltantes: string[];
}

export const TABLAS_REQUERIDAS = [
  "empresa",
  "clientes",
  "items",
  "ncf_secuencias",
  "facturas",
  "factura_lineas",
] as const;

export async function estadoConexion(): Promise<EstadoConexion> {
  const activo = await mysqlActivo();
  if (!activo) {
    return { modo: "demo", error: ultimoErrorMysql(), tablasFaltantes: [] };
  }
  try {
    const filas = await sql<{ nombre: string }>(
      `SELECT TABLE_NAME AS nombre FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?, ?, ?, ?, ?, ?)`,
      [...TABLAS_REQUERIDAS],
    );
    const existentes = new Set(filas.map((f) => String(f.nombre).toLowerCase()));
    return {
      modo: "mysql",
      error: null,
      tablasFaltantes: TABLAS_REQUERIDAS.filter((t) => !existentes.has(t)),
    };
  } catch (error) {
    return {
      modo: "mysql",
      error: error instanceof Error ? error.message : String(error),
      tablasFaltantes: [...TABLAS_REQUERIDAS],
    };
  }
}

async function usarMysql(): Promise<boolean> {
  return mysqlActivo();
}

/* ------------------------------- Empresa -------------------------------- */

const EMPRESA_VACIA: Empresa = { nombre: "", rnc: "", direccion: "", telefono: "", email: "" };

export async function obtenerEmpresa(): Promise<Empresa> {
  if (await usarMysql()) {
    // En modo MySQL nunca se mezclan datos de ejemplo: si no hay fila, vacío.
    const filas = await sql<Empresa>(
      "SELECT nombre, rnc, direccion, telefono, email FROM empresa WHERE id = 1",
    );
    return filas[0] ?? EMPRESA_VACIA;
  }
  return demo().empresa;
}

export async function guardarEmpresa(e: Empresa): Promise<Empresa> {
  if (await usarMysql()) {
    await ejecutar(
      `INSERT INTO empresa (id, nombre, rnc, direccion, telefono, email)
       VALUES (1, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), rnc=VALUES(rnc),
         direccion=VALUES(direccion), telefono=VALUES(telefono), email=VALUES(email)`,
      [e.nombre, e.rnc, e.direccion, e.telefono, e.email],
    );
    return e;
  }
  demo().empresa = e;
  return e;
}

/* ------------------------------- Clientes ------------------------------- */

export async function listarClientes(busqueda = ""): Promise<Cliente[]> {
  if (await usarMysql()) {
    const like = `%${busqueda}%`;
    return sql<Cliente>(
      `SELECT id, nombre, rnc, tipo_ncf, telefono, email, direccion, dias_credito, activo
       FROM clientes
       WHERE (? = '' OR nombre LIKE ? OR rnc LIKE ?)
       ORDER BY nombre`,
      [busqueda, like, like],
    ).then((f) => f.map((c) => ({ ...c, activo: Boolean(c.activo) })));
  }
  const t = busqueda.toLowerCase();
  return demo()
    .clientes.filter((c) => !t || c.nombre.toLowerCase().includes(t) || c.rnc.includes(t))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export async function guardarCliente(c: Omit<Cliente, "id"> & { id?: number | undefined }): Promise<Cliente> {
  if (await usarMysql()) {
    if (c.id) {
      await ejecutar(
        `UPDATE clientes SET nombre=?, rnc=?, tipo_ncf=?, telefono=?, email=?, direccion=?,
           dias_credito=?, activo=? WHERE id=?`,
        [
          c.nombre,
          c.rnc,
          c.tipo_ncf,
          c.telefono,
          c.email,
          c.direccion,
          c.dias_credito,
          c.activo ? 1 : 0,
          c.id,
        ],
      );
      return { ...c, id: c.id } as Cliente;
    }
    const r = await ejecutar(
      `INSERT INTO clientes (nombre, rnc, tipo_ncf, telefono, email, direccion, dias_credito, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        c.nombre,
        c.rnc,
        c.tipo_ncf,
        c.telefono,
        c.email,
        c.direccion,
        c.dias_credito,
        c.activo ? 1 : 0,
      ],
    );
    return { ...c, id: r.insertId } as Cliente;
  }
  const d = demo();
  if (c.id) {
    const i = d.clientes.findIndex((x) => x.id === c.id);
    if (i === -1) throw new Error("Cliente no encontrado");
    d.clientes[i] = { ...(c as Cliente), id: c.id };
    return d.clientes[i]!;
  }
  const nuevo = { ...(c as Cliente), id: d.siguienteId.cliente++ };
  d.clientes.push(nuevo);
  return nuevo;
}

/* --------------------------------- Ítems -------------------------------- */

export async function listarItems(busqueda = ""): Promise<Item[]> {
  if (await usarMysql()) {
    const like = `%${busqueda}%`;
    return sql<Item>(
      `SELECT id, codigo, descripcion, unidad, precio, tasa_itbis, activo
       FROM items
       WHERE (? = '' OR codigo LIKE ? OR descripcion LIKE ?)
       ORDER BY codigo`,
      [busqueda, like, like],
    ).then((f) =>
      f.map((i) => ({
        ...i,
        precio: Number(i.precio),
        tasa_itbis: Number(i.tasa_itbis),
        activo: Boolean(i.activo),
      })),
    );
  }
  const t = busqueda.toLowerCase();
  return demo()
    .items.filter(
      (i) => !t || i.codigo.toLowerCase().includes(t) || i.descripcion.toLowerCase().includes(t),
    )
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export async function guardarItem(it: Omit<Item, "id"> & { id?: number | undefined }): Promise<Item> {
  if (await usarMysql()) {
    if (it.id) {
      await ejecutar(
        `UPDATE items SET codigo=?, descripcion=?, unidad=?, precio=?, tasa_itbis=?, activo=? WHERE id=?`,
        [
          it.codigo,
          it.descripcion,
          it.unidad,
          it.precio,
          it.tasa_itbis,
          it.activo ? 1 : 0,
          it.id,
        ],
      );
      return { ...it, id: it.id } as Item;
    }
    const r = await ejecutar(
      `INSERT INTO items (codigo, descripcion, unidad, precio, tasa_itbis, activo)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [it.codigo, it.descripcion, it.unidad, it.precio, it.tasa_itbis, it.activo ? 1 : 0],
    );
    return { ...it, id: r.insertId } as Item;
  }
  const d = demo();
  if (it.id) {
    const i = d.items.findIndex((x) => x.id === it.id);
    if (i === -1) throw new Error("Ítem no encontrado");
    d.items[i] = { ...(it as Item), id: it.id };
    return d.items[i]!;
  }
  const nuevo = { ...(it as Item), id: d.siguienteId.item++ };
  d.items.push(nuevo);
  return nuevo;
}

/* ------------------------------ Secuencias ------------------------------ */

export async function listarSecuencias(): Promise<SecuenciaNCF[]> {
  if (await usarMysql()) {
    return sql<SecuenciaNCF>(
      `SELECT tipo_ncf, desde, hasta, proximo, DATE_FORMAT(vence, '%Y-%m-%d') AS vence, activa
       FROM ncf_secuencias ORDER BY tipo_ncf`,
    ).then((f) =>
      f.map((s) => ({
        ...s,
        desde: Number(s.desde),
        hasta: Number(s.hasta),
        proximo: Number(s.proximo),
        activa: Boolean(s.activa),
      })),
    );
  }
  return [...demo().secuencias].sort((a, b) => a.tipo_ncf.localeCompare(b.tipo_ncf));
}

export async function guardarSecuencia(s: SecuenciaNCF): Promise<SecuenciaNCF> {
  if (await usarMysql()) {
    await ejecutar(
      `INSERT INTO ncf_secuencias (tipo_ncf, desde, hasta, proximo, vence, activa)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE desde=VALUES(desde), hasta=VALUES(hasta),
         proximo=VALUES(proximo), vence=VALUES(vence), activa=VALUES(activa)`,
      [s.tipo_ncf, s.desde, s.hasta, s.proximo, s.vence, s.activa ? 1 : 0],
    );
    return s;
  }
  const d = demo();
  const i = d.secuencias.findIndex((x) => x.tipo_ncf === s.tipo_ncf);
  if (i === -1) d.secuencias.push(s);
  else d.secuencias[i] = s;
  return s;
}

/* ------------------------------- Facturas ------------------------------- */

function normalizarFactura(f: Factura): Factura {
  return {
    ...f,
    subtotal: Number(f.subtotal),
    descuento: Number(f.descuento),
    itbis: Number(f.itbis),
    total: Number(f.total),
    fecha: String(f.fecha).slice(0, 10),
    vencimiento: String(f.vencimiento).slice(0, 10),
    lineas: f.lineas ?? [],
  };
}

export async function listarFacturas(filtro: FiltroFacturas = {}): Promise<Factura[]> {
  if (await usarMysql()) {
    const cond: string[] = ["1=1"];
    const params: unknown[] = [];
    if (filtro.desde) {
      cond.push("f.fecha >= ?");
      params.push(filtro.desde);
    }
    if (filtro.hasta) {
      cond.push("f.fecha <= ?");
      params.push(filtro.hasta);
    }
    if (filtro.clienteId) {
      cond.push("f.cliente_id = ?");
      params.push(filtro.clienteId);
    }
    if (filtro.tipo) {
      cond.push("f.tipo_ncf = ?");
      params.push(filtro.tipo);
    }
    if (filtro.estado) {
      cond.push("f.estado = ?");
      params.push(filtro.estado);
    }
    const filas = await sql<Factura>(
      `SELECT f.id, f.ncf, f.tipo_ncf, f.cliente_id, c.nombre AS cliente_nombre, c.rnc AS cliente_rnc,
              DATE_FORMAT(f.fecha,'%Y-%m-%d') AS fecha, DATE_FORMAT(f.vencimiento,'%Y-%m-%d') AS vencimiento,
              f.subtotal, f.descuento, f.itbis, f.total, f.estado, f.notas
       FROM facturas f JOIN clientes c ON c.id = f.cliente_id
       WHERE ${cond.join(" AND ")}
       ORDER BY f.fecha DESC, f.id DESC
       LIMIT 500`,
      params,
    );
    return filas.map((f) => normalizarFactura({ ...f, lineas: [] }));
  }
  return demo()
    .facturas.filter(
      (f) =>
        (!filtro.desde || f.fecha >= filtro.desde) &&
        (!filtro.hasta || f.fecha <= filtro.hasta) &&
        (!filtro.clienteId || f.cliente_id === filtro.clienteId) &&
        (!filtro.tipo || f.tipo_ncf === filtro.tipo) &&
        (!filtro.estado || f.estado === filtro.estado),
    )
    .sort((a, b) => (a.fecha === b.fecha ? b.id - a.id : b.fecha.localeCompare(a.fecha)));
}

export async function obtenerFactura(id: number): Promise<Factura | null> {
  if (await usarMysql()) {
    const filas = await sql<Factura>(
      `SELECT f.id, f.ncf, f.tipo_ncf, f.cliente_id, c.nombre AS cliente_nombre, c.rnc AS cliente_rnc,
              DATE_FORMAT(f.fecha,'%Y-%m-%d') AS fecha, DATE_FORMAT(f.vencimiento,'%Y-%m-%d') AS vencimiento,
              f.subtotal, f.descuento, f.itbis, f.total, f.estado, f.notas
       FROM facturas f JOIN clientes c ON c.id = f.cliente_id WHERE f.id = ?`,
      [id],
    );
    const f = filas[0];
    if (!f) return null;
    const lineas = await sql<Factura["lineas"][number]>(
      `SELECT item_id, codigo, descripcion, cantidad, precio, descuento_pct, tasa_itbis,
              subtotal, itbis, total
       FROM factura_lineas WHERE factura_id = ? ORDER BY id`,
      [id],
    );
    return normalizarFactura({
      ...f,
      lineas: lineas.map((l) => ({
        ...l,
        cantidad: Number(l.cantidad),
        precio: Number(l.precio),
        descuento_pct: Number(l.descuento_pct),
        tasa_itbis: Number(l.tasa_itbis),
        subtotal: Number(l.subtotal),
        itbis: Number(l.itbis),
        total: Number(l.total),
      })),
    });
  }
  return demo().facturas.find((f) => f.id === id) ?? null;
}

export interface NuevaFactura {
  cliente_id: number;
  tipo_ncf: TipoNCF;
  fecha: string;
  dias_credito: number;
  notas: string;
  lineas: LineaEntrada[];
}

export async function crearFactura(entrada: NuevaFactura): Promise<Factura> {
  const { lineas, totales } = calcularTotales(entrada.lineas);
  if (!lineas.length) throw new Error("La factura debe tener al menos una línea");
  const vencimiento = sumarDias(entrada.fecha, entrada.dias_credito);

  if (await usarMysql()) {
    // Asignación atómica del NCF: incrementa sólo si queda rango disponible.
    const upd = await ejecutar(
      `UPDATE ncf_secuencias SET proximo = proximo + 1
       WHERE tipo_ncf = ? AND activa = 1 AND proximo <= hasta AND vence >= CURDATE()`,
      [entrada.tipo_ncf],
    );
    if (upd.affectedRows === 0) {
      throw new Error(
        `La secuencia NCF ${entrada.tipo_ncf} está agotada, vencida o inactiva. Actualízala en Secuencias NCF.`,
      );
    }
    const filas = await sql<{ proximo: number }>(
      "SELECT proximo FROM ncf_secuencias WHERE tipo_ncf = ?",
      [entrada.tipo_ncf],
    );
    const numero = Number(filas[0]?.proximo ?? 1) - 1;
    const ncf = formatearNCF(entrada.tipo_ncf, numero);
    const r = await ejecutar(
      `INSERT INTO facturas (ncf, tipo_ncf, cliente_id, fecha, vencimiento, subtotal, descuento,
         itbis, total, estado, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'emitida', ?)`,
      [
        ncf,
        entrada.tipo_ncf,
        entrada.cliente_id,
        entrada.fecha,
        vencimiento,
        totales.subtotal,
        totales.descuento,
        totales.itbis,
        totales.total,
        entrada.notas,
      ],
    );
    for (const l of lineas) {
      await ejecutar(
        `INSERT INTO factura_lineas (factura_id, item_id, codigo, descripcion, cantidad, precio,
           descuento_pct, tasa_itbis, subtotal, itbis, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.insertId,
          l.item_id,
          l.codigo,
          l.descripcion,
          l.cantidad,
          l.precio,
          l.descuento_pct,
          l.tasa_itbis,
          l.subtotal,
          l.itbis,
          l.total,
        ],
      );
    }
    const creada = await obtenerFactura(r.insertId);
    if (!creada) throw new Error("No se pudo leer la factura creada");
    return creada;
  }

  const d = demo();
  const sec = d.secuencias.find((s) => s.tipo_ncf === entrada.tipo_ncf);
  if (!sec || !sec.activa || sec.proximo > sec.hasta || sec.vence < hoyISO()) {
    throw new Error(
      `La secuencia NCF ${entrada.tipo_ncf} está agotada, vencida o inactiva. Actualízala en Secuencias NCF.`,
    );
  }
  const cliente = d.clientes.find((c) => c.id === entrada.cliente_id);
  if (!cliente) throw new Error("Cliente no encontrado");
  const ncf = formatearNCF(entrada.tipo_ncf, sec.proximo);
  sec.proximo += 1;
  const factura: Factura = {
    id: d.siguienteId.factura++,
    ncf,
    tipo_ncf: entrada.tipo_ncf,
    cliente_id: cliente.id,
    cliente_nombre: cliente.nombre,
    cliente_rnc: cliente.rnc,
    fecha: entrada.fecha,
    vencimiento,
    subtotal: totales.subtotal,
    descuento: totales.descuento,
    itbis: totales.itbis,
    total: totales.total,
    estado: "emitida",
    notas: entrada.notas,
    lineas,
  };
  d.facturas.push(factura);
  return factura;
}

export async function cambiarEstadoFactura(id: number, estado: EstadoFactura): Promise<void> {
  if (await usarMysql()) {
    await ejecutar("UPDATE facturas SET estado = ? WHERE id = ?", [estado, id]);
    return;
  }
  const f = demo().facturas.find((x) => x.id === id);
  if (!f) throw new Error("Factura no encontrada");
  f.estado = estado;
}

/* -------------------------- Panel y reportes ---------------------------- */

export interface Resumen {
  mes: string;
  facturado: number;
  itbis: number;
  cantidad: number;
  porCobrar: number;
  ultimas: Factura[];
  alertasNCF: { tipo_ncf: TipoNCF; restantes: number; vence: string }[];
}

export async function resumen(): Promise<Resumen> {
  const hoy = hoyISO();
  const inicioMes = `${hoy.slice(0, 7)}-01`;
  const [delMes, todas, secuencias] = await Promise.all([
    listarFacturas({ desde: inicioMes, hasta: hoy }),
    listarFacturas({}),
    listarSecuencias(),
  ]);
  const validas = delMes.filter((f) => f.estado !== "anulada");
  return {
    mes: inicioMes.slice(0, 7),
    facturado: round2(validas.reduce((a, f) => a + f.subtotal, 0)),
    itbis: round2(validas.reduce((a, f) => a + f.itbis, 0)),
    cantidad: validas.length,
    porCobrar: round2(
      todas.filter((f) => f.estado === "emitida").reduce((a, f) => a + f.total, 0),
    ),
    ultimas: todas.slice(0, 6),
    alertasNCF: secuencias.map((s) => ({
      tipo_ncf: s.tipo_ncf,
      restantes: Math.max(0, s.hasta - s.proximo + 1),
      vence: s.vence,
    })),
  };
}

export interface Reporte {
  desde: string;
  hasta: string;
  totales: { subtotal: number; itbis: number; total: number; cantidad: number };
  porTasa: { tasa: number; base: number; itbis: number }[];
  porCliente: { cliente: string; rnc: string; total: number; cantidad: number }[];
  porTipo: { tipo_ncf: string; total: number; cantidad: number }[];
  filas607: {
    rnc: string;
    ncf: string;
    tipo_ncf: string;
    fecha: string;
    subtotal: number;
    itbis: number;
    total: number;
  }[];
}

export async function reporte(desde: string, hasta: string): Promise<Reporte> {
  const facturas = (await listarFacturas({ desde, hasta })).filter((f) => f.estado !== "anulada");
  const conLineas = await Promise.all(facturas.map((f) => obtenerFactura(f.id)));
  const tasas = new Map<number, { tasa: number; base: number; itbis: number }>();
  for (const f of conLineas) {
    for (const l of f?.lineas ?? []) {
      const a = tasas.get(l.tasa_itbis) ?? { tasa: l.tasa_itbis, base: 0, itbis: 0 };
      a.base = round2(a.base + l.subtotal);
      a.itbis = round2(a.itbis + l.itbis);
      tasas.set(l.tasa_itbis, a);
    }
  }
  const clientes = new Map<string, { cliente: string; rnc: string; total: number; cantidad: number }>();
  for (const f of facturas) {
    const a =
      clientes.get(f.cliente_rnc) ??
      { cliente: f.cliente_nombre, rnc: f.cliente_rnc, total: 0, cantidad: 0 };
    a.total = round2(a.total + f.total);
    a.cantidad += 1;
    clientes.set(f.cliente_rnc, a);
  }
  const tipos = new Map<string, { tipo_ncf: string; total: number; cantidad: number }>();
  for (const f of facturas) {
    const a = tipos.get(f.tipo_ncf) ?? { tipo_ncf: f.tipo_ncf, total: 0, cantidad: 0 };
    a.total = round2(a.total + f.total);
    a.cantidad += 1;
    tipos.set(f.tipo_ncf, a);
  }
  return {
    desde,
    hasta,
    totales: {
      subtotal: round2(facturas.reduce((a, f) => a + f.subtotal, 0)),
      itbis: round2(facturas.reduce((a, f) => a + f.itbis, 0)),
      total: round2(facturas.reduce((a, f) => a + f.total, 0)),
      cantidad: facturas.length,
    },
    porTasa: [...tasas.values()].sort((a, b) => b.tasa - a.tasa),
    porCliente: [...clientes.values()].sort((a, b) => b.total - a.total),
    porTipo: [...tipos.values()].sort((a, b) => a.tipo_ncf.localeCompare(b.tipo_ncf)),
    filas607: facturas.map((f) => ({
      rnc: f.cliente_rnc,
      ncf: f.ncf,
      tipo_ncf: f.tipo_ncf,
      fecha: f.fecha,
      subtotal: f.subtotal,
      itbis: f.itbis,
      total: f.total,
    })),
  };
}
