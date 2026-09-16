// Usuarios, perfiles y permisos sobre las tablas existentes del sistema:
// users (usuarios), profiles (perfiles, con herencia vía parent) y
// profiles_menues (menús y acciones permitidas por perfil). No se crean tablas.

import { createHash } from "node:crypto";

import { PANTALLAS, type AccionPantalla } from "@/lib/pantallas";

import { ejecutar, mysqlActivo, sql } from "./mysql.server";

export type Perfil = {
  id: number;
  nombre: string;
  activo: boolean;
  administrador: boolean;
  padre: number | null;
  empresa_id: number;
};

export type Usuario = {
  id: number;
  login: string;
  nombre: string;
  apellido: string;
  activo: boolean;
  supervisor: boolean;
  perfil_id: number | null;
  perfil_nombre: string | null;
  email: string | null;
  descuento_maximo: number;
  ultimo_acceso: string | null;
};

export type PermisoPantalla = {
  menu_id: string;
  agregar: boolean;
  editar: boolean;
  eliminar: boolean;
  buscar: boolean;
  imprimir: boolean;
  exportar: boolean;
};

export type Sesion = {
  usuario_id: number;
  login: string;
  nombre: string;
  perfil_id: number | null;
  perfil_nombre: string | null;
  administrador: boolean;
  supervisor: boolean;
  permisos: PermisoPantalla[];
};

const md5 = (texto: string) => createHash("md5").update(texto, "utf8").digest("hex");

const bool = (v: unknown) => Number(v ?? 0) === 1;

const TODAS: Omit<PermisoPantalla, "menu_id"> = {
  agregar: true,
  editar: true,
  eliminar: true,
  buscar: true,
  imprimir: true,
  exportar: true,
};

function permisosDemo(): PermisoPantalla[] {
  return PANTALLAS.map((p) => ({ menu_id: p.menu_id, ...TODAS }));
}

export function sesionDemo(): Sesion {
  return {
    usuario_id: 0,
    login: "demo",
    nombre: "Usuario de demostración",
    perfil_id: null,
    perfil_nombre: "DEMOSTRACIÓN",
    administrador: true,
    supervisor: true,
    permisos: permisosDemo(),
  };
}

type FilaPerfil = {
  profile_id: number;
  name: string | null;
  status: string;
  administrator: number;
  parent: number | null;
  company_id: number;
};

const mapearPerfil = (f: FilaPerfil): Perfil => ({
  id: Number(f.profile_id),
  nombre: f.name ?? "",
  activo: f.status === "A",
  administrador: bool(f.administrator),
  padre: f.parent === null ? null : Number(f.parent),
  empresa_id: Number(f.company_id ?? 0),
});

export async function listarPerfiles(): Promise<Perfil[]> {
  if (!(await mysqlActivo())) return [];
  const filas = await sql<FilaPerfil>(
    "SELECT profile_id, name, status, administrator, parent, company_id FROM profiles ORDER BY name",
  );
  return filas.map(mapearPerfil);
}

type FilaUsuario = {
  user_id: number;
  login: string | null;
  first_name: string | null;
  last_name: string | null;
  status: string | null;
  is_supervisor: number | null;
  profile_id: number | null;
  perfil: string | null;
  main_email: string | null;
  max_discount: number | null;
  last_login: string | null;
  password2?: string | null;
  administrator?: number | null;
};

export async function listarUsuarios(): Promise<Usuario[]> {
  if (!(await mysqlActivo())) return [];
  const filas = await sql<FilaUsuario>(
    `SELECT u.user_id, u.login, u.first_name, u.last_name, u.status, u.is_supervisor,
            u.profile_id, p.name AS perfil, u.main_email, u.max_discount, u.last_login
       FROM users u
       LEFT JOIN profiles p ON p.profile_id = u.profile_id
      ORDER BY u.login`,
  );
  return filas.map((f) => ({
    id: Number(f.user_id),
    login: String(f.login ?? ""),
    nombre: String(f.first_name ?? ""),
    apellido: String(f.last_name ?? ""),
    activo: f.status === "A",
    supervisor: bool(f.is_supervisor),
    perfil_id: f.profile_id === null ? null : Number(f.profile_id),
    perfil_nombre: f.perfil === null ? null : String(f.perfil),
    email: f.main_email === null ? null : String(f.main_email),
    descuento_maximo: Number(f.max_discount ?? 0),
    ultimo_acceso:
      f.last_login && String(f.last_login).slice(0, 4) !== "0000"
        ? String(f.last_login).slice(0, 19).replace("T", " ")
        : null,
  }));
}

