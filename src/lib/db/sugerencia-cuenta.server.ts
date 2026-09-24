// Sugiere la cuenta contable del gasto a partir del concepto escrito.
// 1) Busca comprobantes de caja chica anteriores con conceptos parecidos.
// 2) Si no hay, pide a Lovable AI que elija la cuenta por relación de significado.
import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText } from "ai";
import { z } from "zod";

import { sql } from "./mysql.server";
import { usarMysql } from "./repo.server";

export interface SugerenciaCuenta {
  cuenta: string;
  cuenta_nombre: string;
  gasto_id: string;
  origen: "historial" | "ia" | "ninguna";
  motivo: string;
}

const VACIAS = new Set([
  "para", "pago", "pagos", "compra", "compras", "gasto", "gastos", "del", "de", "la", "las",
  "los", "el", "en", "con", "por", "una", "uno", "que", "mes", "dia",
]);

const normalizar = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9ñ ]/g, " ");

function palabras(s: string): string[] {
  return [...new Set(normalizar(s).split(/\s+/).filter((w) => w.length >= 3 && !VACIAS.has(w)))].slice(0, 6);
}

async function porHistorial(concepto: string): Promise<SugerenciaCuenta | null> {
  const claves = palabras(concepto);
  if (!claves.length) return null;
  const cond = claves.map(() => "d.description LIKE ?").join(" OR ");
  // Consulta sencilla (sin JOIN ni cálculos) para que MariaDB responda rápido.
  const filas = await sql<Record<string, unknown>>(
    `SELECT d.description AS descripcion, d.catalog_account AS cuenta, d.expense_id AS gasto_id
       FROM petty_cash_detail d
      WHERE d.kind = 'E' AND (${cond})
      LIMIT 100`,
    claves.map((w) => `%${w}%`),
    { agrupar: false },
  );
  const puntos = new Map<string, { p: number; nombre: string; gasto: string }>();
  for (const r of filas) {
    const desc = new Set(palabras(String(r["descripcion"] ?? "")));
    const coincide = claves.filter((w) => desc.has(w)).length;
    if (!coincide) continue;
    const cuenta = String(r["cuenta"] ?? "").trim();
    if (!cuenta) continue;
    const actual = puntos.get(cuenta) ?? {
      p: 0,
      nombre: "",
      gasto: r["gasto_id"] == null ? "" : String(Number(r["gasto_id"])),
    };
    actual.p += coincide / claves.length;
    puntos.set(cuenta, actual);
  }
  const mejor = [...puntos.entries()].sort((a, b) => b[1].p - a[1].p)[0];
  if (!mejor) return null;
  const nombre = await sql<Record<string, unknown>>(
    "SELECT name AS nombre FROM gl_accounts WHERE account = ? AND is_detail = 1 AND status = 'A' LIMIT 1",
    [mejor[0]],
    { agrupar: false },
  );
  if (!nombre.length) return null;
  return {
    cuenta: mejor[0],
    cuenta_nombre: String(nombre[0]["nombre"] ?? ""),
    gasto_id: mejor[1].gasto,
    origen: "historial",
    motivo: "Usada antes en comprobantes con un concepto parecido.",
  };
}

async function porIA(concepto: string): Promise<SugerenciaCuenta | null> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return null;
  const [cuentas, gastos] = await Promise.all([
    sql<Record<string, unknown>>(
      "SELECT account AS cuenta, name AS nombre FROM gl_accounts WHERE is_detail = 1 AND status = 'A' ORDER BY account LIMIT 1500",
    ),
    sql<Record<string, unknown>>("SELECT expense_id AS id, name AS nombre FROM expenses_kinds ORDER BY expense_id"),
  ]);
  if (!cuentas.length) return null;
  const lista = cuentas.map((c) => `${c["cuenta"]} | ${c["nombre"]}`).join("\n");
  const listaGastos = gastos.map((g) => `${Number(g["id"])} | ${g["nombre"]}`).join("\n");

  const lovable = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey: key,
    headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  const result = streamText({
    model: lovable.responses("openai/gpt-6-astra"),
    output: Output.object({
      schema: z.object({ cuenta: z.string(), gasto_id: z.string(), motivo: z.string() }),
    }),
    system:
      "Eres contador en República Dominicana. Elige, del catálogo dado, la cuenta contable de GASTO de detalle que mejor corresponde al concepto de un gasto de caja chica, y el tipo de gasto del formato 606 de la DGII. Responde solo con códigos de las listas. El motivo, en español, en una frase corta.",
    prompt: `Concepto: "${concepto}"\n\nCatálogo (código | nombre):\n${lista}\n\nTipos de gasto 606 (id | nombre):\n${listaGastos}`,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  const r = await result.output;
  const elegida = cuentas.find((c) => String(c["cuenta"]) === r.cuenta.trim());
  if (!elegida) return null;
  const gasto = gastos.some((g) => String(Number(g["id"])) === r.gasto_id.trim()) ? r.gasto_id.trim() : "";
  return {
    cuenta: String(elegida["cuenta"]),
    cuenta_nombre: String(elegida["nombre"] ?? ""),
    gasto_id: gasto,
    origen: "ia",
    motivo: r.motivo,
  };
}

export async function sugerirCuentaGasto(concepto: string): Promise<SugerenciaCuenta> {
  const nada: SugerenciaCuenta = { cuenta: "", cuenta_nombre: "", gasto_id: "", origen: "ninguna", motivo: "" };
  if (!(await usarMysql()) || concepto.trim().length < 3) return nada;
  let historial: SugerenciaCuenta | null = null;
  try {
    historial = await porHistorial(concepto);
  } catch (e) {
    console.error("Sugerencia por historial:", e instanceof Error ? e.message : String(e));
  }
  if (historial) return historial;
  try {
    return (await porIA(concepto)) ?? nada;
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/402|credit/i.test(m)) return { ...nada, motivo: "Sin créditos de IA disponibles." };
    return { ...nada, motivo: "No se pudo consultar la IA en este momento." };
  }
}
