// Tipos y cálculos fiscales compartidos entre cliente y servidor.

export type TipoNCF = "B01" | "B02" | "B14" | "B15";

export const TIPOS_NCF: { codigo: TipoNCF; nombre: string }[] = [
  { codigo: "B01", nombre: "B01 — Crédito Fiscal" },
  { codigo: "B02", nombre: "B02 — Consumo" },
  { codigo: "B14", nombre: "B14 — Régimen Especial" },
  { codigo: "B15", nombre: "B15 — Gubernamental" },
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

export interface Cliente {
  id: number;
  nombre: string;
  rnc: string;
  tipo_ncf: TipoNCF;
  telefono: string;
  email: string;
  direccion: string;
  dias_credito: number;
  activo: boolean;
}

export interface Item {
  id: number;
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
  item_id: number | null;
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
  cliente_id: number;
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
  item_id?: number | null | undefined;
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

export function formatearNCF(tipo: TipoNCF, numero: number): string {
  return `${tipo}${String(numero).padStart(8, "0")}`;
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
