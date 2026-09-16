// Inventario sobre las tablas existentes:
//   inventory             -> movimientos (una fila por entrada/salida)
//   inventory_operations  -> tipos de transacción (type 'E' entrada, 'S' salida)
//   warehouse             -> almacenes, gl_department -> departamentos
//
// Convención de la base: las entradas guardan cantidad positiva y las salidas
// negativa. La transferencia de almacén genera dos filas: salida en el almacén
// de origen (op 22) y entrada en el almacén de destino (op 12).

import {
  round2,
  type ExistenciaInventario,
  type FiltroInventario,
  type LineaInventario,
  type ListasInventario,
  type MovimientoInventario,
  type NuevoDocumentoInventario,
  type NuevoMovimientoInventario,
  type OpcionId,
  type OperacionInventario,
} from "@/lib/erp-types";
import { ejecutar, sql } from "./mysql.server";
import { usarMysql } from "./repo.server";

export const OP_TRANSFERENCIA_ENTRADA = 12;
export const OP_TRANSFERENCIA_SALIDA = 22;

const txt = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* -------------------------------- Listas -------------------------------- */

export async function listasInventario(): Promise<ListasInventario> {
  if (!(await usarMysql())) {
    return {
      operaciones: [
        { id: 1, nombre: "ENTRADA", tipo: "E", app: "INV", adicional: "" },
        { id: 2, nombre: "SALIDA", tipo: "S", app: "INV", adicional: "" },
        { id: 3, nombre: "AJUSTE DE ENTRADA", tipo: "E", app: "INV", adicional: "" },
        { id: 4, nombre: "AJUSTE DE SALIDA", tipo: "S", app: "INV", adicional: "" },
        {
          id: OP_TRANSFERENCIA_ENTRADA,
          nombre: "TRANSFERENCIA DE ALMACEN",
          tipo: "E",
          app: "INV",
          adicional: "ENTRADA",
        },
      ],
      almacenes: [
        { id: "1", nombre: "PRINCIPAL" },
        { id: "2", nombre: "SHOW ROOM" },
      ],
      departamentos: [{ id: "1", nombre: "GENERAL" }],
    };
  }

  const [ops, almacenes, departamentos] = await Promise.all([
    sql<Record<string, unknown>>(
      `SELECT inventory_op_id AS id, name, type, COALESCE(source_app,'') AS app,
              COALESCE(adicional,'') AS adicional
       FROM inventory_operations
       WHERE COALESCE(source_app,'') = 'INV'
       ORDER BY inventory_op_id`,
    ),
    sql<Record<string, unknown>>(`SELECT warehouse_id AS id, name FROM warehouse ORDER BY name`),
    sql<Record<string, unknown>>(`SELECT department_id AS id, name FROM gl_department ORDER BY name`),
  ]);

  const operaciones: OperacionInventario[] = ops
    // La salida de la transferencia se genera automáticamente; se oculta.
    .filter((o) => num(o["id"]) !== OP_TRANSFERENCIA_SALIDA)
    .map((o) => ({
      id: num(o["id"]),
      nombre: txt(o["name"]),
      tipo: txt(o["type"]) === "S" ? "S" : "E",
      app: txt(o["app"]),
      adicional: txt(o["adicional"]),
    }));

  const opcion = (f: Record<string, unknown>): OpcionId => ({
    id: txt(f["id"]),
    nombre: txt(f["name"]),
  });

  return {
    operaciones,
    almacenes: almacenes.map(opcion),
    departamentos: departamentos.map(opcion),
  };
}

export function esTransferencia(operacionId: number): boolean {
  return operacionId === OP_TRANSFERENCIA_ENTRADA || operacionId === OP_TRANSFERENCIA_SALIDA;
}

/* ------------------------------ Movimientos ------------------------------ */

const SQL_MOVIMIENTOS = `
  SELECT i.inventory_id AS id,
         DATE_FORMAT(i.date, '%Y-%m-%d') AS fecha,
         i.product_id AS producto_id,
         COALESCE(p.name, '') AS producto,
         i.inventory_op_id AS operacion_id,
         COALESCE(o.name, '') AS operacion,
         COALESCE(o.type, 'E') AS tipo,
         i.warehouse_id AS almacen_id,
         COALESCE(w.name, '') AS almacen,
         i.quantity AS cantidad,
         COALESCE(i.cost, 0) AS costo_unitario,
         COALESCE(i.source_doc, '') AS documento,
         COALESCE(i.reference, '') AS referencia,
         COALESCE(i.serial, '') AS serial,
         COALESCE(i.inventory_location, '') AS ubicacion,
         i.department_id AS departamento_id,
         COALESCE(i.notes, '') AS notas,
         COALESCE(i.status, 'A') AS estado
  FROM inventory i
  LEFT JOIN products p ON p.product_id = i.product_id
  LEFT JOIN inventory_operations o ON o.inventory_op_id = i.inventory_op_id
  LEFT JOIN warehouse w ON w.warehouse_id = i.warehouse_id
`;

