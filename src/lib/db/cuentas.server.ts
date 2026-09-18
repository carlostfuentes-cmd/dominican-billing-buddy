// Cuentas contables por clasificación de inventario.
//
// La relación real del sistema es:
//   inventory_groups            -> clasificación del producto (jerárquica, campo parent)
//   inventory_groups_accounts   -> cuenta del catálogo por propósito (name) y clasificación
//
// Propósitos usados: VENTAS BRUTAS, COSTO DE VENTAS, COSTO DE MUESTRAS, INVENTARIO,
// DESCUENTOS, ITBIS POR PAGAR, MERCANCIA DEVUELTA, COSTO MERCANCIA DEVUELTA.
//
// Si una clasificación no tiene el propósito definido se hereda del grupo padre y,
// por último, del grupo '0' (TODOS).

import { round2, type LineaAsiento } from "@/lib/erp-types";
import { sql } from "./mysql.server";
import { usarMysql } from "./repo.server";
import { esTransferencia } from "./inventario.server";

const txt = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const PROPOSITO = {
  ventas: "VENTAS BRUTAS",
  costo: "COSTO DE VENTAS",
  costoMuestras: "COSTO DE MUESTRAS",
  inventario: "INVENTARIO",
  descuentos: "DESCUENTOS",
  itbis: "ITBIS POR PAGAR",
  devolucion: "MERCANCIA DEVUELTA",
  costoDevolucion: "COSTO MERCANCIA DEVUELTA",
} as const;

interface Grupo {
  id: string;
  parent: string;
  departamento: string;
}

interface Resolver {
  cuenta: (grupoId: string, proposito: string) => string;
  departamento: (grupoId: string) => string;
}

/** Carga la jerarquía de clasificaciones con sus cuentas y devuelve un resolvedor. */
async function resolver(): Promise<Resolver> {
  const [grupos, cuentas] = await Promise.all([
    sql<Record<string, unknown>>(
      `SELECT inventory_group_id AS id, COALESCE(parent,'') AS parent,
              COALESCE(department_id,'') AS departamento
       FROM inventory_groups`,
    ),
    sql<Record<string, unknown>>(
      `SELECT inventory_group_id AS id, name, catalog_account AS cuenta
       FROM inventory_groups_accounts`,
    ),
  ]);

  const mapaGrupos = new Map<string, Grupo>(
    grupos.map((g) => [
      txt(g["id"]),
      { id: txt(g["id"]), parent: txt(g["parent"]), departamento: txt(g["departamento"]) },
    ]),
  );
  const mapaCuentas = new Map<string, string>();
  for (const c of cuentas) {
    mapaCuentas.set(`${txt(c["id"])}|${txt(c["name"]).toUpperCase()}`, txt(c["cuenta"]));
  }

  const cuenta = (grupoId: string, proposito: string): string => {
    let actual = grupoId;
    const vistos = new Set<string>();
    while (actual && !vistos.has(actual)) {
      vistos.add(actual);
      const encontrada = mapaCuentas.get(`${actual}|${proposito.toUpperCase()}`);
      if (encontrada) return encontrada;
      actual = mapaGrupos.get(actual)?.parent ?? "";
    }
    return mapaCuentas.get(`0|${proposito.toUpperCase()}`) ?? "";
  };

  const departamento = (grupoId: string): string => {
    let actual = grupoId;
    const vistos = new Set<string>();
    while (actual && !vistos.has(actual)) {
      vistos.add(actual);
      const dep = mapaGrupos.get(actual)?.departamento ?? "";
      if (dep && Number(dep) > 0) return dep;
      actual = mapaGrupos.get(actual)?.parent ?? "";
    }
    return "";
  };

  return { cuenta, departamento };
}

interface DatosProducto {
  grupo: string;
  costo: number;
  servicio: boolean;
}

async function productos(ids: string[]): Promise<Map<string, DatosProducto>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return new Map();
  const filas = await sql<Record<string, unknown>>(
    `SELECT product_id AS id, COALESCE(inventory_group_id,'') AS grupo,
            COALESCE(cost,0) AS costo, COALESCE(is_service,0) AS servicio
     FROM products WHERE product_id IN (${unicos.map(() => "?").join(",")})`,
    unicos,
  );
  return new Map(
    filas.map((f) => [
      txt(f["id"]),
      {
        grupo: txt(f["grupo"]),
        costo: num(f["costo"]),
        servicio: num(f["servicio"]) === 1,
      },
    ]),
  );
}

