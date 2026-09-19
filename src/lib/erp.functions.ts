import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { EstadoConexion, FiltroFacturas, Reporte, Resumen } from "@/lib/db/repo.server";
import type {
  Cliente,
  FormatoImpresion,
  Empresa,
  EstadoFactura,
  Factura,
  Item,
  ListasCliente,
  ListasFactura,
  ListasItem,
  ListasNCF,
  RangoNCF,


  OpcionId,
  SecuenciaNCF,

  TipoNCF,
} from "@/lib/erp-types";

import { auditar } from "@/lib/auditoria.functions";

const repo = () => import("@/lib/db/repo.server");

const tipoNCF = z.enum([
  "B01", "B02", "B03", "B04", "B11", "B13", "B14", "B15",
  "E31", "E32", "E33", "E34", "E41", "E43", "E44", "E45", "E46",
]);
const estadoFactura = z.enum(["emitida", "pagada", "anulada"]);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const texto = (max: number) => z.string().trim().max(max);

/* ----------------------------- Conexión / panel -------------------------- */

export const obtenerEstadoConexion = createServerFn({ method: "GET" }).handler(
  async (): Promise<EstadoConexion> => (await repo()).estadoConexion(),
);

export const obtenerResumen = createServerFn({ method: "GET" }).handler(
  async (): Promise<Resumen> => (await repo()).resumen(),
);

/* -------------------------------- Empresa -------------------------------- */

const lineaAsientoSchema = z.object({
  cuenta: texto(15),
  cuenta_nombre: texto(60).optional(),
  departamento_id: texto(10).optional(),
  descripcion: texto(200),
  referencia: texto(50).optional(),
  debito: z.number().min(0).max(999_999_999),
  credito: z.number().min(0).max(999_999_999),
});

const empresaSchema = z.object({
  nombre: texto(160).min(1, "Requerido"),
  rnc: texto(15).min(9, "RNC inválido"),
  direccion: texto(240),
  telefono: texto(30),
  email: z.string().trim().max(160).email("Correo inválido").or(z.literal("")),
});

export const obtenerEmpresa = createServerFn({ method: "GET" }).handler(
  async (): Promise<Empresa> => (await repo()).obtenerEmpresa(),
);

export const guardarEmpresa = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => empresaSchema.parse(d))
  .handler(async ({ data }): Promise<Empresa> => {
    const empresa = await (await repo()).guardarEmpresa(data);
    await auditar({
      menu_id: "4.51",
      tipo: "E",
      accion: `Empresa: ${empresa.nombre}`,
      referencia: empresa.rnc,
      cambios: data,
    });
    return empresa;
  });

/* -------------------------------- Clientes ------------------------------- */

const clienteSchema = z.object({
  id: texto(20).min(1).optional(),
  nombre: texto(160).min(1, "Requerido"),
  rnc: texto(15).min(9, "RNC o Cédula inválido"),
  tipo_ncf: tipoNCF,
  telefono: texto(30),
  email: z.string().trim().max(160).email("Correo inválido").or(z.literal("")),
  direccion: texto(240),
  dias_credito: z.number().int().min(0).max(365),
  activo: z.boolean(),
  nombre_corto: texto(10).optional(),
  direccion2: texto(100).optional(),
  ciudad: texto(100).optional(),
  pais: texto(40).optional(),
  codigo_postal: texto(10).optional(),
  telefono2: texto(20).optional(),
  telefono3: texto(20).optional(),
  fax: texto(20).optional(),
  email_alterno: z.string().trim().max(160).email("Correo alterno inválido").or(z.literal("")).optional(),
  fecha_apertura: fecha.or(z.literal("")).optional(),
  localidad_id: texto(15).optional(),
  sector: texto(4).optional(),
  monto_credito: z.number().min(0).optional(),
  vendedor_id: z.number().int().min(0).optional(),
  clase_id: z.number().int().min(0).optional(),
  lista_precios: z.number().int().min(1).max(9).optional(),
  datacredito: z
    .enum(["", "NORMAL", "ATRASO", "LEGAL", "CASTIGADO", "SALDADO"])
    .optional(),
  cargar_itbis: z.boolean().optional(),
  backorder: z.boolean().optional(),
  retener_anticipos: z.boolean().optional(),
  validar_orden_compra: z.boolean().optional(),
  generico: z.boolean().optional(),
  bloquear_credito_vencido: z.boolean().optional(),
  dias_credito_vencido: z.number().int().min(0).max(999).optional(),
  certificado_zf: texto(10).optional(),
  certificado_zf_vence: fecha.or(z.literal("")).optional(),
  retencion_itbis: z.number().min(0).max(100).optional(),
  retencion_isr: z.number().min(0).max(100).optional(),
  notas: texto(2000).optional(),
});

