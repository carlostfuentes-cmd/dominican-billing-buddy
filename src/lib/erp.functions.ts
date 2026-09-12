import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { EstadoConexion, FiltroFacturas, Reporte, Resumen } from "@/lib/db/repo.server";
import type {
  Cliente,
  Empresa,
  EstadoFactura,
  Factura,
  Item,
  SecuenciaNCF,
  TipoNCF,
} from "@/lib/erp-types";

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
  .handler(async ({ data }): Promise<Empresa> => (await repo()).guardarEmpresa(data));

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
});

export const obtenerClientes = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ busqueda: texto(80).default("") }).parse(d ?? {}))
  .handler(async ({ data }): Promise<Cliente[]> => (await repo()).listarClientes(data.busqueda));

export const guardarCliente = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => clienteSchema.parse(d))
  .handler(async ({ data }): Promise<Cliente> => (await repo()).guardarCliente(data));

/* --------------------------------- Ítems --------------------------------- */

const itemSchema = z.object({
  id: texto(20).min(1).optional(),
  codigo: texto(30).min(1, "Requerido"),
  descripcion: texto(200).min(1, "Requerido"),
  unidad: texto(10).min(1, "Requerido"),
  precio: z.number().min(0).max(99_999_999),
  tasa_itbis: z.number().refine((v) => [0, 16, 18].includes(v), "Tasa inválida"),
  activo: z.boolean(),
});

export const obtenerItems = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ busqueda: texto(80).default("") }).parse(d ?? {}))
  .handler(async ({ data }): Promise<Item[]> => (await repo()).listarItems(data.busqueda));

export const guardarItem = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => itemSchema.parse(d))
  .handler(async ({ data }): Promise<Item> => (await repo()).guardarItem(data));

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
  .handler(async ({ data }): Promise<SecuenciaNCF> => (await repo()).guardarSecuencia(data));

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

const nuevaFacturaSchema = z.object({
  cliente_id: texto(20).min(1, "Cliente requerido"),
  tipo_ncf: tipoNCF,
  fecha,
  dias_credito: z.number().int().min(0).max(365),
  notas: texto(300),
  lineas: z
    .array(
      z.object({
        item_id: texto(20).nullable().optional(),
        codigo: texto(30),
        descripcion: texto(200).min(1, "Descripción requerida"),
        cantidad: z.number().positive().max(1_000_000),
        precio: z.number().min(0).max(99_999_999),
        descuento_pct: z.number().min(0).max(100),
        tasa_itbis: z.number().refine((v) => [0, 16, 18].includes(v), "Tasa inválida"),
      }),
    )
    .min(1, "Agrega al menos una línea"),
});

export const emitirFactura = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => nuevaFacturaSchema.parse(d))
  .handler(async ({ data }): Promise<Factura> => (await repo()).crearFactura(data));

export const cambiarEstadoFactura = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: z.number().int().positive(), estado: estadoFactura }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await repo()).cambiarEstadoFactura(data.id, data.estado as EstadoFactura);
    return { ok: true };
  });

/* -------------------------------- Reportes ------------------------------- */

export const obtenerReporte = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ desde: fecha, hasta: fecha }).parse(d))
  .handler(async ({ data }): Promise<Reporte> => (await repo()).reporte(data.desde, data.hasta));

export type { TipoNCF };
