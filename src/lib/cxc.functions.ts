import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type {
  BalanceClienteCxC,
  DocPendienteCxC,
  ListasCxC,
  MovimientoCxC,
} from "@/lib/erp-types";

const repo = () => import("@/lib/db/cxc.server");

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const texto = (max: number) => z.string().trim().max(max);
const monto = z.number().min(0).max(999_999_999);

const filtroSchema = z.object({
  desde: fecha.optional(),
  hasta: fecha.optional(),
  clienteId: texto(20).optional(),
  tipoId: texto(2).optional(),
});

export const obtenerMovimientosCxC = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => filtroSchema.parse(d))
  .handler(async ({ data }): Promise<MovimientoCxC[]> =>
    (await repo()).listarMovimientos(data),
  );

export const obtenerDocumentosPendientes = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ clienteId: texto(20) }).parse(d))
  .handler(async ({ data }): Promise<DocPendienteCxC[]> =>
    (await repo()).documentosPendientes(data.clienteId),
  );

export const obtenerBalancesCxC = createServerFn({ method: "GET" }).handler(
  async (): Promise<BalanceClienteCxC[]> => (await repo()).balancesClientes(),
);

export const obtenerListasCxC = createServerFn({ method: "GET" }).handler(
  async (): Promise<ListasCxC> => (await repo()).listasCxC(),
);

const movimientoSchema = z.object({
  cliente_id: texto(20).min(1, "Cliente requerido"),
  tipo_id: texto(2).min(1, "Tipo de transacción requerido"),
  fecha,
  documento: z.number().int().min(0).optional(),
  sucursal_id: texto(10).optional(),
  vendedor_id: texto(10).optional(),
  moneda: texto(3).min(1),
  tasa_cambio: z.number().min(0).max(100_000),
  monto,
  itbis_retenido: monto,
  anticipo_retenido: monto,
  concepto: texto(300),
  pago_fecha: fecha,
  forma_pago_id: texto(2),
  banco_id: texto(10).optional(),
  pago_numero: texto(20),
  aplicaciones: z
    .array(
      z.object({
        referencia: z.number().int().positive(),
        valor: monto,
        descuento: monto,
      }),
    )
    .max(500),
});

export const guardarMovimientoCxC = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => movimientoSchema.parse(d))
  .handler(async ({ data }): Promise<MovimientoCxC> => (await repo()).crearMovimiento(data));