export const obtenerClientes = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ busqueda: texto(80).default("") }).parse(d ?? {}))
  .handler(async ({ data }): Promise<Cliente[]> => (await repo()).listarClientes(data.busqueda));

export const obtenerListasCliente = createServerFn({ method: "GET" }).handler(
  async (): Promise<ListasCliente> => (await repo()).listasCliente(),
);

export const guardarCliente = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => clienteSchema.parse(d))
  .handler(async ({ data }): Promise<Cliente> => {
    const cliente = await (await repo()).guardarCliente(data);
    await auditar({
      menu_id: "1.03.11",
      tipo: data.id ? "E" : "A",
      accion: `Cliente: ${cliente.id} — ${cliente.nombre}`,
      referencia: cliente.id,
      cambios: data,
    });
    return cliente;
  });


/* --------------------------------- Ítems --------------------------------- */

const itemSchema = z.object({
  id: texto(30).min(1).optional(),
  codigo: texto(30).min(1, "Requerido"),
  descripcion: texto(200).min(1, "Requerido"),
  unidad: texto(10).min(1, "Requerido"),
  precio: z.number().min(0).max(99_999_999),
  tasa_itbis: z.number().refine((v) => [0, 16, 18].includes(v), "Tasa inválida"),
  activo: z.boolean(),
  referencia: texto(200).optional(),
  nombre_corto: texto(20).optional(),
  suplidor_id: z.number().int().min(0).optional(),
  grupo_id: texto(10).optional(),
  tipo_id: texto(10).optional(),
  familia_id: z.number().int().min(0).optional(),
  codigo_barras: texto(40).optional(),
  moneda: texto(3).optional(),
  comision: z.number().min(0).max(100).optional(),
  costo: z.number().min(0).optional(),
  precio2: z.number().min(0).optional(),
  precio3: z.number().min(0).optional(),
  precio4: z.number().min(0).optional(),
  precio5: z.number().min(0).optional(),
  aplica_impuesto: z.boolean().optional(),
  es_servicio: z.boolean().optional(),
  requiere_serial: z.boolean().optional(),
  compuesto: z.boolean().optional(),
  validar_existencia: z.boolean().optional(),
  venta_controlada: z.boolean().optional(),
  no_comisionable: z.boolean().optional(),
  empaque_id: texto(10).optional(),
  cantidad_empaque: z.number().min(0).optional(),
  venta_minima: z.number().min(0).optional(),
  venta_maxima: z.number().min(0).optional(),
  existencia_maxima: z.number().min(0).optional(),
  existencia_minima: z.number().min(0).optional(),
  rotacion: z.number().int().min(0).optional(),
  alto: z.number().min(0).optional(),
  ancho: z.number().min(0).optional(),
  profundidad: z.number().min(0).optional(),
  medida_volumen_id: texto(10).optional(),
  peso: z.number().min(0).optional(),
  medida_peso_id: texto(10).optional(),
  ficha: texto(200).optional(),
  dias_antes_vencimiento: z.number().int().min(0).optional(),
  permitir_edicion_precio: z.boolean().optional(),
  arancel: z.number().min(0).max(100).optional(),
  marca_id: texto(10).optional(),
  color_id: texto(10).optional(),
  origen_id: z.number().int().min(0).optional(),
  disparador: z.enum(["", "FST"]).optional(),
  pasillo: texto(30).optional(),
  tramo: texto(30).optional(),
  estante: texto(30).optional(),
  notas: texto(4000).optional(),
  garantia: texto(4000).optional(),
});

export const obtenerItems = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ busqueda: texto(80).default("") }).parse(d ?? {}))
  .handler(async ({ data }): Promise<Item[]> => (await repo()).listarItems(data.busqueda));

export const obtenerListasItem = createServerFn({ method: "GET" }).handler(
  async (): Promise<ListasItem> => (await repo()).listasItem(),
);

export const guardarItem = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => itemSchema.parse(d))
  .handler(async ({ data }): Promise<Item> => {
    const item = await (await repo()).guardarItem(data);
    await auditar({
      menu_id: "1.02.05",
      tipo: data.id ? "E" : "A",
      accion: `Ítem: ${item.codigo} — ${item.descripcion}`,
      referencia: item.id,
      cambios: data,
    });
    return item;
  });


/* ------------------------------ Secuencias ------------------------------- */

const secuenciaSchema = z.object({
  tipo_ncf: tipoNCF,
  desde: z.number().int().min(1),
  hasta: z.number().int().min(1),
  proximo: z.number().int().min(1),
  vence: fecha,
  activa: z.boolean(),
});

export const obtenerSecuencias = createServerFn({ method: "GET" }).handler(
  async (): Promise<SecuenciaNCF[]> => (await repo()).listarSecuencias(),
);