/** Cadena de perfiles: el perfil y todos los perfiles de los que hereda. */
async function cadenaPerfiles(perfilId: number): Promise<Perfil[]> {
  const cadena: Perfil[] = [];
  let actual: number | null = perfilId;
  // eslint-disable-next-line
  const vistos = new Set<number>();
  while (actual && !vistos.has(actual)) {
    vistos.add(actual);
    const filas: FilaPerfil[] = await sql<FilaPerfil>(
      "SELECT profile_id, name, status, administrator, parent, company_id FROM profiles WHERE profile_id = ? LIMIT 1",
      [actual],
    );
    const primera = filas[0];
    const perfil: Perfil | null = primera ? mapearPerfil(primera) : null;
    if (!perfil) break;
    cadena.push(perfil);
    actual = perfil.padre;
  }
  return cadena;
}

export async function permisosDePerfil(perfilId: number): Promise<PermisoPantalla[]> {
  if (!(await mysqlActivo())) return [];
  const filas = await sql<{
    menu_id: string;
    action_add: number;
    action_edit: number;
    action_delete: number;
    action_search: number;
    action_print: number;
    action_export: number;
  }>(
    `SELECT menu_id, action_add, action_edit, action_delete, action_search, action_print, action_export
       FROM profiles_menues WHERE profile_id = ?`,
    [perfilId],
  );
  return filas.map((f) => ({
    menu_id: String(f.menu_id ?? ""),
    agregar: bool(f.action_add),
    editar: bool(f.action_edit),
    eliminar: bool(f.action_delete),
    buscar: bool(f.action_search),
    imprimir: bool(f.action_print),
    exportar: bool(f.action_export),
  }));
}

/** Permisos efectivos: los del perfil y los heredados de sus perfiles padre. */
async function permisosEfectivos(perfilId: number): Promise<PermisoPantalla[]> {
  const cadena = await cadenaPerfiles(perfilId);
  const mapa = new Map<string, PermisoPantalla>();
  for (const perfil of cadena) {
    for (const permiso of await permisosDePerfil(perfil.id)) {
      const previo = mapa.get(permiso.menu_id);
      mapa.set(
        permiso.menu_id,
        previo
          ? {
              menu_id: permiso.menu_id,
              agregar: previo.agregar || permiso.agregar,
              editar: previo.editar || permiso.editar,
              eliminar: previo.eliminar || permiso.eliminar,
              buscar: previo.buscar || permiso.buscar,
              imprimir: previo.imprimir || permiso.imprimir,
              exportar: previo.exportar || permiso.exportar,
            }
          : permiso,
      );
    }
  }
  return [...mapa.values()];
}

export async function autenticar(login: string, clave: string): Promise<Sesion | null> {
  if (!(await mysqlActivo())) {
    return login.trim().length > 0 ? sesionDemo() : null;
  }
  const filas = await sql<FilaUsuario>(
    `SELECT u.user_id, u.login, u.first_name, u.last_name, u.status, u.is_supervisor,
            u.password2, u.profile_id, p.name AS perfil, p.administrator, p.status AS perfil_status
       FROM users u
       LEFT JOIN profiles p ON p.profile_id = u.profile_id
      WHERE u.login = ? LIMIT 1`,
    [login.trim()],
  );
  const fila = filas[0];
  if (!fila) return null;
  if (fila.status !== "A") throw new Error("El usuario está inactivo. Contacta al administrador.");
  const guardada = String(fila.password2 ?? "").toLowerCase();
  if (!guardada || guardada !== md5(clave)) return null;

  const perfilId = fila.profile_id === null ? null : Number(fila.profile_id);
  const administrador = bool(fila.administrator);
  const permisos = perfilId ? await permisosEfectivos(perfilId) : [];

  await ejecutar("UPDATE users SET last_login = NOW() WHERE user_id = ?", [
    Number(fila.user_id),
  ]).catch(() => undefined);

  return {
    usuario_id: Number(fila.user_id),
    login: String(fila.login ?? ""),
    nombre: `${String(fila.first_name ?? "")} ${String(fila.last_name ?? "")}`.trim() ||
      String(fila.login ?? ""),
    perfil_id: perfilId,
    perfil_nombre: fila.perfil === null ? null : String(fila.perfil),
    administrador,
    supervisor: bool(fila.is_supervisor),
    permisos: administrador ? permisosDemo() : permisos,
  };
}

