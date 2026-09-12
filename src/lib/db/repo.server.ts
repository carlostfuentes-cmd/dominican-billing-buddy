// Repositorio: una sola API para la aplicación, con dos implementaciones
// (MySQL externo sobre las tablas existentes del sistema, o modo
// demostración en memoria).
//
// Mapeo sobre el esquema existente del usuario:
//   empresa      -> companies
//   clientes     -> customers  (tipo NCF vía customers.ncf_id / ncf_kinds)
//   ítems        -> products   (unidad vía measures)
//   facturas     -> orders + invoices (NCF real en invoices.ncf_doc)
//   líneas       -> orders_detail
//   secuencias   -> ncf_sequences (prefix = tipo de comprobante)
//   anulaciones  -> reverse_invoices

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
  type ListasCliente,

  type LineaEntrada,
  type SecuenciaNCF,
  type TipoNCF,
} from "@/lib/erp-types";
import { demo } from "./demo.server";
import { ejecutar, mysqlActivo, sql, ultimoErrorMysql } from "./mysql.server";

export interface FiltroFacturas {
  desde?: string;
  hasta?: string;
  clienteId?: string;
  tipo?: TipoNCF;
  estado?: EstadoFactura;
}

export interface EstadoConexion {
  modo: "mysql" | "demo";
  error: string | null;
  // Tablas del sistema existente que faltan en la base conectada.
  tablasFaltantes: string[];
}

export const TABLAS_REQUERIDAS = [
  "companies",
  "customers",
  "products",
  "orders",
  "orders_detail",
  "invoices",
  "ncf_sequences",
  "ncf_kinds",
] as const;