export const guardarSecuencia = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => secuenciaSchema.parse(d))
  .handler(async ({ data }): Promise<SecuenciaNCF> => {
    const secuencia = await (await repo()).guardarSecuencia(data);
    await auditar({
      menu_id: "4.55.03",
      tipo: "E",
      accion: `Secuencia NCF ${data.tipo_ncf}: ${data.desde}-${data.hasta}`,
      referencia: data.tipo_ncf,
      cambios: data,
    });
    return secuencia;
  });

/* ------------------- Comprobantes fiscales (rangos) ---------------------- */

const rangoSchema = z.object({
  id: z.number().int().min(0),
  prefijo: texto(11).min(1, "Prefijo requerido"),
  ncf_id: z.number().int().min(0).max(99),
  sucursal_id: z.number().int().min(1),
  desde: z.number().int().min(0),
  hasta: z.number().int().min(0),
  ultimo: z.number().int().min(0),
  alerta: z.number().int().min(0).max(99_999),
  activa: z.boolean(),
  autorizacion: texto(15),
  vence: fecha.or(z.literal("")),
});

export const obtenerRangosNCF = createServerFn({ method: "GET" }).handler(
  async (): Promise<RangoNCF[]> => (await repo()).listarRangosNCF(),
);

export const obtenerListasNCF = createServerFn({ method: "GET" }).handler(
  async (): Promise<ListasNCF> => (await repo()).listasNCF(),
);

export const guardarRangoNCF = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => rangoSchema.parse(d))
  .handler(async ({ data }): Promise<RangoNCF> => {
    const rango = await (await repo()).guardarRangoNCF(data);
    await auditar({
      menu_id: "4.55.03",
      tipo: data.id ? "E" : "A",
      accion: `Comprobantes ${data.prefijo}: rango ${data.desde}-${data.hasta}`,
      referencia: rango.id,
      cambios: data,
    });
    return rango;
  });

export const eliminarRangoNCF = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await repo()).eliminarRangoNCF(data.id);
    await auditar({
      menu_id: "4.55.03",
      tipo: "B",
      accion: `Eliminó el rango de comprobantes No. ${data.id}`,
      referencia: data.id,
    });
    return { ok: true };
  });

export const activarRangoNCF = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await repo()).activarRangoNCF(data.id);
    await auditar({
      menu_id: "4.55.03",
      tipo: "E",
      accion: `Activó el rango de comprobantes No. ${data.id}`,
      referencia: data.id,
    });
    return { ok: true };
  });

/* -------------------------------- Facturas ------------------------------- */

const filtroSchema = z.object({
  desde: fecha.optional(),
  hasta: fecha.optional(),
  clienteId: texto(20).optional(),
  tipo: tipoNCF.optional(),
  estado: estadoFactura.optional(),
});

export const obtenerFacturas = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => filtroSchema.parse(d ?? {}))
  .handler(async ({ data }): Promise<Factura[]> =>
    (await repo()).listarFacturas(data as FiltroFacturas),
  );

export const obtenerFactura = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<Factura | null> => (await repo()).obtenerFactura(data.id));

export const obtenerListasFactura = createServerFn({ method: "GET" }).handler(
  async (): Promise<ListasFactura> => (await repo()).listasFactura(),
);

const nuevaFacturaSchema = z.object({
  cliente_id: texto(20).min(1, "Cliente requerido"),
  tipo_ncf: tipoNCF,
  fecha,
  dias_credito: z.number().int().min(0).max(365),
  notas: texto(300),
  moneda: z.string().trim().max(3).optional(),
  tasa_cambio: z.number().min(0).max(100_000).optional(),
  vendedor_id: texto(10).optional(),
  tecnico_id: texto(10).optional(),
  almacen_id: texto(10).optional(),
  sucursal_id: texto(10).optional(),
  departamento_id: texto(10).optional(),
  proyecto_id: texto(10).optional(),
  cotizacion_id: texto(10).optional(),
  orden_cliente: texto(10).optional(),
  orden_vendedor: texto(10).optional(),
  pagos: z
    .object({
      efectivo: z.number().min(0).default(0),
      tarjeta: z.number().min(0).default(0),
      cheque: z.number().min(0).default(0),
      transferencia: z.number().min(0).default(0),
      cardnet: z.number().min(0).default(0),
    })
    .optional(),
  lineas: z
    .array(
      z.object({
        item_id: texto(20).nullable().optional(),
        codigo: texto(30),
        descripcion: texto(200).min(1, "Descripción requerida"),
        cantidad: z.number().positive().max(1_000_000),
        oferta: z.number().min(0).max(1_000_000).optional(),
        precio: z.number().min(0).max(99_999_999),
        descuento_pct: z.number().min(0).max(100),
        tasa_itbis: z.number().refine((v) => [0, 16, 18].includes(v), "Tasa inválida"),
        precio_incluye_itbis: z.boolean().optional(),
      }),
    )
    .min(1, "Agrega al menos una línea"),
  facturar: z.boolean().optional(),
  asiento: z.array(lineaAsientoSchema).max(100).optional(),
});

