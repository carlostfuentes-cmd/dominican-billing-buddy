// Campos personalizados: definición (company_fields) y valores por documento
// (company_fields_values). No se crean tablas nuevas.

import { ejecutar, mysqlActivo, sql } from "./mysql.server";

export type ProcesoCampo = "PEDIDOS" | "COTIZACIONES" | "CONDUCES" | "DEVOLUCIONES";
export type TipoCampo = "CARACTER" | "PARRAFO" | "ENTERO" | "DECIMAL" | "FECHA";

export type CampoPersonalizado = {
  id: number;
  nombre: string;
  tipo: TipoCampo;
  longitud: number;
  decimales: number;
  proceso: ProcesoCampo;
};

export type ValorCampo = {
  campo_id: number;
  nombre: string;
  tipo: TipoCampo;
  longitud: number;
  decimales: number;
  valor: string;
};

type FilaCampo = {
  custom_id: number;
  name: string | null;
  kind: TipoCampo;
  length: number;
  decimals: number;
  process: string | null;
};

const mapear = (f: FilaCampo): CampoPersonalizado => ({
  id: Number(f.custom_id),
  nombre: f.name ?? "",
  tipo: f.kind,
  longitud: Number(f.length ?? 0),
  decimales: Number(f.decimals ?? 0),
  proceso: (f.process ?? "PEDIDOS").toUpperCase() as ProcesoCampo,
});

export async function listarCampos(proceso?: ProcesoCampo): Promise<CampoPersonalizado[]> {
  if (!(await mysqlActivo())) return [];
  const filas = proceso
    ? await sql<FilaCampo>(
        "SELECT custom_id, name, kind, `length`, decimals, process FROM company_fields WHERE process = ? ORDER BY custom_id",
        [proceso],
      )
    : await sql<FilaCampo>(
        "SELECT custom_id, name, kind, `length`, decimals, process FROM company_fields ORDER BY process, custom_id",
      );
  return filas.map(mapear);
}

export async function guardarCampo(entrada: {
  id?: number;
  nombre: string;
  tipo: TipoCampo;
  longitud: number;
  decimales: number;
  proceso: ProcesoCampo;
}): Promise<number> {
  if (entrada.id) {
    await ejecutar(
      "UPDATE company_fields SET name = ?, kind = ?, `length` = ?, decimals = ?, process = ? WHERE custom_id = ?",
      [
        entrada.nombre,
        entrada.tipo,
        entrada.longitud,
        entrada.decimales,
        entrada.proceso,
        entrada.id,
      ],
    );
    return entrada.id;
  }
  const r = await ejecutar(
    "INSERT INTO company_fields (name, kind, `length`, decimals, process) VALUES (?, ?, ?, ?, ?)",
    [entrada.nombre, entrada.tipo, entrada.longitud, entrada.decimales, entrada.proceso],
  );
  return r.insertId;
}

export async function eliminarCampo(id: number): Promise<void> {
  await ejecutar("DELETE FROM company_fields_values WHERE custom_id = ?", [id]);
  await ejecutar("DELETE FROM company_fields WHERE custom_id = ?", [id]);
}

/** Campos del proceso con el valor guardado del documento (si existe). */
export async function valoresDocumento(
  proceso: ProcesoCampo,
  referencia: string,
): Promise<ValorCampo[]> {
  const campos = await listarCampos(proceso);
  if (!campos.length) return [];
  let valores: { custom_id: number; value: string | null }[] = [];
  if (referencia) {
    valores = await sql<{ custom_id: number; value: string | null }>(
      `SELECT custom_id, value FROM company_fields_values
       WHERE reference = ? AND custom_id IN (${campos.map(() => "?").join(",")})`,
      [referencia, ...campos.map((c) => c.id)],
    );
  }
  return campos.map((c) => ({
    campo_id: c.id,
    nombre: c.nombre,
    tipo: c.tipo,
    longitud: c.longitud,
    decimales: c.decimales,
    valor: String(valores.find((v) => Number(v.custom_id) === c.id)?.value ?? ""),
  }));
}

/** Guarda (reemplaza) los valores de los campos personalizados de un documento. */
export async function guardarValores(
  proceso: ProcesoCampo,
  referencia: string,
  valores: { campo_id: number; valor: string }[],
): Promise<void> {
  if (!referencia || !valores.length) return;
  const campos = await listarCampos(proceso);
  const permitidos = new Set(campos.map((c) => c.id));
  for (const v of valores) {
    if (!permitidos.has(v.campo_id)) continue;
    const existente = await sql<{ cv_ID: number }>(
      "SELECT cv_ID FROM company_fields_values WHERE reference = ? AND custom_id = ? LIMIT 1",
      [referencia, v.campo_id],
    );
    const valor = v.valor.trim();
    const id = existente[0]?.cv_ID;
    if (id) {
      if (valor) {
        await ejecutar("UPDATE company_fields_values SET value = ? WHERE cv_ID = ?", [valor, id]);
      } else {
        await ejecutar("DELETE FROM company_fields_values WHERE cv_ID = ?", [id]);
      }
    } else if (valor) {
      await ejecutar(
        "INSERT INTO company_fields_values (reference, value, custom_id) VALUES (?, ?, ?)",
        [referencia, valor, v.campo_id],
      );
    }
  }
}