function mapearMovimiento(f: Record<string, unknown>): MovimientoInventario {
  const cantidad = num(f["cantidad"]);
  const costoUnitario = num(f["costo_unitario"]);
  return {
    id: num(f["id"]),
    fecha: txt(f["fecha"]),
    producto_id: txt(f["producto_id"]),
    producto: txt(f["producto"]),
    operacion_id: num(f["operacion_id"]),
    operacion: txt(f["operacion"]),
    tipo: txt(f["tipo"]) === "S" ? "S" : "E",
    almacen_id: txt(f["almacen_id"]),
    almacen: txt(f["almacen"]),
    cantidad,
    costo_unitario: costoUnitario,
    costo_total: round2(Math.abs(cantidad) * costoUnitario),
    documento: txt(f["documento"]),
    referencia: txt(f["referencia"]),
    serial: txt(f["serial"]),
    ubicacion: txt(f["ubicacion"]),
    departamento_id: txt(f["departamento_id"]),
    notas: txt(f["notas"]),
    anulado: txt(f["estado"]) === "I",
  };
}

export async function listarMovimientosInventario(
  filtro: FiltroInventario = {},
): Promise<MovimientoInventario[]> {
  if (!(await usarMysql())) return [];
  const cond: string[] = [];
  const params: unknown[] = [];
  if (filtro.desde) {
    cond.push("i.date >= ?");
    params.push(filtro.desde);
  }
  if (filtro.hasta) {
    cond.push("i.date <= ?");
    params.push(filtro.hasta);
  }
  if (filtro.productoId) {
    cond.push("i.product_id = ?");
    params.push(filtro.productoId);
  }
  if (filtro.almacenId) {
    cond.push("i.warehouse_id = ?");
    params.push(Number(filtro.almacenId));
  }
  if (filtro.operacionId) {
    cond.push("i.inventory_op_id = ?");
    params.push(Number(filtro.operacionId));
  }
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  const filas = await sql<Record<string, unknown>>(
    `${SQL_MOVIMIENTOS} ${where} ORDER BY i.date DESC, i.inventory_id DESC LIMIT 500`,
    params,
  );
  return filas.map(mapearMovimiento);
}

/* ------------------------------ Existencias ------------------------------ */

export async function existenciasInventario(
  productoId?: string,
  almacenId?: string,
): Promise<ExistenciaInventario[]> {
  if (!(await usarMysql())) return [];
  const cond = ["i.status = 'A'"];
  const params: unknown[] = [];
  if (productoId) {
    cond.push("i.product_id = ?");
    params.push(productoId);
  }
  if (almacenId) {
    cond.push("i.warehouse_id = ?");
    params.push(Number(almacenId));
  }
  const filas = await sql<Record<string, unknown>>(
    `SELECT i.product_id AS producto_id,
            COALESCE(p.name, '') AS producto,
            COALESCE(m.name, '') AS unidad,
            i.warehouse_id AS almacen_id,
            COALESCE(w.name, '') AS almacen,
            SUM(i.quantity) AS existencia,
            COALESCE(p.cost, 0) AS costo
     FROM inventory i
     LEFT JOIN products p ON p.product_id = i.product_id
     LEFT JOIN measures m ON m.measure_id = p.measure_id
     LEFT JOIN warehouse w ON w.warehouse_id = i.warehouse_id
     WHERE ${cond.join(" AND ")}
     GROUP BY i.product_id, i.warehouse_id, p.name, m.name, w.name, p.cost
     HAVING SUM(i.quantity) <> 0
     ORDER BY p.name, w.name
     LIMIT 500`,
    params,
  );
  return filas.map((f) => {
    const existencia = round2(num(f["existencia"]));
    const costo = round2(num(f["costo"]));
    return {
      producto_id: txt(f["producto_id"]),
      producto: txt(f["producto"]),
      unidad: txt(f["unidad"]),
      almacen_id: txt(f["almacen_id"]),
      almacen: txt(f["almacen"]),
      existencia,
      costo,
      valor: round2(existencia * costo),
    };
  });
}

