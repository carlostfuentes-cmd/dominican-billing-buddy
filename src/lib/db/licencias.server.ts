/**
 * Licenciamiento centralizado de la Suite Empresarial BP Dominicana.
 *
 * Tablas de control (aprobadas en el plan): licencias, licencia_eventos y
 * licencia_instalaciones. Viven en la base de control del proveedor; en la
 * instalación del cliente solo se consultan o se valida contra el servidor de
 * licencias por HTTPS con respuesta firmada.
 *
 * Toda consulta pasa por sql()/ejecutar() con parámetros vinculados.
 */
import { ejecutar, sql } from "./mysql.server";

export type EstadoLicencia = "A" | "S" | "V" | "C";

export const ESTADOS_LICENCIA: Record<EstadoLicencia, string> = {
  A: "Activa",
  S: "Suspendida",
  V: "Vencida",
  C: "Cancelada",
};

export type Modalidad = "cloud" | "local";

export type Licencia = {
  id: number;
  clave: string;
  cliente: string;
  rnc: string;
  contacto: string;
  modalidad: Modalidad;
  plan: string;
  usuarios: number;
  vence: string;
  estado: EstadoLicencia;
  estado_nombre: string;
  notas: string;
  ultimo_contacto: string | null;
  version: string | null;
  usuarios_reportados: number | null;
};

export type NuevaLicencia = {
  id?: number;
  clave?: string;
  cliente: string;
  rnc: string;
  contacto: string;
  modalidad: Modalidad;
  plan: string;
  usuarios: number;
  vence: string;
  estado: EstadoLicencia;
  notas: string;
};

export type EventoLicencia = {
  id: number;
  licencia_id: number;
  fecha: string;
  usuario: string;
  accion: string;
  detalle: string;
};

export type EstadoActual = {
  configurada: boolean;
  estado: EstadoLicencia;
  estado_nombre: string;
  cliente: string;
  plan: string;
  modalidad: Modalidad;
  usuarios_permitidos: number;
  usuarios_en_uso: number;
  vence: string | null;
  dias_restantes: number | null;
  solo_lectura: boolean;
  en_gracia: boolean;
  gracia_restante: number | null;
  fuente: "remota" | "local" | "sin-licencia";
  mensaje: string;
};

const DIA_MS = 86_400_000;
const GRACIA_DIAS = 7;
const CACHE_MS = 10 * 60_000;

const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const soloFecha = (v: unknown) => {
  if (!v) return "";
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
};

// ---------------------------------------------------------------- tablas

