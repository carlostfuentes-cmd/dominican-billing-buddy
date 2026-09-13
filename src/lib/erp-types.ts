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
}

export interface SecuenciaNCF {
  tipo_ncf: TipoNCF;
  desde: number;
  hasta: number;
  proximo: number;
  vence: string;
  activa: boolean;
}

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
