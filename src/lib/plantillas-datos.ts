// Convierte una factura real del sistema en los datos que consume el
// diseñador de documentos (RenderPlantilla).

import { fechaCorta, round2, enDOP, tituloDocumento, type Empresa, type Factura } from "@/lib/erp-types";
import type { DatosDocumento } from "@/lib/plantillas-tipos";

const num = (n: number): string =>
  (n ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const UNIDADES = [
  "", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE", "DIEZ",
  "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO",
  "DIECINUEVE", "VEINTE",
];
const DECENAS = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function menorMil(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const r = n % 100;
  const parteC = CENTENAS[c] ?? "";
  let parteR = "";
  if (r <= 20) parteR = UNIDADES[r] ?? "";
  else {
    const d = Math.floor(r / 10);
    const u = r % 10;
    parteR = u === 0 ? (DECENAS[d] ?? "") : `${DECENAS[d] ?? ""} Y ${UNIDADES[u] ?? ""}`;
  }
  return [parteC, parteR].filter(Boolean).join(" ");
}

/** Escribe el monto en letras, como en las facturas impresas. */
export function montoEnLetras(monto: number): string {
  const entero = Math.floor(Math.abs(round2(monto)));
  const centavos = Math.round((Math.abs(round2(monto)) - entero) * 100);
  if (entero === 0) return `CERO CON ${String(centavos).padStart(2, "0")}/100`;
  const millones = Math.floor(entero / 1_000_000);
  const miles = Math.floor((entero % 1_000_000) / 1000);
  const resto = entero % 1000;
  const partes: string[] = [];
  if (millones > 0) partes.push(millones === 1 ? "UN MILLÓN" : `${menorMil(millones)} MILLONES`);
  if (miles > 0) partes.push(miles === 1 ? "MIL" : `${menorMil(miles)} MIL`);
  if (resto > 0) partes.push(menorMil(resto));
  return `${partes.join(" ")} CON ${String(centavos).padStart(2, "0")}/100`;
}

export interface SaldosCliente {
  por_vencer?: number;
  d30?: number;
  d60?: number;
  d90?: number;
  d91?: number;
  total?: number;
}

/** Arma los campos del documento a partir de una factura y la empresa. */
export function datosDeFactura(
  factura: Factura,
  empresa?: Empresa | undefined,
  saldos?: SaldosCliente | undefined,
  pagina = 1,
): DatosDocumento {
  const gravado = factura.gravado ?? round2(factura.subtotal - (factura.exento ?? 0));
  const exento = factura.exento ?? 0;
  const campos: Record<string, string> = {
    "empresa.nombre": empresa?.nombre ?? "",
    "empresa.rnc": empresa?.rnc ?? "",
    "empresa.direccion": empresa?.direccion ?? "",
    "empresa.telefono": empresa?.telefono ?? "",
    "empresa.email": empresa?.email ?? "",
    "empresa.web": "",

    "doc.titulo": tituloDocumento(factura.tipo_ncf),
    "doc.numero": factura.invoice_id ? String(factura.invoice_id) : String(factura.id),
    "doc.fecha": fechaCorta(factura.fecha),
    "doc.vencimiento": fechaCorta(factura.vencimiento),
    "doc.condicion":
      (factura.dias_credito ?? 0) > 0 ? `DE 1 A ${factura.dias_credito} DÍAS` : "CONTADO",
    "doc.vendedor": factura.vendedor ?? "",
    "doc.almacen": factura.almacen ?? "",
    "doc.moneda": factura.moneda ?? "DOP",
    "doc.tasa": (factura.tasa_cambio ?? 1).toFixed(4),
    "doc.orden_cliente": factura.orden_cliente ?? "",
    "doc.cotizacion": factura.cotizacion_id ? String(factura.cotizacion_id) : "",
    "doc.pedido": String(factura.id),
    "doc.conduce": "",
    "doc.soporte": "",
    "doc.notas": factura.notas ?? "",
    "doc.pagina": String(pagina),

    "fiscal.ncf": factura.ncf ?? "",
    "fiscal.tipo": factura.tipo_ncf ?? "",
    "fiscal.vigencia": "",
    "fiscal.autorizacion": "",
    "fiscal.seguridad": "",
    "fiscal.firma_fecha": "",

    "cliente.codigo": factura.cliente_id ?? "",
    "cliente.nombre": factura.cliente_nombre ?? "",
    "cliente.rnc": factura.cliente_rnc ?? "",
    "cliente.direccion": factura.cliente_direccion ?? "",
    "cliente.telefono": factura.cliente_telefono ?? "",
    "cliente.contacto": "",
    "cliente.envio": "",

    "totales.subtotal": num(round2(factura.subtotal + factura.descuento)),
    "totales.descuento": num(factura.descuento),
    "totales.neto": num(factura.subtotal),
    "totales.exento": num(exento),
    "totales.gravado": num(gravado),
    "totales.itbis": num(factura.itbis),
    "totales.total": num(factura.total),
    "totales.total_letras": montoEnLetras(factura.total),
    "totales.equivalente_dop": num(enDOP(factura.total, factura.tasa_cambio)),
    "totales.cantidad_lineas": String(factura.lineas.length),

    "cxc.por_vencer": num(saldos?.por_vencer ?? 0),
    "cxc.d30": num(saldos?.d30 ?? 0),
    "cxc.d60": num(saldos?.d60 ?? 0),
    "cxc.d90": num(saldos?.d90 ?? 0),
    "cxc.d91": num(saldos?.d91 ?? 0),
    "cxc.total": num(saldos?.total ?? 0),
  };

  const lineas = factura.lineas.map((l, i) => ({
    "linea.numero": String(i + 1),
    "linea.codigo": l.codigo ?? "",
    "linea.descripcion": l.descripcion ?? "",
    "linea.observacion": l.observacion ?? "",
    "linea.serial": "",
    "linea.cantidad": num(l.cantidad),
    "linea.unidad": "",
    "linea.precio": num(l.precio),
    "linea.descuento_pct": num(l.descuento_pct),
    "linea.descuento": num(round2(l.cantidad * l.precio * (l.descuento_pct / 100))),
    "linea.itbis": num(l.itbis),
    "linea.importe": num(l.subtotal),
  }));

  return { campos, lineas };
}

/* ------------ Otros documentos: cotización, conduce, devolución ----------- */

import { DOCUMENTOS, type Documento, type NotaCredito, type OrdenCompra, type TipoDocumento } from "@/lib/erp-types";
import type { TipoPlantilla } from "@/lib/plantillas-tipos";

/** Plantilla que corresponde a cada documento de venta. */
export function tipoPlantillaDocumento(tipo: TipoDocumento): TipoPlantilla {
  if (tipo === "cotizacion") return "cotizacion";
  if (tipo === "conduce") return "conduce";
  return "nota-credito";
}

interface Comun {
  titulo: string;
  numero: string;
  fecha: string;
  vencimiento?: string | undefined;
  dias_credito?: number | undefined;
  moneda?: string | undefined;
  tasa?: number | undefined;
  vendedor?: string | undefined;
  almacen?: string | undefined;
  orden_cliente?: string | undefined;
  cotizacion?: string | undefined;
  pedido?: string | undefined;
  conduce?: string | undefined;
  soporte?: string | undefined;
  notas?: string | undefined;
  ncf?: string | undefined;
  tipo_ncf?: string | undefined;
  contacto?: string | undefined;
  cliente_codigo?: string | undefined;
  cliente_nombre?: string | undefined;
  cliente_rnc?: string | undefined;
  cliente_direccion?: string | undefined;
  cliente_telefono?: string | undefined;
  subtotal: number;
  descuento: number;
  itbis: number;
  total: number;
  gravado?: number | undefined;
  exento?: number | undefined;
  lineas: LineaFactura[];
}

function armar(c: Comun, empresa: Empresa | undefined, pagina: number): DatosDocumento {
  const campos: Record<string, string> = {
    "empresa.nombre": empresa?.nombre ?? "",
    "empresa.rnc": empresa?.rnc ?? "",
    "empresa.direccion": empresa?.direccion ?? "",
    "empresa.telefono": empresa?.telefono ?? "",
    "empresa.email": empresa?.email ?? "",
    "empresa.web": "",

    "doc.titulo": c.titulo,
    "doc.numero": c.numero,
    "doc.fecha": fechaCorta(c.fecha),
    "doc.vencimiento": c.vencimiento ? fechaCorta(c.vencimiento) : "",
    "doc.condicion": (c.dias_credito ?? 0) > 0 ? `DE 1 A ${c.dias_credito} DÍAS` : "CONTADO",
    "doc.vendedor": c.vendedor ?? "",
    "doc.almacen": c.almacen ?? "",
    "doc.moneda": c.moneda ?? "DOP",
    "doc.tasa": (c.tasa ?? 1).toFixed(4),
    "doc.orden_cliente": c.orden_cliente ?? "",
    "doc.cotizacion": c.cotizacion ?? "",
    "doc.pedido": c.pedido ?? "",
    "doc.conduce": c.conduce ?? "",
    "doc.soporte": c.soporte ?? "",
    "doc.notas": c.notas ?? "",
    "doc.pagina": String(pagina),

    "fiscal.ncf": c.ncf ?? "",
    "fiscal.tipo": c.tipo_ncf ?? "",
    "fiscal.vigencia": "",
    "fiscal.autorizacion": "",
    "fiscal.seguridad": "",
    "fiscal.firma_fecha": "",

    "cliente.codigo": c.cliente_codigo ?? "",
    "cliente.nombre": c.cliente_nombre ?? "",
    "cliente.rnc": c.cliente_rnc ?? "",
    "cliente.direccion": c.cliente_direccion ?? "",
    "cliente.telefono": c.cliente_telefono ?? "",
    "cliente.contacto": c.contacto ?? "",
    "cliente.envio": "",

    "totales.subtotal": num(round2(c.subtotal + c.descuento)),
    "totales.descuento": num(c.descuento),
    "totales.neto": num(c.subtotal),
    "totales.exento": num(c.exento ?? 0),
    "totales.gravado": num(c.gravado ?? round2(c.subtotal - (c.exento ?? 0))),
    "totales.itbis": num(c.itbis),
    "totales.total": num(c.total),
    "totales.total_letras": montoEnLetras(c.total),
    "totales.equivalente_dop": num(enDOP(c.total, c.tasa)),
    "totales.cantidad_lineas": String(c.lineas.length),

    "cxc.por_vencer": num(0),
    "cxc.d30": num(0),
    "cxc.d60": num(0),
    "cxc.d90": num(0),
    "cxc.d91": num(0),
    "cxc.total": num(0),
  };

  const lineas = c.lineas.map((l, i) => ({
    "linea.numero": String(i + 1),
    "linea.codigo": l.codigo ?? "",
    "linea.descripcion": l.descripcion ?? "",
    "linea.observacion": l.observacion ?? "",
    "linea.serial": "",
    "linea.cantidad": num(l.cantidad),
    "linea.unidad": "",
    "linea.precio": num(l.precio),
    "linea.descuento_pct": num(l.descuento_pct),
    "linea.descuento": num(round2(l.cantidad * l.precio * (l.descuento_pct / 100))),
    "linea.itbis": num(l.itbis),
    "linea.importe": num(l.subtotal),
  }));

  return { campos, lineas };
}

/** Cotización, conduce o devolución. */
export function datosDeDocumento(
  doc: Documento,
  empresa?: Empresa | undefined,
  pagina = 1,
): DatosDocumento {
  return armar(
    {
      titulo: DOCUMENTOS[doc.tipo].titulo.toUpperCase(),
      numero: String(doc.id),
      fecha: doc.fecha,
      vencimiento: doc.fecha_entrega,
      dias_credito: doc.dias_credito,
      moneda: doc.moneda,
      tasa: doc.tasa_cambio,
      vendedor: doc.vendedor,
      almacen: doc.almacen,
      orden_cliente: doc.orden_cliente,
      cotizacion: doc.cotizacion_id ? String(doc.cotizacion_id) : "",
      pedido: doc.pedido_id ? String(doc.pedido_id) : "",
      soporte: doc.factura_id ? String(doc.factura_id) : "",
      notas: doc.notas,
      ncf: doc.ncf,
      contacto: doc.contacto,
      cliente_codigo: doc.cliente_id,
      cliente_nombre: doc.cliente_nombre,
      cliente_rnc: doc.cliente_rnc,
      cliente_direccion: doc.cliente_direccion,
      cliente_telefono: doc.cliente_telefono,
      subtotal: doc.subtotal,
      descuento: doc.descuento,
      itbis: doc.itbis,
      total: doc.total,
      lineas: doc.lineas,
    },
    empresa,
    pagina,
  );
}

/** Nota de crédito. */
export function datosDeNotaCredito(
  nota: NotaCredito,
  empresa?: Empresa | undefined,
  pagina = 1,
): DatosDocumento {
  return armar(
    {
      titulo: tituloDocumento("B04"),
      numero: String(nota.id),
      fecha: nota.fecha,
      moneda: nota.moneda,
      tasa: nota.tasa_cambio,
      soporte: nota.factura_ncf ?? (nota.factura_id ? String(nota.factura_id) : ""),
      pedido: nota.pedido_id ? String(nota.pedido_id) : "",
      notas: [nota.motivo, nota.notas].filter(Boolean).join(" · "),
      ncf: nota.ncf,
      tipo_ncf: "B04",
      cliente_codigo: nota.cliente_id,
      cliente_nombre: nota.cliente_nombre,
      cliente_rnc: nota.cliente_rnc,
      cliente_direccion: nota.cliente_direccion,
      cliente_telefono: nota.cliente_telefono,
      subtotal: nota.subtotal,
      descuento: nota.descuento,
      itbis: nota.itbis,
      total: nota.total,
      lineas: nota.lineas,
    },
    empresa,
    pagina,
  );
}

/** Orden de compra: el suplidor ocupa el bloque del cliente. */
export function datosDeOrdenCompra(
  orden: OrdenCompra,
  empresa?: Empresa | undefined,
  pagina = 1,
): DatosDocumento {
  return armar(
    {
      titulo: "ORDEN DE COMPRA",
      numero: String(orden.id),
      fecha: orden.fecha,
      dias_credito: orden.dias_credito,
      moneda: orden.moneda,
      tasa: orden.tasa_cambio,
      almacen: orden.almacen,
      orden_cliente: orden.requisicion,
      cotizacion: orden.cotizacion,
      soporte: orden.factura_suplidor,
      notas: [orden.uso, orden.destino, orden.lugar, orden.notas].filter(Boolean).join(" · "),
      cliente_codigo: orden.suplidor_id,
      cliente_nombre: orden.suplidor,
      cliente_rnc: orden.suplidor_rnc,
      cliente_direccion: orden.suplidor_direccion,
      cliente_telefono: orden.suplidor_telefono,
      subtotal: orden.subtotal,
      descuento: orden.descuento,
      itbis: orden.itbis,
      total: orden.total,
      lineas: orden.lineas.map((l) => ({
        item_id: l.producto_id,
        codigo: l.codigo,
        descripcion: l.descripcion,
        observacion: l.notas,
        cantidad: l.cantidad,
        precio: l.precio,
        descuento_pct: l.descuento_pct,
        tasa_itbis: l.tasa_itbis,
        subtotal: l.subtotal,
        itbis: l.itbis,
        total: l.total,
      })),
    },
    empresa,
    pagina,
  );
}
