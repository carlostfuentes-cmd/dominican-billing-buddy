import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { PropuestaAsiento } from "@/lib/erp-types";

const repo = () => import("@/lib/db/cuentas.server");

const texto = (max: number) => z.string().trim().max(max);

const pedidoSchema = z.object({
  cliente_id: texto(50),
  moneda: texto(3).optional(),
  tasa_cambio: z.number().min(0).max(9999).optional(),
  lineas: z
    .array(
      z.object({
        producto_id: texto(50),
        cantidad: z.number().min(0).max(9_999_999),
        precio: z.number().min(0).max(999_999_999),
        descuento: z.number().min(0).max(999_999_999),
        itbis: z.number().min(0).max(999_999_999),
      }),
    )
    .max(500),
});

const inventarioSchema = z.object({
  operacion_id: z.number().int().min(0),
  lineas: z
    .array(
      z.object({
        producto_id: texto(50),
        cantidad: z.number().min(0).max(9_999_999),
        costo_total: z.number().min(0).max(999_999_999),
      }),
    )
    .max(500),
});

/** Cuentas propuestas para una venta según la clasificación de inventario. */
export const obtenerPropuestaPedido = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pedidoSchema.parse(d))
  .handler(async ({ data }): Promise<PropuestaAsiento> => (await repo()).propuestaPedido(data));

/** Cuentas propuestas para un documento de inventario. */
export const obtenerPropuestaInventario = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inventarioSchema.parse(d))
  .handler(async ({ data }): Promise<PropuestaAsiento> =>
    (await repo()).propuestaInventario(data),
  );