const SQL_LICENCIAS = `CREATE TABLE IF NOT EXISTS licencias (
  licencia_id  INT AUTO_INCREMENT PRIMARY KEY,
  license_key  VARCHAR(64)  NOT NULL,
  client_name  VARCHAR(120) NOT NULL,
  rnc          VARCHAR(20)  NOT NULL DEFAULT '',
  contact      VARCHAR(160) NOT NULL DEFAULT '',
  deployment   VARCHAR(10)  NOT NULL DEFAULT 'cloud',
  plan         VARCHAR(40)  NOT NULL DEFAULT 'BASICO',
  max_users    INT          NOT NULL DEFAULT 1,
  expires_on   DATE         NOT NULL,
  status       CHAR(1)      NOT NULL DEFAULT 'A',
  notes        VARCHAR(255) NOT NULL DEFAULT '',
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_licencias_key (license_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

const SQL_EVENTOS = `CREATE TABLE IF NOT EXISTS licencia_eventos (
  evento_id   INT AUTO_INCREMENT PRIMARY KEY,
  licencia_id INT          NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_name   VARCHAR(60)  NOT NULL DEFAULT '',
  action      VARCHAR(60)  NOT NULL DEFAULT '',
  detail      VARCHAR(255) NOT NULL DEFAULT '',
  KEY ix_licencia_eventos (licencia_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

const SQL_INSTALACIONES = `CREATE TABLE IF NOT EXISTS licencia_instalaciones (
  license_key  VARCHAR(64) NOT NULL,
  last_seen    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  app_version  VARCHAR(40) NOT NULL DEFAULT '',
  users_in_use INT         NOT NULL DEFAULT 0,
  host         VARCHAR(160) NOT NULL DEFAULT '',
  PRIMARY KEY (license_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

let tablasListas = false;
export async function asegurarTablasLicencia(): Promise<void> {
  if (tablasListas) return;
  await ejecutar(SQL_LICENCIAS);
  await ejecutar(SQL_EVENTOS);
  await ejecutar(SQL_INSTALACIONES);
  tablasListas = true;
}

// ------------------------------------------------------- panel del proveedor

type FilaLicencia = Record<string, unknown>;

const mapear = (f: FilaLicencia): Licencia => {
  const estado = (txt(f["status"]) || "A") as EstadoLicencia;
  return {
    id: num(f["licencia_id"]),
    clave: txt(f["license_key"]),
    cliente: txt(f["client_name"]),
    rnc: txt(f["rnc"]),
    contacto: txt(f["contact"]),
    modalidad: txt(f["deployment"]) === "local" ? "local" : "cloud",
    plan: txt(f["plan"]),
    usuarios: num(f["max_users"]),
    vence: soloFecha(f["expires_on"]),
    estado,
    estado_nombre: ESTADOS_LICENCIA[estado] ?? "Activa",
    notas: txt(f["notes"]),
    ultimo_contacto: f["last_seen"] ? String(f["last_seen"]) : null,
    version: f["app_version"] ? txt(f["app_version"]) : null,
    usuarios_reportados: f["users_in_use"] === undefined ? null : num(f["users_in_use"]),
  };
};

const SELECT_LICENCIAS = `
  SELECT l.licencia_id, l.license_key, l.client_name, l.rnc, l.contact, l.deployment,
         l.plan, l.max_users, l.expires_on, l.status, l.notes,
         i.last_seen, i.app_version, i.users_in_use
    FROM licencias l
    LEFT JOIN licencia_instalaciones i ON i.license_key = l.license_key`;

export async function listarLicencias(): Promise<Licencia[]> {
  await asegurarTablasLicencia();
  const filas = await sql<FilaLicencia>(`${SELECT_LICENCIAS} ORDER BY l.client_name`);
  return filas.map(mapear);
}

export function nuevaClaveLicencia(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `BPD-${hex.slice(0, 8)}-${hex.slice(8, 16)}-${hex.slice(16, 24)}-${hex.slice(24)}`.toUpperCase();
}

export async function guardarLicencia(
  entrada: NuevaLicencia,
  usuario: string,
): Promise<{ id: number; clave: string }> {
  await asegurarTablasLicencia();
  if (entrada.id && entrada.id > 0) {
    await ejecutar(
      `UPDATE licencias
          SET client_name = ?, rnc = ?, contact = ?, deployment = ?, plan = ?,
              max_users = ?, expires_on = ?, status = ?, notes = ?
        WHERE licencia_id = ?`,
      [
        entrada.cliente,
        entrada.rnc,
        entrada.contacto,
        entrada.modalidad,
        entrada.plan,
        entrada.usuarios,
        entrada.vence,
        entrada.estado,
        entrada.notas,
        entrada.id,
      ],
    );
    await registrarEvento(entrada.id, usuario, "Editar", `Plan ${entrada.plan}, vence ${entrada.vence}`);
    const filas = await sql<FilaLicencia>(
      "SELECT license_key FROM licencias WHERE licencia_id = ? LIMIT 1",
      [entrada.id],
    );
    return { id: entrada.id, clave: txt(filas[0]?.["license_key"]) };
  }

  const clave = entrada.clave?.trim() || nuevaClaveLicencia();
  const r = await ejecutar(
    `INSERT INTO licencias
       (license_key, client_name, rnc, contact, deployment, plan, max_users, expires_on, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      clave,
      entrada.cliente,
      entrada.rnc,
      entrada.contacto,
      entrada.modalidad,
      entrada.plan,
      entrada.usuarios,
      entrada.vence,
      entrada.estado,
      entrada.notas,
    ],
  );
  await registrarEvento(r.insertId, usuario, "Alta", `Cliente ${entrada.cliente}, plan ${entrada.plan}`);
  return { id: r.insertId, clave };
}