export async function recargarSesion(usuarioId: number): Promise<Sesion | null> {
  if (!(await mysqlActivo())) return sesionDemo();
  const filas = await sql<FilaUsuario>(
    `SELECT u.user_id, u.login, u.first_name, u.last_name, u.status, u.is_supervisor,
            u.profile_id, p.name AS perfil, p.administrator
       FROM users u
       LEFT JOIN profiles p ON p.profile_id = u.profile_id
      WHERE u.user_id = ? LIMIT 1`,
    [usuarioId],
  );
  const fila = filas[0];
  if (!fila || fila.status !== "A") return null;
  const perfilId = fila.profile_id === null ? null : Number(fila.profile_id);
  const administrador = bool(fila.administrator);
  return {
    usuario_id: Number(fila.user_id),
    login: String(fila.login ?? ""),
    nombre: `${String(fila.first_name ?? "")} ${String(fila.last_name ?? "")}`.trim() ||
      String(fila.login ?? ""),
    perfil_id: perfilId,
    perfil_nombre: fila.perfil === null ? null : String(fila.perfil),
    administrador,
    supervisor: bool(fila.is_supervisor),
    permisos: administrador ? permisosDemo() : perfilId ? await permisosEfectivos(perfilId) : [],
  };
}

export type NuevoUsuario = {
  id?: number | undefined;
  login: string;
  nombre: string;
  apellido: string;
  email?: string | undefined;
  perfil_id: number;
  activo: boolean;
  supervisor: boolean;
  descuento_maximo: number;
  clave?: string | undefined;
};

export async function guardarUsuario(entrada: NuevoUsuario): Promise<{ id: number }> {
  if (!(await mysqlActivo())) throw new Error("Sin conexión a la base de datos");
  const estado = entrada.activo ? "A" : "I";
  if (entrada.id) {
    await ejecutar(
      `UPDATE users SET login = ?, first_name = ?, last_name = ?, main_email = ?, profile_id = ?,
              status = ?, is_supervisor = ?, max_discount = ? WHERE user_id = ?`,
      [
        entrada.login,
        entrada.nombre,
        entrada.apellido,
        entrada.email ?? null,
        entrada.perfil_id,
        estado,
        entrada.supervisor ? 1 : 0,
        entrada.descuento_maximo,
        entrada.id,
      ],
    );
    if (entrada.clave) await cambiarClave(entrada.id, entrada.clave);
    return { id: entrada.id };
  }

  if (!entrada.clave) throw new Error("Indica la clave del nuevo usuario");
  const repetido = await sql<{ n: number }>("SELECT COUNT(*) n FROM users WHERE login = ?", [
    entrada.login,
  ]);
  if (Number(repetido[0]?.n ?? 0) > 0) throw new Error("Ese nombre de usuario ya existe");

  const max = await sql<{ m: number | null }>("SELECT MAX(user_id) m FROM users");
  const id = Number(max[0]?.m ?? 0) + 1;
  await ejecutar(
    `INSERT INTO users (user_id, login, first_name, last_name, password, password2, policy,
        language, main_email, birthdate, status, is_supervisor, profile_id, max_discount, mail_html)
     VALUES (?, ?, ?, ?, '', ?, 0, 'SP', ?, ?, ?, ?, ?, 0)`,
    [
      id,
      entrada.login,
      entrada.nombre,
      entrada.apellido,
      md5(entrada.clave),
      entrada.email ?? null,
      "1900-01-01",
      estado,
      entrada.supervisor ? 1 : 0,
      entrada.perfil_id,
      entrada.descuento_maximo,
    ],
  );
  return { id };
}

export async function cambiarClave(usuarioId: number, clave: string): Promise<void> {
  if (!(await mysqlActivo())) throw new Error("Sin conexión a la base de datos");
  await ejecutar("UPDATE users SET password2 = ?, password = '' WHERE user_id = ?", [
    md5(clave),
    usuarioId,
  ]);
}

