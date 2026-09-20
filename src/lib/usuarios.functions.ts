import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type {
  Perfil,
  PermisoPantalla,
  Sesion,
  Usuario,
} from "@/lib/db/usuarios.server";

import { auditar } from "@/lib/auditoria.functions";

const repo = () => import("@/lib/db/usuarios.server");
const ses = () => import("@/lib/db/sesion.server");

async function sesionActiva(): Promise<Sesion> {
  const actual = await (await ses()).leerSesion();
  if (!actual) throw new Error("Debes iniciar sesión");
  return actual;
}

async function exigirAdministrador(): Promise<Sesion> {
  const actual = await sesionActiva();
  if (!actual.administrador) throw new Error("Solo un administrador puede hacer este cambio");
  return actual;
}

export const obtenerSesion = createServerFn({ method: "GET" }).handler(
  async (): Promise<Sesion | null> => (await ses()).leerSesion(),
);

export const iniciarSesion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        login: z.string().trim().min(1, "Indica tu usuario").max(20),
        clave: z.string().min(1, "Indica tu clave").max(100),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<
    { ok: true; sesion: Sesion } | { ok: false; mensaje: string }
  > => {
    try {
      const sesion = await (await repo()).autenticar(data.login, data.clave);
      if (!sesion) return { ok: false, mensaje: "Usuario o clave incorrectos" };
      await (await ses()).escribirSesion(sesion);
      await auditar({ tipo: "A", accion: `Inicio de sesión de ${sesion.login}` });
      return { ok: true, sesion };
    } catch (error) {
      console.error(
        "No se pudo completar el inicio de sesión:",
        error instanceof Error ? error.message : String(error),
      );
      return {
        ok: false,
        mensaje: "No se pudo conectar con el servidor de datos. Inténtalo de nuevo.",
      };
    }
  });

export const cerrarSesion = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: true }> => {
    await auditar({ tipo: "A", accion: "Cierre de sesión" });
    await (await ses()).borrarSesion();
    return { ok: true };
  },
);

export const cambiarMiClave = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        actual: z.string().min(1, "Indica tu clave actual"),
        nueva: z.string().min(4, "La nueva clave debe tener al menos 4 caracteres").max(100),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const sesion = await sesionActiva();
    const r = await repo();
    if (!(await r.verificarClave(sesion.usuario_id, data.actual)))
      throw new Error("La clave actual no es correcta");
    await r.cambiarClave(sesion.usuario_id, data.nueva);
    await auditar({
      menu_id: "4.01.05",
      tipo: "E",
      accion: `${sesion.login} cambió su propia clave`,
      referencia: sesion.usuario_id,
    });
    return { ok: true };
  });

export const obtenerUsuarios = createServerFn({ method: "GET" }).handler(
  async (): Promise<Usuario[]> => {
    await exigirAdministrador();
    return (await repo()).listarUsuarios();
  },
);

export const obtenerPerfiles = createServerFn({ method: "GET" }).handler(
  async (): Promise<Perfil[]> => {
    await sesionActiva();
    return (await repo()).listarPerfiles();
  },
);

export const obtenerPermisosPerfil = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ perfil_id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<PermisoPantalla[]> => {
    await exigirAdministrador();
    return (await repo()).permisosDePerfil(data.perfil_id);
  });

export const guardarUsuarioSistema = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.number().int().positive().optional(),
        login: z.string().trim().min(1, "Indica el usuario").max(20),
        nombre: z.string().trim().max(30),
        apellido: z.string().trim().max(30),
        email: z.string().trim().max(50).optional(),
        perfil_id: z.number().int().positive(),
        activo: z.boolean(),
        supervisor: z.boolean(),
        descuento_maximo: z.number().min(0).max(100),
        clave: z.string().min(4).max(100).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ id: number }> => {
    await exigirAdministrador();
    const r = await (await repo()).guardarUsuario(data);
    const { clave: _clave, ...sinClave } = data;
    await auditar({
      menu_id: "4.01.05",
      tipo: data.id ? "E" : "A",
      accion: `Usuario: ${data.login} (perfil ${data.perfil_id})${data.clave ? " — clave actualizada" : ""}`,
      referencia: r.id,
      cambios: sinClave,
    });
    return r;
  });

export const guardarPerfilSistema = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.number().int().positive().optional(),
        nombre: z.string().trim().min(1, "Indica el nombre del perfil").max(50),
        activo: z.boolean(),
        administrador: z.boolean(),
        padre: z.number().int().positive().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ id: number }> => {
    await exigirAdministrador();
    const r = await (await repo()).guardarPerfil(data);
    await auditar({
      menu_id: "4.01.03",
      tipo: data.id ? "E" : "A",
      accion: `Perfil: ${data.nombre}`,
      referencia: r.id,
      cambios: data,
    });
    return r;
  });

export const eliminarPerfilSistema = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ perfil_id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await exigirAdministrador();
    await (await repo()).eliminarPerfil(data.perfil_id);
    await auditar({
      menu_id: "4.01.03",
      tipo: "B",
      accion: `Eliminó el perfil No. ${data.perfil_id}`,
      referencia: data.perfil_id,
    });
    return { ok: true };
  });

export const guardarPermisos = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        perfil_id: z.number().int().positive(),
        permisos: z
          .array(
            z.object({
              menu_id: z.string().min(1).max(10),
              agregar: z.boolean(),
              editar: z.boolean(),
              eliminar: z.boolean(),
              buscar: z.boolean(),
              imprimir: z.boolean(),
              exportar: z.boolean(),
            }),
          )
          .max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await exigirAdministrador();
    await (await repo()).guardarPermisosPerfil(data.perfil_id, data.permisos);
    await auditar({
      menu_id: "4.01.03",
      tipo: "E",
      accion: `Cambió los permisos del perfil No. ${data.perfil_id}`,
      referencia: data.perfil_id,
      cambios: data.permisos,
    });
    return { ok: true };
  });
