// Datos del panel ejecutivo. Todo se calcula sobre las tablas existentes del
// ERP (orders, invoices, ar, ap, banks_book, gl_journal, ncf_sequences…).
//
// Multimoneda: cada documento guarda su moneda y su tasa. Los importes se
// llevan primero a moneda local (DOP) y luego a la moneda de presentación que
// elige el usuario, usando la última tasa registrada en exchange_rate.

import { round2, type OpcionId } from "@/lib/erp-types";
import { sql } from "./mysql.server";
import { listarSecuencias, usarMysql } from "./repo.server";

const txt = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export interface FiltroPanel {
  desde: string;
  hasta: string;
  sucursalId?: string | undefined;
  departamentoId?: string | undefined;
  moneda?: string | undefined;
}

export interface KpiPanel {
  id: string;
  titulo: string;
  valor: number;
  anterior: number;
  formato: "moneda" | "numero" | "ratio";
  ruta: string;
  nota: string;
}

export interface AlertaPanel {
  id: string;
  nivel: "alta" | "media" | "baja";
  titulo: string;
  detalle: string;
  cantidad: number;
  ruta: string;
}

export interface TramoAging {
  tramo: string;
  monto: number;
  documentos: number;
}

export interface PanelResumen {
  conectado: boolean;
  moneda: string;
  tasa: number;
  rango: { desde: string; hasta: string };
  comparativo: { desde: string; hasta: string };
  kpis: KpiPanel[];
  alertas: AlertaPanel[];
  agingCxC: TramoAging[];
  agingCxP: TramoAging[];
  flujo: { fecha: string; entradas: number; salidas: number; saldo: number }[];
  mensual: { mes: string; ingresos: number; gastos: number; utilidad: number }[];
  topGastos: { cuenta: string; nombre: string; monto: number }[];
  porCentro: { nombre: string; monto: number }[];
  liquidez: { activo: number; pasivo: number; ratio: number; capital: number };
  listas: { sucursales: OpcionId[]; departamentos: OpcionId[]; monedas: OpcionId[] };
}

const TRAMOS = ["Vigente (0-30)", "31-60", "61-90", "90+"] as const;

function tramoPorDias(dias: number): string {
  if (dias <= 30) return TRAMOS[0];
  if (dias <= 60) return TRAMOS[1];
  if (dias <= 90) return TRAMOS[2];
  return TRAMOS[3];
}

function vacio(f: FiltroPanel): PanelResumen {
  return {
    conectado: false,
    moneda: (f.moneda || "DOP").toUpperCase(),
    tasa: 1,
    rango: { desde: f.desde, hasta: f.hasta },
    comparativo: periodoAnterior(f.desde, f.hasta),
    kpis: [],
    alertas: [],
    agingCxC: [],
    agingCxP: [],
    flujo: [],
    mensual: [],
    topGastos: [],
    porCentro: [],
    liquidez: { activo: 0, pasivo: 0, ratio: 0, capital: 0 },
    listas: { sucursales: [], departamentos: [], monedas: [{ id: "DOP", nombre: "PESOS DOMINICANOS" }] },
  };
}

function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Período inmediatamente anterior, de la misma cantidad de días. */
export function periodoAnterior(desde: string, hasta: string): { desde: string; hasta: string } {
  const largo = Math.max(1, diasEntre(desde, hasta) + 1);
  return { desde: sumarDias(desde, -largo), hasta: sumarDias(desde, -1) };
}

/** Última tasa registrada por moneda (moneda extranjera -> local). */
async function tasas(): Promise<Map<string, number>> {
  const filas = await sql<Record<string, unknown>>(
    `SELECT e.currency_id, e.foreign_to_local
     FROM exchange_rate e
     JOIN (SELECT currency_id, MAX(date) AS d FROM exchange_rate GROUP BY currency_id) m
       ON m.currency_id = e.currency_id AND m.d = e.date`,
  );
  const mapa = new Map<string, number>([["DOP", 1]]);
  for (const f of filas) {
    const tasa = num(f["foreign_to_local"]);
    if (tasa > 0) mapa.set(txt(f["currency_id"]).toUpperCase(), tasa);
  }
  return mapa;
}

