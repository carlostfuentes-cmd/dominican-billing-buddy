import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { auditar } from "@/lib/auditoria.functions";
import type { ResumenPlantilla } from "@/lib/db/plantillas.server";
import type { Plantilla, TipoPlantilla } from "@/lib/plantillas-tipos";

const repo = () => import("@/lib/db/plantillas.server");

const docTipo = z.enum(["factura", "cotizacion", "conduce", "nota-credito", "orden-compra"]);
const papel = z.enum(["carta", "legal", "a4", "media", "tirilla"]);
const alineacion = z.enum(["left", "center", "right"]);
const tipoElemento = z.enum(["texto", "campo", "imagen", "linea", "caja"]);
const tipoBanda = z.enum(["encabezado", "cliente", "cabecera", "detalle", "totales", "pie"]);

const elementoSchema = z.object({
  id: z.string().max(40),
  tipo: tipoElemento,
  x: z.number().min(-50).max(600),
  y: z.number().min(-50).max(600),
  ancho: z.number().min(0).max(600),
  alto: z.number().min(0).max(600),
  texto: z.string().max(600).default(""),
  campo: z.string().max(60).optional(),
  url: z.string().max(600).optional(),
  tamano: z.number().min(4).max(48),
  negrita: z.boolean(),
  italica: z.boolean(),
  alineacion,
  color: z.string().max(20),
  grosor: z.number().min(0).max(10).optional(),
  fondo: z.string().max(20).optional(),
});

const plantillaSchema = z.object({
  empresa_id: z.string().trim().min(1).max(20),
  doc_tipo: docTipo,
  nombre: z.string().trim().max(80),
  papel,
  margen_superior: z.number().min(0).max(80),
  margen_inferior: z.number().min(0).max(80),
  margen_izquierdo: z.number().min(0).max(80),
  margen_derecho: z.number().min(0).max(80),
  copias: z.number().int().min(1).max(4),
  bandas: z
    .array(
      z.object({
        tipo: tipoBanda,
        alto: z.number().min(0).max(400),
        visible: z.boolean(),
        elementos: z.array(elementoSchema).max(400),
      }),
    )
    .max(12),
});

export const obtenerPlantilla = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({ empresaId: z.string().max(20).default("*"), docTipo: docTipo.default("factura") })
      .parse(d ?? {}),
  )
  .handler(
    async ({ data }): Promise<Plantilla> =>
      (await repo()).obtenerPlantilla(data.empresaId, data.docTipo),
  );

export const obtenerPlantillas = createServerFn({ method: "GET" }).handler(
  async (): Promise<ResumenPlantilla[]> => (await repo()).listarPlantillas(),
);

export const guardarPlantilla = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => plantillaSchema.parse(d))
  .handler(async ({ data }): Promise<Plantilla> => {
    const p = await (await repo()).guardarPlantilla(data as Plantilla);
    await auditar({
      menu_id: "4.51",
      tipo: "E",
      accion: `Plantilla de ${data.doc_tipo} de la empresa ${data.empresa_id}`,
      referencia: `${data.empresa_id}-${data.doc_tipo}`,
    });
    return p;
  });

export const eliminarPlantilla = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ empresaId: z.string().trim().min(1).max(20), docTipo }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await repo()).eliminarPlantilla(data.empresaId, data.docTipo as TipoPlantilla);
    await auditar({
      menu_id: "4.51",
      tipo: "B",
      accion: `Eliminó la plantilla de ${data.docTipo} de la empresa ${data.empresaId}`,
      referencia: `${data.empresaId}-${data.docTipo}`,
    });
    return { ok: true };
  });
