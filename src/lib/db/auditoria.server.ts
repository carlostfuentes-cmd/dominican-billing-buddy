// Auditoría de operaciones sobre la tabla existente `audit`.
// Se conserva el histórico del sistema actual y se añaden los movimientos de la
// aplicación web. Solo se registran cambios (agregar, editar, eliminar, anular)
// y el inicio y cierre de sesión.

import { PANTALLAS } from "@/lib/pantallas";

import { ejecutar, mysqlActivo, sql } from "./mysql.server";

export type TipoAuditoria = "A" | "E" | "B" | "X" | "V" | "P";

export const TIPOS_AUDITORIA: Record<TipoAuditoria, string> = {
  A: "Agregar",
  E: "Editar",
  B: "Borrar",
  X: "Anular",
  V: "Consultar",
  P: "Imprimir",
};

export type RegistroAuditoria = {
  id: number;
  fecha: string;
  usuario_id: number;
  usuario: string;
  pantalla: string;
  menu_id: string | null;
  tipo: string;
  tipo_nombre: string;
  accion: string;
  referencia: string | null;
  cambios: string | null;
  ip: string | null;
  equipo: string | null;
  origen: string | null;
};

export type FiltroAuditoria = {
  desde?: string;
  hasta?: string;
  usuarioId?: number;
  menuId?: string;
  tipo?: string;
  referencia?: string;
};

export type ListasAuditoria = {
  usuarios: { id: number; nombre: string }[];
  pantallas: { menu_id: string; titulo: string }[];
  tipos: { id: string; nombre: string }[];
};

const ORIGEN = "WEB";
const VERSION = "web-1.0";

const txt = (v: unknown) => (v === null || v === undefined ? null : String(v));

/** Resumen legible de los datos guardados, para el campo de cambios. */
export function describirCambios(datos: unknown, antes?: unknown): string {
  const limpio = (v: unknown) => JSON.stringify(v, null, 1) ?? "";
  const cuerpo = antes === undefined ? limpio(datos) : `ANTES:\n${limpio(antes)}\n\nDESPUÉS:\n${limpio(datos)}`;
  return cuerpo.length > 60000 ? `${cuerpo.slice(0, 60000)}…` : cuerpo;
}

async function ipActual(): Promise<string> {
  try {
    const { getRequestIP } = await import("@tanstack/react-start/server");
    return getRequestIP({ xForwardedFor: true }) ?? "";
  } catch {
    return "";
  }
}

export type EntradaAuditoria = {
  menu_id?: string | null;
  tipo: TipoAuditoria;
  accion: string;
  referencia?: string | number | null;
  cambios?: unknown;
  usuario_id: number;
  ip?: string;
  equipo?: string;
};

/** Anota una operación. Nunca interrumpe el flujo del usuario si falla. */
export async function registrarAuditoria(entrada: EntradaAuditoria): Promise<void> {
  try {
    if (!(await mysqlActivo())) return;
    if (!entrada.usuario_id || entrada.usuario_id <= 0) return;
    const cambios =
      entrada.cambios === undefined || entrada.cambios === null
        ? null
        : typeof entrada.cambios === "string"
          ? entrada.cambios
          : describirCambios(entrada.cambios);
    await ejecutar(
      `INSERT INTO audit
         (date, menu_id, version, app, kind, accion, \`changes\`, reference, action, ip, computer_name, user_id)
       VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?)`,
      [
        entrada.menu_id ?? null,
        VERSION,
        ORIGEN,
        entrada.tipo,
        entrada.accion.slice(0, 500),
        cambios,
        entrada.referencia === null || entrada.referencia === undefined
          ? null
          : String(entrada.referencia).slice(0, 50),
        (entrada.ip ?? ipActual()).slice(0, 15),
        (entrada.equipo ?? ORIGEN).slice(0, 25),
        entrada.usuario_id,
      ],
    );
  } catch (error) {
    console.error("No se pudo registrar la auditoría:", error);
  }
}

