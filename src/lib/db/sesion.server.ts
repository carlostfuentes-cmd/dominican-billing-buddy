// Sesión de trabajo: cookie firmada y cifrada con SESSION_SECRET.
import { useSession } from "@tanstack/react-start/server";

import type { Sesion } from "./usuarios.server";

type Datos = { sesion?: Sesion };

function config() {
  const password =
    process.env["SESSION_SECRET"] ??
    process.env["MYSQL_BRIDGE_TOKEN"] ??
    "erp-desarrollo-clave-local-no-usar-en-produccion-000000";
  return {
    password,
    name: "erp_sesion",
    maxAge: 60 * 60 * 12,
    cookie: { sameSite: "lax" as const, httpOnly: true, path: "/" },
  };
}

export async function leerSesion(): Promise<Sesion | null> {
  const sesion = await useSession<Datos>(config());
  return sesion.data.sesion ?? null;
}

export async function escribirSesion(datos: Sesion): Promise<void> {
  const sesion = await useSession<Datos>(config());
  await sesion.update({ sesion: datos });
}

export async function borrarSesion(): Promise<void> {
  const sesion = await useSession<Datos>(config());
  await sesion.clear();
}
