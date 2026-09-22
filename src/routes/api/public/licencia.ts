// Endpoint del servidor de licencias de BP Dominicana. Las instalaciones (nube o
// local) piden aquí su licencia con la clave que se les entregó; la respuesta va
// firmada para que no pueda copiarse a otra instalación.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const esquema = z.object({
  clave: z.string().trim().min(8).max(64),
  version: z.string().trim().max(40).optional(),
  usuarios: z.number().int().min(0).max(100_000).optional(),
});

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export const Route = createFileRoute("/api/public/licencia")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let entrada: z.infer<typeof esquema>;
        try {
          entrada = esquema.parse(await request.json());
        } catch {
          return json({ error: "Solicitud inválida" }, 400);
        }

        const repo = await import("@/lib/db/licencias.server");
        const licencia = await repo.licenciaPorClave(entrada.clave);
        if (!licencia) return json({ error: "Licencia no registrada" }, 404);

        await repo.registrarContacto(
          entrada.clave,
          entrada.version ?? "",
          entrada.usuarios ?? 0,
          request.headers.get("cf-connecting-ip") ?? "",
        );

        const payload = JSON.stringify({
          clave: licencia.clave,
          cliente: licencia.cliente,
          plan: licencia.plan,
          modalidad: licencia.modalidad,
          usuarios: licencia.usuarios,
          vence: licencia.vence,
          estado: licencia.estado,
          emitido: new Date().toISOString(),
        });

        return json({ payload, firma: await repo.firmarPayload(payload) });
      },
    },
  },
});
