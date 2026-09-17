import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type {
  FacturaAcreditable,
  NotaCredito,
  PropuestaAsiento,
} from "@/lib/erp-types";

import { auditar } from "@/lib/auditoria.functions";

const repo = () => import("@/lib/db/notascredito.server");
const cuentas = () => import("@/lib/db/cuentas.server");

const MENU = "2.01.04";
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const texto = (max: number) => z.string().trim().max(max);

const lineaAsientoSchema = z.object({
  cuenta: texto(15),
  cuenta_nombre: texto(100).optional(),
  departamento_id: texto(10).optional(),
  descripcion: texto(200),
  referencia: texto(50).optional(),
  debito: z.number().min(0).max(999_999_999),
  credito: z.number().min(0).max(999_999_999),
});

const filtroSchema = z.object({
  desde: fecha.optional(),
  hasta: fecha.optional(),
  clienteId: texto(20).optional(),
  pedidoId: z.number().int().positive().optional(),
});

export const obtenerNotasCredito = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => filtroSchema.parse(d))
  .handler(async ({ data }): Promise<NotaCredito[]> => (await repo()).listarNotasCredito(data));

export const obtenerNotaCredito = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<NotaCredito | null> =>
    (await repo()).obtenerNotaCredito(data.id),
  );

/** Factura con su disponible y las cantidades ya acreditadas. */
export const obtenerFacturaAcreditable = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ pedidoId: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<FacturaAcreditable | null> =>
    (await repo()).facturaAcreditable(data.pedidoId),
  );

const nuevaSchema = z.object({
  pedido_id: z.number().int().positive(),
  fecha,
  motivo_id: z.number().int().min(0).optional(),
  notas: texto(500),
  reponer_inventario: z.boolean().optional().default(true),
  almacen_id: texto(10).optional(),
  lineas: z
    .array(
      z.object({
        item_id: texto(50).nullable().optional(),
        codigo: texto(50),
        descripcion: texto(200).min(1, "Descripción requerida"),
        cantidad: z.number().positive().max(1_000_000),
        precio: z.number().min(0).max(99_999_999),
        descuento_pct: z.number().min(0).max(100),
        tasa_itbis: z.number().refine((v) => [0, 16, 18].includes(v), "Tasa inválida"),
      }),
    )
    .min(1, "Agrega al menos una línea"),
  asiento: z.array(lineaAsientoSchema).max(100).optional(),
});

export const guardarNotaCredito = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => nuevaSchema.parse(d))
  .handler(async ({ data }): Promise<NotaCredito> => {
    const nota = await (await repo()).crearNotaCredito(data);
    await auditar({
      menu_id: MENU,
      tipo: "A",
      accion: `Nota de crédito ${nota.ncf} s/factura ${nota.factura_ncf ?? ""} — ${nota.cliente_nombre}`,
      referencia: nota.id,
      cambios: data,
    });
    return nota;
  });

export const anularNotaCredito = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: z.number().int().positive(), motivo: texto(200).optional() }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await repo()).anularNotaCredito(data.id, data.motivo ?? "");
    await auditar({
      menu_id: MENU,
      tipo: "X",
      accion: `Anuló la nota de crédito ${data.id}${data.motivo ? ` — ${data.motivo}` : ""}`,
      referencia: data.id,
    });
    return { ok: true };
  });

/** Cuentas propuestas para la nota de crédito según la clasificación del producto. */
export const obtenerPropuestaNotaCredito = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        cliente_id: texto(50),
        moneda: texto(3).optional(),
        tasa_cambio: z.number().min(0).max(9999).optional(),
        reponer_inventario: z.boolean().optional(),
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
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<PropuestaAsiento> =>
    (await cuentas()).propuestaNotaCredito(data),
  );
