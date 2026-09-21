/**
 * Configuración del servidor de correos (SMTP) por empresa y envío de mensajes.
 *
 * La configuración se guarda en la tabla `config` que ya existe en el ERP,
 * con una clave por empresa (por ejemplo `cMailServer@1`). No se crean tablas.
 * El envío sale por el mismo archivo puente PHP instalado en el servidor de la
 * empresa, que habla SMTP y permite anexar el PDF.
 */
import { sql } from "./mysql.server";

export interface ConfigCorreo {
  servidor: string;
  puerto: number;
  usuario: string;
  clave: string;
  remitente: string;
  remitenteNombre: string;
  copia: string;
  autenticacion: boolean;
  ssl: boolean;
}

export const configCorreoVacia: ConfigCorreo = {
  servidor: "",
  puerto: 25,
  usuario: "",
  clave: "",
  remitente: "",
  remitenteNombre: "",
  copia: "",
  autenticacion: true,
  ssl: false,
};

const CLAVES = {
  servidor: "cMailServer",
  puerto: "nMailPort",
  usuario: "cMailUser",
  clave: "cMailPassword",
  remitente: "cMailSender",
  remitenteNombre: "cMailSenderName",
  copia: "cMailCopy",
  autenticacion: "lMailAuth",
  ssl: "lMailSSL",
} as const;

const nombreClave = (campo: keyof typeof CLAVES, empresaId: number) =>
  `${CLAVES[campo]}@${empresaId}`;

/** Devuelve el id de empresa a usar; si no llega uno válido toma la primera empresa. */
export async function empresaActual(empresaId?: number): Promise<number> {
  if (empresaId && empresaId > 0) return empresaId;
  try {
    const filas = await sql<{ company_id: number | string }>(
      "SELECT company_id FROM companies ORDER BY company_id LIMIT 1",
    );
    const id = Number(filas[0]?.company_id);
    return Number.isFinite(id) && id > 0 ? id : 1;
  } catch {
    return 1;
  }
}

/** Lee la configuración de correo de una empresa. */
export async function leerConfigCorreo(empresaId: number): Promise<ConfigCorreo> {
  const claves = Object.keys(CLAVES).map((c) => nombreClave(c as keyof typeof CLAVES, empresaId));
  const filas = await sql<{ name: string; value: string | null }>(
    `SELECT name, value FROM config WHERE name IN (${claves.map(() => "?").join(",")})`,
    claves,
  );
  const mapa = new Map(filas.map((f) => [f.name, f.value ?? ""]));
  const leer = (campo: keyof typeof CLAVES) => mapa.get(nombreClave(campo, empresaId)) ?? "";
  const puerto = Number(leer("puerto"));
  const bool = (v: string, porDefecto: boolean) =>
    v === "" ? porDefecto : v === ".T." || v === "1" || v.toLowerCase() === "true";
  return {
    servidor: leer("servidor"),
    puerto: Number.isFinite(puerto) && puerto > 0 ? puerto : 25,
    usuario: leer("usuario"),
    clave: leer("clave"),
    remitente: leer("remitente"),
    remitenteNombre: leer("remitenteNombre"),
    copia: leer("copia"),
    autenticacion: bool(leer("autenticacion"), true),
    ssl: bool(leer("ssl"), false),
  };
}

async function guardarValor(nombre: string, valor: string, kind: "C" | "L" | "N") {
  const existe = await sql<{ id: number }>("SELECT id FROM config WHERE name = ? LIMIT 1", [nombre]);
  const fila = existe[0];
  if (fila) {
    await sql("UPDATE config SET value = ?, kind = ? WHERE id = ?", [valor, kind, fila.id]);
    return;
  }
  await sql("INSERT INTO config (name, kind, value, section) VALUES (?, ?, ?, 'AppData')", [
    nombre,
    kind,
    valor,
  ]);
}

/** Guarda la configuración de correo de una empresa. */
export async function guardarConfigCorreo(empresaId: number, cfg: ConfigCorreo): Promise<void> {
  const logico = (v: boolean) => (v ? ".T." : ".F.");
  await guardarValor(nombreClave("servidor", empresaId), cfg.servidor.trim(), "C");
  await guardarValor(nombreClave("puerto", empresaId), String(cfg.puerto), "N");
  await guardarValor(nombreClave("usuario", empresaId), cfg.usuario.trim(), "C");
  await guardarValor(nombreClave("clave", empresaId), cfg.clave, "C");
  await guardarValor(nombreClave("remitente", empresaId), cfg.remitente.trim(), "C");
  await guardarValor(nombreClave("remitenteNombre", empresaId), cfg.remitenteNombre.trim(), "C");
  await guardarValor(nombreClave("copia", empresaId), cfg.copia.trim(), "C");
  await guardarValor(nombreClave("autenticacion", empresaId), logico(cfg.autenticacion), "L");
  await guardarValor(nombreClave("ssl", empresaId), logico(cfg.ssl), "L");
}

export interface Anexo {
  filename: string;
  contentType: string;
  base64: string;
}

export interface MensajeCorreo {
  para: string[];
  asunto: string;
  html: string;
  anexos?: Anexo[];
}

/** Envía un mensaje por el servidor SMTP configurado en la empresa. */
export async function enviarCorreo(empresaId: number, mensaje: MensajeCorreo): Promise<void> {
  const cfg = await leerConfigCorreo(empresaId);
  if (!cfg.servidor || !cfg.remitente) {
    throw new Error(
      "Falta configurar el servidor de correos. Ve a Configuración → Datos servidor de correos.",
    );
  }
  const destinos = mensaje.para.map((d) => d.trim()).filter((d) => d.includes("@"));
  if (destinos.length === 0) throw new Error("El destinatario no tiene un correo válido");

  const url = process.env["MYSQL_BRIDGE_URL"];
  const token = process.env["MYSQL_BRIDGE_TOKEN"];
  if (!url || !token) throw new Error("El puente del servidor no está configurado");

  const respuesta = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      mail: {
        host: cfg.servidor,
        port: cfg.puerto,
        user: cfg.usuario,
        password: cfg.clave,
        from: cfg.remitente,
        fromName: cfg.remitenteNombre,
        to: destinos,
        cc: cfg.copia ? [cfg.copia] : [],
        subject: mensaje.asunto,
        html: mensaje.html,
        auth: cfg.autenticacion,
        ssl: cfg.ssl,
        attachments: mensaje.anexos ?? [],
      },
    }),
  });
  const cuerpo = (await respuesta.json().catch(() => null)) as
    | { ok?: boolean; error?: string }
    | null;
  if (!respuesta.ok || !cuerpo?.ok) {
    throw new Error(cuerpo?.error || "El servidor de correos rechazó el mensaje");
  }
}