export async function verificarClave(usuarioId: number, clave: string): Promise<boolean> {
  if (!(await mysqlActivo())) return true;
  const filas = await sql<{ password2: string | null }>(
    "SELECT password2 FROM users WHERE user_id = ? LIMIT 1",
    [usuarioId],
  );
  return String(filas[0]?.password2 ?? "").toLowerCase() === md5(clave);
}

export type NuevoPerfil = {
  id?: number | undefined;
  nombre: string;
  activo: boolean;
  administrador: boolean;
  padre: number | null;
  empresa_id?: number | undefined;
};

export async function guardarPerfil(entrada: NuevoPerfil): Promise<{ id: number }> {
  if (!(await mysqlActivo())) throw new Error("Sin conexión a la base de datos");
  const estado = entrada.activo ? "A" : "I";
  if (entrada.id) {
    await ejecutar(
      "UPDATE profiles SET name = ?, status = ?, administrator = ?, parent = ? WHERE profile_id = ?",
      [entrada.nombre, estado, entrada.administrador ? 1 : 0, entrada.padre, entrada.id],
    );
    return { id: entrada.id };
  }
  const max = await sql<{ m: number | null }>("SELECT MAX(profile_id) m FROM profiles");
  const id = Number(max[0]?.m ?? 0) + 1;
  const empresa =
    entrada.empresa_id ??
    Number(
      (await sql<{ c: number | null }>("SELECT MIN(company_id) c FROM profiles"))[0]?.c ?? 1,
    );
  await ejecutar(
    "INSERT INTO profiles (profile_id, name, status, administrator, parent, company_id) VALUES (?, ?, ?, ?, ?, ?)",
    [id, entrada.nombre, estado, entrada.administrador ? 1 : 0, entrada.padre, empresa],
  );
  return { id };
}

export async function eliminarPerfil(perfilId: number): Promise<void> {
  if (!(await mysqlActivo())) throw new Error("Sin conexión a la base de datos");
  const usados = await sql<{ n: number }>("SELECT COUNT(*) n FROM users WHERE profile_id = ?", [
    perfilId,
  ]);
  if (Number(usados[0]?.n ?? 0) > 0)
    throw new Error("Hay usuarios con ese perfil. Cámbialos antes de eliminarlo.");
  await ejecutar("DELETE FROM profiles_menues WHERE profile_id = ?", [perfilId]);
  await ejecutar("DELETE FROM profiles WHERE profile_id = ?", [perfilId]);
}

export type PermisoEntrada = {
  menu_id: string;
  agregar: boolean;
  editar: boolean;
  eliminar: boolean;
  buscar: boolean;
  imprimir: boolean;
  exportar: boolean;
};

/** Reemplaza los permisos del perfil para los menús de la aplicación web. */
export async function guardarPermisosPerfil(
  perfilId: number,
  permisos: PermisoEntrada[],
): Promise<void> {
  if (!(await mysqlActivo())) throw new Error("Sin conexión a la base de datos");
  const menus = [...new Set(PANTALLAS.map((p) => p.menu_id))];
  if (menus.length === 0) return;
  const marcas = menus.map(() => "?").join(",");
  await ejecutar(
    `DELETE FROM profiles_menues WHERE profile_id = ? AND menu_id IN (${marcas})`,
    [perfilId, ...menus],
  );
  const max = await sql<{ m: number | null }>("SELECT MAX(id) m FROM profiles_menues");
  let id = Number(max[0]?.m ?? 0);
  for (const permiso of permisos) {
    if (!menus.includes(permiso.menu_id)) continue;
    id += 1;
    await ejecutar(
      `INSERT INTO profiles_menues (id, action_add, action_edit, action_delete, action_search,
          action_print, action_export, in_toolbar, menu_id, profile_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        id,
        permiso.agregar ? 1 : 0,
        permiso.editar ? 1 : 0,
        permiso.eliminar ? 1 : 0,
        permiso.buscar ? 1 : 0,
        permiso.imprimir ? 1 : 0,
        permiso.exportar ? 1 : 0,
        permiso.menu_id,
        perfilId,
      ],
    );
  }
}

export function tienePermiso(
  sesion: Sesion | null,
  menu_id: string,
  accion?: AccionPantalla,
): boolean {
  if (!sesion) return false;
  if (sesion.administrador) return true;
  const permiso = sesion.permisos.find((p) => p.menu_id === menu_id);
  if (!permiso) return false;
  if (!accion) return true;
  return permiso[accion];
}