/** Cuentas de agrupación: se marcan para que el usuario las corrija antes de guardar. */
async function noDetalle(cuentas: string[]): Promise<Set<string>> {
  const unicas = [...new Set(cuentas.filter(Boolean))];
  if (!unicas.length) return new Set();
  const filas = await sql<Record<string, unknown>>(
    `SELECT account, COALESCE(name,'') AS name, is_detail FROM gl_accounts
     WHERE account IN (${unicas.map(() => "?").join(",")})`,
    unicas,
  );
  const conocidas = new Map(filas.map((f) => [txt(f["account"]), num(f["is_detail"])]));
  const malas = new Set<string>();
  for (const c of unicas) if (conocidas.get(c) !== 1) malas.add(c);
  return malas;
}

async function nombres(cuentas: string[]): Promise<Map<string, string>> {
  const unicas = [...new Set(cuentas.filter(Boolean))];
  if (!unicas.length) return new Map();
  const filas = await sql<Record<string, unknown>>(
    `SELECT account, COALESCE(name,'') AS name FROM gl_accounts
     WHERE account IN (${unicas.map(() => "?").join(",")})`,
    unicas,
  );
  return new Map(filas.map((f) => [txt(f["account"]), txt(f["name"])]));
}

/* ------------------------------- Acumulador ------------------------------- */

type Acum = Map<string, LineaAsiento>;

function acumular(
  acum: Acum,
  cuenta: string,
  descripcion: string,
  debito: number,
  credito: number,
  departamentoId: string,
): void {
  if (!cuenta) return;
  if (round2(debito) === 0 && round2(credito) === 0) return;
  const clave = `${cuenta}|${departamentoId}|${descripcion}`;
  const actual = acum.get(clave);
  if (actual) {
    actual.debito = round2(actual.debito + debito);
    actual.credito = round2(actual.credito + credito);
    return;
  }
  acum.set(clave, {
    cuenta,
    descripcion,
    debito: round2(debito),
    credito: round2(credito),
    ...(departamentoId ? { departamento_id: departamentoId } : {}),
  });
}

async function finalizar(
  acum: Acum,
  advertencias: string[],
): Promise<{ lineas: LineaAsiento[]; advertencias: string[] }> {
  const lineas = [...acum.values()].filter((l) => l.debito > 0 || l.credito > 0);
  const nombresCuentas = await nombres(lineas.map((l) => l.cuenta));
  const malas = await noDetalle(lineas.map((l) => l.cuenta));
  for (const l of lineas) {
    l.cuenta_nombre = nombresCuentas.get(l.cuenta) ?? "";
    if (malas.has(l.cuenta))
      advertencias.push(
        `La cuenta ${l.cuenta} configurada en la clasificación no recibe movimientos: cámbiala antes de guardar.`,
      );
  }
  return { lineas, advertencias: [...new Set(advertencias)] };
}

/* --------------------------------- Ventas -------------------------------- */

export interface LineaVenta {
  producto_id: string;
  cantidad: number;
  /** Precio unitario en la moneda del documento (sin ITBIS). */
  precio: number;
  descuento: number;
  itbis: number;
}

export interface EntradaPropuestaPedido {
  cliente_id: string;
  moneda?: string | undefined;
  tasa_cambio?: number | undefined;
  lineas: LineaVenta[];
}

/** Cuenta por cobrar del cliente según su clase (ar_classes). */
async function cuentaCliente(clienteId: string): Promise<string> {
  const filas = await sql<Record<string, unknown>>(
    `SELECT COALESCE(k.debit_account,'') AS cuenta
     FROM customers c LEFT JOIN ar_classes k ON k.class_id = c.class_id
     WHERE c.customer_id = ?`,
    [clienteId],
  );
  const cuenta = txt(filas[0]?.["cuenta"]);
  if (cuenta) return cuenta;
  const clase = await sql<Record<string, unknown>>(
    `SELECT debit_account FROM ar_classes
     WHERE kind = 'CLIENTE' AND debit_account IS NOT NULL ORDER BY class_id LIMIT 1`,
  );
  return txt(clase[0]?.["debit_account"]);
}

/**
 * Asiento propuesto de una venta:
 *   Débito  Cuentas por cobrar (total con ITBIS)
 *   Débito  Descuentos concedidos
 *   Crédito Ventas brutas       (por clasificación)
 *   Crédito ITBIS por pagar
 *   Débito  Costo de ventas / Crédito Inventario (por clasificación)
 */
