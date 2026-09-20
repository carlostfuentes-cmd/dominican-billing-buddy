// Convierte una factura real del sistema en los datos que consume el
// diseñador de documentos (RenderPlantilla).

import { TIPOS_NCF, fechaCorta, round2, enDOP, type Empresa, type Factura } from "@/lib/erp-types";
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
  const titulo = TIPOS_NCF.find((t) => t.codigo === factura.tipo_ncf)?.nombre.split("—")[1]?.trim();
  const gravado = factura.gravado ?? round2(factura.subtotal - (factura.exento ?? 0));
  const exento = factura.exento ?? 0;
  const campos: Record<string, string> = {
    "empresa.nombre": empresa?.nombre ?? "",
    "empresa.rnc": empresa?.rnc ?? "",
    "empresa.direccion": empresa?.direccion ?? "",
    "empresa.telefono": empresa?.telefono ?? "",
    "empresa.email": empresa?.email ?? "",
    "empresa.web": "",

    "doc.titulo": (titulo ? `FACTURA DE ${titulo.toUpperCase()}` : "FACTURA").replace(
      "FACTURA DE NOTA DE CRÉDITO",
      "NOTA DE CRÉDITO",
    ),
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
