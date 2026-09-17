import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type {
  FiltroAuditoria,
  ListasAuditoria,
  RegistroAuditoria,
  TipoAuditoria,
} from "@/lib/db/auditoria.server";

const repo = () => import("@/lib/db/auditoria.server");
const ses = () => import("@/lib/db/sesion.server");

/**
 * Anota una operación de cambio en la auditoría, tomando el usuario de la
 * sesión activa. Se usa desde las funciones de servidor que guardan datos.
 */
export async function auditar(entrada: {
  menu_id?: string | null;
  tipo: TipoAuditoria;
  accion: string;
  referencia?: string | number | null;
  cambios?: unknown;
}): Promise<void> {
  try {
    const sesion = await (await ses()).leerSesion();
    if (!sesion || sesion.usuario_id <= 0) return;
    await (await repo()).registrarAuditoria({ ...entrada, usuario_id: sesion.usuario_id });
  } catch (error) {
    console.error("Auditoría no registrada:", error);
  }
}

async function exigirAdministrador(): Promise<void> {
  const sesion = await (await ses()).leerSesion();
  if (!sesion) throw new Error("Debes iniciar sesión");
  if (!sesion.administrador) throw new Error("Solo un administrador puede consultar la auditoría");
}

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

export const obtenerAuditoria = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        desde: fecha.optional(),
        hasta: fecha.optional(),
        usuarioId: z.number().int().positive().optional(),
        menuId: z.string().max(10).optional(),
        tipo: z.string().max(1).optional(),
        referencia: z.string().trim().max(50).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<RegistroAuditoria[]> => {
    await exigirAdministrador();
    return (await repo()).listarAuditoria(data as FiltroAuditoria);
  });

export const obtenerListasAuditoria = createServerFn({ method: "GET" }).handler(
  async (): Promise<ListasAuditoria> => {
    await exigirAdministrador();
    return (await repo()).listasAuditoria();
  },
);