export async function cambiarEstadoLicencia(
  id: number,
  estado: EstadoLicencia,
  usuario: string,
  detalle: string,
): Promise<void> {
  await asegurarTablasLicencia();
  await ejecutar("UPDATE licencias SET status = ? WHERE licencia_id = ?", [estado, id]);
  await registrarEvento(id, usuario, ESTADOS_LICENCIA[estado] ?? "Cambio", detalle);
}

export async function renovarLicencia(
  id: number,
  vence: string,
  usuario: string,
): Promise<void> {
  await asegurarTablasLicencia();
  await ejecutar("UPDATE licencias SET expires_on = ?, status = 'A' WHERE licencia_id = ?", [
    vence,
    id,
  ]);
  await registrarEvento(id, usuario, "Renovar", `Nuevo vencimiento ${vence}`);
  cacheEstado = null;
}

export async function registrarEvento(
  licenciaId: number,
  usuario: string,
  accion: string,
  detalle: string,
): Promise<void> {
  await ejecutar(
    "INSERT INTO licencia_eventos (licencia_id, user_name, action, detail) VALUES (?, ?, ?, ?)",
    [licenciaId, usuario.slice(0, 60), accion.slice(0, 60), detalle.slice(0, 255)],
  );
}

export async function eventosLicencia(licenciaId: number): Promise<EventoLicencia[]> {
  await asegurarTablasLicencia();
  const filas = await sql<FilaLicencia>(
    `SELECT evento_id, licencia_id, created_at, user_name, action, detail
       FROM licencia_eventos WHERE licencia_id = ? ORDER BY evento_id DESC LIMIT 200`,
    [licenciaId],
  );
  return filas.map((f) => ({
    id: num(f["evento_id"]),
    licencia_id: num(f["licencia_id"]),
    fecha: txt(f["created_at"]),
    usuario: txt(f["user_name"]),
    accion: txt(f["action"]),
    detalle: txt(f["detail"]),
  }));
}

/** Usada por el endpoint público del servidor de licencias. */
export async function licenciaPorClave(clave: string): Promise<Licencia | null> {
  await asegurarTablasLicencia();
  const filas = await sql<FilaLicencia>(
    `${SELECT_LICENCIAS} WHERE l.license_key = ? LIMIT 1`,
    [clave],
  );
  const fila = filas[0];
  return fila ? mapear(fila) : null;
}

export async function registrarContacto(
  clave: string,
  version: string,
  usuarios: number,
  host: string,
): Promise<void> {
  await asegurarTablasLicencia();
  await ejecutar(
    `INSERT INTO licencia_instalaciones (license_key, app_version, users_in_use, host)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE app_version = VALUES(app_version),
       users_in_use = VALUES(users_in_use), host = VALUES(host), last_seen = CURRENT_TIMESTAMP`,
    [clave, version.slice(0, 40), usuarios, host.slice(0, 160)],
  );
}

// ------------------------------------------------------------ firma Ed25519

const base64ABytes = (b64: string) =>
  Uint8Array.from(atob(b64.replace(/\s+/g, "")), (c) => c.charCodeAt(0));

const bytesABase64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...Array.from(bytes)));

