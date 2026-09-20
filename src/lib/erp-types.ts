// Tipos y cálculos fiscales compartidos entre cliente y servidor.

// Comprobantes fiscales DGII: serie B (impresos) y serie E (electrónicos e-CF).
export type TipoNCF =
  | "B01" | "B02" | "B03" | "B04" | "B11" | "B13" | "B14" | "B15"
  | "E31" | "E32" | "E33" | "E34" | "E41" | "E43" | "E44" | "E45" | "E46";

export const TIPOS_NCF: { codigo: TipoNCF; nombre: string }[] = [
  { codigo: "B01", nombre: "B01 — Crédito Fiscal" },
  { codigo: "B02", nombre: "B02 — Consumo" },
  { codigo: "B03", nombre: "B03 — Nota de Débito" },
  { codigo: "B04", nombre: "B04 — Nota de Crédito" },
  { codigo: "B11", nombre: "B11 — Proveedor Informal" },
  { codigo: "B13", nombre: "B13 — Gastos Menores" },
  { codigo: "B14", nombre: "B14 — Régimen Especial" },
  { codigo: "B15", nombre: "B15 — Gubernamental" },
  { codigo: "E31", nombre: "E31 — e-CF Crédito Fiscal" },
  { codigo: "E32", nombre: "E32 — e-CF Consumo" },
  { codigo: "E33", nombre: "E33 — e-CF Nota de Débito" },
  { codigo: "E34", nombre: "E34 — e-CF Nota de Crédito" },
  { codigo: "E41", nombre: "E41 — e-CF Compras" },
  { codigo: "E43", nombre: "E43 — e-CF Gastos Menores" },
  { codigo: "E44", nombre: "E44 — e-CF Regímenes Especiales" },
  { codigo: "E45", nombre: "E45 — e-CF Gubernamental" },
  { codigo: "E46", nombre: "E46 — e-CF Exportaciones" },
];

// Título oficial que se imprime en el documento según el tipo de comprobante.
export const TITULO_NCF: Record<TipoNCF, string> = {
  B01: "FACTURA DE CRÉDITO FISCAL",
  B02: "FACTURA DE CONSUMO",
  B03: "NOTA DE DÉBITO",
  B04: "NOTA DE CRÉDITO",
  B11: "FACTURA DE PROVEEDOR INFORMAL",
  B13: "GASTOS MENORES",
  B14: "FACTURA DE REGÍMENES ESPECIALES",
  B15: "FACTURA GUBERNAMENTAL",
  E31: "FACTURA DE CRÉDITO FISCAL ELECTRÓNICA",
  E32: "FACTURA DE CONSUMO ELECTRÓNICA",
  E33: "NOTA DE DÉBITO ELECTRÓNICA",
  E34: "NOTA DE CRÉDITO ELECTRÓNICA",
  E41: "COMPROBANTE DE COMPRAS ELECTRÓNICO",
  E43: "GASTOS MENORES ELECTRÓNICOS",
  E44: "FACTURA DE REGÍMENES ESPECIALES ELECTRÓNICA",
  E45: "FACTURA GUBERNAMENTAL ELECTRÓNICA",
  E46: "COMPROBANTE DE EXPORTACIONES ELECTRÓNICO",
};

export function tituloDocumento(tipo: string | undefined): string {
  return TITULO_NCF[tipo as TipoNCF] ?? "FACTURA";
}

export const TASAS_ITBIS = [18, 16, 0] as const;
export type TasaItbis = (typeof TASAS_ITBIS)[number];

// "pedido" = orden guardada sin número de factura todavía.
export type EstadoFactura = "pedido" | "emitida" | "pagada" | "anulada";

export const ETIQUETA_ESTADO: Record<EstadoFactura, string> = {
  pedido: "Pedido",
  emitida: "Facturada",
  pagada: "Pagada",
  anulada: "Anulada",
};

export interface Empresa {
  /** companies.company_id — identifica la plantilla de impresión de la empresa. */
  id?: string | undefined;
  nombre: string;
  rnc: string;
  direccion: string;
  telefono: string;
  email: string;
}


// Los identificadores son texto: provienen de las tablas existentes
// (customers.customer_id, products.product_id).
export interface Cliente {
  id: string;
  nombre: string;
  rnc: string;
  tipo_ncf: TipoNCF;
  telefono: string;
  email: string;
  direccion: string;
  dias_credito: number;
  activo: boolean;
  // Datos generales adicionales
  nombre_corto?: string | undefined;
  direccion2?: string | undefined;
  ciudad?: string | undefined;
  pais?: string | undefined;
  codigo_postal?: string | undefined;
  telefono2?: string | undefined;
  telefono3?: string | undefined;
  fax?: string | undefined;
  email_alterno?: string | undefined;
  fecha_apertura?: string | undefined;
  localidad_id?: string | undefined;
  sector?: string | undefined;
  // Administración
  monto_credito?: number | undefined;
  vendedor_id?: number | undefined;
  clase_id?: number | undefined;
  lista_precios?: number | undefined;
  datacredito?: "" | "NORMAL" | "ATRASO" | "LEGAL" | "CASTIGADO" | "SALDADO" | undefined;
  cargar_itbis?: boolean | undefined;
  backorder?: boolean | undefined;
  retener_anticipos?: boolean | undefined;
  validar_orden_compra?: boolean | undefined;
  generico?: boolean | undefined;
  bloquear_credito_vencido?: boolean | undefined;
  dias_credito_vencido?: number | undefined;
  certificado_zf?: string | undefined;
  certificado_zf_vence?: string | undefined;
  retencion_itbis?: number | undefined;
  retencion_isr?: number | undefined;
  notas?: string | undefined;
}

export interface OpcionLista {
  id: string;
  nombre: string;
}