export async function propuestaPedido(
  entrada: EntradaPropuestaPedido,
): Promise<{ lineas: LineaAsiento[]; advertencias: string[] }> {
  if (!(await usarMysql())) return { lineas: [], advertencias: [] };
  const advertencias: string[] = [];
  const tasa = entrada.tasa_cambio && entrada.tasa_cambio > 0 ? entrada.tasa_cambio : 1;
  const lineas = entrada.lineas.filter((l) => l.producto_id && l.cantidad > 0);
  if (!lineas.length) return { lineas: [], advertencias: [] };

  const [res, prods, cxc] = await Promise.all([
    resolver(),
    productos(lineas.map((l) => l.producto_id)),
    cuentaCliente(entrada.cliente_id),
  ]);

  const acum: Acum = new Map();
  let total = 0;

  for (const l of lineas) {
    const p = prods.get(l.producto_id);
    const grupo = p?.grupo ?? "";
    const dep = res.departamento(grupo);
    const bruto = round2(l.cantidad * l.precio);
    const descuento = round2(l.descuento);
    const itbis = round2(l.itbis);
    total = round2(total + bruto - descuento + itbis);

    acumular(acum, res.cuenta(grupo, PROPOSITO.ventas), "Ventas", 0, bruto, dep);
    if (descuento > 0)
      acumular(acum, res.cuenta(grupo, PROPOSITO.descuentos), "Descuentos", descuento, 0, dep);
    if (itbis > 0)
      acumular(acum, res.cuenta(grupo, PROPOSITO.itbis), "ITBIS por pagar", 0, itbis, "");

    // El costo se guarda en pesos en products.cost: se expresa en la moneda del documento.
    if (p && !p.servicio && p.costo > 0) {
      const costo = round2((l.cantidad * p.costo) / tasa);
      acumular(acum, res.cuenta(grupo, PROPOSITO.costo), "Costo de ventas", costo, 0, dep);
      acumular(acum, res.cuenta(grupo, PROPOSITO.inventario), "Costo de ventas", 0, costo, dep);
    }

    if (!res.cuenta(grupo, PROPOSITO.ventas))
      advertencias.push(
        `El producto ${l.producto_id} no tiene cuenta de ventas en su clasificación.`,
      );
  }

  if (cxc) acumular(acum, cxc, "Cuentas por cobrar", total, 0, "");
  else advertencias.push("El cliente no tiene cuenta por cobrar configurada en su clase.");

  return finalizar(acum, advertencias);
}

/* ------------------------------- Inventario ------------------------------ */

export interface LineaCosto {
  producto_id: string;
  cantidad: number;
  /** Costo total de la línea en pesos. */
  costo_total: number;
}

export interface EntradaPropuestaInventario {
  operacion_id: number;
  lineas: LineaCosto[];
}

/** Propósito de la contrapartida según el tipo de transacción de inventario. */
function propositoContra(operacionId: number): string {
  if (operacionId === 25) return PROPOSITO.costoMuestras; // SALIDA DE MUESTRAS
  if (operacionId === 32) return PROPOSITO.costoDevolucion; // SALIDA POR GARANTIA
  if (operacionId === 33) return PROPOSITO.costoDevolucion; // ENTRADA POR GARANTIA
  return PROPOSITO.costo;
}

/**
 * Asiento propuesto de un documento de inventario:
 *   Entrada -> Débito Inventario / Crédito contrapartida
 *   Salida  -> Débito contrapartida / Crédito Inventario
 * La transferencia entre almacenes no genera asiento (el valor no cambia).
 */