export async function estadoConexion(): Promise<EstadoConexion> {
  const activo = await mysqlActivo();
  if (!activo) {
    return { modo: "demo", error: ultimoErrorMysql(), tablasFaltantes: [] };
  }
  try {
    const filas = await sql<{ nombre: string }>(
      `SELECT TABLE_NAME AS nombre FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?, ?, ?, ?, ?, ?, ?, ?)`,
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

/* --------------------- Correspondencia de comprobantes -------------------- */

// Tipo de comprobante (prefijo) <-> ncf_id de la tabla ncf_kinds del sistema.
const NCF_ID_POR_TIPO: Record<TipoNCF, number> = {
  B01: 1, B02: 2, B03: 3, B04: 4, B11: 5, B13: 7, B14: 8, B15: 9,
  E31: 31, E32: 32, E33: 33, E34: 34, E41: 41, E43: 43, E44: 44, E45: 45, E46: 46,
};

const TIPO_POR_NCF_ID = new Map<number, TipoNCF>(
  Object.entries(NCF_ID_POR_TIPO).map(([tipo, id]) => [id, tipo as TipoNCF]),
);

function tipoDesdeNcfId(ncfId: number | null | undefined): TipoNCF {
  return TIPO_POR_NCF_ID.get(Number(ncfId)) ?? "B02";
}

/* --------- Valores por defecto para campos obligatorios del sistema ------- */

interface Defectos {
  user_id: number;
  salesman_id: number;
  warehouse_id: number;
  bank_id: number;
  ar_location_id: string;
  class_id: number;
  supplier_id: number;
  brand_id: string;
  color_id: string;
  packaging_id: string;
  source_id: number;
  inventory_group_id: string;
  product_family_id: number;
  product_kind_id: string;
}

let cacheDefectos: Defectos | null = null;

// Toma el primer registro de cada tabla relacionada para rellenar los campos
// obligatorios que el módulo de facturación no maneja (almacén, vendedor…).
async function defectos(): Promise<Defectos> {
  if (cacheDefectos) return cacheDefectos;
  const filas = await sql<Record<string, string | number | null>>(
    `SELECT
       (SELECT MIN(user_id) FROM users) AS user_id,
       (SELECT MIN(salesman_id) FROM salesmen) AS salesman_id,
       (SELECT MIN(warehouse_id) FROM warehouse) AS warehouse_id,
       (SELECT MIN(bank_id) FROM banks) AS bank_id,
       (SELECT MIN(ar_location_id) FROM ar_locations) AS ar_location_id,
       (SELECT MIN(class_id) FROM ar_classes) AS class_id,
       (SELECT MIN(supplier_id) FROM suppliers) AS supplier_id,
       (SELECT MIN(brand_id) FROM brands) AS brand_id,
       (SELECT MIN(color_id) FROM colors) AS color_id,
       (SELECT MIN(packaging_id) FROM packaging) AS packaging_id,
       (SELECT MIN(source_id) FROM sources) AS source_id,
       (SELECT MIN(inventory_group_id) FROM inventory_groups) AS inventory_group_id,
       (SELECT MIN(product_family_id) FROM products_family) AS product_family_id,
       (SELECT MIN(product_kind_id) FROM products_kinds) AS product_kind_id`,
  );
  const r = filas[0] ?? {};
  cacheDefectos = {
    user_id: Number(r["user_id"] ?? 1),
    salesman_id: Number(r["salesman_id"] ?? 1),
    warehouse_id: Number(r["warehouse_id"] ?? 1),
    bank_id: Number(r["bank_id"] ?? 1),
    ar_location_id: String(r["ar_location_id"] ?? "1"),
    class_id: Number(r["class_id"] ?? 1),
    supplier_id: Number(r["supplier_id"] ?? 1),
    brand_id: String(r["brand_id"] ?? "0"),
    color_id: String(r["color_id"] ?? "0"),
    packaging_id: String(r["packaging_id"] ?? "0"),
    source_id: Number(r["source_id"] ?? 0),
    inventory_group_id: String(r["inventory_group_id"] ?? "0"),
    product_family_id: Number(r["product_family_id"] ?? 1),
    product_kind_id: String(r["product_kind_id"] ?? "0"),
  };
  return cacheDefectos;
}

/* ------------------------------- Empresa -------------------------------- */

const EMPRESA_VACIA: Empresa = { nombre: "", rnc: "", direccion: "", telefono: "", email: "" };

export async function obtenerEmpresa(): Promise<Empresa> {
  if (await usarMysql()) {
    // En modo MySQL nunca se mezclan datos de ejemplo: si no hay fila, vacío.
    const filas = await sql<{
      nombre: string | null;
      rnc: string | null;
      direccion: string | null;
      telefono: string | null;
      email: string | null;
    }>(
      `SELECT name AS nombre, rnc,
              TRIM(CONCAT_WS(', ', NULLIF(address1, ''), NULLIF(address2, ''),
                             NULLIF(address3, ''), NULLIF(address4, ''))) AS direccion,
              phone AS telefono, email
       FROM companies ORDER BY company_id LIMIT 1`,
    );
    const f = filas[0];
    if (!f) return EMPRESA_VACIA;
    return {
      nombre: f.nombre ?? "",
      rnc: f.rnc ?? "",
      direccion: f.direccion ?? "",
      telefono: f.telefono ?? "",
      email: f.email ?? "",
    };
  }
  return demo().empresa;
}

export async function guardarEmpresa(e: Empresa): Promise<Empresa> {
  if (await usarMysql()) {
    const filas = await sql<{ company_id: number }>(
      "SELECT company_id FROM companies ORDER BY company_id LIMIT 1",
    );
    const id = filas[0]?.company_id;
    if (id === undefined) throw new Error("No hay empresa registrada en la tabla companies");
    await ejecutar(
      `UPDATE companies SET name = ?, billing_name = ?, rnc = ?, address1 = ?, phone = ?, email = ?
       WHERE company_id = ?`,
      [e.nombre, e.nombre, e.rnc, e.direccion, e.telefono, e.email, id],
    );
    return e;
  }
  demo().empresa = e;
  return e;
}

/* ------------------------------- Clientes ------------------------------- */

type FilaCliente = Record<string, string | number | null>;

const txt = (v: string | number | null | undefined) => (v == null ? "" : String(v));
const num = (v: string | number | null | undefined) => Number(v ?? 0) || 0;
const fechaIso = (v: string | number | null | undefined) =>
  v == null ? "" : String(v).slice(0, 10);

const CAMPOS_CLIENTE = `customer_id AS id, name AS nombre, rnc, ncf_id,
       phone1 AS telefono, phone2, phone3, fax1, main_email AS email, secondary_email,
       short_name, address1 AS direccion, address2, address3, address4, zip_code,
       since, ar_location_id, sector_id, credit_days AS dias_credito, credit_amount,
       salesman_id, class_id, price_list, datacredito, tax, backorder, advance,
       purchase_validation, generico, overdue_credit, overdue_credit_days,
       drug_certificate, certificate_date, tax_retention, isr_retention, notes,
       status = 'A' AS activo`;

function mapearCliente(f: FilaCliente): Cliente {
  return {
    id: String(f["id"]),
    nombre: txt(f["nombre"]),
    rnc: txt(f["rnc"]),
    tipo_ncf: tipoDesdeNcfId(f["ncf_id"] as number | null),
    telefono: txt(f["telefono"]),
    email: txt(f["email"]),
    direccion: txt(f["direccion"]),
    dias_credito: num(f["dias_credito"]),
    activo: Boolean(f["activo"]),
    nombre_corto: txt(f["short_name"]),
    direccion2: txt(f["address2"]),
    ciudad: txt(f["address3"]),
    pais: txt(f["address4"]),
    codigo_postal: txt(f["zip_code"]),
    telefono2: txt(f["phone2"]),
    telefono3: txt(f["phone3"]),
    fax: txt(f["fax1"]),
    email_alterno: txt(f["secondary_email"]),
    fecha_apertura: fechaIso(f["since"]),
    localidad_id: txt(f["ar_location_id"]),
    sector: txt(f["sector_id"]),
    monto_credito: num(f["credit_amount"]),
    vendedor_id: num(f["salesman_id"]),
    clase_id: num(f["class_id"]),
    lista_precios: num(f["price_list"]) || 1,
    datacredito: (txt(f["datacredito"]) || "") as Cliente["datacredito"],
    cargar_itbis: Boolean(num(f["tax"])),
    backorder: Boolean(num(f["backorder"])),
    retener_anticipos: Boolean(num(f["advance"])),
    validar_orden_compra: Boolean(num(f["purchase_validation"])),
    generico: Boolean(num(f["generico"])),
    bloquear_credito_vencido: Boolean(num(f["overdue_credit"])),
    dias_credito_vencido: num(f["overdue_credit_days"]),
    certificado_zf: txt(f["drug_certificate"]),
    certificado_zf_vence: fechaIso(f["certificate_date"]),
    retencion_itbis: num(f["tax_retention"]),
    retencion_isr: num(f["isr_retention"]),
    notas: txt(f["notes"]),
  };
}

export async function listarClientes(busqueda = ""): Promise<Cliente[]> {
  if (await usarMysql()) {
    const like = `%${busqueda}%`;
    const filas = await sql<FilaCliente>(
      `SELECT ${CAMPOS_CLIENTE}
       FROM customers
       WHERE (? = '' OR name LIKE ? OR rnc LIKE ? OR customer_id LIKE ?)
       ORDER BY name
       LIMIT 500`,
      [busqueda, like, like, like],
    );
    return filas.map(mapearCliente);
  }
  const t = busqueda.toLowerCase();
  return demo()
    .clientes.filter((c) => !t || c.nombre.toLowerCase().includes(t) || c.rnc.includes(t))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export async function listasCliente(): Promise<ListasCliente> {
  if (!(await usarMysql())) {
    return { localidades: [], vendedores: [], clases: [] };
  }
  const [loc, ven, cla] = await Promise.all([
    sql<FilaCliente>(
      "SELECT ar_location_id AS id, name AS nombre FROM ar_locations ORDER BY name LIMIT 500",
    ),
    sql<FilaCliente>(
      `SELECT salesman_id AS id, TRIM(CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,''))) AS nombre
       FROM salesmen WHERE status = 'A' ORDER BY nombre LIMIT 300`,
    ),
    sql<FilaCliente>(
      "SELECT class_id AS id, name AS nombre FROM ar_classes WHERE kind = 'CLIENTE' ORDER BY name LIMIT 200",
    ),
  ]);
  const map = (f: FilaCliente[]) =>
    f.map((r) => ({ id: String(r["id"]), nombre: txt(r["nombre"]) || String(r["id"]) }));
  return { localidades: map(loc), vendedores: map(ven), clases: map(cla) };
}

export async function guardarCliente(
  c: Omit<Cliente, "id"> & { id?: string | undefined },
): Promise<Cliente> {
  if (await usarMysql()) {
    const d = await defectos();
    const ncfId = NCF_ID_POR_TIPO[c.tipo_ncf];
    const valores = [
      c.nombre,
      c.nombre_corto || null,
      c.rnc,
      ncfId,
      c.telefono || ".",
      c.telefono2 || null,
      c.telefono3 || null,
      c.fax || null,
      c.email || null,
      c.email_alterno || null,
      c.direccion || null,
      c.direccion2 || null,
      c.ciudad || null,
      c.pais || null,
      c.codigo_postal || null,
      c.localidad_id || d.ar_location_id,
      c.sector || null,
      c.dias_credito,
      Math.round(c.monto_credito ?? 0),
      c.vendedor_id ?? d.salesman_id,
      c.clase_id ?? d.class_id,
      c.lista_precios ?? 1,
      c.datacredito ? c.datacredito : null,
      c.cargar_itbis ? 1 : 0,
      c.backorder ? 1 : 0,
      c.retener_anticipos ? 1 : 0,
      c.validar_orden_compra ? 1 : 0,
      c.generico ? 1 : 0,
      c.bloquear_credito_vencido ? 1 : 0,
      c.dias_credito_vencido ?? 0,
      c.certificado_zf || null,
      c.certificado_zf_vence || null,
      c.retencion_itbis ?? 0,
      c.retencion_isr ?? 0,
      c.notas || null,
      c.activo ? "A" : "I",
    ];
    if (c.id) {
      await ejecutar(
        `UPDATE customers SET name = ?, short_name = ?, rnc = ?, ncf_id = ?, phone1 = ?,
           phone2 = ?, phone3 = ?, fax1 = ?, main_email = ?, secondary_email = ?,
           address1 = ?, address2 = ?, address3 = ?, address4 = ?, zip_code = ?,
           ar_location_id = ?, sector_id = ?, credit_days = ?, credit_amount = ?,
           salesman_id = ?, class_id = ?, price_list = ?, datacredito = ?, tax = ?,
           backorder = ?, advance = ?, purchase_validation = ?, generico = ?,
           overdue_credit = ?, overdue_credit_days = ?, drug_certificate = ?,
           certificate_date = ?, tax_retention = ?, isr_retention = ?, notes = ?, status = ?
         WHERE customer_id = ?`,
        [...valores, c.id],
      );
      const filas = await sql<FilaCliente>(
        `SELECT ${CAMPOS_CLIENTE} FROM customers WHERE customer_id = ?`,
        [c.id],
      );
      return filas[0] ? mapearCliente(filas[0]) : ({ ...c, id: c.id } as Cliente);
    }
    const sig = await sql<{ id: string | null }>(
      "SELECT LPAD(MAX(CAST(customer_id AS UNSIGNED)) + 1, 5, '0') AS id FROM customers",
    );
    const nuevoId = sig[0]?.id ?? "00001";
    await ejecutar(
      `INSERT INTO customers
         (customer_id, name, short_name, rnc, ncf_id, phone1, phone2, phone3, fax1,
          main_email, secondary_email, address1, address2, address3, address4, zip_code,
          ar_location_id, sector_id, credit_days, credit_amount, salesman_id, class_id,
          price_list, datacredito, tax, backorder, advance, purchase_validation, generico,
          overdue_credit, overdue_credit_days, drug_certificate, certificate_date,
          tax_retention, isr_retention, notes, status, since, tax_deduction)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [nuevoId, ...valores, c.fecha_apertura || new Date().toISOString().slice(0, 10)],
    );
    const filas = await sql<FilaCliente>(
      `SELECT ${CAMPOS_CLIENTE} FROM customers WHERE customer_id = ?`,
      [nuevoId],
    );
    return filas[0] ? mapearCliente(filas[0]) : ({ ...c, id: nuevoId } as Cliente);
  }
  const d = demo();
  if (c.id) {
    const i = d.clientes.findIndex((x) => x.id === c.id);
    if (i === -1) throw new Error("Cliente no encontrado");
    d.clientes[i] = { ...(c as Cliente), id: c.id };
    return d.clientes[i]!;
  }
  const nuevo = { ...(c as Cliente), id: String(d.siguienteId.cliente++) };
  d.clientes.push(nuevo);
  return nuevo;

}

/* --------------------------------- Ítems -------------------------------- */

interface FilaItem {
  id: string;
  codigo: string;
  descripcion: string | null;
  unidad: string | null;
  precio: number | null;
  tasa_itbis: number | null;
  activo: number | null;
}

function mapearItem(f: FilaItem): Item {
  return {
    id: String(f.id),
    codigo: f.codigo,
    descripcion: f.descripcion ?? "",
    unidad: f.unidad ?? "UND",
    precio: Number(f.precio ?? 0),
    tasa_itbis: Number(f.tasa_itbis ?? 0),
    activo: Boolean(f.activo),
  };
}

export async function listarItems(busqueda = ""): Promise<Item[]> {
  if (await usarMysql()) {
    const like = `%${busqueda}%`;
    const filas = await sql<FilaItem>(
      `SELECT p.product_id AS id, p.product_id AS codigo, p.name AS descripcion,
              COALESCE(m.abreviature, 'UND') AS unidad, p.price1 AS precio,
              CASE WHEN p.tax = 1 THEN COALESCE(p.tax_rate, 18) ELSE 0 END AS tasa_itbis,
              p.status = 'A' AS activo
       FROM products p
       LEFT JOIN measures m ON m.measure_id = p.measure_id
       WHERE (? = '' OR p.product_id LIKE ? OR p.name LIKE ?)
       ORDER BY p.product_id
       LIMIT 500`,
      [busqueda, like, like],
    );
    return filas.map(mapearItem);
  }
  const t = busqueda.toLowerCase();
  return demo()
    .items.filter(
      (i) => !t || i.codigo.toLowerCase().includes(t) || i.descripcion.toLowerCase().includes(t),
    )
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export async function guardarItem(
  it: Omit<Item, "id"> & { id?: string | undefined },
): Promise<Item> {
  if (await usarMysql()) {
    if (it.id) {
      await ejecutar(
        `UPDATE products SET name = ?, price1 = ?, tax = ?, tax_rate = ?, status = ?
         WHERE product_id = ?`,
        [it.descripcion, it.precio, it.tasa_itbis > 0 ? 1 : 0, it.tasa_itbis, it.activo ? "A" : "I", it.id],
      );
      return { ...it, id: it.id } as Item;
    }
    const d = await defectos();
    await ejecutar(
      `INSERT INTO products
         (product_id, name, status, tax, tax_rate, price1, cost,
          is_compound, is_service, stock_validate, is_drug, is_comisionable, no_gravamen,
          price_edition, rotation, life, serial_require,
          weight_measure_id, measure_id, volume_measure_id, supplier_id, color_id,
          packaging_id, source_id, currency_id, inventory_group_id, brand_id,
          product_family_id, product_kind_id)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, 1, 0, 0, 0, ?, 0, 0, 0, 0,
               '0', COALESCE((SELECT measure_id FROM (SELECT measure_id FROM measures WHERE abreviature = ? LIMIT 1) mm), '0'),
               '0', ?, ?, ?, ?, 'DOP', ?, ?, ?, ?)`,
      [
        it.codigo,
        it.descripcion,
        it.activo ? "A" : "I",
        it.tasa_itbis > 0 ? 1 : 0,
        it.tasa_itbis,
        it.precio,
        it.tasa_itbis > 0 ? 0 : 1,
        it.unidad,
        d.supplier_id,
        d.color_id,
        d.packaging_id,
        d.source_id,
        d.inventory_group_id,
        d.brand_id,
        d.product_family_id,
        d.product_kind_id,
      ],
    );
    return { ...it, id: it.codigo } as Item;
  }
  const d = demo();
  if (it.id) {
    const i = d.items.findIndex((x) => x.id === it.id);
    if (i === -1) throw new Error("Ítem no encontrado");
    d.items[i] = { ...(it as Item), id: it.id };
    return d.items[i]!;
  }
  const nuevo = { ...(it as Item), id: String(d.siguienteId.item++) };
  d.items.push(nuevo);
  return nuevo;
}

/* ------------------------------ Secuencias ------------------------------ */

interface FilaSecuencia {
  ID: number;
  prefix: string;
  start: number;
  end: number;
  last: number;
  status: number;
  vencimiento: string | null;
}

export async function listarSecuencias(): Promise<SecuenciaNCF[]> {
  if (await usarMysql()) {
    const filas = await sql<FilaSecuencia>(
      `SELECT ID, prefix, start, end, last, status,
              DATE_FORMAT(vencimiento, '%Y-%m-%d') AS vencimiento
       FROM ncf_sequences ORDER BY prefix, ID`,
    );
    // Varias filas pueden compartir prefijo (rangos sucesivos): se muestra la
    // vigente (activa, con saldo y no vencida) o, en su defecto, la más reciente.
    const hoy = hoyISO();
    const porTipo = new Map<string, FilaSecuencia>();
    for (const f of filas) {
      if (!(f.prefix in NCF_ID_POR_TIPO)) continue;
      const vigente =
        Number(f.status) === 1 &&
        Number(f.last) < Number(f.end) &&
        (!f.vencimiento || f.vencimiento >= hoy);
      const actual = porTipo.get(f.prefix);
      if (!actual) {
        porTipo.set(f.prefix, f);
      } else {
        const actualVigente =
          Number(actual.status) === 1 &&
          Number(actual.last) < Number(actual.end) &&
          (!actual.vencimiento || actual.vencimiento >= hoy);
        if ((vigente && !actualVigente) || (vigente === actualVigente && f.ID > actual.ID)) {
          porTipo.set(f.prefix, f);
        }
      }
    }
    return [...porTipo.values()]
      .map((f) => ({
        tipo_ncf: f.prefix as TipoNCF,
        desde: Number(f.start),
        hasta: Number(f.end),
        proximo: Number(f.last) + 1,
        vence: f.vencimiento ?? "",
        activa: Number(f.status) === 1,
      }))
      .sort((a, b) => a.tipo_ncf.localeCompare(b.tipo_ncf));
  }
  return [...demo().secuencias].sort((a, b) => a.tipo_ncf.localeCompare(b.tipo_ncf));
}

export async function guardarSecuencia(s: SecuenciaNCF): Promise<SecuenciaNCF> {
  if (await usarMysql()) {
    // Se desactivan los rangos anteriores del mismo tipo y se registra el nuevo.
    await ejecutar("UPDATE ncf_sequences SET status = 0 WHERE prefix = ?", [s.tipo_ncf]);
    await ejecutar(
      `INSERT INTO ncf_sequences
         (start, end, last, alert, status, ncf_id, branch_id, sb_id, caja_id, prefix, autorizacion, vencimiento)
       VALUES (?, ?, ?, 5, ?, ?, 1, 1, 1, ?, '', ?)`,
      [
        s.desde,
        s.hasta,
        s.proximo - 1,
        s.activa ? 1 : 0,
        NCF_ID_POR_TIPO[s.tipo_ncf],
        s.tipo_ncf,
        s.vence || null,
      ],
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

// Consulta base: cada factura es una orden con su comprobante (invoices) y los
// totales calculados desde orders_detail. El estado se deriva: anulada si tiene
// reverso, pagada si los cobros cubren el total, si no, emitida.
const SQL_FACTURAS = `
  SELECT * FROM (
    SELECT o.order_id AS id, COALESCE(i.ncf_doc, '') AS ncf,
           COALESCE(LEFT(i.ncf_doc, 3), '') AS tipo_prefijo, i.ncf_id AS ncf_id,
           o.customer_id AS cliente_id,
           COALESCE(NULLIF(c.name, ''), o.customer_name, '') AS cliente_nombre,
           COALESCE(NULLIF(c.rnc, ''), NULLIF(o.rnc, ''), '') AS cliente_rnc,
           DATE_FORMAT(o.date, '%Y-%m-%d') AS fecha,
           DATE_FORMAT(DATE_ADD(o.date, INTERVAL o.credit_days DAY), '%Y-%m-%d') AS vencimiento,
           COALESCE(t.subtotal, 0) AS subtotal, COALESCE(t.descuento, 0) AS descuento,
           COALESCE(t.itbis, 0) AS itbis, COALESCE(t.total, 0) AS total,
           CASE
             WHEN ri.invoice_id IS NOT NULL THEN 'anulada'
             WHEN COALESCE(t.total, 0) > 0
                  AND (o.efectivo + o.tarjeta + o.cheque + o.transferencia + o.cardnet)
                      >= t.total - 0.01 THEN 'pagada'
             ELSE 'emitida'
           END AS estado,
           COALESCE(o.notes, '') AS notas,
           o.credit_days AS dias_credito,
           COALESCE(NULLIF(o.currency_id, ''), 'DOP') AS moneda,
           COALESCE(o.currency_rate, 1) AS tasa_cambio,
           o.salesman_id AS vendedor_id,
           TRIM(CONCAT(COALESCE(sm.first_name, ''), ' ', COALESCE(sm.last_name, ''))) AS vendedor,
           o.tech_id AS tecnico_id,
           o.warehouse_id AS almacen_id, w.name AS almacen,
           o.branch_id AS sucursal_id, o.department_id AS departamento_id,
           o.project_id AS proyecto_id, o.quotation_id AS cotizacion_id,
           COALESCE(o.customer_order, '') AS orden_cliente,
           COALESCE(o.salesman_order, '') AS orden_vendedor,
           COALESCE(NULLIF(c.address1, ''), '') AS cliente_direccion,
           COALESCE(NULLIF(c.phone1, ''), '') AS cliente_telefono,
           o.efectivo, o.tarjeta, o.cheque, o.transferencia, o.cardnet
    FROM orders o
    LEFT JOIN invoices i ON i.invoice_id = o.invoice_id AND i.branch_id = o.branch_id
    LEFT JOIN customers c ON c.customer_id = o.customer_id
    LEFT JOIN salesmen sm ON sm.salesman_id = o.salesman_id
    LEFT JOIN warehouse w ON w.warehouse_id = o.warehouse_id

    LEFT JOIN (
      SELECT order_id,
             ROUND(SUM(quantity * price - discount), 2) AS subtotal,
             ROUND(SUM(discount), 2) AS descuento,
             ROUND(SUM(tax1 + tax2 + tax3), 2) AS itbis,
             ROUND(SUM(quantity * price - discount + tax1 + tax2 + tax3), 2) AS total
      FROM orders_detail GROUP BY order_id
    ) t ON t.order_id = o.order_id
    LEFT JOIN (
      SELECT DISTINCT invoice_id FROM reverse_invoices WHERE invoice_id IS NOT NULL
    ) ri ON ri.invoice_id = o.invoice_id
    WHERE o.invoice_id IS NOT NULL
  ) f`;

interface FilaFactura {
  id: number;
  ncf: string;
  tipo_prefijo: string;
  ncf_id: number | null;
  cliente_id: string;
  cliente_nombre: string;
  cliente_rnc: string;
  fecha: string;
  vencimiento: string;
  subtotal: number;
  descuento: number;
  itbis: number;
  total: number;
  estado: EstadoFactura;
  notas: string;
  dias_credito: number | null;
  moneda: string | null;
  tasa_cambio: number | null;
  vendedor_id: number | null;
  vendedor: string | null;
  tecnico_id: number | null;
  almacen_id: number | null;
  almacen: string | null;
  sucursal_id: number | null;
  departamento_id: number | null;
  proyecto_id: number | null;
  cotizacion_id: number | null;
  orden_cliente: string | null;
  orden_vendedor: string | null;
  cliente_direccion: string | null;
  cliente_telefono: string | null;
  efectivo: number | null;
  tarjeta: number | null;
  cheque: number | null;
  transferencia: number | null;
  cardnet: number | null;
}

const idOpc = (v: number | null | undefined): string | undefined =>
  v === null || v === undefined ? undefined : String(v);

function mapearFactura(f: FilaFactura): Factura {
  const tipo = (f.tipo_prefijo && f.tipo_prefijo in NCF_ID_POR_TIPO
    ? f.tipo_prefijo
    : tipoDesdeNcfId(f.ncf_id)) as TipoNCF;
  return normalizarFactura({
    id: Number(f.id),
    ncf: f.ncf,
    tipo_ncf: tipo,
    cliente_id: String(f.cliente_id),
    cliente_nombre: f.cliente_nombre,
    cliente_rnc: f.cliente_rnc,
    cliente_direccion: f.cliente_direccion ?? "",
    cliente_telefono: f.cliente_telefono ?? "",
    fecha: f.fecha,
    vencimiento: f.vencimiento,
    dias_credito: Number(f.dias_credito ?? 0),
    moneda: f.moneda ?? "DOP",
    tasa_cambio: Number(f.tasa_cambio ?? 1) || 1,
    subtotal: f.subtotal,
    descuento: f.descuento,
    itbis: f.itbis,
    total: f.total,
    estado: f.estado,
    notas: f.notas,
    vendedor_id: idOpc(f.vendedor_id),
    vendedor: f.vendedor?.trim() || undefined,
    tecnico_id: idOpc(f.tecnico_id),
    almacen_id: idOpc(f.almacen_id),
    almacen: f.almacen ?? undefined,
    sucursal_id: idOpc(f.sucursal_id),
    departamento_id: idOpc(f.departamento_id),
    proyecto_id: idOpc(f.proyecto_id),
    cotizacion_id: idOpc(f.cotizacion_id),
    orden_cliente: f.orden_cliente ?? "",
    orden_vendedor: f.orden_vendedor ?? "",
    pagos: {
      efectivo: Number(f.efectivo ?? 0),
      tarjeta: Number(f.tarjeta ?? 0),
      cheque: Number(f.cheque ?? 0),
      transferencia: Number(f.transferencia ?? 0),
      cardnet: Number(f.cardnet ?? 0),
    },
    lineas: [],
  });
}


export async function listarFacturas(filtro: FiltroFacturas = {}): Promise<Factura[]> {
  if (await usarMysql()) {
    const cond: string[] = [];
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
      cond.push("(f.tipo_prefijo = ? OR (f.tipo_prefijo = '' AND f.ncf_id = ?))");
      params.push(filtro.tipo, NCF_ID_POR_TIPO[filtro.tipo]);
    }
    if (filtro.estado) {
      cond.push("f.estado = ?");
      params.push(filtro.estado);
    }
    const filas = await sql<FilaFactura>(
      `${SQL_FACTURAS}
       ${cond.length ? `WHERE ${cond.join(" AND ")}` : ""}
       ORDER BY f.fecha DESC, f.id DESC
       LIMIT 500`,
      params,
    );
    return filas.map(mapearFactura);
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
    const filas = await sql<FilaFactura>(`${SQL_FACTURAS} WHERE f.id = ?`, [id]);
    const f = filas[0];
    if (!f) return null;
    const lineas = await sql<{
      item_id: string | null;
      codigo: string;
      descripcion: string;
      cantidad: number;
      precio: number;
      descuento_pct: number;
      tasa_itbis: number;
      subtotal: number;
      itbis: number;
      total: number;
    }>(
      `SELECT product_id AS item_id, product_id AS codigo,
              COALESCE(NULLIF(product_name, ''), NULLIF(name, ''), product_id) AS descripcion,
              quantity AS cantidad, price AS precio, discount_rate AS descuento_pct,
              CASE WHEN quantity * price - discount > 0
                   THEN ROUND((tax1 + tax2 + tax3) / (quantity * price - discount) * 100)
                   ELSE 0 END AS tasa_itbis,
              ROUND(quantity * price - discount, 2) AS subtotal,
              ROUND(tax1 + tax2 + tax3, 2) AS itbis,
              ROUND(quantity * price - discount + tax1 + tax2 + tax3, 2) AS total
       FROM orders_detail WHERE order_id = ? ORDER BY orders_detail_id`,
      [id],
    );
    const factura = mapearFactura(f);
    factura.lineas = lineas.map((l) => ({
      item_id: l.item_id,
      codigo: l.codigo,
      descripcion: l.descripcion,
      cantidad: Number(l.cantidad),
      precio: Number(l.precio),
      descuento_pct: Number(l.descuento_pct),
      tasa_itbis: Number(l.tasa_itbis),
      subtotal: Number(l.subtotal),
      itbis: Number(l.itbis),
      total: Number(l.total),
    }));
    return factura;
  }
  return demo().facturas.find((f) => f.id === id) ?? null;
}

export interface NuevaFactura {
  cliente_id: string;
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
    // Rango vigente del tipo solicitado.
    const rangos = await sql<{ ID: number; last: number }>(
      `SELECT ID, last FROM ncf_sequences
       WHERE prefix = ? AND status = 1 AND last < end
         AND (vencimiento IS NULL OR vencimiento >= CURDATE())
       ORDER BY ID LIMIT 1`,
      [entrada.tipo_ncf],
    );
    const rango = rangos[0];
    if (!rango) {
      throw new Error(
        `La secuencia NCF ${entrada.tipo_ncf} está agotada, vencida o inactiva. Actualízala en Secuencias NCF.`,
      );
    }
    // Asignación atómica: incrementa sólo si queda rango disponible.
    const upd = await ejecutar(
      "UPDATE ncf_sequences SET last = last + 1 WHERE ID = ? AND last < end",
      [rango.ID],
    );
    if (upd.affectedRows === 0) {
      throw new Error(`La secuencia NCF ${entrada.tipo_ncf} se agotó. Actualízala en Secuencias NCF.`);
    }
    const numero = Number(rango.last) + 1;
    const ncf = formatearNCF(entrada.tipo_ncf, numero);

    const clientes = await sql<{ name: string; rnc: string | null }>(
      "SELECT name, rnc FROM customers WHERE customer_id = ?",
      [entrada.cliente_id],
    );
    const cliente = clientes[0];
    if (!cliente) throw new Error("Cliente no encontrado");

    // Comprobante en invoices.
    const inv = await ejecutar(
      `INSERT INTO invoices (branch_id, date, time, counted, ncf_id, ncf_doc)
       VALUES (1, ?, CURTIME(), 0, ?, ?)`,
      [entrada.fecha, NCF_ID_POR_TIPO[entrada.tipo_ncf], ncf],
    );

    const d = await defectos();
    // Venta de contado: se registra cobrada en efectivo; a crédito queda pendiente.
    const efectivo = entrada.dias_credito === 0 ? totales.total : 0;
    const ord = await ejecutar(
      `INSERT INTO orders
         (branch_id, date, time, open, customer_name, credit_days, currency_rate,
          authorized, user_id, ship_id, customer_id, salesman_id, currency_id,
          warehouse_id, bank_id, efectivo, tarjeta, cheque, transferencia, horas,
          cardnet, ultimo_pago, notes, rnc)
       VALUES (1, ?, CURTIME(), 1, ?, ?, 1, 0, ?, 1, ?, ?, 'DOP', ?, ?, ?, 0, 0, 0, 0, 0, 0, ?, ?)`,
      [
        entrada.fecha,
        cliente.name,
        entrada.dias_credito,
        d.user_id,
        entrada.cliente_id,
        d.salesman_id,
        d.warehouse_id,
        d.bank_id,
        efectivo,
        entrada.notas,
        cliente.rnc ?? "",
      ],
    );
    const orderId = ord.insertId;
    await ejecutar("UPDATE orders SET invoice_id = ? WHERE order_id = ?", [inv.insertId, orderId]);

    for (const [pos, l] of lineas.entries()) {
      const descuentoMonto = round2(l.cantidad * l.precio * (l.descuento_pct / 100));
      await ejecutar(
        `INSERT INTO orders_detail
           (order_id, branch_id, position, product_id, product_name, name,
            quantity, bonus, price, ref_price, tax1, tax2, tax3,
            discount_rate, discount, cost, cost_ant,
            compound_qtty, compound_bonus, compound_price, compound_discount)
         VALUES (?, 1, ?, ?, ?, ?, ?, 0, ?, ?, ?, 0, 0, ?, ?, 0, 0, 0, 0, 0, 0)`,
        [
          orderId,
          pos + 1,
          l.item_id ?? l.codigo ?? "",
          l.descripcion,
          l.descripcion,
          l.cantidad,
          l.precio,
          l.precio,
          l.itbis,
          l.descuento_pct,
          descuentoMonto,
        ],
      );
    }
    const creada = await obtenerFactura(orderId);
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
    if (estado === "pagada") {
      // Registra el cobro en efectivo por la diferencia pendiente.
      await ejecutar(
        `UPDATE orders o
         JOIN (SELECT order_id, ROUND(SUM(quantity * price - discount + tax1 + tax2 + tax3), 2) AS t
               FROM orders_detail WHERE order_id = ? GROUP BY order_id) d
           ON d.order_id = o.order_id
         SET o.efectivo = GREATEST(0, d.t - o.tarjeta - o.cheque - o.transferencia - o.cardnet)
         WHERE o.order_id = ?`,
        [id, id],
      );
      return;
    }
    if (estado === "emitida") {
      await ejecutar(
        "UPDATE orders SET efectivo = 0, tarjeta = 0, cheque = 0, transferencia = 0, cardnet = 0 WHERE order_id = ?",
        [id],
      );
      return;
    }
    // Anulada: se registra un reverso sobre la factura (como hace el sistema).
    const filas = await sql<FilaFactura>(`${SQL_FACTURAS} WHERE f.id = ?`, [id]);
    const f = filas[0];
    if (!f) throw new Error("Factura no encontrada");
    if (f.estado === "anulada") return;
    const inv = await sql<{ invoice_id: number; branch_id: number }>(
      "SELECT invoice_id, branch_id FROM orders WHERE order_id = ?",
      [id],
    );
    if (!inv[0]) throw new Error("Factura no encontrada");
    const d = await defectos();
    const ncfId = f.ncf_id ?? NCF_ID_POR_TIPO[mapearFactura(f).tipo_ncf];
    await ejecutar(
      `INSERT INTO reverse_invoices
         (branch_id, posted, number, date, time, customer_name, currency_rate,
          authorized, invoice_id, ncf_id, ncf_doc, user_id, customer_id,
          salesman_id, currency_id, warehouse_id, notes)
       VALUES (?, 0, 0, CURDATE(), CURTIME(), ?, 1, 0, ?, ?, ?, ?, ?, ?, 'DOP', ?, ?)`,
      [
        inv[0].branch_id,
        f.cliente_nombre,
        inv[0].invoice_id,
        ncfId,
        f.ncf,
        d.user_id,
        f.cliente_id,
        d.salesman_id,
        d.warehouse_id,
        "Anulada desde el módulo de facturación web",
      ],
    );
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
