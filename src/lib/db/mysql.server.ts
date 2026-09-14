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

// Puente HTTPS opcional: un archivo alojado en el servidor del usuario
// (db/puente-mysql.php) que ejecuta las consultas. Se usa cuando el entorno de
// ejecución no permite conexiones directas al puerto de MySQL (sitio publicado).
function leerPuente(): { url: string; token: string } | null {
  const url = process.env["MYSQL_BRIDGE_URL"];
  const token = process.env["MYSQL_BRIDGE_TOKEN"];
  if (!url || !token) return null;
  return { url, token };
}

function conexionPuente(url: string, token: string): Conexion {
  return {
    async query(sql: string, params: unknown[] = []) {
      const respuesta = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sql, params }),
      });
      const texto = await respuesta.text();
      let cuerpo: {
        rows?: unknown[];
        insertId?: number;
        affectedRows?: number;
        error?: string;
        ok?: boolean;
      };
      try {
        cuerpo = JSON.parse(texto) as typeof cuerpo;
      } catch {
        throw new Error(`Respuesta inválida del puente (${respuesta.status})`);
      }
      if (!respuesta.ok || cuerpo.error) {
        throw new Error(cuerpo.error ?? `Puente respondió ${respuesta.status}`);
      }
      const filas = cuerpo.rows ?? [];
      // El repositorio usa tanto filas como insertId/affectedRows.
      const resultado = Object.assign([...filas], {
        insertId: cuerpo.insertId ?? 0,
        affectedRows: cuerpo.affectedRows ?? 0,
      });
      return [resultado, undefined];
    },
    async end() {},
  };
}

async function obtenerConexion(): Promise<Conexion | null> {
  if (cache) return cache.conexion;

  const puente = leerPuente();
  if (puente) {
    try {
      const conexion = conexionPuente(puente.url, puente.token);
      await conexion.query("SELECT 1");
      cache = { conexion };
      ultimoError = null;
      return conexion;
    } catch (error) {
      ultimoError = `Puente: ${error instanceof Error ? error.message : String(error)}`;
      console.error("Puente MySQL no disponible:", ultimoError);
      // Se intenta la conexión directa como respaldo.
    }
  }

  const cred = leerCredenciales();
  if (!cred) return null;
  try {
    // Import estático (analizable por el bundler) para que el conector viaje
    // dentro del paquete del servidor también en producción.
    const mod = (await import("mysql2/promise")) as unknown as {
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

// La aplicación trabaja sobre las tablas existentes del sistema del usuario
// (companies, customers, products, orders, orders_detail, invoices,
// ncf_sequences, ncf_kinds). No se crean tablas nuevas en su base de datos.