export const guardarPedido = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => nuevaFacturaSchema.parse(d))
  .handler(async ({ data }): Promise<Factura> => {
    const factura = await (await repo()).crearPedido(data);
    await auditar({
      menu_id: "2.01.02",
      tipo: "A",
      accion: factura.ncf
        ? `Pedido: ${factura.id} | Factura: ${factura.invoice_id ?? ""} | NCF: ${factura.ncf}`
        : `Pedido: ${factura.id} — ${factura.cliente_nombre}`,
      referencia: factura.id,
      cambios: data,
    });
    return factura;
  });

/** Convierte un pedido existente en factura (asigna NCF y número de factura). */
export const facturarPedido = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        tipo_ncf: tipoNCF.optional(),
        asiento: z.array(lineaAsientoSchema).max(100).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Factura> => {
    const factura = await (await repo()).facturarPedido(data.id, data.tipo_ncf, data.asiento);
    await auditar({
      menu_id: "2.01.02",
      tipo: "E",
      accion: `Facturó el pedido ${data.id} | Factura: ${factura.invoice_id ?? ""} | NCF: ${factura.ncf ?? ""}`,
      referencia: data.id,
      cambios: data,
    });
    return factura;
  });

/** Borra un pedido que aún no se ha convertido en factura. */
export const eliminarPedido = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await repo()).eliminarPedido(data.id);
    await auditar({
      menu_id: "2.01.02",
      tipo: "B",
      accion: `Borró el pedido ${data.id}`,
      referencia: data.id,
      cambios: data,
    });
    return { ok: true };
  });

export const cambiarEstadoFactura = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: z.number().int().positive(), estado: estadoFactura }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await repo()).cambiarEstadoFactura(data.id, data.estado as EstadoFactura);
    await auditar({
      menu_id: "2.01.02",
      tipo: data.estado === "anulada" ? "X" : "E",
      accion: `Cambió el estado del documento ${data.id} a ${data.estado}`,
      referencia: data.id,
      cambios: data,
    });
    return { ok: true };
  });

/* -------------------------------- Reportes ------------------------------- */

export const obtenerReporte = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ desde: fecha, hasta: fecha }).parse(d))
  .handler(async ({ data }): Promise<Reporte> => (await repo()).reporte(data.desde, data.hasta));

/* --------------------- Formatos de impresión por empresa ------------------ */

const formatoSchema = z.object({
  empresa_id: texto(20).min(1),
  nombre: texto(60),
  papel: z.enum(["carta", "legal", "a4", "media", "tirilla"]),
  preimpreso: z.boolean(),
  margen_superior: z.number().int().min(0).max(80),
  margen_inferior: z.number().int().min(0).max(80),
  margen_izquierdo: z.number().int().min(0).max(80),
  margen_derecho: z.number().int().min(0).max(80),
  mostrar_logo: z.boolean(),
  mostrar_codigo: z.boolean(),
  mostrar_itbis_linea: z.boolean(),
  mostrar_descuento: z.boolean(),
  mostrar_equivalente_dop: z.boolean(),
  copias: z.number().int().min(1).max(4),
  titulo: texto(80),
  pie: texto(300),
});

export const obtenerEmpresas = createServerFn({ method: "GET" }).handler(
  async (): Promise<OpcionId[]> => (await repo()).listarEmpresas(),
);

export const obtenerFormatoImpresion = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ empresaId: texto(20).default("") }).parse(d ?? {}))
  .handler(async ({ data }): Promise<FormatoImpresion> =>
    (await repo()).obtenerFormatoImpresion(data.empresaId),
  );

export const obtenerFormatosImpresion = createServerFn({ method: "GET" }).handler(
  async (): Promise<FormatoImpresion[]> => (await repo()).listarFormatosImpresion(),
);

export const guardarFormatoImpresion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => formatoSchema.parse(d))
  .handler(async ({ data }): Promise<FormatoImpresion> => {
    const formato = await (await repo()).guardarFormatoImpresion(data);
    await auditar({
      menu_id: "4.51",
      tipo: "E",
      accion: `Formato de impresión de la empresa ${data.empresa_id}`,
      referencia: data.empresa_id,
      cambios: data,
    });
    return formato;
  });

export const eliminarFormatoImpresion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ empresaId: texto(20).min(1) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await repo()).eliminarFormatoImpresion(data.empresaId);
    await auditar({
      menu_id: "4.51",
      tipo: "B",
      accion: `Eliminó el formato de impresión de la empresa ${data.empresaId}`,
      referencia: data.empresaId,
    });
    return { ok: true };
  });

export type { TipoNCF };
