import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type {
  ComprobanteCaja,
  FiltroCajaChica,
  ListasCajaChica,
  PropuestaAsiento,
  ResumenCajaChica,
} from "@/lib/erp-types";

import { auditar } from "@/lib/auditoria.functions";

const repo = () => import("@/lib/db/cajachica.server");

const MENU = "2.07";

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const texto = (max: number) => z.string().trim().max(max);
const monto = z.number().min(0).max(999_999_999);

const lineaAsiento = z.object({
  cuenta: texto(15),
  cuenta_nombre: texto(150).optional(),
  departamento_id: texto(10).optional(),
  descripcion: texto(255),
  debito: monto,
  credito: monto,
});

const comprobanteSchema = z.object({
  id: z.number().int().positive().optional(),
  caja_id: texto(10).min(1, "Selecciona la caja chica"),
  tipo: z.enum(["A", "I", "E"]).default("E"),
  fecha,
  referencia: texto(15).default(""),
  descripcion: texto(500).min(3, "Escribe el concepto del gasto"),
  bienes: monto.default(0),
  servicios: monto.default(0),
  itbis: monto.default(0),
  retencion_itbis: monto.default(0),
  retencion_isr: monto.default(0),
  propina: monto.default(0),
  isc: monto.default(0),
  otros_impuestos: monto.default(0),
  estado: z.enum(["P", "A"]).default("A"),
  cedula: texto(15).default(""),
  rnc: texto(15).default(""),
  beneficiario: texto(50).default(""),
  ncf: texto(19).default(""),
  autorizacion: texto(15).default(""),
  vigencia: fecha.optional(),
  ncf_id: texto(3).default(""),
  gasto_id: texto(3).default(""),
  gasto_menor: z.boolean().default(false),
  isr_id: texto(6).optional(),
  proyecto_id: texto(12).optional(),
  cuenta_gasto: texto(15).default(""),
  cuenta_itbis: texto(15).optional(),
  cuenta_isr: texto(15).optional(),
  asiento: z.array(lineaAsiento).optional(),
});

const reposicionSchema = z.object({
  caja_id: texto(10).min(1, "Selecciona la caja chica"),
  banco_id: texto(10).min(1, "Selecciona la cuenta bancaria"),
  tipo_id: texto(5).min(1, "Selecciona el tipo de operación bancaria"),
  numero: texto(5).min(1, "Escribe el número del cheque o transferencia"),
  fecha,
  descripcion: texto(240).default(""),
  comprobantes: z.array(z.number().int().positive()).min(1, "Selecciona los comprobantes"),
  asiento: z.array(lineaAsiento).optional(),
});

export const obtenerListasCajaChica = createServerFn({ method: "GET" }).handler(
  async (): Promise<ListasCajaChica> => (await repo()).listasCajaChica(),
);

export const obtenerComprobantesCaja = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        cajaId: texto(10).optional(),
        desde: fecha.optional(),
        hasta: fecha.optional(),
        estado: texto(15).optional(),
        gastoId: texto(3).optional(),
        busqueda: texto(60).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<ComprobanteCaja[]> =>
    (await repo()).listarComprobantes(data as FiltroCajaChica),
  );

export const obtenerComprobanteCaja = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<ComprobanteCaja | null> =>
    (await repo()).obtenerComprobante(data.id),
  );

export const obtenerResumenCajaChica = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({ cajaId: texto(10), desde: fecha.optional(), hasta: fecha.optional() })
      .parse(d),
  )
  .handler(async ({ data }): Promise<ResumenCajaChica> =>
    (await repo()).resumenCajaChica(data.cajaId, data.desde, data.hasta),
  );

export const proponerAsientoCaja = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => comprobanteSchema.parse(d))
  .handler(async ({ data }): Promise<PropuestaAsiento> =>
    (await repo()).propuestaAsientoCaja(data),
  );

export const guardarComprobanteCaja = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => comprobanteSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: number; total: number }> => {
    const r = await (await repo()).guardarComprobanteCaja(data);
    await auditar({
      menu_id: MENU,
      tipo: data.id ? "E" : "A",
      accion: `Comprobante de caja chica ${r.id} — ${data.descripcion} (${r.total.toFixed(2)})`,
      referencia: r.id,
      cambios: data,
    });
    return r;
  });

export const eliminarComprobanteCaja = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<void> => {
    await (await repo()).eliminarComprobanteCaja(data.id);
    await auditar({
      menu_id: MENU,
      tipo: "B",
      accion: `Eliminó el comprobante de caja chica ${data.id}`,
      referencia: data.id,
    });
  });

export const proponerAsientoReposicion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    reposicionSchema.partial({ banco_id: true, tipo_id: true, numero: true }).parse(d),
  )
  .handler(async ({ data }): Promise<PropuestaAsiento> =>
    (await repo()).propuestaAsientoReposicion({
      caja_id: data.caja_id,
      banco_id: data.banco_id ?? "",
      tipo_id: data.tipo_id ?? "",
      numero: data.numero ?? "",
      fecha: data.fecha,
      descripcion: data.descripcion,
      comprobantes: data.comprobantes,
    }),
  );

export const reponerFondoCaja = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => reposicionSchema.parse(d))
  .handler(
    async ({ data }): Promise<{ id: number; numero: string; total: number; comprobantes: number }> => {
      const r = await (await repo()).reponerFondoCaja(data);
      await auditar({
        menu_id: MENU,
        tipo: "A",
        accion: `Reposición de caja chica No. ${r.numero} por ${r.total.toFixed(2)} (${r.comprobantes} comprobante(s))`,
        referencia: r.numero,
        cambios: data,
      });
      return r;
    },
  );
