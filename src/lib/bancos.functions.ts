import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { auditar } from "@/lib/auditoria.functions";
import type {
  ConceptoBancario,
  CuentaBancaria,
  DisponibilidadBanco,
  FiltroBancos,
  LineaAsiento,
  ListasBancos,
  MovimientoBanco,
  NuevoMovimientoBanco,
  PropuestaAsiento,
  ResultadoMovimientoBanco,
} from "@/lib/erp-types";

const repo = () => import("@/lib/db/bancos.server");

const texto = (max: number) => z.string().trim().max(max);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

const lineaAsiento = z.object({
  cuenta: texto(15),
  cuenta_nombre: texto(80).optional(),
  departamento_id: texto(10).optional(),
  departamento: texto(80).optional(),
  descripcion: texto(240),
  referencia: texto(50).optional(),
  debito: z.number().min(0).max(999_999_999),
  credito: z.number().min(0).max(999_999_999),
});

const movimientoSchema = z.object({
  banco_id: texto(10).min(1, "Selecciona la cuenta bancaria"),
  tipo_id: texto(2).min(1, "Selecciona el tipo de operación"),
  fecha,
  numero: texto(15).min(1, "Escribe el número del documento"),
  monto: z.number().min(0.01, "El monto debe ser mayor que cero").max(999_999_999),
  tasa_cambio: z.number().min(0).max(100_000).default(1),
  beneficiario: texto(50).default(""),
  descripcion: texto(240).default(""),
  ncf: texto(20).default(""),
  monto_ncf: z.number().min(0).default(0),
  itbis: z.number().min(0).default(0),
  comision: z.number().min(0).default(0),
  itbis_retenido: z.number().min(0).default(0),
  isr_retenido: z.number().min(0).default(0),
  concepto_id: texto(5).optional(),
  suplidor_id: texto(10).optional(),
  banco_destino_id: texto(10).optional(),
  avance: z
    .object({ suplidor_id: texto(10).min(1), cuenta_cxp: texto(15) })
    .optional(),
  aplicaciones: z
    .array(z.object({ referencia: texto(15), monto: z.number().min(0) }))
    .optional(),
  asiento: z.array(lineaAsiento).optional(),
});

const cuentaSchema = z.object({
  id: texto(10).default(""),
  nombre: texto(50).min(2, "Escribe el nombre del banco"),
  numero_cuenta: texto(25).min(1, "Escribe el número de cuenta"),
  nombre_corto: texto(10).default(""),
  tipo_id: texto(1).min(1, "Selecciona el tipo de cuenta"),
  oficial: texto(30).default(""),
  telefono: texto(20).default(""),
  direccion: texto(30).default(""),
  cuenta_contable: texto(15).min(1, "Selecciona la cuenta del catálogo"),
  moneda: texto(3).min(1),
  sucursal_id: texto(5).default("1"),
  rnc: texto(15).default(""),
  numero_empresa: texto(15).default(""),
  activa: z.boolean().default(true),
  ultimo_deposito: z.number().min(0).default(0),
  ultimo_cheque: z.number().min(0).default(0),
  ultima_nota_credito: z.number().min(0).default(0),
  ultima_nota_debito: z.number().min(0).default(0),
  limite_cheques: z.number().min(0).default(0),
  limite_monto: z.number().min(0).default(0),
  cargo_tc: z.number().min(0).max(100).default(0),
  itbis_tc: z.number().min(0).max(100).default(0),
});

/* ------------------------------- Consultas ------------------------------- */

export const obtenerListasBancos = createServerFn({ method: "GET" }).handler(
  async (): Promise<ListasBancos> => (await repo()).listasBancos(),
);

export const obtenerCuentasBancarias = createServerFn({ method: "GET" }).handler(
  async (): Promise<CuentaBancaria[]> => (await repo()).listarCuentasBancarias(),
);

export const obtenerConceptosBancarios = createServerFn({ method: "GET" }).handler(
  async (): Promise<ConceptoBancario[]> => (await repo()).listarConceptosBancarios(),
);

export const obtenerMovimientosBanco = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        desde: fecha.optional(),
        hasta: fecha.optional(),
        bancoId: texto(10).optional(),
        tipoId: texto(2).optional(),
        suplidorId: texto(10).optional(),
        busqueda: texto(60).optional(),
        estado: texto(1).optional(),
        montoDesde: z.number().min(0).optional(),
        montoHasta: z.number().min(0).optional(),
        numero: texto(20).optional(),
        beneficiario: texto(50).optional(),
        concepto: texto(60).optional(),
        cuenta: texto(15).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<MovimientoBanco[]> =>
    (await repo()).listarMovimientosBanco(data as FiltroBancos),
  );

export const obtenerMovimientoBanco = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.number().int().min(1) }).parse(d))
  .handler(
    async ({ data }): Promise<(MovimientoBanco & { lineas: LineaAsiento[] }) | null> =>
      (await repo()).obtenerMovimientoBanco(data.id),
  );

export const obtenerDisponibilidadBancaria = createServerFn({ method: "GET" }).handler(
  async (): Promise<DisponibilidadBanco[]> => (await repo()).disponibilidadBancaria(),
);

export const obtenerAsientoBanco = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => movimientoSchema.partial({ numero: true }).parse(d))
  .handler(async ({ data }): Promise<PropuestaAsiento> =>
    (await repo()).propuestaAsientoBanco({
      ...data,
      numero: data.numero ?? "",
    } as NuevoMovimientoBanco),
  );

/* ------------------------------- Mutaciones ------------------------------ */

export const guardarMovimientoBanco = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => movimientoSchema.parse(d))
  .handler(async ({ data }): Promise<ResultadoMovimientoBanco> => {
    const r = await (await repo()).crearMovimientoBanco(data as NuevoMovimientoBanco);
    await auditar({
      menu_id: "2.07.01",
      tipo: "A",
      accion: `Operación bancaria ${data.tipo_id} No. ${data.numero} por ${data.monto.toFixed(2)}`,
      referencia: r.id,
      cambios: data,
    });
    return r;
  });

export const anularMovimientoBanco = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.number().int().min(1) }).parse(d))
  .handler(async ({ data }): Promise<void> => {
    await (await repo()).anularMovimientoBanco(data.id);
    await auditar({
      menu_id: "2.07.01",
      tipo: "X",
      accion: `Anuló la operación bancaria No. ${data.id}`,
      referencia: data.id,
    });
  });

export const guardarCuentaBancaria = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => cuentaSchema.parse(d))
  .handler(async ({ data }): Promise<CuentaBancaria> => {
    const r = await (await repo()).guardarCuentaBancaria(data as CuentaBancaria);
    await auditar({
      menu_id: "1.07.02",
      tipo: data.id ? "E" : "A",
      accion: `Cuenta bancaria ${r.nombre} (${r.numero_cuenta})`,
      referencia: r.id,
      cambios: data,
    });
    return r;
  });

export const guardarConceptoBancario = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: texto(5).default(""),
        nombre: texto(50).min(2, "Escribe el nombre del concepto"),
        cuenta: texto(15).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<void> => {
    await (await repo()).guardarConceptoBancario(data as ConceptoBancario);
    await auditar({
      menu_id: "1.07.04",
      tipo: data.id ? "E" : "A",
      accion: `Concepto bancario ${data.nombre}`,
      referencia: data.id || data.nombre,
      cambios: data,
    });
  });