export interface ListasCliente {
  localidades: OpcionLista[];
  vendedores: OpcionLista[];
  clases: OpcionLista[];
}


export interface Item {
  id: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  precio: number;
  tasa_itbis: number;
  activo: boolean;
  // Datos generales
  referencia?: string | undefined;
  nombre_corto?: string | undefined;
  suplidor_id?: number | undefined;
  grupo_id?: string | undefined;
  tipo_id?: string | undefined;
  familia_id?: number | undefined;
  codigo_barras?: string | undefined;
  moneda?: string | undefined;
  comision?: number | undefined;
  costo?: number | undefined;
  precio2?: number | undefined;
  precio3?: number | undefined;
  precio4?: number | undefined;
  precio5?: number | undefined;
  aplica_impuesto?: boolean | undefined;
  es_servicio?: boolean | undefined;
  requiere_serial?: boolean | undefined;
  compuesto?: boolean | undefined;
  validar_existencia?: boolean | undefined;
  venta_controlada?: boolean | undefined;
  no_comisionable?: boolean | undefined;
  // Presentación y disponibilidad
  empaque_id?: string | undefined;
  cantidad_empaque?: number | undefined;
  venta_minima?: number | undefined;
  venta_maxima?: number | undefined;
  existencia_maxima?: number | undefined;
  existencia_minima?: number | undefined;
  rotacion?: number | undefined;
  alto?: number | undefined;
  ancho?: number | undefined;
  profundidad?: number | undefined;
  medida_volumen_id?: string | undefined;
  peso?: number | undefined;
  medida_peso_id?: string | undefined;
  ficha?: string | undefined;
  dias_antes_vencimiento?: number | undefined;
  permitir_edicion_precio?: boolean | undefined;
  arancel?: number | undefined;
  marca_id?: string | undefined;
  color_id?: string | undefined;
  origen_id?: number | undefined;
  disparador?: "" | "FST" | undefined;
  pasillo?: string | undefined;
  tramo?: string | undefined;
  estante?: string | undefined;
  // Notas y garantía
  notas?: string | undefined;
  garantia?: string | undefined;
}

export interface ListasItem {
  suplidores: OpcionLista[];
  grupos: OpcionLista[];
  tipos: OpcionLista[];
  familias: OpcionLista[];
  marcas: OpcionLista[];
  colores: OpcionLista[];
  origenes: OpcionLista[];
  empaques: OpcionLista[];
  unidades: OpcionLista[];
  monedas: OpcionLista[];
}


export interface SecuenciaNCF {
  tipo_ncf: TipoNCF;
  desde: number;
  hasta: number;
  proximo: number;
  vence: string;
  activa: boolean;
}

/** Rango autorizado tal como se registra en la pantalla de Comprobantes Fiscales. */
export interface RangoNCF {
  id: number;
  prefijo: string;
  ncf_id: number;
  sucursal_id: number;
  desde: number;
  hasta: number;
  ultimo: number;
  alerta: number;
  activa: boolean;
  autorizacion: string;
  vence: string;
}

export interface ListasNCF {
  sucursales: OpcionLista[];
  tipos: OpcionLista[];
}

export const TAMANO_SUFIJO_NCF = 8;

export interface LineaFactura {
  item_id: string | null;
  codigo: string;
  descripcion: string;
  cantidad: number;
  oferta?: number | undefined;
  precio: number;
  descuento_pct: number;
  tasa_itbis: number;
  subtotal: number;
  itbis: number;
  total: number;
}

export interface Moneda {
  id: string;
  nombre: string;
  simbolo: string;
}

export interface OpcionId {
  id: string;
  nombre: string;
}

export interface ListasFactura {
  monedas: Moneda[];
  vendedores: OpcionId[];
  tecnicos: OpcionId[];
  almacenes: OpcionId[];
  sucursales: OpcionId[];
  departamentos: OpcionId[];
  proyectos: OpcionId[];
}

export interface PagosFactura {
  efectivo: number;
  tarjeta: number;
  cheque: number;
  transferencia: number;
  cardnet: number;
}

export interface Factura {
  /** Es el número de pedido (orders.order_id). */
  id: number;
  ncf: string;
  tipo_ncf: TipoNCF;
  /** true cuando el pedido ya tiene número de factura asignado. */
  facturado?: boolean | undefined;
  invoice_id?: number | undefined;
  cliente_id: string;
  cliente_nombre: string;
  cliente_rnc: string;
  cliente_direccion?: string | undefined;
  cliente_telefono?: string | undefined;
  fecha: string;
  vencimiento: string;
  dias_credito?: number | undefined;
  moneda?: string | undefined;
  tasa_cambio?: number | undefined;
  subtotal: number;
  /** Parte del subtotal con ITBIS (no exenta). */
  gravado?: number | undefined;
  /** Parte del subtotal sin ITBIS (exenta). */
  exento?: number | undefined;
  descuento: number;
  itbis: number;
  total: number;
  estado: EstadoFactura;
  notas: string;
  // Referencias del pedido en el sistema (equivalen a la pantalla de pedidos).
  vendedor_id?: string | undefined;
  vendedor?: string | undefined;
  tecnico_id?: string | undefined;
  almacen_id?: string | undefined;
  almacen?: string | undefined;
  sucursal_id?: string | undefined;
  departamento_id?: string | undefined;
  proyecto_id?: string | undefined;
  orden_cliente?: string | undefined;
  orden_vendedor?: string | undefined;
  cotizacion_id?: string | undefined;
  pagos?: PagosFactura | undefined;
  lineas: LineaFactura[];
}