export async function propuestaInventario(
  entrada: EntradaPropuestaInventario,
): Promise<{ lineas: LineaAsiento[]; advertencias: string[] }> {
  if (!(await usarMysql())) return { lineas: [], advertencias: [] };
  if (!entrada.operacion_id || esTransferencia(entrada.operacion_id))
    return { lineas: [], advertencias: [] };

  const lineas = entrada.lineas.filter((l) => l.producto_id && l.costo_total > 0);
  if (!lineas.length) return { lineas: [], advertencias: [] };

  const ops = await sql<Record<string, unknown>>(
    `SELECT type FROM inventory_operations WHERE inventory_op_id = ?`,
    [entrada.operacion_id],
  );
  const tipo = txt(ops[0]?.["type"]) === "S" ? "S" : "E";
  const proposito = propositoContra(entrada.operacion_id);

  const [res, prods] = await Promise.all([
    resolver(),
    productos(lineas.map((l) => l.producto_id)),
  ]);

  const advertencias: string[] = [];
  const acum: Acum = new Map();

  for (const l of lineas) {
    const grupo = prods.get(l.producto_id)?.grupo ?? "";
    const dep = res.departamento(grupo);
    const monto = round2(l.costo_total);
    const inventario = res.cuenta(grupo, PROPOSITO.inventario);
    const contra = res.cuenta(grupo, proposito) || res.cuenta(grupo, PROPOSITO.costo);
    if (!inventario || !contra)
      advertencias.push(
        `El producto ${l.producto_id} no tiene cuentas completas en su clasificación.`,
      );
    if (tipo === "E") {
      acumular(acum, inventario, "Entrada de inventario", monto, 0, dep);
      acumular(acum, contra, "Entrada de inventario", 0, monto, dep);
    } else {
      acumular(acum, contra, "Salida de inventario", monto, 0, dep);
      acumular(acum, inventario, "Salida de inventario", 0, monto, dep);
    }
  }

  return finalizar(acum, advertencias);
}

/* ---------------------------- Notas de crédito --------------------------- */

export interface LineaNotaCreditoCuentas {
  producto_id: string;
  cantidad: number;
  /** Precio unitario en la moneda del documento (sin ITBIS). */
  precio: number;
  descuento: number;
  itbis: number;
}

export interface EntradaPropuestaNotaCredito {
  cliente_id: string;
  moneda?: string | undefined;
  tasa_cambio?: number | undefined;
  /** Cuando la mercancía regresa al inventario se revierte también el costo. */
  reponer_inventario?: boolean | undefined;
  lineas: LineaNotaCreditoCuentas[];
}

/**
 * Asiento propuesto de una nota de crédito (inverso de la venta):
 *   Débito  Mercancía devuelta (o Ventas brutas si no está configurada)
 *   Débito  ITBIS por pagar
 *   Crédito Cuentas por cobrar (total con ITBIS)
 *   Crédito Descuentos concedidos (se revierte la parte proporcional)
 *   Si repone inventario: Débito Inventario / Crédito Costo mercancía devuelta
 */
export async function propuestaNotaCredito(
  entrada: EntradaPropuestaNotaCredito,
): Promise<{ lineas: LineaAsiento[]; advertencias: string[] }> {
  if (!(await usarMysql())) return { lineas: [], advertencias: [] };
  const advertencias: string[] = [];
  const tasa = entrada.tasa_cambio && entrada.tasa_cambio > 0 ? entrada.tasa_cambio : 1;
  const lineas = entrada.lineas.filter((l) => l.producto_id && l.cantidad > 0);
  if (!lineas.length) return { lineas: [], advertencias: [] };

  const [res, prods, cxc] = await Promise.all([
    resolver(),
    productos(lineas.map((l) => l.producto_id)),
    cuentaCliente(entrada.cliente_id),
  ]);

  const acum: Acum = new Map();
  let total = 0;

  for (const l of lineas) {
    const p = prods.get(l.producto_id);
    const grupo = p?.grupo ?? "";
    const dep = res.departamento(grupo);
    const bruto = round2(l.cantidad * l.precio);
    const descuento = round2(l.descuento);
    const itbis = round2(l.itbis);
    total = round2(total + bruto - descuento + itbis);

    const devuelta = res.cuenta(grupo, PROPOSITO.devolucion) || res.cuenta(grupo, PROPOSITO.ventas);
    acumular(acum, devuelta, "Mercancía devuelta", bruto, 0, dep);
    if (descuento > 0)
      acumular(acum, res.cuenta(grupo, PROPOSITO.descuentos), "Descuentos", 0, descuento, dep);
    if (itbis > 0)
      acumular(acum, res.cuenta(grupo, PROPOSITO.itbis), "ITBIS por pagar", itbis, 0, "");

    if (entrada.reponer_inventario && p && !p.servicio && p.costo > 0) {
      const costo = round2((l.cantidad * p.costo) / tasa);
      const contra =
        res.cuenta(grupo, PROPOSITO.costoDevolucion) || res.cuenta(grupo, PROPOSITO.costo);
      acumular(acum, res.cuenta(grupo, PROPOSITO.inventario), "Mercancía devuelta", costo, 0, dep);
      acumular(acum, contra, "Mercancía devuelta", 0, costo, dep);
    }

    if (!devuelta)
      advertencias.push(
        `El producto ${l.producto_id} no tiene cuenta de mercancía devuelta ni de ventas en su clasificación.`,
      );
  }

  if (cxc) acumular(acum, cxc, "Cuentas por cobrar", 0, total, "");
  else advertencias.push("El cliente no tiene cuenta por cobrar configurada en su clase.");

  return finalizar(acum, advertencias);
}

