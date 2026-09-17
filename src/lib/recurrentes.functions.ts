import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { EmisionRecurrente, PlantillaRecurrente } from "@/lib/erp-types";
import { auditar } from "@/lib/auditoria.functions";

const repo = () => import("@/lib/db/recurrentes.server");

const MENU = "2.01.03.3";
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const texto = (max: number) => z.string().trim().max(max);
const id = z.number().int().positive();

const filtroSchema = z.object({
  clienteId: texto(20).optional(),
  estado: z.enum(["todas", "activas", "inactivas", "vencidas"]).optional(),
  busqueda: texto(60).optional(),
});

const lineaSchema = z.object({
  item_id: texto(20).min(1, "Selecciona el producto"),
  codigo: texto(20),
  descripcion: texto(200),
  detalle: texto(500),
  cantidad: z.number().positive().max(999_999),
  precio: z.number().min(0).max(99_999_999),
  descuento_pct: z.number().min(0).max(100),
  tasa_itbis: z.number().min(0).max(100),
});

const plantillaSchema = z.object({
  id: id.optional(),
  activa: z.boolean(),
  nombre: texto(120).min(1, "Escribe el concepto"),
  cliente_id: texto(20).min(1, "Selecciona el cliente"),
  moneda: texto(3),
  cada: z.number().int().positive().max(120),
  frecuencia: z.enum(["D", "M", "A"]),
  inicio: fecha,
  fin: fecha.optional(),
  sin_fin: z.boolean(),
  repeticiones: z.number().int().min(0).max(999),
  notificar: texto(160),
  notas: texto(500),
  lineas: z.array(lineaSchema).min(1, "Agrega al menos una línea"),
});

export const obtenerRecurrentes = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => filtroSchema.parse(d))
  .handler(async ({ data }): Promise<PlantillaRecurrente[]> =>
    (await repo()).listarRecurrentes(data),
  );

export const obtenerRecurrente = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data }): Promise<PlantillaRecurrente | null> =>
    (await repo()).obtenerRecurrente(data.id),
  );

export const guardarRecurrente = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => plantillaSchema.parse(d))
  .handler(async ({ data }): Promise<PlantillaRecurrente> => {
    const guardada = await (await repo()).guardarRecurrente(data);
    await auditar({
      menu_id: MENU,
      tipo: data.id ? "E" : "A",
      accion: data.id ? "Editar factura recurrente" : "Crear factura recurrente",
      referencia: guardada.id,
      cambios: { nombre: guardada.nombre, cliente: guardada.cliente_nombre, total: guardada.total },
    });
    return guardada;
  });

export const cambiarEstadoRecurrente = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id, activa: z.boolean() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await repo()).cambiarEstadoRecurrente(data.id, data.activa);
    await auditar({
      menu_id: MENU,
      tipo: "E",
      accion: data.activa ? "Activar factura recurrente" : "Desactivar factura recurrente",
      referencia: data.id,
    });
    return { ok: true };
  });

export const eliminarRecurrente = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await repo()).eliminarRecurrente(data.id);
    await auditar({
      menu_id: MENU,
      tipo: "B",
      accion: "Eliminar factura recurrente",
      referencia: data.id,
    });
    return { ok: true };
  });

/** Documento que se emitiría, para revisión o impresión previa. */
export const obtenerPreviaRecurrente = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data }) => (await repo()).previaRecurrente(data.id));

export const emitirRecurrentes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ ids: z.array(id).min(1), facturar: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data }): Promise<EmisionRecurrente[]> => {
    const salida = await (await repo()).emitirRecurrentes(data);
    for (const r of salida.filter((x) => !x.error)) {
      await auditar({
        menu_id: MENU,
        tipo: "A",
        accion: data.facturar === false ? "Emitir pedido recurrente" : "Emitir factura recurrente",
        referencia: r.pedido_id ?? r.plantilla_id,
        cambios: { plantilla: r.plantilla_id, fecha: r.fecha, ncf: r.ncf, total: r.total },
      });
    }
    return salida;
  });