export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface LineaEntrada {
  item_id?: string | null | undefined;
  codigo: string;
  descripcion: string;
  cantidad: number;
  /** Unidades bonificadas (oferta): se despachan pero no se cobran. */
  oferta?: number | undefined;
  precio: number;
  descuento_pct: number;
  tasa_itbis: number;
  /** Cuando es true, el precio digitado ya incluye el ITBIS. */
  precio_incluye_itbis?: boolean | undefined;
}

export function calcularLinea(l: LineaEntrada): LineaFactura {
  const precio = l.precio_incluye_itbis
    ? round2(l.precio / (1 + (l.tasa_itbis || 0) / 100))
    : l.precio;
  const bruto = l.cantidad * precio;
  const subtotal = round2(bruto * (1 - (l.descuento_pct || 0) / 100));
  const itbis = round2((subtotal * l.tasa_itbis) / 100);
  return {
    item_id: l.item_id ?? null,
    codigo: l.codigo,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    oferta: l.oferta ?? 0,
    precio,
    descuento_pct: l.descuento_pct || 0,
    tasa_itbis: l.tasa_itbis,
    subtotal,
    itbis,
    total: round2(subtotal + itbis),
  };
}


export interface Totales {
  subtotal: number;
  descuento: number;
  itbisPorTasa: { tasa: number; base: number; itbis: number }[];
  itbis: number;
  total: number;
}

export function calcularTotales(lineas: LineaEntrada[]): {
  lineas: LineaFactura[];
  totales: Totales;
} {
  const calculadas = lineas.map(calcularLinea);
  const descuento = round2(
    calculadas.reduce((a, l) => a + l.cantidad * l.precio * ((l.descuento_pct || 0) / 100), 0),
  );

  const subtotal = round2(calculadas.reduce((a, l) => a + l.subtotal, 0));
  const itbis = round2(calculadas.reduce((a, l) => a + l.itbis, 0));
  const mapa = new Map<number, { tasa: number; base: number; itbis: number }>();
  for (const l of calculadas) {
    const actual = mapa.get(l.tasa_itbis) ?? { tasa: l.tasa_itbis, base: 0, itbis: 0 };
    actual.base = round2(actual.base + l.subtotal);
    actual.itbis = round2(actual.itbis + l.itbis);
    mapa.set(l.tasa_itbis, actual);
  }
  return {
    lineas: calculadas,
    totales: {
      subtotal,
      descuento,
      itbis,
      total: round2(subtotal + itbis),
      itbisPorTasa: [...mapa.values()].sort((a, b) => b.tasa - a.tasa),
    },
  };
}

// Serie B: 8 dígitos (B0100000001). Serie E (e-CF): 10 dígitos (E310000000001).
export function formatearNCF(tipo: TipoNCF, numero: number): string {
  const digitos = tipo.startsWith("E") ? 10 : 8;
  return `${tipo}${String(numero).padStart(digitos, "0")}`;
}

const formateadorDOP = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
  minimumFractionDigits: 2,
});

export function dop(n: number): string {
  return formateadorDOP.format(n ?? 0);
}

const cacheFormato = new Map<string, Intl.NumberFormat>();

