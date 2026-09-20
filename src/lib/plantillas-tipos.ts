// Diseñador de documentos: modelo de la plantilla (bandas y elementos),
// catálogo de campos del sistema y utilidades para resolver valores.
//
// La plantilla describe, en milímetros, dónde va cada cosa dentro del papel,
// igual que una plantilla de FastReport: bandas fijas (encabezado, cliente,
// cabecera de columnas, totales, pie) y una banda de detalle que se repite por
// cada línea del documento.

import { papelCss, type PapelImpresion } from "@/lib/erp-types";
import logoLogikos from "@/assets/logo-logikos.png.asset.json";

export type TipoPlantilla =
  | "factura"
  | "cotizacion"
  | "conduce"
  | "nota-credito"
  | "orden-compra";

export const TIPOS_PLANTILLA: { id: TipoPlantilla; nombre: string }[] = [
  { id: "factura", nombre: "Factura" },
  { id: "cotizacion", nombre: "Cotización" },
  { id: "conduce", nombre: "Conduce" },
  { id: "nota-credito", nombre: "Nota de crédito" },
  { id: "orden-compra", nombre: "Orden de compra" },
];

export type TipoBanda = "encabezado" | "cliente" | "cabecera" | "detalle" | "totales" | "pie";

export const BANDAS: { id: TipoBanda; nombre: string; repite: boolean; ayuda: string }[] = [
  { id: "encabezado", nombre: "Encabezado", repite: false, ayuda: "Logo, datos de la empresa, número y NCF." },
  { id: "cliente", nombre: "Datos del cliente", repite: false, ayuda: "Vendido a, enviado a, condiciones." },
  { id: "cabecera", nombre: "Cabecera de columnas", repite: false, ayuda: "Títulos de las columnas del detalle." },
  { id: "detalle", nombre: "Línea de detalle", repite: true, ayuda: "Se repite una vez por cada artículo." },
  { id: "totales", nombre: "Totales", repite: false, ayuda: "Subtotal, descuento, ITBIS y total." },
  { id: "pie", nombre: "Pie de página", repite: false, ayuda: "Notas legales, firmas y datos de contacto." },
];

export type AlineacionTexto = "left" | "center" | "right";
export type TipoElemento = "texto" | "campo" | "imagen" | "linea" | "caja";

export interface ElementoPlantilla {
  id: string;
  tipo: TipoElemento;
  /** Posición y tamaño en milímetros, relativos a la banda. */
  x: number;
  y: number;
  ancho: number;
  alto: number;
  /** Texto fijo, o etiqueta del campo ("Total:"). Admite {campos} incrustados. */
  texto: string;
  /** Campo del sistema, por ejemplo "cliente.nombre". */
  campo?: string;
  /** URL de la imagen (logo, sello, firma). */
  url?: string;
  tamano: number;
  negrita: boolean;
  italica: boolean;
  alineacion: AlineacionTexto;
  /** Color del texto o de la línea, en hexadecimal. */
  color: string;
  /** Solo caja y línea: grosor del borde en mm. */
  grosor?: number;
  /** Solo caja: color de relleno ("" = sin relleno). */
  fondo?: string;
}

export interface BandaPlantilla {
  tipo: TipoBanda;
  alto: number;
  visible: boolean;
  elementos: ElementoPlantilla[];
}

export interface Plantilla {
  /** "*" es la plantilla general que sirve a todas las empresas. */
  empresa_id: string;
  doc_tipo: TipoPlantilla;
  nombre: string;
  papel: PapelImpresion;
  margen_superior: number;
  margen_inferior: number;
  margen_izquierdo: number;
  margen_derecho: number;
  copias: number;
  bandas: BandaPlantilla[];
}

/* ----------------------------- Campos del sistema ------------------------- */

export interface CampoSistema {
  id: string;
  nombre: string;
  grupo: string;
  /** Pertenece a la banda de detalle (una vez por línea). */
  linea?: boolean;
  /** Ejemplo que se muestra en el diseñador. */
  muestra: string;
}

