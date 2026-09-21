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
let conexionPendiente: Promise<Conexion | null> | null = null;
let ultimoError: string | null = null;

const TIEMPO_MAXIMO_MS = 20_000;
const ESPERA_TRAS_FALLO_MS = 8_000;
const ESPERA_AGRUPACION_MS = 8;
const MAX_CONSULTAS_POR_LOTE = 30;
let falloHasta = 0;

type ConsultaPendiente = {
  sql: string;
  params: unknown[];
  resolve: (resultado: [unknown, unknown]) => void;
  reject: (error: unknown) => void;
};

let lotePendiente: ConsultaPendiente[] = [];
let temporizadorLote: ReturnType<typeof setTimeout> | null = null;

// Puente HTTPS opcional: un archivo alojado en el servidor del usuario
// (db/puente-mysql.php) que ejecuta las consultas. Se usa cuando el entorno de
// ejecución no permite conexiones directas al puerto de MySQL (sitio publicado).
function leerPuente(): { url: string; token: string } | null {
  const url = process.env["MYSQL_BRIDGE_URL"];
  const token = process.env["MYSQL_BRIDGE_TOKEN"];
  if (!url || !token) return null;
  return { url, token };
}

const esLectura = (consulta: string) =>
  /^(SELECT|SHOW|DESCRIBE|EXPLAIN|WITH)\b/i.test(consulta.trim());

async function pedirPuente(
  url: string,
  token: string,
  cuerpo: Record<string, unknown>,
  reintentar: boolean,
): Promise<Record<string, unknown>> {
  let ultimo: unknown;
  const intentos = reintentar ? 2 : 1;
  for (let intento = 0; intento < intentos; intento += 1) {
    try {
      const respuesta = await fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(cuerpo),
      });
      const texto = await respuesta.text();
      let datos: Record<string, unknown>;
      try {
        datos = JSON.parse(texto) as Record<string, unknown>;
      } catch {
        throw new Error(`Respuesta inválida del puente (${respuesta.status})`);
      }
      if (!respuesta.ok || typeof datos["error"] === "string") {
        throw new Error(typeof datos["error"] === "string" ? datos["error"] : `Puente respondió ${respuesta.status}`);
      }
      falloHasta = 0;
      ultimoError = null;
      return datos;
    } catch (error) {
      ultimo = error;
      if (intento + 1 < intentos) await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  const nombre = ultimo instanceof Error ? ultimo.name : "";
  const mensaje = nombre === "TimeoutError" || nombre === "AbortError"
    ? "El servidor de datos tardó demasiado en responder"
    : ultimo instanceof Error ? ultimo.message : String(ultimo);
  ultimoError = `Puente: ${mensaje}`;
  falloHasta = Date.now() + ESPERA_TRAS_FALLO_MS;
  throw new Error(mensaje);
}

async function vaciarLote(url: string, token: string) {
  temporizadorLote = null;
  const lote = lotePendiente.splice(0, MAX_CONSULTAS_POR_LOTE);
  if (lote.length === 0) return;
  try {
    const cuerpo = await pedirPuente(
      url,
      token,
      { queries: lote.map((item) => ({ sql: item.sql, params: item.params })) },
      true,
    );
    const resultados = Array.isArray(cuerpo["results"]) ? cuerpo["results"] as Array<Record<string, unknown>> : [];
    if (resultados.length !== lote.length) throw new Error("El puente devolvió un lote incompleto");
    lote.forEach((item, indice) => {
      const resultado = resultados[indice] ?? {};
      if (typeof resultado["error"] === "string") item.reject(new Error(resultado["error"]));
      else {
        const filas = Array.isArray(resultado["rows"]) ? resultado["rows"] : [];
        item.resolve([Object.assign([...filas], {
          insertId: Number(resultado["insertId"] ?? 0),
          affectedRows: Number(resultado["affectedRows"] ?? 0),
        }), undefined]);
      }
    });
  } catch (error) {
    // Compatibilidad durante el reemplazo del archivo PHP: la versión anterior
    // no entiende lotes. En ese caso ejecutamos las lecturas una por una y la
    // aplicación sigue operando hasta que se suba el puente nuevo.
    const mensaje = error instanceof Error ? error.message : String(error);
    if (/Consulta vacía|lote|queries/i.test(mensaje)) {
      for (const item of lote) {
        try {
          const resultado = await pedirPuente(url, token, { sql: item.sql, params: item.params }, true);
          const filas = Array.isArray(resultado["rows"]) ? resultado["rows"] : [];
          item.resolve([Object.assign([...filas], {
            insertId: Number(resultado["insertId"] ?? 0),
            affectedRows: Number(resultado["affectedRows"] ?? 0),
          }), undefined]);
        } catch (fallo) {
          item.reject(fallo);
        }
      }
    } else {
      lote.forEach((item) => item.reject(error));
    }
  } finally {
    if (lotePendiente.length > 0 && !temporizadorLote) {
      temporizadorLote = setTimeout(() => void vaciarLote(url, token), ESPERA_AGRUPACION_MS);
    }
  }
}