export async function firmarPayload(payload: string): Promise<string | null> {
  const privada = process.env["LICENSE_PRIVATE_KEY"];
  if (!privada) return null;
  const clave = await crypto.subtle.importKey(
    "pkcs8",
    base64ABytes(privada),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign(
    "Ed25519",
    clave,
    new TextEncoder().encode(payload),
  );
  return bytesABase64(new Uint8Array(firma));
}

async function firmaValida(payload: string, firma: string): Promise<boolean> {
  const publica = process.env["LICENSE_PUBLIC_KEY"];
  if (!publica) return true; // sin clave configurada no se exige firma
  try {
    const clave = await crypto.subtle.importKey(
      "spki",
      base64ABytes(publica),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "Ed25519",
      clave,
      base64ABytes(firma),
      new TextEncoder().encode(payload),
    );
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ estado actual

let cacheEstado: { valor: EstadoActual; hasta: number } | null = null;
let ultimaValidacionOk = 0;

export async function usuariosEnUso(): Promise<number> {
  try {
    const filas = await sql<{ total: unknown }>(
      "SELECT COUNT(*) AS total FROM users WHERE COALESCE(status, 'A') <> 'B'",
    );
    return num(filas[0]?.total);
  } catch {
    return 0;
  }
}

function diasRestantes(vence: string): number {
  const fin = Date.parse(`${vence}T23:59:59Z`);
  if (!Number.isFinite(fin)) return 0;
  return Math.ceil((fin - Date.now()) / DIA_MS);
}

function componer(l: Licencia, enUso: number, fuente: "remota" | "local"): EstadoActual {
  const dias = diasRestantes(l.vence);
  const estado: EstadoLicencia = l.estado === "A" && dias < 0 ? "V" : l.estado;
  const soloLectura = estado !== "A";
  return {
    configurada: true,
    estado,
    estado_nombre: ESTADOS_LICENCIA[estado] ?? "Activa",
    cliente: l.cliente,
    plan: l.plan,
    modalidad: l.modalidad,
    usuarios_permitidos: l.usuarios,
    usuarios_en_uso: enUso,
    vence: l.vence,
    dias_restantes: dias,
    solo_lectura: soloLectura,
    en_gracia: false,
    gracia_restante: null,
    fuente,
    mensaje: soloLectura
      ? estado === "V"
        ? "La licencia venció. El sistema queda en solo lectura: puedes consultar e imprimir, pero no registrar. Comunícate con BP Dominicana para renovar."
        : "La licencia está suspendida. El sistema queda en solo lectura. Comunícate con BP Dominicana."
      : dias <= 30
        ? `La licencia vence en ${dias} día(s). Renuévala para no quedar en solo lectura.`
        : "Licencia activa.",
  };
}

const sinLicencia = (): EstadoActual => ({
  configurada: false,
  estado: "A",
  estado_nombre: "Sin licenciamiento",
  cliente: "",
  plan: "",
  modalidad: "cloud",
  usuarios_permitidos: 0,
  usuarios_en_uso: 0,
  vence: null,
  dias_restantes: null,
  solo_lectura: false,
  en_gracia: false,
  gracia_restante: null,
  fuente: "sin-licencia",
  mensaje: "Esta instalación no tiene licenciamiento configurado.",
});

function enGracia(): EstadoActual {
  const usados = ultimaValidacionOk
    ? Math.floor((Date.now() - ultimaValidacionOk) / DIA_MS)
    : GRACIA_DIAS;
  const restante = Math.max(0, GRACIA_DIAS - usados);
  const soloLectura = restante === 0;
  return {
    ...sinLicencia(),
    configurada: true,
    estado: soloLectura ? "S" : "A",
    estado_nombre: soloLectura ? "Sin validar" : "Activa (período de gracia)",
    solo_lectura: soloLectura,
    en_gracia: true,
    gracia_restante: restante,
    fuente: "remota",
    mensaje: soloLectura
      ? "No se pudo validar la licencia en los últimos 7 días. El sistema quedó en solo lectura hasta restablecer la comunicación con BP Dominicana."
      : `No se pudo validar la licencia ahora mismo. Puedes seguir trabajando ${restante} día(s) más.`,
  };
}

type Payload = {
  clave: string;
  cliente: string;
  plan: string;
  modalidad: Modalidad;
  usuarios: number;
  vence: string;
  estado: EstadoLicencia;
  emitido: string;
};

async function validarRemoto(url: string, clave: string): Promise<Licencia | null> {
  const respuesta = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clave,
      version: process.env["APP_VERSION"] ?? "web-1.0",
      usuarios: await usuariosEnUso(),
    }),
  });
  const datos = (await respuesta.json()) as { payload?: string; firma?: string };
  if (!respuesta.ok || !datos.payload) throw new Error("Respuesta de licencia inválida");
  if (!(await firmaValida(datos.payload, datos.firma ?? "")))
    throw new Error("La firma de la licencia no es válida");
  const p = JSON.parse(datos.payload) as Payload;
  if (p.clave !== clave) throw new Error("La licencia no corresponde a esta instalación");
  // La licencia firmada no puede tener más de 3 días de antigüedad.
  if (Date.now() - Date.parse(p.emitido) > 3 * DIA_MS)
    throw new Error("La licencia recibida está caducada");
  return {
    id: 0,
    clave: p.clave,
    cliente: p.cliente,
    rnc: "",
    contacto: "",
    modalidad: p.modalidad,
    plan: p.plan,
    usuarios: p.usuarios,
    vence: p.vence,
    estado: p.estado,
    estado_nombre: ESTADOS_LICENCIA[p.estado] ?? "Activa",
    notas: "",
    ultimo_contacto: null,
    version: null,
    usuarios_reportados: null,
  };
}

