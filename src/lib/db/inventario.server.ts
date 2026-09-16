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

interface FilaInsert {
  operacionId: number;
  almacenId: number;
  cantidad: number;
  serial: string;
}

async function insertarFila(
  entrada: NuevoMovimientoInventario,
  fila: FilaInsert,
  costoUnitario: number,
): Promise<number> {
  const r = await ejecutar(
    `INSERT INTO inventory
       (date, time, quantity, value, cost, discount, taxes, source_app, source_doc,
        reference, serial, status, inventory_op_id, warehouse_id, product_id,
        inventory_location, department_id, notes)
     VALUES (?, CURTIME(), ?, 0, ?, 0, 0, 'INV', ?, ?, ?, 'A', ?, ?, ?, ?, ?, ?)`,
    [
      entrada.fecha,
      fila.cantidad,
      costoUnitario,
      (entrada.documento ?? "").slice(0, 10),
      (entrada.referencia ?? "").slice(0, 10),
      fila.serial.slice(0, 50) || null,
      fila.operacionId,
      fila.almacenId,
      entrada.producto_id,
      (entrada.ubicacion ?? "").slice(0, 20) || null,
      entrada.departamento_id ? Number(entrada.departamento_id) : null,
      entrada.notas ?? "",
    ],
  );
  return r.insertId;
}

export async function crearMovimientoInventario(
  entrada: NuevoMovimientoInventario,
): Promise<{ ids: number[] }> {
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

  const cantidad = Math.abs(entrada.cantidad);
  if (cantidad <= 0) throw new Error("La cantidad debe ser mayor que cero.");
  const costoUnitario = round2(
    entrada.costo_unitario > 0 ? entrada.costo_unitario : entrada.costo_total / cantidad,
  );

  const almacenOrigen = Number(entrada.almacen_id);
  const transferencia = esTransferencia(entrada.operacion_id);
  const almacenDestino = Number(entrada.almacen_destino_id ?? 0);
  if (transferencia) {
    if (!almacenDestino) throw new Error("Selecciona el almacén de destino.");
    if (almacenDestino === almacenOrigen)
      throw new Error("El almacén de destino debe ser distinto al de origen.");
  }

  const seriales = (entrada.seriales ?? []).map((s) => s.trim()).filter(Boolean);
  const unidades: { cantidad: number; serial: string }[] = seriales.length
    ? seriales.map((s) => ({ cantidad: 1, serial: s }))
    : [{ cantidad, serial: "" }];

  const ids: number[] = [];
  for (const u of unidades) {
    if (transferencia) {
      ids.push(
        await insertarFila(
          entrada,
          {
            operacionId: OP_TRANSFERENCIA_SALIDA,
            almacenId: almacenOrigen,
            cantidad: -u.cantidad,
            serial: u.serial,
          },
          costoUnitario,
        ),
      );
      ids.push(
        await insertarFila(
          entrada,
          {
            operacionId: OP_TRANSFERENCIA_ENTRADA,
            almacenId: almacenDestino,
            cantidad: u.cantidad,
            serial: u.serial,
          },
          costoUnitario,
        ),
      );
    } else {
      ids.push(
        await insertarFila(
          entrada,
          {
            operacionId: entrada.operacion_id,
            almacenId: almacenOrigen,
            cantidad: tipo === "S" ? -u.cantidad : u.cantidad,
            serial: u.serial,
          },
          costoUnitario,
        ),
      );
    }
  }
  return { ids };
}

/** Anula un movimiento (status = 'I'): deja de contar para la existencia. */
export async function anularMovimientoInventario(id: number): Promise<void> {
  if (!(await usarMysql())) throw new Error("Sin conexión a la base de datos.");
  await ejecutar(`UPDATE inventory SET status = 'I' WHERE inventory_id = ?`, [id]);
}