/** Formatea un importe en la moneda del documento (el sistema es multimoneda). */
export function money(n: number, monedaId?: string | undefined): string {
  const codigo = (monedaId || "DOP").toUpperCase();
  if (!/^[A-Z]{3}$/.test(codigo) || codigo === "000")
    return (n ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let f = cacheFormato.get(codigo);
  if (!f) {
    try {
      f = new Intl.NumberFormat("es-DO", {
        style: "currency",
        currency: codigo,
        minimumFractionDigits: 2,
      });
    } catch {
      f = formateadorDOP;
    }
    cacheFormato.set(codigo, f);
  }
  return f.format(n ?? 0);
}

/** Equivalente en pesos usando la tasa registrada en el documento. */
export function enDOP(n: number, tasa?: number | undefined): number {
  return round2((n ?? 0) * (tasa && tasa > 0 ? tasa : 1));
}


export function fechaCorta(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Validación básica de RNC (9 dígitos) o Cédula (11 dígitos). */
export function rncValido(valor: string): boolean {
  const limpio = valor.replace(/\D/g, "");
  return limpio.length === 9 || limpio.length === 11;
}

/* ---------------------- Formato de impresión por cliente ------------------ */

export type PapelImpresion = "carta" | "legal" | "a4" | "media" | "tirilla";

export const PAPELES: { id: PapelImpresion; nombre: string; css: string }[] = [
  { id: "carta", nombre: "Carta (8.5 × 11 pulg.)", css: "215.9mm 279.4mm" },
  { id: "legal", nombre: "Legal (8.5 × 14 pulg.)", css: "215.9mm 355.6mm" },
  { id: "a4", nombre: "A4 (210 × 297 mm)", css: "210mm 297mm" },
  { id: "media", nombre: "Media hoja (8.5 × 5.5 pulg.)", css: "215.9mm 139.7mm" },
  { id: "tirilla", nombre: "Tirilla 80 mm", css: "80mm auto" },
];

/** Configuración de impresión de la factura. empresa_id = "*" es el formato general. */
export interface FormatoImpresion {
  empresa_id: string;
  nombre: string;
  papel: PapelImpresion;
  /** Papel preimpreso: no se imprime encabezado ni logo de la empresa. */
  preimpreso: boolean;
  margen_superior: number;
  margen_inferior: number;
  margen_izquierdo: number;
  margen_derecho: number;
  mostrar_logo: boolean;
  mostrar_codigo: boolean;
  mostrar_itbis_linea: boolean;
  mostrar_descuento: boolean;
  mostrar_equivalente_dop: boolean;
  copias: number;
  titulo: string;
  pie: string;
}

export const FORMATO_IMPRESION_DEFECTO: FormatoImpresion = {
  empresa_id: "*",
  nombre: "Formato general",
  papel: "carta",
  preimpreso: false,
  margen_superior: 12,
  margen_inferior: 12,
  margen_izquierdo: 12,
  margen_derecho: 12,
  mostrar_logo: true,
  mostrar_codigo: true,
  mostrar_itbis_linea: true,
  mostrar_descuento: true,
  mostrar_equivalente_dop: true,
  copias: 1,
  titulo: "Factura de crédito fiscal / consumo",
  pie: "",
};

export function papelCss(papel: PapelImpresion): string {
  return PAPELES.find((p) => p.id === papel)?.css ?? "215.9mm 279.4mm";
}

/* -------- Otros documentos: cotizaciones, conduces y devoluciones -------- */

export type TipoDocumento = "cotizacion" | "conduce" | "devolucion";

export interface DocConfig {
  tipo: TipoDocumento;
  singular: string;
  plural: string;
  nuevo: string;
  ruta: "/cotizaciones" | "/conduces" | "/devoluciones";
  rutaNueva: "/cotizaciones/nueva" | "/conduces/nueva" | "/devoluciones/nueva";
  rutaDetalle: "/cotizaciones/$id" | "/conduces/$id" | "/devoluciones/$id";
  titulo: string;
  descripcion: string;
}

export const DOCUMENTOS: Record<TipoDocumento, DocConfig> = {
  cotizacion: {
    tipo: "cotizacion",
    singular: "Cotización",
    plural: "Cotizaciones",
    nuevo: "Nueva cotización",
    ruta: "/cotizaciones",
    rutaNueva: "/cotizaciones/nueva",
    rutaDetalle: "/cotizaciones/$id",
    titulo: "Cotización",
    descripcion: "Ofertas de precio al cliente, sin efecto fiscal ni de inventario.",
  },
  conduce: {
    tipo: "conduce",
    singular: "Conduce",
    plural: "Conduces",
    nuevo: "Nuevo conduce",
    ruta: "/conduces",
    rutaNueva: "/conduces/nueva",
    rutaDetalle: "/conduces/$id",
    titulo: "Conduce / orden de entrega",
    descripcion: "Entrega de mercancía al cliente, con referencia al pedido o cotización.",
  },
  devolucion: {
    tipo: "devolucion",
    singular: "Devolución",
    plural: "Devoluciones",
    nuevo: "Nueva devolución",
    ruta: "/devoluciones",
    rutaNueva: "/devoluciones/nueva",
    rutaDetalle: "/devoluciones/$id",
    titulo: "Nota de crédito por devolución",
    descripcion: "Devoluciones de clientes con nota de crédito (NCF B04) y motivo.",
  },
};

export interface Documento {
  tipo: TipoDocumento;
  id: number;
  sucursal_id: number;
  fecha: string;
  fecha_entrega?: string | undefined;
  cliente_id: string;
  cliente_nombre: string;
  cliente_rnc: string;
  cliente_direccion?: string | undefined;
  cliente_telefono?: string | undefined;
  moneda: string;
  tasa_cambio: number;
  dias_credito: number;
  notas: string;
  contacto?: string | undefined;
  vendedor_id?: string | undefined;
  vendedor?: string | undefined;
  tecnico_id?: string | undefined;
  almacen_id?: string | undefined;
  almacen?: string | undefined;
  proyecto_id?: string | undefined;
  departamento_id?: string | undefined;
  orden_cliente?: string | undefined;
  /** Referencias: pedido, cotización o factura de origen. */
  pedido_id?: number | undefined;
  cotizacion_id?: number | undefined;
  factura_id?: number | undefined;
  /** Devoluciones: NCF de la nota de crédito y motivo. */
  ncf?: string | undefined;
  motivo_id?: number | undefined;
  motivo?: string | undefined;
  anulado: boolean;
  aplicada?: boolean | undefined;
  subtotal: number;
  descuento: number;
  itbis: number;
  total: number;
  lineas: LineaFactura[];
}

export interface NuevoDocumento {
  tipo: TipoDocumento;
  cliente_id: string;
  fecha: string;
  fecha_entrega?: string | undefined;
  dias_credito: number;
  notas: string;
  contacto?: string | undefined;
  moneda?: string | undefined;
  tasa_cambio?: number | undefined;
  vendedor_id?: string | undefined;
  tecnico_id?: string | undefined;
  almacen_id?: string | undefined;
  sucursal_id?: string | undefined;
  departamento_id?: string | undefined;
  proyecto_id?: string | undefined;
  orden_cliente?: string | undefined;
  pedido_id?: number | undefined;
  cotizacion_id?: number | undefined;
  factura_id?: number | undefined;
  motivo_id?: number | undefined;
  lineas: LineaEntrada[];
}

export interface FiltroDocumentos {
  desde?: string | undefined;
  hasta?: string | undefined;
  clienteId?: string | undefined;
}

/* ------------------------ Cuentas por cobrar (CxC) ----------------------- */

/** Tipo de transacción de CxC (tabla ar_kinds). "D" carga al cliente, "C" abona. */
export interface TipoMovimientoCxC {
  id: string;
  nombre: string;
  signo: "D" | "C";
  ncf: boolean;
}

/** Documento con balance pendiente (agrupado por referencia en ar_reference). */
export interface DocPendienteCxC {
  referencia: number;
  fecha: string;
  balance: number;
  moneda: string;
}

export interface MovimientoCxC {
  id: number;
  fecha: string;
  documento: number;
  tipo_id: string;
  tipo: string;
  signo: "D" | "C";
  cliente_id: string;
  cliente: string;
  moneda: string;
  tasa_cambio: number;
  monto: number;
  descripcion: string;
  forma_pago: string;
  banco: string;
  pago_doc: string;
}

export interface BalanceClienteCxC {
  cliente_id: string;
  cliente: string;
  moneda: string;
  balance: number;
  documentos: number;
  mas_antiguo: string;
}

export interface ListasCxC {
  tipos: TipoMovimientoCxC[];
  formas: OpcionId[];
  bancos: OpcionId[];
  sucursales: OpcionId[];
  vendedores: OpcionId[];
  monedas: Moneda[];
}

export interface AplicacionCxC {
  referencia: number;
  valor: number;
  descuento: number;
}

export interface NuevoMovimientoCxC {
  cliente_id: string;
  tipo_id: string;
  fecha: string;
  documento?: number | undefined;
  sucursal_id?: string | undefined;
  vendedor_id?: string | undefined;
  moneda: string;
  tasa_cambio: number;
  monto: number;
  itbis_retenido: number;
  anticipo_retenido: number;
  concepto: string;
  pago_fecha: string;
  forma_pago_id: string;
  banco_id?: string | undefined;
  pago_numero: string;
  aplicaciones: AplicacionCxC[];
}

export interface FiltroCxC {
  desde?: string | undefined;
  hasta?: string | undefined;
  clienteId?: string | undefined;
  tipoId?: string | undefined;
}

/* ------------------------------- Inventario ------------------------------ */

/** Tipo de transacción de inventario (tabla inventory_operations). */
export interface OperacionInventario {
  id: number;
  nombre: string;
  /** "E" entrada al almacén, "S" salida. */
  tipo: "E" | "S";
  app: string;
  /** "ENTRADA"/"SALIDA" en la transferencia entre almacenes. */
  adicional: string;
}

export interface ListasInventario {
  operaciones: OperacionInventario[];
  almacenes: OpcionId[];
  departamentos: OpcionId[];
}

export interface MovimientoInventario {
  id: number;
  fecha: string;
  producto_id: string;
  producto: string;
  operacion_id: number;
  operacion: string;
  tipo: "E" | "S";
  almacen_id: string;
  almacen: string;
  /** Positiva en entradas, negativa en salidas. */
  cantidad: number;
  costo_unitario: number;
  costo_total: number;
  documento: string;
  referencia: string;
  serial: string;
  ubicacion: string;
  departamento_id: string;
  notas: string;
  anulado: boolean;
}

export interface ExistenciaInventario {
  producto_id: string;
  producto: string;
  unidad: string;
  almacen_id: string;
  almacen: string;
  existencia: number;
  costo: number;
  valor: number;
}

export interface NuevoMovimientoInventario {
  producto_id: string;
  operacion_id: number;
  fecha: string;
  /** Almacén de origen (o el único almacén afectado). */
  almacen_id: string;
  /** Solo en transferencia entre almacenes. */
  almacen_destino_id?: string | undefined;
  ubicacion?: string | undefined;
  documento?: string | undefined;
  referencia?: string | undefined;
  departamento_id?: string | undefined;
  cantidad: number;
  costo_total: number;
  costo_unitario: number;
  seriales?: string[] | undefined;
  notas?: string | undefined;
}

/** Una línea (producto) del documento de inventario. */
export interface LineaInventario {
  producto_id: string;
  descripcion?: string | undefined;
  cantidad: number;
  costo_unitario: number;
  costo_total: number;
  ubicacion?: string | undefined;
  seriales?: string[] | undefined;
}

/** Documento de inventario: una transacción con varias líneas de producto. */
export interface NuevoDocumentoInventario {
  operacion_id: number;
  fecha: string;
  almacen_id: string;
  almacen_destino_id?: string | undefined;
  documento?: string | undefined;
  referencia?: string | undefined;
  departamento_id?: string | undefined;
  notas?: string | undefined;
  lineas: LineaInventario[];
  /** Cuentas contables a afectar (si no se envían, se toman de la clasificación). */
  asiento?: LineaAsiento[] | undefined;
}

export interface FiltroInventario {
  desde?: string | undefined;
  hasta?: string | undefined;
  productoId?: string | undefined;
  almacenId?: string | undefined;
  operacionId?: number | undefined;
}

/* ---------------------------- Contabilidad general ----------------------- */

export interface CuentaCatalogo {
  cuenta: string;
  nombre: string;
  nivel: number;
  naturaleza: "D" | "C";
  /** true cuando la cuenta no tiene hijas: es la que recibe movimiento. */
  detalle: boolean;
  padre?: string | undefined;
  clasificacion?: string | undefined;
  moneda?: string | undefined;
  status?: string | undefined;
}

export interface NuevaCuentaCatalogo {
  cuenta: string;
  nombre: string;
  padre?: string | undefined;
  clasificacion?: string | undefined;
  naturaleza: "D" | "C";
  detalle: boolean;
  moneda?: string | undefined;
  status?: string | undefined;
}

export interface LineaAsiento {
  cuenta: string;
  cuenta_nombre?: string | undefined;
  departamento_id?: string | undefined;
  departamento?: string | undefined;
  descripcion: string;
  referencia?: string | undefined;
  debito: number;
  credito: number;
}

/** Asiento propuesto automáticamente a partir de la clasificación de inventario. */
export interface PropuestaAsiento {
  lineas: LineaAsiento[];
  advertencias: string[];
}

export interface AsientoContable {
  id: number;
  numero: number;
  ano: number;
  fecha: string;
  descripcion: string;
  /** 'N' normal, 'A' ajuste, 'C' cierre. */
  clase: string;
  estado_id: string;
  estado: string;
  tipo_id: string;
  tipo: string;
  moneda: string;
  debito: number;
  credito: number;
  lineas: LineaAsiento[];
}

export interface NuevoAsiento {
  fecha: string;
  descripcion: string;
  tipo_id?: string | undefined;
  estado_id?: string | undefined;
  clase?: string | undefined;
  moneda?: string | undefined;
  tasa_cambio?: number | undefined;
  documento?: string | undefined;
  lineas: LineaAsiento[];
}

export interface ListasContabilidad {
  tipos: OpcionId[];
  estados: OpcionId[];
  departamentos: OpcionId[];
  monedas: Moneda[];
  cuentas: CuentaCatalogo[];
}

export interface FiltroAsientos {
  desde?: string | undefined;
  hasta?: string | undefined;
  tipoId?: string | undefined;
  estadoId?: string | undefined;
  busqueda?: string | undefined;
}

export interface FiltroMayor {
  cuenta: string;
  desde?: string | undefined;
  hasta?: string | undefined;
  departamentoId?: string | undefined;
}

export interface LineaMayor {
  id: number;
  fecha: string;
  asiento_id: number;
  documento: string;
  descripcion: string;
  operacion: string;
  origen: string;
  departamento: string;
  debito: number;
  credito: number;
  saldo: number;
}

export interface MayorGeneral {
  cuenta: string;
  cuenta_nombre: string;
  saldo_anterior: number;
  debito: number;
  credito: number;
  saldo: number;
  movimientos: LineaMayor[];
}

export interface LineaBalance {
  cuenta: string;
  nombre: string;
  saldo_anterior: number;
  debito: number;
  credito: number;
  saldo: number;
}

/* ---------------------------- Notas de crédito ---------------------------- */

/** Línea de una nota de crédito con el control de lo ya acreditado. */
export interface LineaNotaCredito {
  item_id: string | null;
  codigo: string;
  descripcion: string;
  cantidad: number;
  precio: number;
  descuento_pct: number;
  tasa_itbis: number;
  /** Cantidad de la factura original y cantidad ya acreditada en otras notas. */
  cantidad_facturada: number;
  cantidad_acreditada: number;
}

export interface NotaCredito {
  id: number;
  fecha: string;
  ncf: string;
  /** Número de factura (invoices.invoice_id) y pedido (orders.order_id) de origen. */
  factura_id?: number | undefined;
  pedido_id?: number | undefined;
  factura_ncf?: string | undefined;
  cliente_id: string;
  cliente_nombre: string;
  cliente_rnc: string;
  cliente_direccion?: string | undefined;
  cliente_telefono?: string | undefined;
  moneda: string;
  tasa_cambio: number;
  motivo_id?: number | undefined;
  motivo: string;
  notas: string;
  almacen_id?: string | undefined;
  subtotal: number;
  descuento: number;
  itbis: number;
  total: number;
  anulada: boolean;
  lineas: LineaFactura[];
}

/** Factura con su disponible para emitir notas de crédito. */
export interface FacturaAcreditable {
  factura: Factura;
  acreditado: number;
  disponible: number;
  notas: NotaCredito[];
  lineas: LineaNotaCredito[];
}

export interface NuevaNotaCredito {
  /** Pedido (orders.order_id) ya facturado. */
  pedido_id: number;
  fecha: string;
  motivo_id?: number | undefined;
  notas: string;
  /** Devuelve la mercancía al inventario. */
  reponer_inventario: boolean;
  almacen_id?: string | undefined;
  lineas: LineaEntrada[];
  asiento?: LineaAsiento[] | undefined;
}

export interface FiltroNotasCredito {
  desde?: string | undefined;
  hasta?: string | undefined;
  clienteId?: string | undefined;
  pedidoId?: number | undefined;
}

/* ------------------------- Facturación recurrente ------------------------- */

/** Frecuencia de repetición: días, meses o años. */
export type FrecuenciaRecurrente = "D" | "M" | "A";

export const FRECUENCIAS: { id: FrecuenciaRecurrente; nombre: string }[] = [
  { id: "D", nombre: "Días" },
  { id: "M", nombre: "Meses" },
  { id: "A", nombre: "Años" },
];

export const ETIQUETA_FRECUENCIA: Record<FrecuenciaRecurrente, string> = {
  D: "Días",
  M: "Meses",
  A: "Años",
};

export interface LineaRecurrente {
  item_id: string;
  codigo: string;
  descripcion: string;
  /** Texto del detalle; admite las marcas <INICIO_MES> y <FIN_MES>. */
  detalle: string;
  cantidad: number;
  precio: number;
  descuento_pct: number;
  tasa_itbis: number;
}

export interface PlantillaRecurrente {
  id: number;
  activa: boolean;
  /** Concepto de la facturación (recursive_invoices.name). */
  nombre: string;
  cliente_id: string;
  cliente_nombre: string;
  cliente_rnc: string;
  moneda: string;
  cada: number;
  frecuencia: FrecuenciaRecurrente;
  inicio: string;
  fin?: string | undefined;
  sin_fin: boolean;
  repeticiones: number;
  /** Vacío cuando nunca se ha emitido. */
  ultima_emision?: string | undefined;
  /** Fecha del próximo documento; vacío cuando la plantilla ya terminó. */
  proxima?: string | undefined;
  /** La próxima emisión ya está vencida (hoy o antes). */
  vencida: boolean;
  /** Emisiones realizadas y las que restan según las repeticiones. */
  emitidas: number;
  notificar: string;
  notas: string;
  /** Condiciones tomadas del cliente al momento de emitir. */
  dias_credito: number;
  subtotal: number;
  descuento: number;
  itbis: number;
  total: number;
  lineas: LineaRecurrente[];
}

export interface NuevaPlantillaRecurrente {
  id?: number | undefined;
  activa: boolean;
  nombre: string;
  cliente_id: string;
  moneda: string;
  cada: number;
  frecuencia: FrecuenciaRecurrente;
  inicio: string;
  fin?: string | undefined;
  sin_fin: boolean;
  repeticiones: number;
  notificar: string;
  notas: string;
  lineas: LineaRecurrente[];
}

/** Resultado de emitir una plantilla. */
export interface EmisionRecurrente {
  plantilla_id: number;
  nombre: string;
  cliente: string;
  fecha: string;
  pedido_id?: number | undefined;
  ncf?: string | undefined;
  total?: number | undefined;
  moneda?: string | undefined;
  error?: string | undefined;
}

/** Sustituye las marcas del detalle por las fechas del período facturado. */
export function textoRecurrente(texto: string, fechaISO: string): string {
  const inicio = `${fechaISO.slice(0, 7)}-01`;
  const [a, m] = [Number(fechaISO.slice(0, 4)), Number(fechaISO.slice(5, 7))];
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const fin = `${fechaISO.slice(0, 7)}-${String(ultimo).padStart(2, "0")}`;
  return texto
    .replaceAll("<INICIO_MES>", fechaCorta(inicio))
    .replaceAll("<FIN_MES>", fechaCorta(fin));
}

/* ------------------------- Compras y cuentas por pagar ------------------- */

export type EstadoOrdenCompra = "A" | "I" | "N";

export const ETIQUETA_ESTADO_COMPRA: Record<EstadoOrdenCompra, string> = {
  A: "Autorizada",
  I: "No autorizada",
  N: "Anulada",
};

export type EstadoRecepcion = "pendiente" | "parcial" | "completa";

export const ETIQUETA_RECEPCION: Record<EstadoRecepcion, string> = {
  pendiente: "Pendiente",
  parcial: "Recibida parcial",
  completa: "Recibida completa",
};

export interface LineaCompra {
  id?: number | undefined;
  producto_id: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
  /** Cantidad ya recibida (purchases_detail.receipt). */
  recibida: number;
  precio: number;
  descuento_pct: number;
  tasa_itbis: number;
  subtotal: number;
  itbis: number;
  total: number;
  notas: string;
  serial: string;
}

export interface OrdenCompra {
  id: number;
  fecha: string;
  suplidor_id: string;
  suplidor: string;
  suplidor_rnc: string;
  suplidor_direccion: string;
  suplidor_telefono: string;
  moneda: string;
  tasa_cambio: number;
  sucursal_id: string;
  almacen_id: string;
  almacen: string;
  destino: string;
  lugar: string;
  uso: string;
  cotizacion: string;
  requisicion: string;
  fecha_requisicion: string;
  dias_credito: number;
  descuento_pct: number;
  solicitante_id: string;
  proyecto_id: string;
  departamento_id: string;
  forma_pago_id: string;
  notas: string;
  estado: EstadoOrdenCompra;
  recepcion: EstadoRecepcion;
  /** Factura del suplidor cuando la recepción se hizo en contabilidad. */
  factura_suplidor: string;
  subtotal: number;
  descuento: number;
  itbis: number;
  total: number;
  lineas: LineaCompra[];
}

export interface NuevaOrdenCompra {
  id?: number | undefined;
  suplidor_id: string;
  fecha: string;
  moneda: string;
  tasa_cambio: number;
  sucursal_id?: string | undefined;
  almacen_id?: string | undefined;
  destino?: string | undefined;
  lugar?: string | undefined;
  uso?: string | undefined;
  cotizacion?: string | undefined;
  requisicion?: string | undefined;
  fecha_requisicion?: string | undefined;
  dias_credito: number;
  descuento_pct: number;
  solicitante_id?: string | undefined;
  proyecto_id?: string | undefined;
  departamento_id?: string | undefined;
  forma_pago_id?: string | undefined;
  notas?: string | undefined;
  sin_valor?: boolean | undefined;
  estado: EstadoOrdenCompra;
  lineas: {
    producto_id: string;
    descripcion: string;
    cantidad: number;
    precio: number;
    descuento_pct: number;
    tasa_itbis: number;
    notas?: string | undefined;
  }[];
}

export interface FiltroCompras {
  desde?: string | undefined;
  hasta?: string | undefined;
  suplidorId?: string | undefined;
  estado?: EstadoOrdenCompra | undefined;
  recepcion?: EstadoRecepcion | undefined;
  busqueda?: string | undefined;
}

export interface ListasCompras {
  suplidores: OpcionId[];
  almacenes: OpcionId[];
  sucursales: OpcionId[];
  departamentos: OpcionId[];
  proyectos: OpcionId[];
  formas: OpcionId[];
  monedas: Moneda[];
  gastos: OpcionId[];
  retenciones: { id: string; nombre: string; tasa: number }[];
  comprobantes: OpcionId[];
  tipos_cxp: OpcionId[];
}

/** Datos fiscales de la factura del suplidor (recepción en contabilidad o captura directa). */
export interface DatosFacturaSuplidor {
  numero: string;
  ncf: string;
  fecha: string;
  vencimiento: string;
  dias_credito: number;
  moneda: string;
  tasa_cambio: number;
  comprobante_id: string;
  gasto_id: string;
  forma_pago_id: string;
  bienes: number;
  servicios: number;
  propina: number;
  isc: number;
  otros_impuestos: number;
  itbis: number;
  itbis_retenido: number;
  isr_id: string;
  isr_retenido: number;
  itbis_costo: number;
  itbis_proporcional: number;
  conduce: boolean;
  informal: boolean;
  gasto_menor: boolean;
  sucursal_id: string;
  uso: string;
  notas: string;
}

export interface NuevaRecepcion {
  orden_id: number;
  /** "almacen" solo afecta inventario; "contabilidad" crea además la factura. */
  modalidad: "almacen" | "contabilidad";
  fecha: string;
  almacen_id: string;
  descuento_pct: number;
  notas: string;
  lineas: { linea_id: number; producto_id: string; recibida: number; precio: number }[];
  factura?: DatosFacturaSuplidor | undefined;
  asiento?: LineaAsiento[] | undefined;
}

export interface ResultadoRecepcion {
  orden_id: number;
  documento_inventario: string;
  ap_id?: number | undefined;
  factura?: string | undefined;
  recepcion: EstadoRecepcion;
}

export interface MovimientoCxP {
  id: number;
  fecha: string;
  vencimiento: string;
  documento: string;
  ncf: string;
  tipo_id: string;
  tipo: string;
  signo: "D" | "C";
  suplidor_id: string;
  suplidor: string;
  moneda: string;
  tasa_cambio: number;
  monto: number;
  balance: number;
  descripcion: string;
  gasto: string;
  orden_id: string;
}

export interface BalanceSuplidorCxP {
  suplidor_id: string;
  suplidor: string;
  moneda: string;
  balance: number;
  documentos: number;
  mas_antiguo: string;
}

export interface FiltroCxP {
  desde?: string | undefined;
  hasta?: string | undefined;
  suplidorId?: string | undefined;
  tipoId?: string | undefined;
  ncf?: string | undefined;
}

export interface NuevaFacturaSuplidor {
  suplidor_id: string;
  tipo_id: string;
  factura: DatosFacturaSuplidor;
  orden_id?: number | undefined;
  asiento?: LineaAsiento[] | undefined;
}

/** Total de la factura del suplidor en su moneda. */
export function totalFacturaSuplidor(f: {
  bienes: number;
  servicios: number;
  propina: number;
  isc: number;
  otros_impuestos: number;
  itbis: number;
  itbis_retenido: number;
  isr_retenido: number;
}): number {
  return round2(
    f.bienes +
      f.servicios +
      f.propina +
      f.isc +
      f.otros_impuestos +
      f.itbis -
      f.itbis_retenido -
      f.isr_retenido,
  );
}

/* ========================= Bancos ========================= */

/** Tipo de operación bancaria (banks_book_entry). */
export interface TipoOperacionBanco {
  id: string;
  nombre: string;
  /** D = entra dinero al banco, C = sale dinero del banco. */
  signo: "D" | "C";
  entrada_id: string;
}

/** Cuenta bancaria de la maestra de caja y bancos (banks). */
export interface CuentaBancaria {
  id: string;
  nombre: string;
  numero_cuenta: string;
  nombre_corto: string;
  tipo_id: string;
  tipo?: string | undefined;
  oficial: string;
  telefono: string;
  direccion: string;
  cuenta_contable: string;
  cuenta_contable_nombre?: string | undefined;
  moneda: string;
  sucursal_id: string;
  rnc: string;
  numero_empresa: string;
  activa: boolean;
  ultimo_deposito: number;
  ultimo_cheque: number;
  ultima_nota_credito: number;
  ultima_nota_debito: number;
  limite_cheques: number;
  limite_monto: number;
  cargo_tc: number;
  itbis_tc: number;
}

export interface ConceptoBancario {
  id: string;
  nombre: string;
  cuenta: string;
  cuenta_nombre?: string | undefined;
}

export interface ListasBancos {
  bancos: CuentaBancaria[];
  tipos: TipoOperacionBanco[];
  conceptos: ConceptoBancario[];
  tipos_cuenta: OpcionId[];
  suplidores: OpcionId[];
  sucursales: OpcionId[];
  monedas: Moneda[];
}

export interface MovimientoBanco {
  id: number;
  fecha: string;
  numero: string;
  beneficiario: string;
  descripcion: string;
  monto: number;
  itbis: number;
  comision: number;
  monto_ncf: number;
  ncf: string;
  tasa_cambio: number;
  moneda: string;
  banco_id: string;
  banco: string;
  tipo_id: string;
  tipo: string;
  signo: "D" | "C";
  concepto_id: string;
  concepto: string;
  suplidor_id: string;
  suplidor: string;
  estado: "A" | "I" | "P";
  conciliado: string;
}

export interface DisponibilidadBanco {
  banco_id: string;
  banco: string;
  numero_cuenta: string;
  moneda: string;
  saldo: number;
  movimientos: number;
  ultimo: string;
}

export interface FiltroBancos {
  desde?: string | undefined;
  hasta?: string | undefined;
  bancoId?: string | undefined;
  tipoId?: string | undefined;
  suplidorId?: string | undefined;
  busqueda?: string | undefined;
  estado?: string | undefined;
  /** Criterios adicionales de la búsqueda de movimientos (para copiar). */
  montoDesde?: number | undefined;
  montoHasta?: number | undefined;
  numero?: string | undefined;
  beneficiario?: string | undefined;
  concepto?: string | undefined;
  cuenta?: string | undefined;
}

/** Aplicación del pago a un documento pendiente del suplidor (ap_reference). */
export interface AplicacionCxP {
  referencia: string;
  monto: number;
}

export interface NuevoMovimientoBanco {
  banco_id: string;
  tipo_id: string;
  fecha: string;
  numero: string;
  monto: number;
  tasa_cambio: number;
  beneficiario: string;
  descripcion: string;
  ncf: string;
  monto_ncf: number;
  itbis: number;
  comision: number;
  itbis_retenido: number;
  isr_retenido: number;
  concepto_id?: string | undefined;
  suplidor_id?: string | undefined;
  /** Banco destino en transferencias entre bancos. */
  banco_destino_id?: string | undefined;
  /** Avance al suplidor: crea el avance no aplicado en cuentas por pagar. */
  avance?: { suplidor_id: string; cuenta_cxp: string } | undefined;
  aplicaciones?: AplicacionCxP[] | undefined;
  asiento?: LineaAsiento[] | undefined;
}

export interface ResultadoMovimientoBanco {
  id: number;
  numero: string;
  /** Movimiento espejo creado en el banco destino de una transferencia. */
  id_destino?: number | undefined;
  ap_id?: number | undefined;
}
