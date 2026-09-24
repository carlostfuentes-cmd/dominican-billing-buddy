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
    cookie: {
      sameSite: "none" as const,
      secure: true,
      httpOnly: true,
      path: "/",
      // La vista previa vive dentro de un marco de lovable.dev. Los navegadores
      // modernos aíslan estas cookies por sitio superior (CHIPS).
      partitioned: true,
    },
  };
}

// TEMPORAL: inicio de sesión desactivado mientras avanzamos en el desarrollo.
// Para volver a exigir usuario y clave, cambie a `true`.
const EXIGIR_LOGIN = false;

export async function leerSesion(): Promise<Sesion | null> {
  const sesion = await useSession<Datos>(config());
  if (sesion.data.demo) return sesionDemo();
  const id = sesion.data.usuario_id;
  if (id) {
    const actual = await recargarSesion(id);
    if (actual || EXIGIR_LOGIN) return actual;
  }
  if (EXIGIR_LOGIN) return null;
  return sesionSinLogin();
}

/** TEMPORAL: entra como el primer administrador activo (o modo demostración). */
async function sesionSinLogin(): Promise<Sesion> {
  try {
    const { sql } = await import("./mysql.server");
    const filas = await sql<{ user_id: number }>(
      `SELECT u.user_id FROM users u
         JOIN profiles p ON p.profile_id = u.profile_id
        WHERE u.status = 'A' AND p.administrator = 1
        ORDER BY u.user_id LIMIT 1`,
      [],
    );
    const id = filas[0]?.user_id;
    if (id) {
      const s = await recargarSesion(Number(id));
      if (s) return s;
    }
  } catch {
    // sin base de datos: se usa la sesión de demostración
  }
  return sesionDemo();
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
