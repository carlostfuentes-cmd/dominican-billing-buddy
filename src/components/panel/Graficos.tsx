import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { money } from "@/lib/erp-types";

const COLORES = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-muted-foreground)",
];

const ejeCorto = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : Math.abs(n) >= 1_000
      ? `${Math.round(n / 1_000)}K`
      : String(Math.round(n));

const estiloTooltip = {
  contentStyle: {
    background: "var(--color-popover)",
    border: "1px solid var(--color-border)",
    borderRadius: "0.5rem",
    fontSize: "12px",
    color: "var(--color-popover-foreground)",
  },
  labelStyle: { color: "var(--color-muted-foreground)" },
} as const;

const ejeComun = {
  stroke: "var(--color-muted-foreground)",
  tick: { fontSize: 11 },
  tickLine: false,
} as const;

export function FlujoCaja({
  datos,
  moneda,
}: {
  datos: { fecha: string; entradas: number; salidas: number; saldo: number }[];
  moneda: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis dataKey="fecha" {...ejeComun} tickFormatter={(v: string) => v.slice(5)} />
        <YAxis {...ejeComun} width={48} tickFormatter={ejeCorto} />
        <Tooltip {...estiloTooltip} formatter={(v: number) => money(v, moneda)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Area
          type="monotone"
          name="Entradas"
          dataKey="entradas"
          stroke="var(--color-chart-2)"
          fill="var(--color-chart-2)"
          fillOpacity={0.18}
        />
        <Area
          type="monotone"
          name="Salidas"
          dataKey="salidas"
          stroke="var(--color-chart-4)"
          fill="var(--color-chart-4)"
          fillOpacity={0.14}
        />
        <Line type="monotone" name="Saldo acumulado" dataKey="saldo" stroke="var(--color-chart-1)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function Aging({
  datos,
  moneda,
  color,
}: {
  datos: { tramo: string; monto: number; documentos: number }[];
  moneda: string;
  color: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis dataKey="tramo" {...ejeComun} />
        <YAxis {...ejeComun} width={48} tickFormatter={ejeCorto} />
        <Tooltip
          {...estiloTooltip}
          formatter={(v: number, _n, p) =>
            [`${money(v, moneda)} · ${(p?.payload?.documentos ?? 0) as number} doc.`, "Saldo"] as [string, string]
          }
        />
        <Bar
          dataKey="monto"
          fill={color}
          radius={[4, 4, 0, 0]}
          minPointSize={(valor: number) => (valor > 0 ? 6 : 0)}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function IngresosGastos({
  datos,
  moneda,
}: {
  datos: { mes: string; ingresos: number; gastos: number; utilidad: number }[];
  moneda: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis dataKey="mes" {...ejeComun} tickFormatter={(v: string) => v.slice(2)} />
        <YAxis {...ejeComun} width={48} tickFormatter={ejeCorto} />
        <Tooltip {...estiloTooltip} formatter={(v: number) => money(v, moneda)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar name="Ingresos" dataKey="ingresos" fill="var(--color-chart-2)" radius={[3, 3, 0, 0]} />
        <Bar name="Gastos" dataKey="gastos" fill="var(--color-chart-4)" radius={[3, 3, 0, 0]} />
        <Bar name="Utilidad" dataKey="utilidad" fill="var(--color-chart-1)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Distribucion({
  datos,
  moneda,
}: {
  datos: { nombre: string; monto: number }[];
  moneda: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <PieChart>
        <Pie data={datos} dataKey="monto" nameKey="nombre" innerRadius={52} outerRadius={82} paddingAngle={2}>
          {datos.map((_, i) => (
            <Cell key={i} fill={COLORES[i % COLORES.length]} />
          ))}
        </Pie>
        <Tooltip {...estiloTooltip} formatter={(v: number) => money(v, moneda)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