export async function estadoLicencia(forzar = false): Promise<EstadoActual> {
  if (!forzar && cacheEstado && cacheEstado.hasta > Date.now()) return cacheEstado.valor;

  const url = process.env["LICENSE_SERVER_URL"];
  const clave = process.env["LICENSE_KEY"];
  let valor: EstadoActual;

  try {
    if (url && clave) {
      const licencia = await validarRemoto(url, clave);
      valor = licencia
        ? componer(licencia, await usuariosEnUso(), "remota")
        : { ...sinLicencia(), configurada: true, estado: "C", estado_nombre: "Cancelada", solo_lectura: true, mensaje: "Esta instalación no tiene una licencia registrada en BP Dominicana." };
      ultimaValidacionOk = Date.now();
    } else {
      await asegurarTablasLicencia();
      const filas = clave
        ? await sql<FilaLicencia>(`${SELECT_LICENCIAS} WHERE l.license_key = ? LIMIT 1`, [clave])
        : await sql<FilaLicencia>(`${SELECT_LICENCIAS} ORDER BY l.licencia_id LIMIT 1`);
      const fila = filas[0];
      valor = fila ? componer(mapear(fila), await usuariosEnUso(), "local") : sinLicencia();
      ultimaValidacionOk = Date.now();
    }
  } catch (error) {
    console.error(
      "No se pudo validar la licencia:",
      error instanceof Error ? error.message : String(error),
    );
    valor = url && clave ? enGracia() : sinLicencia();
  }

  cacheEstado = { valor, hasta: Date.now() + CACHE_MS };
  return valor;
}

export function limpiarCacheLicencia(): void {
  cacheEstado = null;
}

/** Consultas que nunca se bloquean: control de licencias, sesión y auditoría. */
const EXENTA = /^\s*(CREATE|ALTER|DROP)\b|licencia|\baudit\b|\busers\b/i;

/** Puerta central de escritura: la usa ejecutar() en mysql.server.ts. */
export async function permiteEscritura(consulta: string): Promise<true | string> {
  if (EXENTA.test(consulta)) return true;
  const estado = await estadoLicencia();
  if (!estado.configurada || !estado.solo_lectura) return true;
  return estado.mensaje;
}

/** Tope de usuarios del plan. */
export async function puedeAgregarUsuario(): Promise<true | string> {
  const estado = await estadoLicencia();
  if (!estado.configurada || estado.usuarios_permitidos <= 0) return true;
  if (estado.usuarios_en_uso < estado.usuarios_permitidos) return true;
  return `Tu plan ${estado.plan} permite ${estado.usuarios_permitidos} usuarios y ya están todos en uso. Comunícate con BP Dominicana para ampliarlo.`;
}
