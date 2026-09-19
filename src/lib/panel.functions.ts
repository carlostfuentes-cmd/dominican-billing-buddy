import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { PanelResumen } from "@/lib/db/panel.server";

const repo = () => import("@/lib/db/panel.server");

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

const filtroSchema = z.object({
  desde: fecha,
  hasta: fecha,
  sucursalId: z.string().trim().max(20).optional(),
  departamentoId: z.string().trim().max(20).optional(),
  moneda: z.string().trim().max(3).optional(),
});

export const obtenerPanel = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => filtroSchema.parse(d))
  .handler(async ({ data }): Promise<PanelResumen> => (await repo()).panelResumen(data));
