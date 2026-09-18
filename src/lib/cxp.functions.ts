import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { auditar } from "@/lib/auditoria.functions";
import type {
  BalanceSuplidorCxP,
  FiltroCxP,
  LineaAsiento,
  MovimientoCxP,
  NuevaFacturaSuplidor,
} from "@/lib/erp-types";

const repo = () => import("@/lib/db/cxp.server");

const texto = (max: number) => z.string().trim().max(max);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

const lineaAsiento = z.object({
  cuenta: texto(15),
  cuenta_nombre: texto(60).optional(),
  departamento_id: texto(10).optional(),
  descripcion: texto(200),
  referencia: texto(50).optional(),
  debito: z.number().min(0).max(999_999_999),
  credito: z.number().min(0).max(999_999_999),
});

const facturaSchema = z.object({
  numero: texto(15),
  ncf: texto(19),
  fecha,
  vencimiento: fecha.or(z.literal("")),
  dias_credito: z.number().int().min(0).max(365).default(0),
  moneda: texto(3),
  tasa_cambio: z.number().min(0).max(100_000),
  comprobante_id: texto(2),
  gasto_id: texto(2),
  forma_pago_id: texto(2),
  bienes: z.number().min(0),
  servicios: z.number().min(0),
  propina: z.number().min(0),
  isc: z.number().min(0),
  otros_impuestos: z.number().min(0),
  itbis: z.number().min(0),
  itbis_retenido: z.number().min(0),
  isr_id: texto(5),
  isr_retenido: z.number().min(0),
  itbis_costo: z.number().min(0),
  itbis_proporcional: z.number().min(0),
  conduce: z.boolean(),
  informal: z.boolean(),
  gasto_menor: z.boolean(),
  sucursal_id: texto(5),
  uso: texto(200),
  notas: texto(200),
});

const nuevaFacturaSchema = z.object({
  suplidor_id: texto(10).min(1, "Selecciona el suplidor"),
  tipo_id: texto(2).default("I"),
  factura: facturaSchema,
  orden_id: z.number().int().positive().optional(),
  asiento: z.array(lineaAsiento).max(100).optional(),
});

const filtroSchema = z.object({
  desde: fecha.optional(),
  hasta: fecha.optional(),
  suplidorId: texto(10).optional(),
  tipoId: texto(2).optional(),
  ncf: texto(19).optional(),
});

export const obtenerMovimientosCxP = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => filtroSchema.parse(d ?? {}))
  .handler(
    async ({ data }): Promise<MovimientoCxP[]> =>
      (await repo()).listarMovimientosCxP(data as FiltroCxP),
  );

export const obtenerBalancesSuplidores = createServerFn({ method: "GET" }).handler(
  async (): Promise<BalanceSuplidorCxP[]> => (await repo()).balancesSuplidores(),
);

export const obtenerPendientesCxP = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ suplidorId: texto(10) }).parse(d))
  .handler(async ({ data }) => (await repo()).documentosPendientesCxP(data.suplidorId));

export const obtenerMovimientoCxP = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }) => (await repo()).obtenerMovimientoCxP(data.id));

export const obtenerAsientoFacturaSuplidor = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        suplidor_id: texto(10),
        bienes: z.number().min(0),
        servicios: z.number().min(0),
        propina: z.number().min(0).default(0),
        isc: z.number().min(0).default(0),
        otros_impuestos: z.number().min(0).default(0),
        itbis: z.number().min(0).default(0),
        itbis_costo: z.number().min(0).default(0),
        itbis_retenido: z.number().min(0).default(0),
        isr_retenido: z.number().min(0).default(0),
        cuenta_gasto: texto(15).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ lineas: LineaAsiento[]; advertencias: string[] }> => {
    const { propuestaFacturaSuplidor } = await import("@/lib/db/cuentas.server");
    return propuestaFacturaSuplidor(data);
  });

export const guardarFacturaSuplidor = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => nuevaFacturaSchema.parse(d))
  .handler(async ({ data }) => {
    const res = await (await repo()).crearFacturaSuplidor(data as NuevaFacturaSuplidor);
    await auditar({
      menu_id: "2.04.07",
      tipo: "A",
      accion: `Factura de suplidor ${res.documento} | NCF: ${data.factura.ncf} | Total: ${res.total}`,
      referencia: res.ap_id,
      cambios: data,
    });
    return res;
  });