/** Existencia actual de un producto en un almacén. */
export async function existenciaProducto(
  productoId: string,
  almacenId: string,
): Promise<number> {
  if (!(await usarMysql()) || !productoId || !almacenId) return 0;
  const filas = await sql<Record<string, unknown>>(
    `SELECT COALESCE(SUM(quantity), 0) AS existencia
     FROM inventory
     WHERE status = 'A' AND product_id = ? AND warehouse_id = ?`,
    [productoId, Number(almacenId)],
  );
  return round2(num(filas[0]?.["existencia"]));
}

/* --------------------------- Registro y anulación ------------------------ */

interface Cabecera {
  fecha: string;
  documento: string;
  referencia?: string | undefined;
  departamento_id?: string | undefined;
  notas?: string | undefined;
}

interface FilaInsert {
  operacionId: number;
  almacenId: number;
  productoId: string;
  cantidad: number;
  costoUnitario: number;
  serial: string;
  ubicacion: string;
}

async function insertarFila(cab: Cabecera, fila: FilaInsert): Promise<number> {
  const r = await ejecutar(
    `INSERT INTO inventory
       (date, time, quantity, value, cost, discount, taxes, source_app, source_doc,
        reference, serial, status, inventory_op_id, warehouse_id, product_id,
        inventory_location, department_id, notes)
     VALUES (?, CURTIME(), ?, 0, ?, 0, 0, 'INV', ?, ?, ?, 'A', ?, ?, ?, ?, ?, ?)`,
    [
      cab.fecha,
      fila.cantidad,
      fila.costoUnitario,
      cab.documento.slice(0, 10),
      (cab.referencia ?? "").slice(0, 10),
      fila.serial.slice(0, 50) || null,
      fila.operacionId,
      fila.almacenId,
      fila.productoId,
      fila.ubicacion.slice(0, 20) || null,
      cab.departamento_id ? Number(cab.departamento_id) : null,
      cab.notas ?? "",
    ],
  );
  return r.insertId;
}

/** Operaciones que comparten el consecutivo (la transferencia usa un solo número). */
function opsDelConsecutivo(operacionId: number): number[] {
  return esTransferencia(operacionId)
    ? [OP_TRANSFERENCIA_ENTRADA, OP_TRANSFERENCIA_SALIDA]
    : [operacionId];
}

/** Próximo número de documento (source_doc) para el tipo de transacción. */
export async function proximoDocumentoInventario(operacionId: number): Promise<string> {
  if (!(await usarMysql()) || !operacionId) return "1";
  const ops = opsDelConsecutivo(operacionId);
  const filas = await sql<Record<string, unknown>>(
    `SELECT COALESCE(MAX(CAST(source_doc AS UNSIGNED)), 0) AS ultimo
     FROM inventory
     WHERE inventory_op_id IN (${ops.map(() => "?").join(",")})
       AND source_doc REGEXP '^[0-9]+$'`,
    ops,
  );
  return String(num(filas[0]?.["ultimo"]) + 1);
}

function unidadesLinea(linea: LineaInventario): { cantidad: number; serial: string }[] {
  const seriales = (linea.seriales ?? []).map((s) => s.trim()).filter(Boolean);
  if (seriales.length) return seriales.map((s) => ({ cantidad: 1, serial: s }));
  return [{ cantidad: Math.abs(linea.cantidad), serial: "" }];
}