export const CAMPOS_SISTEMA: CampoSistema[] = [
  { id: "empresa.nombre", nombre: "Razón social", grupo: "Empresa", muestra: "DISTOSA, S.R.L." },
  { id: "empresa.rnc", nombre: "RNC de la empresa", grupo: "Empresa", muestra: "122001672" },
  { id: "empresa.direccion", nombre: "Dirección", grupo: "Empresa", muestra: "C/ Eugenio Deschamps #11, La Castellana" },
  { id: "empresa.telefono", nombre: "Teléfono", grupo: "Empresa", muestra: "809.563.8249" },
  { id: "empresa.email", nombre: "Correo", grupo: "Empresa", muestra: "ventas@empresa.com" },
  { id: "empresa.web", nombre: "Página web", grupo: "Empresa", muestra: "www.empresa.com" },

  { id: "doc.titulo", nombre: "Título del documento", grupo: "Documento", muestra: "FACTURA DE CRÉDITO FISCAL" },
  { id: "doc.numero", nombre: "Número", grupo: "Documento", muestra: "57279" },
  { id: "doc.fecha", nombre: "Fecha de emisión", grupo: "Documento", muestra: "18/09/2026" },
  { id: "doc.vencimiento", nombre: "Fecha de vencimiento", grupo: "Documento", muestra: "18/10/2026" },
  { id: "doc.condicion", nombre: "Condición de pago", grupo: "Documento", muestra: "DE 1 A 30 DÍAS" },
  { id: "doc.vendedor", nombre: "Vendedor", grupo: "Documento", muestra: "YISIA MARTÍNEZ" },
  { id: "doc.almacen", nombre: "Almacén", grupo: "Documento", muestra: "ALMACÉN PRINCIPAL" },
  { id: "doc.moneda", nombre: "Moneda", grupo: "Documento", muestra: "DOP" },
  { id: "doc.tasa", nombre: "Tasa de cambio", grupo: "Documento", muestra: "1.0000" },
  { id: "doc.orden_cliente", nombre: "Orden del cliente (O/C)", grupo: "Documento", muestra: "CORREO" },
  { id: "doc.cotizacion", nombre: "Cotización", grupo: "Documento", muestra: "12045" },
  { id: "doc.pedido", nombre: "Pedido", grupo: "Documento", muestra: "CORREO" },
  { id: "doc.conduce", nombre: "Conduce", grupo: "Documento", muestra: "" },
  { id: "doc.soporte", nombre: "Soporte", grupo: "Documento", muestra: "" },
  { id: "doc.notas", nombre: "Observaciones", grupo: "Documento", muestra: "ENTREGA INMEDIATA" },
  { id: "doc.pagina", nombre: "Página", grupo: "Documento", muestra: "1" },

  { id: "fiscal.ncf", nombre: "NCF / e-NCF", grupo: "Fiscal", muestra: "B0100014011" },
  { id: "fiscal.tipo", nombre: "Tipo de comprobante", grupo: "Fiscal", muestra: "B01" },
  { id: "fiscal.vigencia", nombre: "Vigencia del NCF", grupo: "Fiscal", muestra: "31/12/2027" },
  { id: "fiscal.autorizacion", nombre: "Número de autorización (e-CF)", grupo: "Fiscal", muestra: "5004703767" },
  { id: "fiscal.seguridad", nombre: "Código de seguridad (e-CF)", grupo: "Fiscal", muestra: "ZPbfeF" },
  { id: "fiscal.firma_fecha", nombre: "Fecha de firma digital", grupo: "Fiscal", muestra: "18/09/2026" },

  { id: "cliente.codigo", nombre: "Código del cliente", grupo: "Cliente", muestra: "C1831" },
  { id: "cliente.nombre", nombre: "Nombre del cliente", grupo: "Cliente", muestra: "COOPERATIVA SAN ANTONIO" },
  { id: "cliente.rnc", nombre: "RNC / cédula", grupo: "Cliente", muestra: "403001417" },
  { id: "cliente.direccion", nombre: "Dirección", grupo: "Cliente", muestra: "AV. PROFESOR JUAN BOSCH #51, BONAO" },
  { id: "cliente.telefono", nombre: "Teléfono", grupo: "Cliente", muestra: "809-525-3515" },
  { id: "cliente.contacto", nombre: "Contacto", grupo: "Cliente", muestra: "Celeste Severino" },
  { id: "cliente.envio", nombre: "Enviado a", grupo: "Cliente", muestra: "NÉSTOR RIVERA, PUENTE 2" },

  { id: "linea.numero", nombre: "No. de línea", grupo: "Detalle", linea: true, muestra: "1" },
  { id: "linea.codigo", nombre: "Código", grupo: "Detalle", linea: true, muestra: "55206" },
  { id: "linea.descripcion", nombre: "Descripción", grupo: "Detalle", linea: true, muestra: "TONER BLACK e477/527S" },
  { id: "linea.serial", nombre: "Serial (S/N)", grupo: "Detalle", linea: true, muestra: "AB-99231" },
  { id: "linea.cantidad", nombre: "Cantidad", grupo: "Detalle", linea: true, muestra: "1.00" },
  { id: "linea.unidad", nombre: "Unidad", grupo: "Detalle", linea: true, muestra: "UND" },
  { id: "linea.precio", nombre: "Precio unitario", grupo: "Detalle", linea: true, muestra: "13,300.00" },
  { id: "linea.descuento_pct", nombre: "% de descuento", grupo: "Detalle", linea: true, muestra: "10.00" },
  { id: "linea.descuento", nombre: "Descuento", grupo: "Detalle", linea: true, muestra: "1,330.00" },
  { id: "linea.itbis", nombre: "ITBIS de la línea", grupo: "Detalle", linea: true, muestra: "2,154.60" },
  { id: "linea.importe", nombre: "Importe", grupo: "Detalle", linea: true, muestra: "11,970.00" },

  { id: "totales.subtotal", nombre: "Subtotal", grupo: "Totales", muestra: "97,854.73" },
  { id: "totales.descuento", nombre: "Descuento", grupo: "Totales", muestra: "7,845.00" },
  { id: "totales.neto", nombre: "Neto", grupo: "Totales", muestra: "90,009.73" },
  { id: "totales.exento", nombre: "Ventas exentas", grupo: "Totales", muestra: "0.00" },
  { id: "totales.gravado", nombre: "Ventas gravadas", grupo: "Totales", muestra: "90,009.73" },
  { id: "totales.itbis", nombre: "ITBIS", grupo: "Totales", muestra: "16,201.75" },
  { id: "totales.total", nombre: "Total del documento", grupo: "Totales", muestra: "106,211.48" },
  { id: "totales.total_letras", nombre: "Total en letras", grupo: "Totales", muestra: "CIENTO SEIS MIL DOSCIENTOS ONCE CON 48/100" },
  { id: "totales.equivalente_dop", nombre: "Equivalente en pesos", grupo: "Totales", muestra: "106,211.48" },
  { id: "totales.cantidad_lineas", nombre: "Cantidad de líneas", grupo: "Totales", muestra: "3" },

  { id: "cxc.por_vencer", nombre: "Balance por vencer", grupo: "Estado de cuenta", muestra: "91,420.50" },
  { id: "cxc.d30", nombre: "Vencido 0-30 días", grupo: "Estado de cuenta", muestra: "0.00" },
  { id: "cxc.d60", nombre: "Vencido 31-60 días", grupo: "Estado de cuenta", muestra: "0.00" },
  { id: "cxc.d90", nombre: "Vencido 61-90 días", grupo: "Estado de cuenta", muestra: "0.00" },
  { id: "cxc.d91", nombre: "Vencido más de 91 días", grupo: "Estado de cuenta", muestra: "0.00" },
  { id: "cxc.total", nombre: "Balance total del cliente", grupo: "Estado de cuenta", muestra: "91,420.50" },
];

