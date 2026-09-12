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

export type EstadoFactura = "emitida" | "pagada" | "anulada";

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
  precio: number;
  descuento_pct: number;
  tasa_itbis: number;
  subtotal: number;
  itbis: number;
  total: number;
}

export interface Factura {
  id: number;
  ncf: string;
  tipo_ncf: TipoNCF;
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
  precio: number;
  descuento_pct: number;
  tasa_itbis: number;
}

export function calcularLinea(l: LineaEntrada): LineaFactura {
  const bruto = l.cantidad * l.precio;
  const subtotal = round2(bruto * (1 - (l.descuento_pct || 0) / 100));
  const itbis = round2((subtotal * l.tasa_itbis) / 100);
  return {
    item_id: l.item_id ?? null,
    codigo: l.codigo,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precio: l.precio,
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
    lineas.reduce((a, l) => a + l.cantidad * l.precio * ((l.descuento_pct || 0) / 100), 0),
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
