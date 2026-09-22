import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { auditar } from "@/lib/auditoria.functions";
import type {
  EstadoActual,
  EventoLicencia,
  Licencia,
} from "@/lib/db/licencias.server";
import type { Sesion } from "@/lib/db/usuarios.server";

const repo = () => import("@/lib/db/licencias.server");
const ses = () => import("@/lib/db/sesion.server");

const MENU = "4.51";

async function sesionActiva(): Promise<Sesion> {
  const actual = await (await ses()).leerSesion();
  if (!actual) throw new Error("Debes iniciar sesión");
  return actual;
}

async function exigirAdministrador(): Promise<Sesion> {
  const actual = await sesionActiva();
  if (!actual.administrador)
    throw new Error("Solo un administrador puede administrar el licenciamiento");
  return actual;
}

export const obtenerEstadoLicencia = createServerFn({ method: "GET" }).handler(
  async (): Promise<EstadoActual> => (await repo()).estadoLicencia(),
);

export const revalidarLicencia = createServerFn({ method: "POST" }).handler(
  async (): Promise<EstadoActual> => {
    await sesionActiva();
    return (await repo()).estadoLicencia(true);
  },
);

export const obtenerLicencias = createServerFn({ method: "GET" }).handler(
  async (): Promise<Licencia[]> => {
    await exigirAdministrador();
    return (await repo()).listarLicencias();
  },
);

export const obtenerEventosLicencia = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<EventoLicencia[]> => {
    await exigirAdministrador();
    return (await repo()).eventosLicencia(data.id);
  });

const esquemaLicencia = z.object({
  id: z.number().int().positive().optional(),
  clave: z.string().trim().max(64).optional(),
  cliente: z.string().trim().min(2, "Escribe el nombre del cliente").max(120),
  rnc: z.string().trim().max(20).default(""),
  contacto: z.string().trim().max(160).default(""),
  modalidad: z.enum(["cloud", "local"]),
  plan: z.string().trim().min(1, "Indica el plan").max(40),
  usuarios: z.number().int().min(1, "Indica la cantidad de usuarios").max(10_000),
  vence: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Indica la fecha de vencimiento"),
  estado: z.enum(["A", "S", "V", "C"]),
  notas: z.string().trim().max(255).default(""),
});

export const guardarLicenciaCliente = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => esquemaLicencia.parse(d))
  .handler(async ({ data }): Promise<{ id: number; clave: string }> => {
    const sesion = await exigirAdministrador();
    const r = await repo();
    const guardada = await r.guardarLicencia(data, sesion.login);
    r.limpiarCacheLicencia();
    await auditar({
      menu_id: MENU,
      tipo: data.id ? "E" : "A",
      accion: `${data.id ? "Editó" : "Registró"} la licencia de ${data.cliente}`,
      referencia: guardada.id,
    });
    return guardada;
  });

export const cambiarEstadoLicenciaCliente = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        estado: z.enum(["A", "S", "V", "C"]),
        detalle: z.string().trim().max(200).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const sesion = await exigirAdministrador();
    const r = await repo();
    await r.cambiarEstadoLicencia(data.id, data.estado, sesion.login, data.detalle);
    r.limpiarCacheLicencia();
    await auditar({
      menu_id: MENU,
      tipo: "E",
      accion: `Cambió el estado de la licencia a ${data.estado}`,
      referencia: data.id,
    });
    return { ok: true };
  });

export const renovarLicenciaCliente = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        vence: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Indica el nuevo vencimiento"),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const sesion = await exigirAdministrador();
    const r = await repo();
    await r.renovarLicencia(data.id, data.vence, sesion.login);
    r.limpiarCacheLicencia();
    await auditar({
      menu_id: MENU,
      tipo: "E",
      accion: `Renovó la licencia hasta ${data.vence}`,
      referencia: data.id,
    });
    return { ok: true };
  });
