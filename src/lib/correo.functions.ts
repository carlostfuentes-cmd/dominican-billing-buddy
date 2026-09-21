import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { ConfigCorreo } from "@/lib/db/correo.server";

const correo = () => import("@/lib/db/correo.server");

const empresaOpcional = z.number().int().nonnegative().optional();

const configSchema = z.object({
  empresaId: empresaOpcional,
  servidor: z.string().trim().max(120),
  puerto: z.number().int().min(1).max(65535),
  usuario: z.string().trim().max(120),
  clave: z.string().max(120),
  remitente: z.string().trim().max(120),
  remitenteNombre: z.string().trim().max(120),
  copia: z.string().trim().max(120),
  autenticacion: z.boolean(),
  ssl: z.boolean(),
});

const anexoSchema = z.object({
  filename: z.string().trim().min(1).max(120),
  contentType: z.string().trim().min(1).max(80),
  base64: z.string().min(1),
});

export const obtenerConfigCorreo = createServerFn({ method: "GET" })
  .inputValidator((d: { empresaId?: number }) => z.object({ empresaId: empresaOpcional }).parse(d))
  .handler(async ({ data }): Promise<ConfigCorreo> => {
    const mod = await correo();
    return mod.leerConfigCorreo(await mod.empresaActual(data.empresaId));
  });

export const guardarConfigCorreo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => configSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { empresaId, ...cfg } = data;
    const mod = await correo();
    await mod.guardarConfigCorreo(await mod.empresaActual(empresaId), cfg);
    return { ok: true };
  });

export const enviarCorreoPrueba = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        empresaId: empresaOpcional,
        para: z.string().trim().email("Escribe un correo válido"),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const mod = await correo();
    await mod.enviarCorreo(await mod.empresaActual(data.empresaId), {
      para: [data.para],
      asunto: "Prueba de configuración de correo",
      html: "<p>Este es un mensaje de prueba enviado desde su ERP. Si lo recibió, la configuración del servidor de correos es correcta.</p>",
    });
    return { ok: true };
  });

export const enviarDocumentoPorCorreo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        empresaId: empresaOpcional,
        para: z.string().trim().min(3, "Escribe el correo del destinatario").max(300),
        asunto: z.string().trim().min(1, "Escribe el asunto").max(200),
        mensaje: z.string().trim().max(4000),
        anexos: z.array(anexoSchema).max(3),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const destinos = data.para
      .split(/[,;]/)
      .map((d) => d.trim())
      .filter(Boolean);
    const cuerpo = data.mensaje
      .split(/\n{2,}/)
      .map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br />")}</p>`)
      .join("");
    const mod = await correo();
    await mod.enviarCorreo(await mod.empresaActual(data.empresaId), {
      para: destinos,
      asunto: data.asunto,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222">${cuerpo}</div>`,
      anexos: data.anexos,
    });
    return { ok: true };
  });
