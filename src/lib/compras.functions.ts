import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { auditar } from "@/lib/auditoria.functions";
import type {
  FiltroCompras,
  LineaAsiento,
  ListasCompras,
  NuevaRecepcion,
  OrdenCompra,
  ResultadoRecepcion,
} from "@/lib/erp-types";

const repo = () => import("@/lib/db/compras.server");

const texto = (max: number) => z.string().trim().max(max);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

const lineaAsiento = z.object({
  cuenta: texto(15),
  cuenta_nombre: texto(60).optional(),
  departamento_id: texto(10).optional(),
  descripcion: texto(200),
  referencia: texto(50).optional(),
  debito: z.number().min(0).max(999_999_999),
  credito: z.number().min(0).max(999_999_999),
});

const facturaSchema = z.object({
  numero: texto(15),
  ncf: texto(19),
  fecha,
  vencimiento: fecha.or(z.literal("")),
  dias_credito: z.number().int().min(0).max(365).default(0),
  moneda: texto(3),
  tasa_cambio: z.number().min(0).max(100_000),
  comprobante_id: texto(2),
  gasto_id: texto(2),
  forma_pago_id: texto(2),
  bienes: z.number().min(0),
  servicios: z.number().min(0),
  propina: z.number().min(0),
  isc: z.number().min(0),
  otros_impuestos: z.number().min(0),
  itbis: z.number().min(0),
  itbis_retenido: z.number().min(0),
  isr_id: texto(5),
  isr_retenido: z.number().min(0),
  itbis_costo: z.number().min(0),
  itbis_proporcional: z.number().min(0),
  conduce: z.boolean(),
  informal: z.boolean(),
  gasto_menor: z.boolean(),
  sucursal_id: texto(5),
  uso: texto(200),
  notas: texto(200),
});

const ordenSchema = z.object({
  id: z.number().int().positive().optional(),
  suplidor_id: texto(10).min(1, "Selecciona el suplidor"),
  fecha,
  moneda: texto(3),
  tasa_cambio: z.number().min(0).max(100_000),
  sucursal_id: texto(5).optional(),
  almacen_id: texto(10).optional(),
  destino: texto(100).optional(),
  lugar: texto(100).optional(),
  uso: texto(200).optional(),
  cotizacion: texto(20).optional(),
  requisicion: texto(20).optional(),
  fecha_requisicion: fecha.or(z.literal("")).optional(),
  dias_credito: z.number().int().min(0).max(365),
  descuento_pct: z.number().min(0).max(100).default(0),
  solicitante_id: texto(10).optional(),
  proyecto_id: texto(20).optional(),
  departamento_id: texto(10).optional(),
  forma_pago_id: texto(2).optional(),
  notas: texto(1000).optional(),
  estado: z.enum(["A", "I", "N"]),
  lineas: z
    .array(
      z.object({
        producto_id: texto(50).min(1, "Producto requerido"),
        descripcion: texto(200),
        cantidad: z.number().positive().max(1_000_000),
        precio: z.number().min(0).max(99_999_999),
        descuento_pct: z.number().min(0).max(100),
        tasa_itbis: z.number().refine((v) => [0, 16, 18].includes(v), "Tasa inválida"),
        notas: texto(500).optional(),
      }),
    )
    .min(1, "Agrega al menos una línea"),
});

const recepcionSchema = z.object({
  orden_id: z.number().int().positive(),
  modalidad: z.enum(["almacen", "contabilidad"]),
  fecha,
  almacen_id: texto(10),
  descuento_pct: z.number().min(0).max(100).default(0),
  notas: texto(200).default(""),
  lineas: z
    .array(
      z.object({
        linea_id: z.number().int().positive(),
        producto_id: texto(50),
        recibida: z.number().min(0).max(1_000_000),
        precio: z.number().min(0).max(99_999_999),
      }),
    )
    .min(1),
  factura: facturaSchema.optional(),
  asiento: z.array(lineaAsiento).max(100).optional(),
});

const filtroSchema = z.object({
  desde: fecha.optional(),
  hasta: fecha.optional(),
  suplidorId: texto(10).optional(),
  estado: z.enum(["A", "I", "N"]).optional(),
  recepcion: z.enum(["pendiente", "parcial", "completa"]).optional(),
  busqueda: texto(60).optional(),
});

export const obtenerListasCompras = createServerFn({ method: "GET" }).handler(
  async (): Promise<ListasCompras> => (await repo()).listasCompras(),
);

export const obtenerCompras = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => filtroSchema.parse(d ?? {}))
  .handler(
    async ({ data }): Promise<OrdenCompra[]> =>
      (await repo()).listarCompras(data as FiltroCompras),
  );

export const obtenerCompra = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<OrdenCompra | null> => (await repo()).obtenerCompra(data.id));

export const guardarCompra = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ordenSchema.parse(d))
  .handler(async ({ data }): Promise<OrdenCompra> => {
    const orden = await (await repo()).guardarCompra(data);
    await auditar({
      menu_id: "2.05.01",
      tipo: data.id ? "E" : "A",
      accion: `Orden de compra ${orden.id} — ${orden.suplidor}`,
      referencia: orden.id,
      cambios: data,
    });
    return orden;
  });

export const anularCompra = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await (await repo()).anularCompra(data.id);
    await auditar({
      menu_id: "2.05.01",
      tipo: "X",
      accion: `Anuló la orden de compra ${data.id}`,
      referencia: data.id,
    });
    return { ok: true };
  });

export const obtenerAsientoRecepcion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => recepcionSchema.parse(d))
  .handler(
    async ({ data }): Promise<{ lineas: LineaAsiento[]; advertencias: string[] }> =>
      (await repo()).propuestaAsientoRecepcion(data as NuevaRecepcion),
  );

export const registrarRecepcion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => recepcionSchema.parse(d))
  .handler(async ({ data }): Promise<ResultadoRecepcion> => {
    const res = await (await repo()).registrarRecepcion(data as NuevaRecepcion);
    await auditar({
      menu_id: "2.05.02",
      tipo: "A",
      accion:
        `Recepción de la orden ${res.orden_id} (${data.modalidad === "contabilidad" ? "contabilidad" : "almacén"})` +
        ` | Inventario: ${res.documento_inventario}` +
        (res.factura ? ` | Factura suplidor: ${res.factura}` : ""),
      referencia: res.orden_id,
      cambios: data,
    });
    return res;
  });