export async function panelResumen(filtro: FiltroPanel): Promise<PanelResumen> {
  if (!(await usarMysql())) return vacio(filtro);

  const { desde, hasta } = filtro;
  const previo = periodoAnterior(desde, hasta);
  const moneda = (filtro.moneda || "DOP").toUpperCase();
  const depto = filtro.departamentoId ? Number(filtro.departamentoId) : null;
  const sucursal = filtro.sucursalId ? Number(filtro.sucursalId) : null;

  const mapaTasas = await tasas();
  const tasa = moneda === "DOP" ? 1 : (mapaTasas.get(moneda) ?? 1);
  /** Convierte un importe en moneda local a la moneda de presentación. */
  const conv = (n: number): number => round2(n / (tasa > 0 ? tasa : 1));

  const condOrders = (alias = "o") => {
    const cond: string[] = [];
    const params: unknown[] = [];
    if (sucursal !== null) {
      cond.push(`${alias}.branch_id = ?`);
      params.push(sucursal);
    }
    if (depto !== null) {
      cond.push(`${alias}.department_id = ?`);
      params.push(depto);
    }
    return { cond: cond.length ? ` AND ${cond.join(" AND ")}` : "", params };
  };
  const condGl = () => (depto !== null ? " AND d.department_id = ?" : "");
  const paramsGl = () => (depto !== null ? [depto] : []);

  const SQL_VENTAS = (extra: string) => `
    SELECT ROUND(SUM(t.subtotal * COALESCE(NULLIF(o.currency_rate,0),1)), 2) AS subtotal,
           ROUND(SUM(t.gravado * COALESCE(NULLIF(o.currency_rate,0),1)), 2) AS gravado,
           ROUND(SUM(t.exento * COALESCE(NULLIF(o.currency_rate,0),1)), 2) AS exento,
           ROUND(SUM(t.itbis * COALESCE(NULLIF(o.currency_rate,0),1)), 2) AS itbis,
           ROUND(SUM(t.total * COALESCE(NULLIF(o.currency_rate,0),1)), 2) AS total,
           COUNT(*) AS cantidad
    FROM orders o
    JOIN (SELECT order_id,
                 ROUND(SUM(CASE WHEN (tax1 + tax2 + tax3) <> 0
                                THEN quantity * price - discount ELSE 0 END), 2) AS gravado,
                 ROUND(SUM(CASE WHEN (tax1 + tax2 + tax3) = 0
                                THEN quantity * price - discount ELSE 0 END), 2) AS exento,
                 ROUND(SUM(quantity * price - discount), 2) AS subtotal,
                 ROUND(SUM(tax1 + tax2 + tax3), 2) AS itbis,
                 ROUND(SUM(quantity * price - discount + tax1 + tax2 + tax3), 2) AS total
          FROM orders_detail GROUP BY order_id) t ON t.order_id = o.order_id
    WHERE o.invoice_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM reverse_invoices ri WHERE ri.invoice_id = o.invoice_id)
      AND o.date BETWEEN ? AND ?${extra}`;

  // Notas de crédito por devolución (NCF B04), sin las anuladas.
  const condNotas = sucursal !== null ? " AND r.branch_id = ?" : "";
  const paramsNotas = () => (sucursal !== null ? [sucursal] : []);
  const SQL_NOTAS = (extra: string) => `
    SELECT ROUND(SUM(t.subtotal * COALESCE(NULLIF(r.currency_rate,0),1)), 2) AS subtotal,
           ROUND(SUM(t.itbis * COALESCE(NULLIF(r.currency_rate,0),1)), 2) AS itbis,
           COUNT(*) AS cantidad
    FROM reverse_invoices r
    JOIN (SELECT reverse_invoice_id AS ref,
                 ROUND(SUM(quantity * price - discount), 2) AS subtotal,
                 ROUND(SUM(tax1 + tax2 + tax3), 2) AS itbis
          FROM reverse_invoices_detail GROUP BY reverse_invoice_id) t ON t.ref = r.reverse_invoice_id
    WHERE COALESCE(r.void, 0) = 0
      AND r.date BETWEEN ? AND ?${extra}`;

  const oc = condOrders();

  const SQL_BALANCE = (tabla: "ar" | "ap") => `
    SELECT ROUND(SUM(bal), 2) AS balance
    FROM (
      SELECT ROUND(SUM(r.amount * COALESCE(NULLIF(a.exchange,0),1)), 2) AS bal
      FROM ${tabla} a
      JOIN ${tabla}_reference r ON r.${tabla}_id = a.${tabla}_id
      WHERE a.date <= ?
      GROUP BY ${tabla === "ar" ? "a.customer_id" : "a.supplier_id"}, r.reference
      HAVING ROUND(SUM(r.amount), 2) <> 0
    ) p`;

  const SQL_AGING = (tabla: "ar" | "ap") => `
    SELECT DATEDIFF(?, fecha) AS dias, bal AS balance
    FROM (
      SELECT ROUND(SUM(r.amount * COALESCE(NULLIF(a.exchange,0),1)), 2) AS bal,
             MIN(a.date) AS fecha
      FROM ${tabla} a
      JOIN ${tabla}_reference r ON r.${tabla}_id = a.${tabla}_id
      WHERE a.date <= ?
      GROUP BY ${tabla === "ar" ? "a.customer_id" : "a.supplier_id"}, r.reference
      HAVING ROUND(SUM(r.amount), 2) <> 0
    ) p`;

  const inicioMensual = `${sumarDias(hasta, -365).slice(0, 7)}-01`;

  // El puente MariaDB del ERP no tolera una ráfaga grande de solicitudes HTTP.
  // Ejecutamos las consultas en lotes pequeños dentro de esta petición, sin
  // mantener una cola global que pueda sobrevivir incorrectamente entre
  // ejecuciones del servidor.
  async function ejecutarEnLotes<T>(tareas: Array<() => Promise<T>>, tamano = 2): Promise<T[]> {
    const resultados: T[] = [];
    for (let i = 0; i < tareas.length; i += tamano) {
      resultados.push(...(await Promise.all(tareas.slice(i, i + tamano).map((tarea) => tarea()))));
    }
    return resultados;
  }

  const [
    ventas,
    ventasPrev,
    notasDev,
    notasDevPrev,
    pedidos,
    porCobrar,
    porCobrarPrev,
    porPagar,
    porPagarPrev,
    agingCxCRaw,
    agingCxPRaw,
    bancos,
    bancosPrev,
    descuadrados,
    mensualRaw,
    flujoRaw,
    gastosRaw,
    centroRaw,
    liquidezRaw,
    secuencias,
    sucursales,
    departamentos,
    monedas,
  ] = await ejecutarEnLotes<Array<Record<string, unknown>>>([
    () => sql<Record<string, unknown>>(SQL_VENTAS(oc.cond), [desde, hasta, ...oc.params]),
    () => sql<Record<string, unknown>>(SQL_VENTAS(oc.cond), [previo.desde, previo.hasta, ...oc.params]),
    () => sql<Record<string, unknown>>(SQL_NOTAS(condNotas), [desde, hasta, ...paramsNotas()]),
    () => sql<Record<string, unknown>>(SQL_NOTAS(condNotas), [previo.desde, previo.hasta, ...paramsNotas()]),
    () => sql<Record<string, unknown>>(
      `SELECT COUNT(*) AS cantidad FROM orders o
       WHERE o.invoice_id IS NULL AND o.date BETWEEN ? AND ?${oc.cond}`,
      [desde, hasta, ...oc.params],
    ),
    () => sql<Record<string, unknown>>(SQL_BALANCE("ar"), [hasta]),
    () => sql<Record<string, unknown>>(SQL_BALANCE("ar"), [previo.hasta]),
    () => sql<Record<string, unknown>>(SQL_BALANCE("ap"), [hasta]),
    () => sql<Record<string, unknown>>(SQL_BALANCE("ap"), [previo.hasta]),
    () => sql<Record<string, unknown>>(SQL_AGING("ar"), [hasta, hasta]),
    () => sql<Record<string, unknown>>(SQL_AGING("ap"), [hasta, hasta]),
    () => sql<Record<string, unknown>>(
      `SELECT k.currency_id AS moneda,
              ROUND(COALESCE(SUM(CASE WHEN e.type = 'D' THEN b.amount ELSE -b.amount END), 0), 2) AS saldo
       FROM banks k
       LEFT JOIN banks_book b ON b.bank_id = k.bank_id AND b.status = 'A' AND b.date <= ?
       LEFT JOIN banks_book_entry e ON e.entry_id = b.entry_id
       WHERE k.status = 'A'
       GROUP BY k.currency_id`,
      [hasta],
    ),
    () => sql<Record<string, unknown>>(
      `SELECT k.currency_id AS moneda,
              ROUND(COALESCE(SUM(CASE WHEN e.type = 'D' THEN b.amount ELSE -b.amount END), 0), 2) AS saldo
       FROM banks k
       LEFT JOIN banks_book b ON b.bank_id = k.bank_id AND b.status = 'A' AND b.date <= ?
       LEFT JOIN banks_book_entry e ON e.entry_id = b.entry_id
       WHERE k.status = 'A'
       GROUP BY k.currency_id`,
      [previo.hasta],
    ),
    () => sql<Record<string, unknown>>(
      `SELECT COUNT(*) AS cantidad FROM (
         SELECT j.journal_id
         FROM gl_journal j
         JOIN gl_journal_detail d ON d.journal_id = j.journal_id
         WHERE j.void = 0 AND j.date BETWEEN ? AND ?${condGl()}
         GROUP BY j.journal_id
         HAVING ABS(COALESCE(SUM(d.debit),0) - COALESCE(SUM(d.credit),0)) > 0.01
       ) x`,
      [desde, hasta, ...paramsGl()],
    ),
    () => sql<Record<string, unknown>>(
      `SELECT DATE_FORMAT(j.date, '%Y-%m') AS mes,
              ROUND(SUM(CASE WHEN LEFT(d.account,1) = '4' THEN d.credit - d.debit ELSE 0 END), 2) AS ingresos,
              ROUND(SUM(CASE WHEN LEFT(d.account,1) IN ('5','6','7') THEN d.debit - d.credit ELSE 0 END), 2) AS gastos
       FROM gl_journal j
       JOIN gl_journal_detail d ON d.journal_id = j.journal_id
       WHERE j.void = 0 AND j.date >= ? AND j.date <= ?${condGl()}
       GROUP BY mes ORDER BY mes`,
      [inicioMensual, hasta, ...paramsGl()],
    ),
    () => sql<Record<string, unknown>>(
      `SELECT DATE_FORMAT(b.date, '%Y-%m-%d') AS fecha, k.currency_id AS moneda,
              ROUND(SUM(CASE WHEN e.type = 'D' THEN ABS(b.amount) ELSE 0 END), 2) AS entradas,
              ROUND(SUM(CASE WHEN e.type = 'C' THEN ABS(b.amount) ELSE 0 END), 2) AS salidas
       FROM banks_book b
       JOIN banks_book_entry e ON e.entry_id = b.entry_id
       JOIN banks k ON k.bank_id = b.bank_id
       WHERE b.status = 'A' AND b.date BETWEEN ? AND ?
       GROUP BY fecha, k.currency_id
       ORDER BY fecha`,
      [desde, hasta],
    ),
    () => sql<Record<string, unknown>>(
      `SELECT d.account AS cuenta, COALESCE(c.name, d.account) AS nombre,
              ROUND(SUM(d.debit - d.credit), 2) AS monto
       FROM gl_journal j
       JOIN gl_journal_detail d ON d.journal_id = j.journal_id
       LEFT JOIN gl_accounts c ON c.account = d.account
       WHERE j.void = 0 AND j.date BETWEEN ? AND ?
         AND LEFT(d.account,1) IN ('5','6','7')${condGl()}
       GROUP BY d.account, nombre
       HAVING monto > 0
       ORDER BY monto DESC
       LIMIT 6`,
      [desde, hasta, ...paramsGl()],
    ),
    () => sql<Record<string, unknown>>(
      `SELECT COALESCE(NULLIF(g.name,''), 'Sin centro de costo') AS nombre,
              ROUND(SUM(d.credit - d.debit), 2) AS monto
       FROM gl_journal j
       JOIN gl_journal_detail d ON d.journal_id = j.journal_id
       LEFT JOIN gl_department g ON g.department_id = d.department_id
       WHERE j.void = 0 AND j.date BETWEEN ? AND ? AND LEFT(d.account,1) = '4'${condGl()}
       GROUP BY nombre
       HAVING monto <> 0
       ORDER BY monto DESC
       LIMIT 8`,
      [desde, hasta, ...paramsGl()],
    ),
    sql<Record<string, unknown>>(
      `SELECT ROUND(SUM(CASE WHEN LEFT(d.account,2) = '11' THEN d.debit - d.credit ELSE 0 END), 2) AS activo,
              ROUND(SUM(CASE WHEN LEFT(d.account,2) = '21' THEN d.credit - d.debit ELSE 0 END), 2) AS pasivo
       FROM gl_journal j
       JOIN gl_journal_detail d ON d.journal_id = j.journal_id
       WHERE j.void = 0 AND j.date <= ?${condGl()}`,
      [hasta, ...paramsGl()],
    ),
    async () => (await listarSecuencias().catch(() => [])) as unknown as Array<Record<string, unknown>>,
    () => sql<Record<string, unknown>>("SELECT branch_id AS id, name AS nombre FROM branchs ORDER BY name LIMIT 100"),
    () => sql<Record<string, unknown>>(
      "SELECT department_id AS id, name AS nombre FROM gl_department ORDER BY name LIMIT 300",
    ),
    () => sql<Record<string, unknown>>(
      "SELECT currency_id AS id, name AS nombre FROM currencies WHERE currency_id <> '000' ORDER BY is_base DESC, currency_id",
    ),
  ]);

  const v = ventas[0] ?? {};
  const vp = ventasPrev[0] ?? {};
  const saldoBancos = (filas: Record<string, unknown>[]) =>
    filas.reduce((acc, f) => {
      const m = txt(f["moneda"]).toUpperCase() || "DOP";
      const factor = m === "DOP" ? 1 : (mapaTasas.get(m) ?? 1);
      return acc + num(f["saldo"]) * factor;
    }, 0);

  const agrupar = (filas: Record<string, unknown>[], soloPositivo: boolean): TramoAging[] => {
    const mapa = new Map<string, { monto: number; documentos: number }>(
      TRAMOS.map((t) => [t, { monto: 0, documentos: 0 }]),
    );
    for (const f of filas) {
      const bal = num(f["balance"]);
      if (soloPositivo && bal <= 0) continue;
      const clave = tramoPorDias(Math.max(0, num(f["dias"])));
      const actual = mapa.get(clave)!;
      actual.monto += Math.abs(bal);
      actual.documentos += 1;
    }
    return TRAMOS.map((t) => ({
      tramo: t,
      monto: conv(round2(mapa.get(t)!.monto)),
      documentos: mapa.get(t)!.documentos,
    }));
  };

  const agingCxC = agrupar(agingCxCRaw, true);
  const agingCxP = agrupar(agingCxPRaw, true);

  const cobrar = conv(num(porCobrar[0]?.["balance"]));
  const cobrarPrev = conv(num(porCobrarPrev[0]?.["balance"]));
  const pagar = conv(num(porPagar[0]?.["balance"]));
  const pagarPrev = conv(num(porPagarPrev[0]?.["balance"]));
  const disponible = conv(round2(saldoBancos(bancos)));
  const disponiblePrev = conv(round2(saldoBancos(bancosPrev)));

  const liq = liquidezRaw[0] ?? {};
  const activo = conv(num(liq["activo"]));
  const pasivo = conv(num(liq["pasivo"]));

  const mensual = mensualRaw.map((f) => {
    const ingresos = conv(num(f["ingresos"]));
    const gastos = conv(num(f["gastos"]));
    return { mes: txt(f["mes"]), ingresos, gastos, utilidad: round2(ingresos - gastos) };
  });

  // Flujo de caja diario con saldo acumulado del período.
  const porFecha = new Map<string, { entradas: number; salidas: number }>();
  for (const f of flujoRaw) {
    const m = txt(f["moneda"]).toUpperCase() || "DOP";
    const factor = m === "DOP" ? 1 : (mapaTasas.get(m) ?? 1);
    const fecha = txt(f["fecha"]);
    const acumulado = porFecha.get(fecha) ?? { entradas: 0, salidas: 0 };
    acumulado.entradas += num(f["entradas"]) * factor;
    acumulado.salidas += num(f["salidas"]) * factor;
    porFecha.set(fecha, acumulado);
  }
  let saldo = 0;
  const flujo = [...porFecha.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fecha, d]) => {
      const entradas = conv(round2(d.entradas));
      const salidas = conv(round2(d.salidas));
      saldo = round2(saldo + entradas - salidas);
      return { fecha, entradas, salidas, saldo };
    });

  /* ------------------------------- Alertas ------------------------------- */
  const alertas: AlertaPanel[] = [];
  const hoy = new Date().toISOString().slice(0, 10);

  const porAgotarse = secuencias
    .map((s) => ({ tipo: s.tipo_ncf, restantes: Math.max(0, s.hasta - s.proximo + 1), vence: s.vence }))
    .filter((s) => s.restantes <= 20);
  if (porAgotarse.length > 0)
    alertas.push({
      id: "ncf-restantes",
      nivel: "alta",
      titulo: "Comprobantes fiscales por agotarse",
      detalle: porAgotarse.map((s) => `${s.tipo}: ${s.restantes} disponibles`).join(" · "),
      cantidad: porAgotarse.length,
      ruta: "/ncf",
    });

  const porVencer = secuencias
    .map((s) => ({ tipo: s.tipo_ncf, vence: s.vence, dias: s.vence ? diasEntre(hoy, s.vence) : 999 }))
    .filter((s) => s.dias <= 60);
  if (porVencer.length > 0)
    alertas.push({
      id: "ncf-vence",
      nivel: porVencer.some((s) => s.dias <= 15) ? "alta" : "media",
      titulo: "Autorizaciones de NCF próximas a vencer",
      detalle: porVencer
        .map((s) => `${s.tipo}: ${s.dias < 0 ? "vencida" : `faltan ${s.dias} días`}`)
        .join(" · "),
      cantidad: porVencer.length,
      ruta: "/ncf",
    });

  const cantidadDescuadrados = num(descuadrados[0]?.["cantidad"]);
  if (cantidadDescuadrados > 0)
    alertas.push({
      id: "asientos",
      nivel: "alta",
      titulo: "Asientos contables descuadrados",
      detalle: `${cantidadDescuadrados} asiento(s) del período con débitos y créditos distintos.`,
      cantidad: cantidadDescuadrados,
      ruta: "/contabilidad",
    });

  const vencidoCxC = agingCxC
    .filter((t) => t.tramo !== TRAMOS[0])
    .reduce((a, t) => ({ monto: a.monto + t.monto, docs: a.docs + t.documentos }), { monto: 0, docs: 0 });
  if (vencidoCxC.monto > 0)
    alertas.push({
      id: "cxc-vencido",
      nivel: vencidoCxC.monto > cobrar * 0.4 ? "alta" : "media",
      titulo: "Cobros con más de 30 días",
      detalle: `${vencidoCxC.docs} documento(s) con saldo fuera de plazo.`,
      cantidad: round2(vencidoCxC.monto),
      ruta: "/cxc",
    });

  const vencidoCxP = agingCxP
    .filter((t) => t.tramo !== TRAMOS[0])
    .reduce((a, t) => ({ monto: a.monto + t.monto, docs: a.docs + t.documentos }), { monto: 0, docs: 0 });
  if (vencidoCxP.monto > 0)
    alertas.push({
      id: "cxp-vencido",
      nivel: "media",
      titulo: "Pagos a suplidores fuera de plazo",
      detalle: `${vencidoCxP.docs} factura(s) de suplidor con más de 30 días.`,
      cantidad: round2(vencidoCxP.monto),
      ruta: "/cxp",
    });

  const pedidosAbiertos = num(pedidos[0]?.["cantidad"]);
  if (pedidosAbiertos > 0)
    alertas.push({
      id: "pedidos",
      nivel: "baja",
      titulo: "Pedidos sin facturar",
      detalle: `${pedidosAbiertos} pedido(s) del período aún no tienen comprobante.`,
      cantidad: pedidosAbiertos,
      ruta: "/facturas",
    });

  if (disponible < 0)
    alertas.push({
      id: "bancos",
      nivel: "alta",
      titulo: "Saldo bancario en negativo",
      detalle: "El libro de bancos muestra un saldo negativo en el consolidado.",
      cantidad: 1,
      ruta: "/bancos",
    });

  const orden = { alta: 0, media: 1, baja: 2 } as const;
  alertas.sort((a, b) => orden[a.nivel] - orden[b.nivel]);

  const ratio = pasivo > 0 ? round2(activo / pasivo) : 0;

  const kpis: KpiPanel[] = [
    {
      id: "ventas",
      titulo: "Ventas netas totales",
      valor: conv(round2(num(v["gravado"]) + num(v["exento"]))),
      anterior: conv(round2(num(vp["gravado"]) + num(vp["exento"]))),
      formato: "moneda",
      ruta: "/facturas",
      nota: "Sin ITBIS, netas de descuentos",
    },
    {
      id: "gravado",
      titulo: "Ventas netas no exentas",
      valor: conv(num(v["gravado"])),
      anterior: conv(num(vp["gravado"])),
      formato: "moneda",
      ruta: "/facturas",
      nota: "Líneas con ITBIS del período",
    },
    {
      id: "exento",
      titulo: "Ventas netas exentas",
      valor: conv(num(v["exento"])),
      anterior: conv(num(vp["exento"])),
      formato: "moneda",
      ruta: "/facturas",
      nota: "Líneas sin ITBIS del período",
    },
    {
      id: "itbis",
      titulo: "ITBIS facturado",
      valor: conv(num(v["itbis"])),
      anterior: conv(num(vp["itbis"])),
      formato: "moneda",
      ruta: "/reportes",
      nota: "Impuesto del período",
    },
    {
      id: "total-facturado",
      titulo: "Total facturado (con ITBIS)",
      valor: conv(round2(num(v["gravado"]) + num(v["exento"]) + num(v["itbis"]))),
      anterior: conv(round2(num(vp["gravado"]) + num(vp["exento"]) + num(vp["itbis"]))),
      formato: "moneda",
      ruta: "/facturas",
      nota: "Ventas netas más ITBIS",
    },
    {
      id: "notas",
      titulo: "Notas de crédito por devolución",
      valor: conv(num(notasDev[0]?.["subtotal"])),
      anterior: conv(num(notasDevPrev[0]?.["subtotal"])),
      formato: "moneda",
      ruta: "/notas-credito",
      nota: `${num(notasDev[0]?.["cantidad"])} nota(s) emitida(s)`,
    },
    {
      id: "cantidad",
      titulo: "Facturas emitidas",
      valor: num(v["cantidad"]),
      anterior: num(vp["cantidad"]),
      formato: "numero",
      ruta: "/facturas",
      nota: "Documentos con comprobante",
    },
    {
      id: "cobrar",
      titulo: "Por cobrar",
      valor: cobrar,
      anterior: cobrarPrev,
      formato: "moneda",
      ruta: "/cxc",
      nota: "Saldo de clientes al cierre",
    },
    {
      id: "pagar",
      titulo: "Por pagar",
      valor: pagar,
      anterior: pagarPrev,
      formato: "moneda",
      ruta: "/cxp",
      nota: "Compromisos con suplidores",
    },
    {
      id: "bancos",
      titulo: "Disponible en bancos",
      valor: disponible,
      anterior: disponiblePrev,
      formato: "moneda",
      ruta: "/bancos",
      nota: "Libro de bancos consolidado",
    },
    {
      id: "capital",
      titulo: "Capital de trabajo",
      valor: round2(activo - pasivo),
      anterior: 0,
      formato: "moneda",
      ruta: "/reportes",
      nota: "Activo corriente menos pasivo corriente",
    },
    {
      id: "ratio",
      titulo: "Razón de liquidez",
      valor: ratio,
      anterior: 0,
      formato: "ratio",
      ruta: "/contabilidad",
      nota: "Activo corriente / pasivo corriente",
    },
  ];

  const opciones = (filas: Record<string, unknown>[]): OpcionId[] =>
    filas.map((f) => ({ id: txt(f["id"]), nombre: txt(f["nombre"]) }));

  return {
    conectado: true,
    moneda,
    tasa,
    rango: { desde, hasta },
    comparativo: previo,
    kpis,
    alertas,
    agingCxC,
    agingCxP,
    flujo,
    mensual,
    topGastos: gastosRaw.map((f) => ({
      cuenta: txt(f["cuenta"]),
      nombre: txt(f["nombre"]),
      monto: conv(num(f["monto"])),
    })),
    porCentro: centroRaw.map((f) => ({ nombre: txt(f["nombre"]), monto: conv(num(f["monto"])) })),
    liquidez: { activo, pasivo, ratio, capital: round2(activo - pasivo) },
    listas: {
      sucursales: opciones(sucursales),
      departamentos: opciones(departamentos),
      monedas: opciones(monedas).filter((m) => m.id),
    },
  };
}
