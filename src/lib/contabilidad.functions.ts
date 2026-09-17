import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type {
  AsientoContable,
  CuentaCatalogo,
  LineaBalance,
  ListasContabilidad,
  MayorGeneral,
} from "@/lib/erp-types";

import { auditar } from "@/lib/auditoria.functions";

const repo = () => import("@/lib/db/contabilidad.server");

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const texto = (max: number) => z.string().trim().max(max);

export const obtenerListasContabilidad = createServerFn({ method: "GET" }).handler(
  async (): Promise<ListasContabilidad> => (await repo()).listasContabilidad(),
);

export const obtenerCatalogo = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ busqueda: texto(60).optional() }).parse(d))
  .handler(async ({ data }): Promise<CuentaCatalogo[]> =>
    (await repo()).listarCatalogo(data.busqueda),
  );

export const obtenerAsientos = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        desde: fecha.optional(),
        hasta: fecha.optional(),
        tipoId: texto(10).optional(),
        estadoId: texto(1).optional(),
        busqueda: texto(60).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<AsientoContable[]> => (await repo()).listarAsientos(data));

export const obtenerAsiento = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.number().int().min(1) }).parse(d))
  .handler(async ({ data }): Promise<AsientoContable | null> =>
    (await repo()).obtenerAsiento(data.id),
  );

export const obtenerMayor = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        cuenta: texto(15),
        desde: fecha.optional(),
        hasta: fecha.optional(),
        departamentoId: texto(10).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<MayorGeneral> => (await repo()).mayorGeneral(data));

export const obtenerBalanceComprobacion = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        desde: fecha.optional(),
        hasta: fecha.optional(),
        departamentoId: texto(10).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<LineaBalance[]> => (await repo()).balanceComprobacion(data));

const asientoSchema = z.object({
  fecha,
  descripcion: texto(255).min(3, "Escribe una descripción del asiento"),
  tipo_id: texto(10).optional(),
  estado_id: texto(1).optional(),
  clase: texto(1).optional(),
  moneda: texto(3).optional(),
  tasa_cambio: z.number().min(0).max(1_000_000).optional(),
  documento: texto(20).optional(),
  lineas: z
    .array(
      z.object({
        cuenta: texto(15),
        departamento_id: texto(10).optional(),
        descripcion: texto(255),
        referencia: texto(50).optional(),
        debito: z.number().min(0).max(999_999_999),
        credito: z.number().min(0).max(999_999_999),
      }),
    )
    .min(2, "El asiento necesita al menos dos líneas"),
});

export const guardarAsiento = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => asientoSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: number; numero: number }> => {
    const r = await (await repo()).crearAsiento(data);
    await auditar({
      menu_id: "2.09.01",
      tipo: "A",
      accion: `Asiento contable No. ${r.numero} (${data.lineas.length} línea(s))`,
      referencia: r.numero,
      cambios: data,
    });
    return r;
  });

const cuentaSchema = z.object({
  cuenta: texto(15).min(1, "El número de cuenta es obligatorio"),
  nombre: texto(150).min(2, "Escribe el nombre de la cuenta"),
  padre: texto(15).optional(),
  clasificacion: texto(30).optional(),
  naturaleza: z.enum(["D", "C"]),
  detalle: z.boolean(),
  moneda: texto(5).optional(),
  status: texto(1).optional(),
});

export const guardarCuenta = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => cuentaSchema.parse(d))
  .handler(async ({ data }): Promise<void> => {
    await (await repo()).guardarCuentaCatalogo(data);
    await auditar({
      menu_id: "2.09.01",
      tipo: "E",
      accion: `Cuenta del catálogo ${data.cuenta} — ${data.nombre}`,
      referencia: data.cuenta,
      cambios: data,
    });
  });

export const eliminarCuenta = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ cuenta: texto(15).min(1) }).parse(d))
  .handler(async ({ data }): Promise<void> => {
    await (await repo()).eliminarCuentaCatalogo(data.cuenta);
    await auditar({
      menu_id: "2.09.01",
      tipo: "B",
      accion: `Eliminó la cuenta del catálogo ${data.cuenta}`,
      referencia: data.cuenta,
    });
  });