const TITULOS = new Map(PANTALLAS.map((p) => [p.menu_id, p.titulo]));

function mapear(f: Record<string, unknown>): RegistroAuditoria {
  const menu = txt(f["menu_id"]);
  const tipo = (txt(f["kind"]) ?? "") as TipoAuditoria;
  return {
    id: Number(f["audit_id"] ?? 0),
    fecha: txt(f["date"]) ?? "",
    usuario_id: Number(f["user_id"] ?? 0),
    usuario: txt(f["usuario"]) || `Usuario ${Number(f["user_id"] ?? 0)}`,
    pantalla: (menu ? TITULOS.get(menu) : undefined) ?? txt(f["menu_nombre"]) ?? menu ?? "Sistema",
    menu_id: menu,
    tipo,
    tipo_nombre: TIPOS_AUDITORIA[tipo] ?? "Otro",
    accion: txt(f["accion"]) ?? "",
    referencia: txt(f["reference"]),
    cambios: txt(f["changes"]),
    ip: txt(f["ip"]),
    equipo: txt(f["computer_name"]),
    origen: txt(f["app"]) ?? "DESKTOP",
  };
}

export async function listarAuditoria(filtro: FiltroAuditoria = {}): Promise<RegistroAuditoria[]> {
  if (!(await mysqlActivo())) return [];
  const cond: string[] = [];
  const params: unknown[] = [];
  if (filtro.desde) {
    cond.push("a.date >= ?");
    params.push(`${filtro.desde} 00:00:00`);
  }
  if (filtro.hasta) {
    cond.push("a.date <= ?");
    params.push(`${filtro.hasta} 23:59:59`);
  }
  if (filtro.usuarioId) {
    cond.push("a.user_id = ?");
    params.push(filtro.usuarioId);
  }
  if (filtro.menuId) {
    cond.push("a.menu_id = ?");
    params.push(filtro.menuId);
  }
  if (filtro.tipo) {
    cond.push("a.kind = ?");
    params.push(filtro.tipo);
  }
  if (filtro.referencia) {
    cond.push("(a.reference LIKE ? OR a.accion LIKE ?)");
    params.push(`%${filtro.referencia}%`, `%${filtro.referencia}%`);
  }
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  const filas = await sql<Record<string, unknown>>(
    `SELECT a.audit_id, a.date, a.menu_id, a.app, a.kind, a.accion, a.\`changes\`,
            a.reference, a.ip, a.computer_name, a.user_id,
            TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS nombre,
            u.login, m.name AS menu_nombre
       FROM audit a
       LEFT JOIN users u ON u.user_id = a.user_id
       LEFT JOIN menues m ON m.menu_id = a.menu_id
       ${where}
       ORDER BY a.date DESC, a.audit_id DESC
       LIMIT 500`,
    params,
  );
  return filas.map((f) => {
    const nombre = txt(f["nombre"]);
    const login = txt(f["login"]);
    return mapear({ ...f, usuario: nombre || login || "" });
  });
}

export async function listasAuditoria(): Promise<ListasAuditoria> {
  const tipos = (["A", "E", "B", "X"] as TipoAuditoria[]).map((id) => ({
    id,
    nombre: TIPOS_AUDITORIA[id],
  }));
  const pantallas = PANTALLAS.map((p) => ({ menu_id: p.menu_id, titulo: p.titulo })).filter(
    (p, i, arr) => arr.findIndex((x) => x.menu_id === p.menu_id) === i,
  );
  if (!(await mysqlActivo())) return { usuarios: [], pantallas, tipos };
  const filas = await sql<Record<string, unknown>>(
    `SELECT u.user_id,
            TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS nombre,
            u.login
       FROM users u ORDER BY u.login`,
  );
  return {
    usuarios: filas.map((f) => ({
      id: Number(f["user_id"] ?? 0),
      nombre: `${txt(f["login"]) ?? ""} — ${txt(f["nombre"]) || "sin nombre"}`,
    })),
    pantallas,
    tipos,
  };
}
