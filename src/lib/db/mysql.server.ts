// Única capa de acceso a MySQL/MariaDB. Las credenciales se leen SIEMPRE dentro
// de la función (nunca a nivel de módulo) y nunca llegan al navegador.

export interface Credenciales {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

export function leerCredenciales(): Credenciales | null {
  const host = process.env["MYSQL_HOST"];
  const database = process.env["MYSQL_DATABASE"];
  const user = process.env["MYSQL_USER"];
  const password = process.env["MYSQL_PASSWORD"];
  if (!host || !database || !user || password === undefined) return null;
  return {
    host,
    port: Number(process.env["MYSQL_PORT"] ?? 3306),
    database,
    user,
    password,
    ssl: (process.env["MYSQL_SSL"] ?? "").toLowerCase() === "true",
  };
}

type Conexion = {
  query: (sql: string, params?: unknown[]) => Promise<[unknown, unknown]>;
  end: () => Promise<void>;
};

let cache: { conexion: Conexion } | null = null;
let ultimoError: string | null = null;

async function obtenerConexion(): Promise<Conexion | null> {
  if (cache) return cache.conexion;
  const cred = leerCredenciales();
  if (!cred) return null;
  try {
    // Import no estático a propósito: si el entorno de ejecución no admite el
    // conector MySQL, caemos a modo demostración en lugar de romper la app.
    const especificador = "mysql2/promise";
    const mod = (await import(/* @vite-ignore */ especificador)) as {
      createPool: (o: unknown) => Conexion;
    };
    const conexion = mod.createPool({
      host: cred.host,
      port: cred.port,
      database: cred.database,
      user: cred.user,
      password: cred.password,
      ssl: cred.ssl ? { rejectUnauthorized: true } : undefined,
      waitForConnections: true,
      connectionLimit: 4,
      namedPlaceholders: false,
      decimalNumbers: true,
    });
    await conexion.query("SELECT 1");
    cache = { conexion };
    ultimoError = null;
    return conexion;
  } catch (error) {
    ultimoError = error instanceof Error ? error.message : String(error);
    console.error("MySQL no disponible:", ultimoError);
    return null;
  }
}

export async function mysqlActivo(): Promise<boolean> {
  return (await obtenerConexion()) !== null;
}

export function ultimoErrorMysql(): string | null {
  return ultimoError;
}

export async function sql<T = Record<string, unknown>>(
  consulta: string,
  params: unknown[] = [],
): Promise<T[]> {
  const conexion = await obtenerConexion();
  if (!conexion) throw new Error("Sin conexión MySQL");
  const [filas] = await conexion.query(consulta, params);
  return filas as T[];
}

export async function ejecutar(
  consulta: string,
  params: unknown[] = [],
): Promise<{ insertId: number; affectedRows: number }> {
  const conexion = await obtenerConexion();
  if (!conexion) throw new Error("Sin conexión MySQL");
  const [resultado] = await conexion.query(consulta, params);
  const r = resultado as { insertId?: number; affectedRows?: number };
  return { insertId: Number(r.insertId ?? 0), affectedRows: Number(r.affectedRows ?? 0) };
}
