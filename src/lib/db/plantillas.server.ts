// Almacenamiento de las plantillas del diseñador de documentos.
// Se guarda como JSON en una tabla propia de la aplicación (print_templates);
// no se toca ninguna tabla del sistema existente.

import { ejecutar, sql, usarMysql } from "@/lib/db/mysql.server";
import type { Plantilla, TipoPlantilla } from "@/lib/plantillas-tipos";
import { plantillaBase } from "@/lib/plantillas-tipos";

const SQL_TABLA = `CREATE TABLE IF NOT EXISTS print_templates (
  company_id VARCHAR(20)  NOT NULL,
  doc_type   VARCHAR(20)  NOT NULL,
  name       VARCHAR(80)  NOT NULL DEFAULT '',
  layout     MEDIUMTEXT   NOT NULL,
  updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id, doc_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

let lista = false;
async function asegurarTabla(): Promise<void> {
  if (lista) return;
  await ejecutar(SQL_TABLA);
  lista = true;
}

const demo = new Map<string, Plantilla>();
const clave = (empresaId: string, docTipo: string) => `${empresaId}|${docTipo}`;

export interface ResumenPlantilla {
  empresa_id: string;
  doc_tipo: TipoPlantilla;
  nombre: string;
  actualizada: string;
}

function parsear(fila: Record<string, unknown>): Plantilla | null {
  try {
    const p = JSON.parse(String(fila["layout"])) as Plantilla;
    return {
      ...p,
      empresa_id: String(fila["company_id"]),
      doc_tipo: String(fila["doc_type"]) as TipoPlantilla,
    };
  } catch {
    return null;
  }
}

/** Plantilla de la empresa; si no tiene, la general ("*"); si no, la de fábrica. */
export async function obtenerPlantilla(
  empresaId: string,
  docTipo: TipoPlantilla,
): Promise<Plantilla> {
  const id = empresaId || "*";
  if (await usarMysql()) {
    try {
      await asegurarTabla();
      const filas = await sql<Record<string, unknown>>(
        "SELECT * FROM print_templates WHERE doc_type = ? AND company_id IN (?, '*')",
        [docTipo, id],
      );
      const propia = filas.find((f) => String(f["company_id"]) === id);
      const general = filas.find((f) => String(f["company_id"]) === "*");
      const p = (propia && parsear(propia)) || (general && parsear(general));
      if (p) return p;
    } catch {
      /* sin tabla o sin permisos: se usa la de fábrica */
    }
    return plantillaBase(id, docTipo);
  }
  return (
    demo.get(clave(id, docTipo)) ?? demo.get(clave("*", docTipo)) ?? plantillaBase(id, docTipo)
  );
}

export async function listarPlantillas(): Promise<ResumenPlantilla[]> {
  if (await usarMysql()) {
    try {
      await asegurarTabla();
      const filas = await sql<Record<string, unknown>>(
        "SELECT company_id, doc_type, name, updated_at FROM print_templates ORDER BY company_id, doc_type",
      );
      return filas.map((f) => ({
        empresa_id: String(f["company_id"]),
        doc_tipo: String(f["doc_type"]) as TipoPlantilla,
        nombre: String(f["name"] ?? ""),
        actualizada: String(f["updated_at"] ?? ""),
      }));
    } catch {
      return [];
    }
  }
  return [...demo.values()].map((p) => ({
    empresa_id: p.empresa_id,
    doc_tipo: p.doc_tipo,
    nombre: p.nombre,
    actualizada: "",
  }));
}

export async function guardarPlantilla(p: Plantilla): Promise<Plantilla> {
  if (await usarMysql()) {
    await asegurarTabla();
    await ejecutar(
      `INSERT INTO print_templates (company_id, doc_type, name, layout)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), layout = VALUES(layout)`,
      [p.empresa_id, p.doc_tipo, p.nombre, JSON.stringify(p)],
    );
    return p;
  }
  demo.set(clave(p.empresa_id, p.doc_tipo), p);
  return p;
}

export async function eliminarPlantilla(empresaId: string, docTipo: TipoPlantilla): Promise<void> {
  if (await usarMysql()) {
    await asegurarTabla();
    await ejecutar("DELETE FROM print_templates WHERE company_id = ? AND doc_type = ?", [
      empresaId,
      docTipo,
    ]);
    return;
  }
  demo.delete(clave(empresaId, docTipo));
}