/** Registra un documento de inventario con una o varias líneas de producto. */
export async function crearDocumentoInventario(
  entrada: NuevoDocumentoInventario,
): Promise<{ ids: number[]; documento: string }> {
  if (!(await usarMysql())) {
    throw new Error(
      "Sin conexión a la base de datos: no se puede registrar el movimiento de inventario.",
    );
  }

  const ops = await sql<Record<string, unknown>>(
    `SELECT inventory_op_id AS id, type FROM inventory_operations WHERE inventory_op_id = ?`,
    [entrada.operacion_id],
  );
  const op = ops[0];
  if (!op) throw new Error("Tipo de transacción no válido.");
  const tipo = txt(op["type"]) === "S" ? "S" : "E";

  const lineas = entrada.lineas.filter((l) => l.producto_id && Math.abs(l.cantidad) > 0);
  if (!lineas.length) throw new Error("Agrega al menos una línea con producto y cantidad.");

  const almacenOrigen = Number(entrada.almacen_id);
  const transferencia = esTransferencia(entrada.operacion_id);
  const almacenDestino = Number(entrada.almacen_destino_id ?? 0);
  if (transferencia) {
    if (!almacenDestino) throw new Error("Selecciona el almacén de destino.");
    if (almacenDestino === almacenOrigen)
      throw new Error("El almacén de destino debe ser distinto al de origen.");
  }

  const documento =
    (entrada.documento ?? "").trim() ||
    (await proximoDocumentoInventario(entrada.operacion_id));

  const cab: Cabecera = {
    fecha: entrada.fecha,
    documento,
    referencia: entrada.referencia,
    departamento_id: entrada.departamento_id,
    notas: entrada.notas,
  };

  const ids: number[] = [];
  for (const linea of lineas) {
    const cantidadLinea = Math.abs(linea.cantidad);
    const costoUnitario = round2(
      linea.costo_unitario > 0 ? linea.costo_unitario : linea.costo_total / cantidadLinea,
    );
    const ubicacion = linea.ubicacion ?? "";
    for (const u of unidadesLinea(linea)) {
      const base = {
        productoId: linea.producto_id,
        costoUnitario,
        serial: u.serial,
        ubicacion,
      };
      if (transferencia) {
        ids.push(
          await insertarFila(cab, {
            ...base,
            operacionId: OP_TRANSFERENCIA_SALIDA,
            almacenId: almacenOrigen,
            cantidad: -u.cantidad,
          }),
        );
        ids.push(
          await insertarFila(cab, {
            ...base,
            operacionId: OP_TRANSFERENCIA_ENTRADA,
            almacenId: almacenDestino,
            cantidad: u.cantidad,
          }),
        );
      } else {
        ids.push(
          await insertarFila(cab, {
            ...base,
            operacionId: entrada.operacion_id,
            almacenId: almacenOrigen,
            cantidad: tipo === "S" ? -u.cantidad : u.cantidad,
          }),
        );
      }
    }
  }
  await contabilizarDocumento(entrada, documento, tipo);

  return { ids, documento };
}

/**
 * Registra el asiento contable del documento de inventario.
 * Si el usuario no envía cuentas, se toman de la clasificación del producto.
 * La transferencia entre almacenes no genera asiento.
 */
async function contabilizarDocumento(
  entrada: NuevoDocumentoInventario,
  documento: string,
  tipo: "E" | "S",
): Promise<void> {
  if (esTransferencia(entrada.operacion_id)) return;

  let lineas = (entrada.asiento ?? []).filter(
    (l) => l.cuenta && (l.debito > 0 || l.credito > 0),
  );
  if (!lineas.length) {
    const { propuestaInventario } = await import("./cuentas.server");
    const propuesta = await propuestaInventario({
      operacion_id: entrada.operacion_id,
      lineas: entrada.lineas.map((l) => ({
        producto_id: l.producto_id,
        cantidad: Math.abs(l.cantidad),
        costo_total: l.costo_total,
      })),
    });
    lineas = propuesta.lineas;
  }
  if (lineas.length < 2) return;

  const debito = round2(lineas.reduce((a, l) => a + l.debito, 0));
  const credito = round2(lineas.reduce((a, l) => a + l.credito, 0));
  if (debito <= 0 || Math.abs(debito - credito) > 0.01) return;

  const { crearAsiento } = await import("./contabilidad.server");
  const descripcion =
    (entrada.notas ?? "").trim() ||
    `${tipo === "E" ? "Entrada" : "Salida"} de inventario documento ${documento}`;
  await crearAsiento({
    fecha: entrada.fecha,
    descripcion,
    documento,
    moneda: "DOP",
    tasa_cambio: 1,
    lineas,
  });
}

/** Compatibilidad: un movimiento de un solo producto. */
export async function crearMovimientoInventario(
  entrada: NuevoMovimientoInventario,
): Promise<{ ids: number[]; documento: string }> {
  return crearDocumentoInventario({
    operacion_id: entrada.operacion_id,
    fecha: entrada.fecha,
    almacen_id: entrada.almacen_id,
    almacen_destino_id: entrada.almacen_destino_id,
    documento: entrada.documento,
    referencia: entrada.referencia,
    departamento_id: entrada.departamento_id,
    notas: entrada.notas,
    lineas: [
      {
        producto_id: entrada.producto_id,
        cantidad: entrada.cantidad,
        costo_unitario: entrada.costo_unitario,
        costo_total: entrada.costo_total,
        ubicacion: entrada.ubicacion,
        seriales: entrada.seriales,
      },
    ],
  });
}

/** Anula un movimiento (status = 'I'): deja de contar para la existencia. */
export async function anularMovimientoInventario(id: number): Promise<void> {
  if (!(await usarMysql())) throw new Error("Sin conexión a la base de datos.");
  await ejecutar(`UPDATE inventory SET status = 'I' WHERE inventory_id = ?`, [id]);
}
