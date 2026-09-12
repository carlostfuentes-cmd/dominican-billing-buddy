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

/* ----------------------- Esquema legado (referencia) ---------------------- */

// Mismas definiciones de db/schema.sql, sin datos iniciales: en producción la
// empresa y las secuencias NCF se registran desde la propia aplicación.
const SENTENCIAS_ESQUEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS empresa (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    nombre VARCHAR(160) NOT NULL,
    rnc VARCHAR(15) NOT NULL,
    direccion VARCHAR(240) NOT NULL DEFAULT '',
    telefono VARCHAR(30) NOT NULL DEFAULT '',
    email VARCHAR(160) NOT NULL DEFAULT ''
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS clientes (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(160) NOT NULL,
    rnc VARCHAR(15) NOT NULL,
    tipo_ncf ENUM('B01','B02','B14','B15') NOT NULL DEFAULT 'B02',
    telefono VARCHAR(30) NOT NULL DEFAULT '',
    email VARCHAR(160) NOT NULL DEFAULT '',
    direccion VARCHAR(240) NOT NULL DEFAULT '',
    dias_credito SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_clientes_rnc (rnc),
    KEY idx_clientes_nombre (nombre)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS items (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(30) NOT NULL,
    descripcion VARCHAR(200) NOT NULL,
    unidad VARCHAR(10) NOT NULL DEFAULT 'UND',
    precio DECIMAL(14,2) NOT NULL DEFAULT 0,
    tasa_itbis DECIMAL(5,2) NOT NULL DEFAULT 18.00,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_items_codigo (codigo)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS ncf_secuencias (
    tipo_ncf ENUM('B01','B02','B14','B15') NOT NULL PRIMARY KEY,
    desde INT UNSIGNED NOT NULL DEFAULT 1,
    hasta INT UNSIGNED NOT NULL DEFAULT 1000,
    proximo INT UNSIGNED NOT NULL DEFAULT 1,
    vence DATE NOT NULL,
    activa TINYINT(1) NOT NULL DEFAULT 1
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS facturas (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ncf CHAR(11) NOT NULL,
    tipo_ncf ENUM('B01','B02','B14','B15') NOT NULL,
    cliente_id INT UNSIGNED NOT NULL,
    fecha DATE NOT NULL,
    vencimiento DATE NOT NULL,
    subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
    descuento DECIMAL(14,2) NOT NULL DEFAULT 0,
    itbis DECIMAL(14,2) NOT NULL DEFAULT 0,
    total DECIMAL(14,2) NOT NULL DEFAULT 0,
    estado ENUM('emitida','pagada','anulada') NOT NULL DEFAULT 'emitida',
    notas VARCHAR(300) NOT NULL DEFAULT '',
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_facturas_ncf (ncf),
    KEY idx_facturas_fecha (fecha),
    KEY idx_facturas_cliente (cliente_id),
    CONSTRAINT fk_facturas_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS factura_lineas (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    factura_id INT UNSIGNED NOT NULL,
    item_id INT UNSIGNED NULL,
    codigo VARCHAR(30) NOT NULL DEFAULT '',
    descripcion VARCHAR(200) NOT NULL,
    cantidad DECIMAL(14,3) NOT NULL DEFAULT 1,
    precio DECIMAL(14,2) NOT NULL DEFAULT 0,
    descuento_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
    tasa_itbis DECIMAL(5,2) NOT NULL DEFAULT 18.00,
    subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
    itbis DECIMAL(14,2) NOT NULL DEFAULT 0,
    total DECIMAL(14,2) NOT NULL DEFAULT 0,
    KEY idx_lineas_factura (factura_id),
    CONSTRAINT fk_lineas_factura FOREIGN KEY (factura_id) REFERENCES facturas(id) ON DELETE CASCADE,
    CONSTRAINT fk_lineas_item FOREIGN KEY (item_id) REFERENCES items(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

// Crea las tablas que falten en la base conectada. Seguro de repetir.
export async function crearTablas(): Promise<void> {
  const conexion = await obtenerConexion();
  if (!conexion) throw new Error("Sin conexión MySQL");
  for (const sentencia of SENTENCIAS_ESQUEMA) {
    await conexion.query(sentencia);
  }
}
