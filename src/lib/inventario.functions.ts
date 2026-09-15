import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type {
  ExistenciaInventario,
  ListasInventario,
  MovimientoInventario,
} from "@/lib/erp-types";

const repo = () => import("@/lib/db/inventario.server");

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const texto = (max: number) => z.string().trim().max(max);

const filtroSchema = z.object({
  desde: fecha.optional(),
  hasta: fecha.optional(),
  productoId: texto(50).optional(),
  almacenId: texto(10).optional(),
  operacionId: z.number().int().min(0).optional(),
});

export const obtenerListasInventario = createServerFn({ method: "GET" }).handler(
  async (): Promise<ListasInventario> => (await repo()).listasInventario(),
);

export const obtenerMovimientosInventario = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => filtroSchema.parse(d))
  .handler(async ({ data }): Promise<MovimientoInventario[]> =>
    (await repo()).listarMovimientosInventario(data),
  );

export const obtenerExistencias = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({ productoId: texto(50).optional(), almacenId: texto(10).optional() })
      .parse(d),
  )
  .handler(async ({ data }): Promise<ExistenciaInventario[]> =>
    (await repo()).existenciasInventario(data.productoId, data.almacenId),
  );

export const obtenerExistenciaProducto = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ productoId: texto(50), almacenId: texto(10) }).parse(d),
  )
  .handler(async ({ data }): Promise<number> =>
    (await repo()).existenciaProducto(data.productoId, data.almacenId),
  );

const movimientoSchema = z.object({
  producto_id: texto(50).min(1, "Selecciona el producto"),
  operacion_id: z.number().int().min(1, "Selecciona la transacción"),
  fecha,
  almacen_id: texto(10).min(1, "Selecciona el almacén"),
  almacen_destino_id: texto(10).optional(),
  ubicacion: texto(20).optional(),
  documento: texto(10).optional(),
  referencia: texto(10).optional(),
  departamento_id: texto(10).optional(),
  cantidad: z.number().min(0.0001, "La cantidad debe ser mayor que cero").max(9_999_999),
  costo_total: z.number().min(0).max(999_999_999),
  costo_unitario: z.number().min(0).max(999_999_999),
  seriales: z.array(texto(50)).max(500).optional(),
  notas: texto(1000).optional(),
});

export const guardarMovimientoInventario = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => movimientoSchema.parse(d))
  .handler(async ({ data }): Promise<{ ids: number[] }> =>
    (await repo()).crearMovimientoInventario(data),
  );

export const anularMovimientoInventario = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.number().int().min(1) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await repo()).anularMovimientoInventario(data.id);
    return { ok: true };
  });