function conexionPuente(url: string, token: string, admiteLotes: boolean): Conexion {
  return {
    async query(sql: string, params: unknown[] = []) {
      if (Date.now() < falloHasta) throw new Error("Servidor de datos temporalmente no disponible");
      if (admiteLotes && esLectura(sql)) {
        return new Promise<[unknown, unknown]>((resolve, reject) => {
          lotePendiente.push({ sql, params, resolve, reject });
          if (lotePendiente.length >= MAX_CONSULTAS_POR_LOTE) void vaciarLote(url, token);
          else if (!temporizadorLote) {
            temporizadorLote = setTimeout(() => void vaciarLote(url, token), ESPERA_AGRUPACION_MS);
          }
        });
      }
      const cuerpo = await pedirPuente(url, token, { sql, params }, false);
      const filas = Array.isArray(cuerpo["rows"]) ? cuerpo["rows"] : [];
      return [Object.assign([...filas], {
        insertId: Number(cuerpo["insertId"] ?? 0),
        affectedRows: Number(cuerpo["affectedRows"] ?? 0),
      }), undefined] as [unknown, unknown];
    },
    async end() {},
  };
}

// Cuando el servidor de datos no responde, no reintentar la comprobación en
// cada consulta de la misma pantalla: se recuerda el fallo unos segundos para
// contestar de inmediato en vez de sumar una espera de 20 s por consulta.
async function obtenerConexion(): Promise<Conexion | null> {
  if (cache) return cache.conexion;
  if (Date.now() < falloHasta) return null;


  // Una pantalla puede iniciar muchas consultas a la vez. Todas deben esperar
  // la misma comprobación inicial, no lanzar un SELECT 1 por cada consulta.
  if (conexionPendiente) return conexionPendiente;

  conexionPendiente = crearConexion();
  try {
    return await conexionPendiente;
  } finally {
    conexionPendiente = null;
  }
}

async function crearConexion(): Promise<Conexion | null> {
  if (cache) return cache.conexion;

  const puente = leerPuente();
  if (puente) {
    try {
      // El ping no abre MariaDB. Solo identifica en milisegundos si el archivo
      // instalado admite lotes; así la versión anterior sigue funcionando sin
      // esperar un timeout mientras el usuario reemplaza el archivo.
      const capacidad = await pedirPuente(puente.url, puente.token, { ping: true }, false);
      const conexion = conexionPuente(puente.url, puente.token, Number(capacidad["version"] ?? 1) >= 2);
      cache = { conexion };
      return conexion;
    } catch (error) {
      console.error("Puente MySQL no disponible:", error instanceof Error ? error.message : String(error));
      return null;
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
    falloHasta = Date.now() + ESPERA_TRAS_FALLO_MS;
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

export async function diagnosticarMysql(): Promise<{
  ok: boolean;
  puente: boolean;
  baseDatos: boolean;
  latenciaMs: number;
  mensaje: string;
}> {
  const puente = leerPuente();
  if (!puente) return { ok: false, puente: false, baseDatos: false, latenciaMs: 0, mensaje: "Falta configurar el puente HTTPS" };
  const inicio = Date.now();
  try {
    const cuerpo = await pedirPuente(puente.url, puente.token, { health: true }, false);
    const baseDatos = cuerpo["database"] === true;
    return {
      ok: cuerpo["ok"] === true && baseDatos,
      puente: true,
      baseDatos,
      latenciaMs: Date.now() - inicio,
      mensaje: baseDatos ? "Conexión estable" : "El puente responde, pero MariaDB no está disponible",
    };
  } catch (error) {
    return {
      ok: false,
      puente: false,
      baseDatos: false,
      latenciaMs: Date.now() - inicio,
      mensaje: error instanceof Error ? error.message : "No se pudo comprobar la conexión",
    };
  }
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