export const GRUPOS_CAMPOS = [...new Set(CAMPOS_SISTEMA.map((c) => c.grupo))];

export function campoSistema(id: string): CampoSistema | undefined {
  return CAMPOS_SISTEMA.find((c) => c.id === id);
}

/* ----------------------------- Papel y medidas --------------------------- */

export function medidasPapel(papel: PapelImpresion): { ancho: number; alto: number } {
  const [a, b] = papelCss(papel).split(" ");
  const mm = (v?: string) => {
    const n = Number(String(v ?? "").replace("mm", ""));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return { ancho: mm(a) || 215.9, alto: mm(b) || 279.4 };
}

/* --------------------------- Datos del documento ------------------------- */

export interface DatosDocumento {
  campos: Record<string, string>;
  lineas: Record<string, string>[];
}

/** Sustituye {campo} dentro de un texto y resuelve el campo de un elemento. */
export function resolver(
  plantilla: string,
  campos: Record<string, string>,
  linea?: Record<string, string>,
): string {
  return plantilla.replace(/\{([a-z0-9_.]+)\}/gi, (_todo, clave: string) => {
    const v = linea?.[clave] ?? campos[clave];
    return v ?? "";
  });
}

export function valorElemento(
  el: ElementoPlantilla,
  datos: DatosDocumento,
  linea?: Record<string, string>,
): string {
  const base = el.campo ? (linea?.[el.campo] ?? datos.campos[el.campo] ?? "") : "";
  const etiqueta = el.texto ? resolver(el.texto, datos.campos, linea) : "";
  if (el.campo && etiqueta) return `${etiqueta} ${base}`.trim();
  return el.campo ? base : etiqueta;
}

/* ------------------------------ Plantilla base --------------------------- */

let secuencia = 0;
export function nuevoId(): string {
  secuencia += 1;
  return `e${Date.now().toString(36)}${secuencia.toString(36)}`;
}

export function nuevoElemento(tipo: TipoElemento, parcial: Partial<ElementoPlantilla> = {}): ElementoPlantilla {
  return {
    id: nuevoId(),
    tipo,
    x: 10,
    y: 3,
    ancho: tipo === "linea" ? 60 : 40,
    alto: tipo === "linea" ? 0.4 : 5,
    texto: tipo === "texto" ? "Texto" : "",
    tamano: 9,
    negrita: false,
    italica: false,
    alineacion: "left",
    color: "#111827",
    ...(tipo === "caja" || tipo === "linea" ? { grosor: 0.3, fondo: "" } : {}),
    ...parcial,
  };
}

const txt = (
  texto: string,
  x: number,
  y: number,
  ancho: number,
  extra: Partial<ElementoPlantilla> = {},
): ElementoPlantilla => nuevoElemento("texto", { texto, x, y, ancho, ...extra });

const cmp = (
  campo: string,
  x: number,
  y: number,
  ancho: number,
  extra: Partial<ElementoPlantilla> = {},
): ElementoPlantilla => nuevoElemento("campo", { campo, texto: "", x, y, ancho, ...extra });

/** Plantilla inicial de factura, parecida a la factura tradicional dominicana. */
export function plantillaBase(empresaId: string, docTipo: TipoPlantilla): Plantilla {
  return {
    empresa_id: empresaId,
    doc_tipo: docTipo,
    nombre: TIPOS_PLANTILLA.find((t) => t.id === docTipo)?.nombre ?? "Documento",
    papel: "carta",
    margen_superior: 10,
    margen_inferior: 10,
    margen_izquierdo: 10,
    margen_derecho: 10,
    copias: 1,
    bandas: [
      {
        tipo: "encabezado",
        alto: 34,
        visible: true,
        elementos: [
          cmp("empresa.nombre", 0, 2, 100, { tamano: 14, negrita: true }),
          cmp("empresa.direccion", 0, 10, 100, { tamano: 8 }),
          cmp("empresa.telefono", 0, 14, 60, { tamano: 8 }),
          txt("RNC: {empresa.rnc}", 0, 18, 60, { tamano: 8 }),
          cmp("doc.titulo", 110, 2, 85, { tamano: 12, negrita: true, alineacion: "right" }),
          txt("No.", 110, 11, 20, { tamano: 9, negrita: true }),
          cmp("doc.numero", 130, 11, 65, { tamano: 11, negrita: true, alineacion: "right" }),
          txt("NCF:", 110, 17, 20, { tamano: 9 }),
          cmp("fiscal.ncf", 130, 17, 65, { tamano: 9, negrita: true, alineacion: "right" }),
          txt("Vigencia:", 110, 22, 20, { tamano: 8 }),
          cmp("fiscal.vigencia", 130, 22, 65, { tamano: 8, alineacion: "right" }),
          txt("Fecha:", 110, 27, 20, { tamano: 8 }),
          cmp("doc.fecha", 130, 27, 65, { tamano: 8, alineacion: "right" }),
          nuevoElemento("linea", { x: 0, y: 32, ancho: 195, alto: 0.4 }),
        ],
      },
      {
        tipo: "cliente",
        alto: 28,
        visible: true,
        elementos: [
          txt("Cliente:", 0, 1, 20, { tamano: 8, negrita: true }),
          cmp("cliente.nombre", 20, 1, 100, { tamano: 10, negrita: true }),
          txt("RNC / Cédula: {cliente.rnc}", 20, 6, 80, { tamano: 8 }),
          txt("Código: {cliente.codigo}", 20, 10, 80, { tamano: 8 }),
          cmp("cliente.direccion", 20, 14, 100, { tamano: 8 }),
          txt("Tel. {cliente.telefono}", 20, 18, 80, { tamano: 8 }),
          txt("Condición de pago:", 125, 1, 40, { tamano: 8 }),
          cmp("doc.condicion", 125, 5, 70, { tamano: 8, negrita: true }),
          txt("Vendedor:", 125, 10, 40, { tamano: 8 }),
          cmp("doc.vendedor", 125, 14, 70, { tamano: 8, negrita: true }),
          txt("Vence: {doc.vencimiento}", 125, 19, 70, { tamano: 8 }),
        ],
      },
      {
        tipo: "cabecera",
        alto: 8,
        visible: true,
        elementos: [
          nuevoElemento("caja", { x: 0, y: 0, ancho: 195, alto: 7, fondo: "#f1f5f9", grosor: 0.3 }),
          txt("Código", 2, 1.5, 22, { tamano: 8, negrita: true }),
          txt("Descripción", 25, 1.5, 78, { tamano: 8, negrita: true }),
          txt("Cant.", 104, 1.5, 14, { tamano: 8, negrita: true, alineacion: "right" }),
          txt("Precio", 119, 1.5, 24, { tamano: 8, negrita: true, alineacion: "right" }),
          txt("% Desc.", 144, 1.5, 18, { tamano: 8, negrita: true, alineacion: "right" }),
          txt("Importe", 163, 1.5, 30, { tamano: 8, negrita: true, alineacion: "right" }),
        ],
      },
      {
        tipo: "detalle",
        alto: 5,
        visible: true,
        elementos: [
          cmp("linea.codigo", 2, 0.5, 22, { tamano: 8 }),
          cmp("linea.descripcion", 25, 0.5, 78, { tamano: 8 }),
          cmp("linea.cantidad", 104, 0.5, 14, { tamano: 8, alineacion: "right" }),
          cmp("linea.precio", 119, 0.5, 24, { tamano: 8, alineacion: "right" }),
          cmp("linea.descuento_pct", 144, 0.5, 18, { tamano: 8, alineacion: "right" }),
          cmp("linea.importe", 163, 0.5, 30, { tamano: 8, alineacion: "right" }),
        ],
      },
      {
        tipo: "totales",
        alto: 34,
        visible: true,
        elementos: [
          nuevoElemento("linea", { x: 0, y: 1, ancho: 195, alto: 0.4 }),
          txt("Observaciones:", 0, 3, 40, { tamano: 8, negrita: true }),
          cmp("doc.notas", 0, 7, 110, { tamano: 8 }),
          txt("Subtotal:", 120, 3, 35, { tamano: 8, alineacion: "right" }),
          cmp("totales.subtotal", 158, 3, 35, { tamano: 8, alineacion: "right" }),
          txt("Descuento:", 120, 8, 35, { tamano: 8, alineacion: "right" }),
          cmp("totales.descuento", 158, 8, 35, { tamano: 8, alineacion: "right" }),
          txt("ITBIS:", 120, 13, 35, { tamano: 8, alineacion: "right" }),
          cmp("totales.itbis", 158, 13, 35, { tamano: 8, alineacion: "right" }),
          txt("TOTAL:", 120, 19, 35, { tamano: 10, negrita: true, alineacion: "right" }),
          txt("{doc.moneda} {totales.total}", 145, 19, 48, { tamano: 10, negrita: true, alineacion: "right" }),
          txt("Recibido conforme: ______________________________", 0, 24, 110, { tamano: 8 }),
        ],
      },
      {
        tipo: "pie",
        alto: 18,
        visible: true,
        elementos: [
          nuevoElemento("linea", { x: 0, y: 1, ancho: 195, alto: 0.4 }),
          txt(
            "Después de 20 días de recibida la mercancía, la devolución paga el ITBIS conforme a la ley 74-2 (Código Tributario).",
            0,
            3,
            195,
            { tamano: 7 },
          ),
          txt("{empresa.nombre} · RNC {empresa.rnc} · {empresa.telefono} · {empresa.email}", 0, 9, 195, {
            tamano: 7,
            alineacion: "center",
          }),
          txt("Página {doc.pagina}", 0, 13, 195, { tamano: 7, alineacion: "center" }),
        ],
      },
    ],
  };
}

/** Factura inicial de Logikos, inspirada en la estructura operativa de Distosa. */
export function plantillaLogikos(empresaId = "1087"): Plantilla {
  const negro = "#111827";
  const azul = "#0b4f94";
  return {
    empresa_id: empresaId,
    doc_tipo: "factura",
    nombre: "Factura Logikos — estilo Distosa",
    papel: "carta",
    margen_superior: 8,
    margen_inferior: 8,
    margen_izquierdo: 10,
    margen_derecho: 10,
    copias: 1,
    bandas: [
      {
        tipo: "encabezado",
        alto: 48,
        visible: true,
        elementos: [
          nuevoElemento("imagen", { x: 0, y: 0, ancho: 76, alto: 22, url: logoLogikos.url }),
          cmp("empresa.direccion", 0, 24, 98, { tamano: 7, color: azul }),
          txt("RNC: {empresa.rnc}  |  Tel: {empresa.telefono}", 0, 29, 98, { tamano: 7, color: azul }),
          cmp("empresa.email", 0, 34, 98, { tamano: 7, color: azul }),
          cmp("doc.titulo", 118, 0, 77, { tamano: 16, negrita: true, alineacion: "right" }),
          txt("No.", 126, 9, 25, { tamano: 8, alineacion: "right" }),
          cmp("doc.numero", 153, 8, 42, { tamano: 11, negrita: true, alineacion: "right" }),
          txt("Fecha de emisión", 118, 15, 45, { tamano: 7, alineacion: "right" }),
          cmp("doc.fecha", 165, 14, 30, { tamano: 8, negrita: true, alineacion: "right" }),
          txt("Pagar antes del", 118, 21, 45, { tamano: 7, alineacion: "right" }),
          cmp("doc.vencimiento", 165, 20, 30, { tamano: 8, negrita: true, alineacion: "right" }),
          txt("NCF", 118, 27, 35, { tamano: 7, alineacion: "right" }),
          cmp("fiscal.ncf", 154, 26, 41, { tamano: 8, negrita: true, alineacion: "right" }),
          txt("Vigencia NCF", 118, 33, 45, { tamano: 7, alineacion: "right" }),
          cmp("fiscal.vigencia", 165, 32, 30, { tamano: 8, negrita: true, alineacion: "right" }),
          nuevoElemento("linea", { x: 0, y: 43, ancho: 195, alto: 0.4, color: azul, grosor: 0.5 }),
        ],
      },
      {
        tipo: "cliente",
        alto: 42,
        visible: true,
        elementos: [
          txt("Código: {cliente.codigo}     RNC / Cédula: {cliente.rnc}", 3, 2, 118, { tamano: 8 }),
          nuevoElemento("caja", { x: 0, y: 7, ancho: 125, alto: 25, color: negro, grosor: 0.4, fondo: "" }),
          cmp("cliente.nombre", 3, 9, 119, { tamano: 10, negrita: true }),
          txt("{cliente.contacto}  ·  Tel: {cliente.telefono}", 3, 16, 119, { tamano: 8 }),
          cmp("cliente.direccion", 3, 22, 119, { tamano: 8 }),
          txt("Condición de pago", 131, 8, 64, { tamano: 7 }),
          cmp("doc.condicion", 131, 12, 64, { tamano: 8, negrita: true }),
          txt("Vendedor", 131, 19, 30, { tamano: 7 }),
          cmp("doc.vendedor", 131, 23, 64, { tamano: 8, negrita: true }),
          txt("Soporte: {doc.soporte}", 131, 30, 64, { tamano: 7 }),
          txt("O/C: {doc.orden_cliente}", 131, 35, 64, { tamano: 8, negrita: true }),
          nuevoElemento("linea", { x: 0, y: 40, ancho: 195, alto: 0.4, color: negro, grosor: 0.35 }),
        ],
      },
      {
        tipo: "cabecera",
        alto: 16,
        visible: true,
        elementos: [
          txt("Información de productos y servicios", 1, 1, 150, { tamano: 11, color: azul, negrita: true }),
          nuevoElemento("linea", { x: 0, y: 8, ancho: 195, alto: 0.4, color: negro, grosor: 0.35 }),
          txt("Código", 2, 10, 23, { tamano: 7, negrita: true }),
          txt("Descripción", 27, 10, 76, { tamano: 7, negrita: true }),
          txt("Cant.", 105, 10, 14, { tamano: 7, negrita: true, alineacion: "right" }),
          txt("Precio", 121, 10, 25, { tamano: 7, negrita: true, alineacion: "right" }),
          txt("% Desc.", 148, 10, 18, { tamano: 7, negrita: true, alineacion: "right" }),
          txt("Importe", 168, 10, 27, { tamano: 7, negrita: true, alineacion: "right" }),
          nuevoElemento("linea", { x: 0, y: 15, ancho: 195, alto: 0.4, color: negro, grosor: 0.35 }),
        ],
      },
      {
        tipo: "detalle",
        alto: 6,
        visible: true,
        elementos: [
          cmp("linea.codigo", 2, 1, 23, { tamano: 7 }),
          cmp("linea.descripcion", 27, 1, 76, { tamano: 8 }),
          cmp("linea.cantidad", 105, 1, 14, { tamano: 8, alineacion: "right" }),
          cmp("linea.precio", 121, 1, 25, { tamano: 8, alineacion: "right" }),
          cmp("linea.descuento_pct", 148, 1, 18, { tamano: 8, alineacion: "right" }),
          cmp("linea.importe", 168, 1, 27, { tamano: 8, alineacion: "right" }),
        ],
      },
      {
        tipo: "totales",
        alto: 70,
        visible: true,
        elementos: [
          nuevoElemento("caja", { x: 2, y: 2, ancho: 108, alto: 20, color: negro, grosor: 0.35, fondo: "" }),
          txt("Observaciones", 4, 3, 45, { tamano: 7, negrita: true }),
          cmp("doc.notas", 4, 8, 104, { tamano: 8 }),
          txt("Devoluciones después de 20 días estarán sujetas a las disposiciones fiscales vigentes.", 3, 25, 110, { tamano: 6 }),
          txt("Resumen estado de cuenta", 2, 34, 54, { tamano: 8, negrita: true, color: azul }),
          nuevoElemento("caja", { x: 0, y: 38, ancho: 58, alto: 29, color: negro, grosor: 0.35, fondo: "" }),
          txt("Por vencer", 2, 40, 28, { tamano: 7, negrita: true }),
          cmp("cxc.por_vencer", 31, 40, 25, { tamano: 7, alineacion: "right" }),
          txt("0–30 días", 2, 45, 28, { tamano: 7 }),
          cmp("cxc.d30", 31, 45, 25, { tamano: 7, alineacion: "right" }),
          txt("31–60 días", 2, 50, 28, { tamano: 7 }),
          cmp("cxc.d60", 31, 50, 25, { tamano: 7, alineacion: "right" }),
          txt("61–90 días", 2, 55, 28, { tamano: 7 }),
          cmp("cxc.d90", 31, 55, 25, { tamano: 7, alineacion: "right" }),
          txt("Más de 91 días", 2, 60, 28, { tamano: 7 }),
          cmp("cxc.d91", 31, 60, 25, { tamano: 7, alineacion: "right" }),
          txt("Total", 2, 64, 28, { tamano: 7, negrita: true }),
          cmp("cxc.total", 31, 64, 25, { tamano: 7, negrita: true, alineacion: "right" }),
          txt("RECIBIDO CONFORME", 66, 34, 58, { tamano: 9, negrita: true, alineacion: "center" }),
          txt("Nombre completo", 63, 44, 31, { tamano: 7 }),
          nuevoElemento("linea", { x: 94, y: 48, ancho: 34, alto: 0.4, color: negro, grosor: 0.25 }),
          txt("Cédula", 63, 53, 31, { tamano: 7 }),
          nuevoElemento("linea", { x: 94, y: 57, ancho: 34, alto: 0.4, color: negro, grosor: 0.25 }),
          txt("Fecha y hora", 63, 62, 31, { tamano: 7 }),
          nuevoElemento("linea", { x: 94, y: 66, ancho: 34, alto: 0.4, color: negro, grosor: 0.25 }),
          txt("Subtotal", 132, 5, 28, { tamano: 8, alineacion: "right" }),
          cmp("totales.subtotal", 163, 5, 32, { tamano: 8, alineacion: "right" }),
          txt("Descuento", 132, 12, 28, { tamano: 8, alineacion: "right" }),
          cmp("totales.descuento", 163, 12, 32, { tamano: 8, alineacion: "right" }),
          txt("ITBIS", 132, 19, 28, { tamano: 8, alineacion: "right" }),
          cmp("totales.itbis", 163, 19, 32, { tamano: 8, alineacion: "right" }),
          nuevoElemento("linea", { x: 132, y: 27, ancho: 63, alto: 0.4, color: azul, grosor: 0.5 }),
          txt("TOTAL", 132, 30, 28, { tamano: 10, negrita: true, alineacion: "right", color: azul }),
          txt("{doc.moneda} {totales.total}", 161, 30, 34, { tamano: 10, negrita: true, alineacion: "right", color: azul }),
        ],
      },
      {
        tipo: "pie",
        alto: 22,
        visible: true,
        elementos: [
          nuevoElemento("linea", { x: 0, y: 1, ancho: 195, alto: 0.4, color: azul, grosor: 0.5 }),
          txt("{empresa.nombre}  ·  RNC {empresa.rnc}", 0, 4, 125, { tamano: 7, negrita: true, color: azul }),
          txt("{empresa.direccion}  ·  {empresa.telefono}  ·  {empresa.email}", 0, 9, 145, { tamano: 7, color: azul }),
          txt("Cotización: {doc.cotizacion}", 150, 4, 45, { tamano: 7 }),
          txt("Pedido: {doc.pedido}", 150, 9, 45, { tamano: 7 }),
          txt("Conduce: {doc.conduce}", 150, 14, 45, { tamano: 7 }),
          txt("Página {doc.pagina}", 0, 16, 145, { tamano: 7, alineacion: "center" }),
        ],
      },
    ],
  };
}

/** Diseño de fábrica correspondiente a una empresa y documento. */
export function plantillaPredeterminada(empresaId: string, docTipo: TipoPlantilla): Plantilla {
  if (empresaId === "1087" && docTipo === "factura") return plantillaLogikos(empresaId);
  return plantillaBase(empresaId, docTipo);
}

export function bandaDe(plantilla: Plantilla, tipo: TipoBanda): BandaPlantilla {
  return (
    plantilla.bandas.find((b) => b.tipo === tipo) ?? { tipo, alto: 10, visible: false, elementos: [] }
  );
}
