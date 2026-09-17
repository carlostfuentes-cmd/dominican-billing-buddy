// Sesión de trabajo: cookie firmada y cifrada con SESSION_SECRET.
// En la cookie solo se guarda el identificador del usuario; el perfil y los
// permisos se leen de la base en cada petición para que un cambio de permisos
// tenga efecto de inmediato.
import { useSession } from "@tanstack/react-start/server";

import { recargarSesion, sesionDemo, type Sesion } from "./usuarios.server";

type Datos = { usuario_id?: number; demo?: boolean };

function config() {
  const password =
    process.env["SESSION_SECRET"] ??
    process.env["MYSQL_BRIDGE_TOKEN"] ??
    "erp-desarrollo-clave-local-no-usar-en-produccion-000000";
  return {
    password,
    name: "erp_sesion",
    maxAge: 60 * 60 * 12,
    // La vista previa se muestra dentro de un marco de otro dominio: la cookie
    // necesita SameSite=None y Secure para que el navegador la conserve.
    cookie: { sameSite: "none" as const, secure: true, httpOnly: true, path: "/" },
  };
}

export async function leerSesion(): Promise<Sesion | null> {
  const sesion = await useSession<Datos>(config());
  if (sesion.data.demo) return sesionDemo();
  const id = sesion.data.usuario_id;
  if (!id) return null;
  return recargarSesion(id);
}

export async function escribirSesion(datos: Sesion): Promise<void> {
  const sesion = await useSession<Datos>(config());
  await sesion.update(
    datos.usuario_id > 0 ? { usuario_id: datos.usuario_id, demo: false } : { demo: true },
  );
}

export async function borrarSesion(): Promise<void> {
  const sesion = await useSession<Datos>(config());
  await sesion.clear();
}