/* ------------------------- Compras y cuentas por pagar ------------------- */

/** Cuentas por defecto cuando el suplidor no las tiene configuradas. */
export const CUENTA_ITBIS_COMPRAS = "131202";
export const CUENTA_ITBIS_RETENIDO_CXP = "2149";
export const CUENTA_ISR_RETENIDO_CXP = "2162";
export const CUENTA_CXP_SUPLIDORES = "2120102";

export interface CuentasSuplidor {
  /** Cuenta por pagar del suplidor (suppliers.credit_account). */
  cxp: string;
  /** Cuenta del ITBIS adelantado (suppliers.itbis_account). */
  itbis: string;
  /** Cuenta de gasto o costo por defecto (suppliers.debit_account). */
  gasto: string;
}

export async function cuentasSuplidor(suplidorId: string): Promise<CuentasSuplidor> {
  if (!(await usarMysql()) || !suplidorId)
    return { cxp: CUENTA_CXP_SUPLIDORES, itbis: CUENTA_ITBIS_COMPRAS, gasto: "" };
  const filas = await sql<Record<string, unknown>>(
    `SELECT COALESCE(credit_account,'') AS cxp, COALESCE(itbis_account,'') AS itbis,
            COALESCE(debit_account,'') AS gasto
     FROM suppliers WHERE supplier_id = ? LIMIT 1`,
    [Number(suplidorId)],
  );
  const f = filas[0];
  return {
    cxp: txt(f?.["cxp"]) || CUENTA_CXP_SUPLIDORES,
    itbis: txt(f?.["itbis"]) || CUENTA_ITBIS_COMPRAS,
    gasto: txt(f?.["gasto"]),
  };
}

export interface LineaRecibida {
  producto_id: string;
  cantidad: number;
  /** Costo total de la línea en la moneda del documento. */
  costo_total: number;
}

export interface EntradaPropuestaCompra {
  suplidor_id: string;
  lineas: LineaRecibida[];
  /** ITBIS adelantado de la factura (0 cuando recibe almacén). */
  itbis?: number | undefined;
  /** Parte del ITBIS que se lleva al costo. */
  itbis_costo?: number | undefined;
  itbis_retenido?: number | undefined;
  isr_retenido?: number | undefined;
  /** ISC, propina y otros impuestos que aumentan el costo. */
  otros?: number | undefined;
}

/**
 * Asiento propuesto de una recepción de compra:
 *   Débito  Inventario (por clasificación del producto)
 *   Débito  ITBIS adelantado
 *   Crédito Cuentas por pagar del suplidor
 *   Crédito ITBIS retenido / ISR retenido
 */
