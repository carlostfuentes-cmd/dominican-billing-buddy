import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { CampoPersonalizado, ProcesoCampo, ValorCampo } from "@/lib/db/campos.server";

const repo = () => import("@/lib/db/campos.server");

const proceso = z.enum(["PEDIDOS", "COTIZACIONES", "CONDUCES", "DEVOLUCIONES"]);
const tipo = z.enum(["CARACTER", "PARRAFO", "ENTERO", "DECIMAL", "FECHA"]);

export const obtenerCampos = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ proceso: proceso.optional() }).parse(d))
  .handler(async ({ data }): Promise<CampoPersonalizado[]> =>
    (await repo()).listarCampos(data.proceso as ProcesoCampo | undefined),
  );

export const obtenerValoresCampos = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ proceso, referencia: z.string().trim().max(15) }).parse(d),
  )
  .handler(async ({ data }): Promise<ValorCampo[]> =>
    (await repo()).valoresDocumento(data.proceso as ProcesoCampo, data.referencia),
  );

export const guardarCampoPersonalizado = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.number().int().positive().optional(),
        nombre: z.string().trim().min(1, "Indica el nombre del campo").max(50),
        tipo,
        longitud: z.number().int().min(0).max(999),
        decimales: z.number().int().min(0).max(9),
        proceso,
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ id: number }> => ({
    id: await (await repo()).guardarCampo({
      ...(data.id ? { id: data.id } : {}),
      nombre: data.nombre,
      tipo: data.tipo,
      longitud: data.longitud,
      decimales: data.decimales,
      proceso: data.proceso as ProcesoCampo,
    }),
  }));

export const eliminarCampoPersonalizado = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await repo()).eliminarCampo(data.id);
    return { ok: true };
  });

export const guardarValoresCampos = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        proceso,
        referencia: z.string().trim().min(1).max(15),
        valores: z
          .array(
            z.object({
              campo_id: z.number().int().positive(),
              valor: z.string().max(2000),
            }),
          )
          .max(50),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await repo()).guardarValores(
      data.proceso as ProcesoCampo,
      data.referencia,
      data.valores,
    );
    return { ok: true };
  });
