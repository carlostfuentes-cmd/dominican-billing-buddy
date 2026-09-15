import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type {
  Documento,
  LineaFactura,
  OpcionId,
  TipoDocumento,
} from "@/lib/erp-types";

const repo = () => import("@/lib/db/documentos.server");

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const texto = (max: number) => z.string().trim().max(max);
const tipoDoc = z.enum(["cotizacion", "conduce", "devolucion"]);

const filtroSchema = z.object({
  tipo: tipoDoc,
  desde: fecha.optional(),
  hasta: fecha.optional(),
  clienteId: texto(20).optional(),
});

export const obtenerDocumentos = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => filtroSchema.parse(d))
  .handler(async ({ data }): Promise<Documento[]> =>
    (await repo()).listarDocumentos(data.tipo as TipoDocumento, {
      desde: data.desde,
      hasta: data.hasta,
      clienteId: data.clienteId,
    }),
  );

export const obtenerDocumento = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ tipo: tipoDoc, id: z.number().int().positive() }).parse(d),
  )
  .handler(async ({ data }): Promise<Documento | null> =>
    (await repo()).obtenerDocumento(data.tipo as TipoDocumento, data.id),
  );

export const obtenerMotivosDevolucion = createServerFn({ method: "GET" }).handler(
  async (): Promise<OpcionId[]> => (await repo()).listarMotivosDevolucion(),
);

const nuevoDocumentoSchema = z.object({
  tipo: tipoDoc,
  cliente_id: texto(20).min(1, "Cliente requerido"),
  fecha,
  fecha_entrega: fecha.optional(),
  dias_credito: z.number().int().min(0).max(365),
  notas: texto(500),
  contacto: texto(200).optional(),
  moneda: z.string().trim().max(3).optional(),
  tasa_cambio: z.number().min(0).max(100_000).optional(),
  vendedor_id: texto(10).optional(),
  tecnico_id: texto(10).optional(),
  almacen_id: texto(10).optional(),
  sucursal_id: texto(10).optional(),
  departamento_id: texto(10).optional(),
  proyecto_id: texto(10).optional(),
  orden_cliente: texto(10).optional(),
  pedido_id: z.number().int().positive().optional(),
  cotizacion_id: z.number().int().positive().optional(),
  factura_id: z.number().int().positive().optional(),
  motivo_id: z.number().int().min(0).optional(),
  lineas: z
    .array(
      z.object({
        item_id: texto(50).nullable().optional(),
        codigo: texto(50),
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
});

export const guardarDocumento = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => nuevoDocumentoSchema.parse(d))
  .handler(async ({ data }): Promise<Documento> => (await repo()).crearDocumento(data));

export const anularCotizacion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await repo()).anularCotizacion(data.id);
    return { ok: true };
  });

/** Trae las líneas de un pedido o factura para copiarlas al nuevo documento. */
export const lineasDesdePedido = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<LineaFactura[]> =>
    (await repo()).lineasDesdePedido(data.id),
  );