export async function propuestaCompra(
  entrada: EntradaPropuestaCompra,
): Promise<{ lineas: LineaAsiento[]; advertencias: string[] }> {
  if (!(await usarMysql())) return { lineas: [], advertencias: [] };
  const advertencias: string[] = [];
  const lineas = entrada.lineas.filter((l) => l.producto_id && l.costo_total > 0);
  if (!lineas.length) return { lineas: [], advertencias: [] };

  const [res, prods, ct] = await Promise.all([
    resolver(),
    productos(lineas.map((l) => l.producto_id)),
    cuentasSuplidor(entrada.suplidor_id),
  ]);

  const acum: Acum = new Map();
  let costo = 0;

  for (const l of lineas) {
    const grupo = prods.get(l.producto_id)?.grupo ?? "";
    const dep = res.departamento(grupo);
    const monto = round2(l.costo_total);
    const inventario = res.cuenta(grupo, PROPOSITO.inventario);
    if (!inventario)
      advertencias.push(
        `El producto ${l.producto_id} no tiene cuenta de inventario en su clasificación.`,
      );
    acumular(acum, inventario, "Compra de mercancía", monto, 0, dep);
    costo = round2(costo + monto);
  }

  const otros = round2(entrada.otros ?? 0);
  const itbisCosto = round2(entrada.itbis_costo ?? 0);
  if (otros + itbisCosto > 0) {
    const grupo = prods.get(lineas[0]?.producto_id ?? "")?.grupo ?? "";
    acumular(
      acum,
      res.cuenta(grupo, PROPOSITO.inventario),
      "Otros costos de la compra",
      round2(otros + itbisCosto),
      0,
      res.departamento(grupo),
    );
  }

  const itbis = round2(Math.max((entrada.itbis ?? 0) - itbisCosto, 0));
  if (itbis > 0) acumular(acum, ct.itbis, "ITBIS adelantado en compras", itbis, 0, "");

  const itbisRet = round2(entrada.itbis_retenido ?? 0);
  const isrRet = round2(entrada.isr_retenido ?? 0);
  if (itbisRet > 0)
    acumular(acum, CUENTA_ITBIS_RETENIDO_CXP, "ITBIS retenido al suplidor", 0, itbisRet, "");
  if (isrRet > 0)
    acumular(acum, CUENTA_ISR_RETENIDO_CXP, "ISR retenido al suplidor", 0, isrRet, "");

  const porPagar = round2(costo + otros + itbisCosto + itbis - itbisRet - isrRet);
  if (porPagar > 0) acumular(acum, ct.cxp, "Cuentas por pagar suplidor", 0, porPagar, "");

  return finalizar(acum, advertencias);
}

export interface EntradaPropuestaFacturaSuplidor {
  suplidor_id: string;
  bienes: number;
  servicios: number;
  propina?: number | undefined;
  isc?: number | undefined;
  otros_impuestos?: number | undefined;
  itbis?: number | undefined;
  itbis_costo?: number | undefined;
  itbis_retenido?: number | undefined;
  isr_retenido?: number | undefined;
  /** Cuenta de gasto elegida por el usuario; si falta se usa la del suplidor. */
  cuenta_gasto?: string | undefined;
}

/**
 * Asiento propuesto de una factura de suplidor sin orden de compra:
 *   Débito  Gasto o costo (bienes, servicios y otros cargos)
 *   Débito  ITBIS adelantado
 *   Crédito Cuentas por pagar del suplidor
 *   Crédito ITBIS retenido / ISR retenido
 */
export async function propuestaFacturaSuplidor(
  entrada: EntradaPropuestaFacturaSuplidor,
): Promise<{ lineas: LineaAsiento[]; advertencias: string[] }> {
  if (!(await usarMysql())) return { lineas: [], advertencias: [] };
  const advertencias: string[] = [];
  const ct = await cuentasSuplidor(entrada.suplidor_id);
  const gasto = entrada.cuenta_gasto || ct.gasto;

  const itbisCosto = round2(entrada.itbis_costo ?? 0);
  const cargo = round2(
    entrada.bienes +
      entrada.servicios +
      (entrada.propina ?? 0) +
      (entrada.isc ?? 0) +
      (entrada.otros_impuestos ?? 0) +
      itbisCosto,
  );
  const itbis = round2(Math.max((entrada.itbis ?? 0) - itbisCosto, 0));
  const itbisRet = round2(entrada.itbis_retenido ?? 0);
  const isrRet = round2(entrada.isr_retenido ?? 0);
  if (cargo <= 0) return { lineas: [], advertencias: [] };

  const acum: Acum = new Map();
  if (gasto) acumular(acum, gasto, "Factura del suplidor", cargo, 0, "");
  else
    advertencias.push(
      "El suplidor no tiene cuenta de gasto configurada: elige la cuenta del asiento antes de guardar.",
    );
  if (itbis > 0) acumular(acum, ct.itbis, "ITBIS adelantado en compras", itbis, 0, "");
  if (itbisRet > 0)
    acumular(acum, CUENTA_ITBIS_RETENIDO_CXP, "ITBIS retenido al suplidor", 0, itbisRet, "");
  if (isrRet > 0)
    acumular(acum, CUENTA_ISR_RETENIDO_CXP, "ISR retenido al suplidor", 0, isrRet, "");
  const porPagar = round2(cargo + itbis - itbisRet - isrRet);
  if (porPagar > 0) acumular(acum, ct.cxp, "Cuentas por pagar suplidor", 0, porPagar, "");

  return finalizar(acum, advertencias);
}
