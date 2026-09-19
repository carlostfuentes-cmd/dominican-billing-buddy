import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Banknote,
  FileText,
  Hash,
  Landmark,
  Minus,
  Plus,
  ScrollText,
  Wallet,
} from "lucide-react";

import { PageHeader } from "@/components/AppShell";
import { Aging, Distribucion, FlujoCaja, IngresosGastos } from "@/components/panel/Graficos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { obtenerPanel } from "@/lib/panel.functions";
import { obtenerResumen } from "@/lib/erp.functions";
import { fechaCorta, money } from "@/lib/erp-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Panel ejecutivo — ERP Contable RD" },
      {
        name: "description",
        content:
          "Centro de control financiero: alertas fiscales, liquidez, antigüedad de cobros y pagos, ingresos y gastos.",
      },
      { property: "og:title", content: "Panel ejecutivo — ERP Contable RD" },
      {
        property: "og:description",
        content: "Alertas fiscales, liquidez, antigüedad de saldos y analítica de ingresos y gastos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Panel,
});

const TODOS = "__todos__";

function hoy(): Date {
  return new Date();
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function inicioMes(): string {
  const d = hoy();
  return iso(new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)));
}

function rangoPreset(clave: "mes" | "trimestre" | "anio"): { desde: string; hasta: string } {
  const d = hoy();
  const hasta = iso(d);
  if (clave === "mes") return { desde: inicioMes(), hasta };
  if (clave === "trimestre") {
    const trimestre = Math.floor(d.getMonth() / 3) * 3;
    return { desde: iso(new Date(Date.UTC(d.getFullYear(), trimestre, 1))), hasta };
  }
  return { desde: iso(new Date(Date.UTC(d.getFullYear(), 0, 1))), hasta };
}

function Variacion({ valor, anterior }: { valor: number; anterior: number }) {
  if (!anterior) return <span className="text-xs text-muted-foreground">Sin comparativo</span>;
  const pct = ((valor - anterior) / Math.abs(anterior)) * 100;
  const sube = pct > 0.05;
  const baja = pct < -0.05;
  const Icono = sube ? ArrowUpRight : baja ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        sube ? "text-success" : baja ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <Icono className="size-3.5" />
      {Math.abs(pct).toFixed(1)}% vs. período anterior
    </span>
  );
}

function ACCESOS() {
  return [
    { to: "/facturas/nueva", label: "Emitir factura", icono: FileText },
    { to: "/contabilidad/nuevo", label: "Asiento manual", icono: BookOpen },
    { to: "/cxc/nuevo", label: "Registrar cobro", icono: Wallet },
    { to: "/bancos/nueva", label: "Operación bancaria", icono: Landmark },
    { to: "/cxp/nueva", label: "Factura de suplidor", icono: Banknote },
  ] as const;
}

const REPORTES = [
  { to: "/reportes", label: "Balance general y resultados", icono: BarChart3 },
  { to: "/contabilidad", label: "Libro diario y mayor", icono: BookOpen },
  { to: "/ncf", label: "Comprobantes fiscales", icono: Hash },
  { to: "/auditoria", label: "Auditoría de operaciones", icono: ScrollText },
] as const;

function Panel() {
  const preset = rangoPreset("mes");
  const [desde, setDesde] = useState(preset.desde);
  const [hasta, setHasta] = useState(preset.hasta);
  const [sucursalId, setSucursalId] = useState(TODOS);
  const [departamentoId, setDepartamentoId] = useState(TODOS);
  const [moneda, setMoneda] = useState("DOP");

  const filtro = useMemo(
    () => ({
      desde,
      hasta,
      ...(sucursalId === TODOS ? {} : { sucursalId }),
      ...(departamentoId === TODOS ? {} : { departamentoId }),
      moneda,
    }),
    [desde, hasta, sucursalId, departamentoId, moneda],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["panel", filtro],
    queryFn: () => obtenerPanel({ data: filtro }),
  });

  const { data: resumen } = useQuery({
    queryKey: ["resumen"],
    queryFn: () => obtenerResumen(),
  });

  const fmt = (valor: number, formato: "moneda" | "numero" | "ratio") =>
    formato === "moneda" ? money(valor, moneda) : formato === "ratio" ? valor.toFixed(2) : String(valor);

  // Escala la cifra según su longitud para que quepa completa en la tarjeta.
  const tamañoCifra = (texto: string) => {
    const n = texto.length;
    if (n <= 11) return "text-2xl";
    if (n <= 14) return "text-xl";
    if (n <= 17) return "text-lg";
    return "text-base";
  };

  const aplicarPreset = (clave: "mes" | "trimestre" | "anio") => {
    const r = rangoPreset(clave);
    setDesde(r.desde);
    setHasta(r.hasta);
  };


  const sinDatos = data && !data.conectado;

  return (
    <div>
      <PageHeader
        titulo="Panel ejecutivo"
        descripcion={`Control financiero del ${fechaCorta(desde)} al ${fechaCorta(hasta)} · valores en ${moneda}`}
        acciones={
          <Button asChild>
            <Link to="/facturas/nueva">
              <Plus className="size-4" /> Nuevo pedido
            </Link>
          </Button>
        }
      />

      {/* Filtros globales */}
      <Card className="no-print mb-6">
        <CardContent className="grid gap-3 py-4 md:grid-cols-2 xl:grid-cols-6">
          <div>
            <Label className="text-xs text-muted-foreground">Desde</Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Hasta</Label>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Sucursal</Label>
            <Select value={sucursalId} onValueChange={setSucursalId}>
              <SelectTrigger>
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas las sucursales</SelectItem>
                {(data?.listas.sucursales ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Centro de costo</Label>
            <Select value={departamentoId} onValueChange={setDepartamentoId}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos los centros</SelectItem>
                {(data?.listas.departamentos ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Moneda de presentación</Label>
            <Select value={moneda} onValueChange={setMoneda}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(data?.listas.monedas ?? [{ id: "DOP", nombre: "PESOS DOMINICANOS" }]).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.id} — {m.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" size="sm" onClick={() => aplicarPreset("mes")}>
              Mes
            </Button>
            <Button variant="outline" size="sm" onClick={() => aplicarPreset("trimestre")}>
              Trimestre
            </Button>
            <Button variant="outline" size="sm" onClick={() => aplicarPreset("anio")}>
              Año
            </Button>
          </div>
        </CardContent>
      </Card>

      {sinDatos && (
        <Card className="mb-6 border-warning/30 bg-warning/8">
          <CardContent className="py-4 text-sm text-warning-foreground">
            Aún no hay conexión con tu servidor de datos, por eso el panel aparece vacío. Configura las
            credenciales en Configuración para ver las cifras reales.
          </CardContent>
        </Card>
      )}

      {/* 1. Centro de alertas y control */}
      <Card className="mb-6 border-l-4 border-l-warning">
        <CardHeader className="flex flex-row items-center justify-between border-b pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-warning" /> Centro de alertas y control
          </CardTitle>
          <Badge variant={(data?.alertas.length ?? 0) > 0 ? "destructive" : "secondary"}>
            {data?.alertas.length ?? 0} activas
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-3 py-4 md:grid-cols-2 xl:grid-cols-3">
          {(data?.alertas ?? []).map((a) => (
            <Link
              key={a.id}
              to={a.ruta}
              className={cn(
                "rounded-md border p-3 transition-colors hover:bg-accent/60",
                a.nivel === "alta"
                  ? "border-destructive/35 bg-destructive/5"
                  : a.nivel === "media"
                    ? "border-warning/40 bg-warning/8"
                    : "border-border bg-muted/40",
              )}
            >
              <p className="flex items-center justify-between gap-2 text-sm font-semibold">
                {a.titulo}
                <span className="shrink-0 text-xs uppercase text-muted-foreground">{a.nivel}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{a.detalle}</p>
            </Link>
          ))}
          {(data?.alertas ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              {isLoading ? "Revisando alertas…" : "Sin alertas pendientes en el período."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 2. Indicadores clave */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(data?.kpis ?? []).map((k) => (
          <Link key={k.id} to={k.ruta} className="block">
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">{k.titulo}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="tabular font-display text-2xl font-semibold">
                  {isLoading ? "—" : fmt(k.valor, k.formato)}
                </p>
                <div className="mt-2">
                  <Variacion valor={k.valor} anterior={k.anterior} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{k.nota}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
        {(data?.kpis ?? []).length === 0 &&
          [0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">—</CardContent>
            </Card>
          ))}
      </div>

      {/* Flujo de caja y antigüedad */}
      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="border-b pb-3">
            <CardTitle className="text-base">Flujo de caja del período</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {(data?.flujo ?? []).length > 0 ? (
              <FlujoCaja datos={data!.flujo} moneda={moneda} />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Sin movimientos bancarios en el período.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="border-b pb-3">
            <CardTitle className="text-base">Liquidez</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4 text-sm">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">Activo corriente</span>
              <span className="tabular font-medium">{money(data?.liquidez.activo ?? 0, moneda)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">Pasivo corriente</span>
              <span className="tabular font-medium">{money(data?.liquidez.pasivo ?? 0, moneda)}</span>
            </div>
            <div className="flex items-baseline justify-between border-t pt-3">
              <span className="text-muted-foreground">Capital de trabajo</span>
              <span className="tabular font-semibold">{money(data?.liquidez.capital ?? 0, moneda)}</span>
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">Razón de liquidez</span>
                <span className="tabular font-display text-xl font-semibold">
                  {(data?.liquidez.ratio ?? 0).toFixed(2)}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    (data?.liquidez.ratio ?? 0) >= 1.5
                      ? "bg-success"
                      : (data?.liquidez.ratio ?? 0) >= 1
                        ? "bg-warning"
                        : "bg-destructive",
                  )}
                  style={{ width: `${Math.min(100, ((data?.liquidez.ratio ?? 0) / 3) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Meta recomendada: 1.5 veces el pasivo corriente.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between border-b pb-3">
            <CardTitle className="text-base">Antigüedad de cuentas por cobrar</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/cxc">Ver detalle</Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-4">
            <Aging datos={data?.agingCxC ?? []} moneda={moneda} color="var(--color-chart-1)" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between border-b pb-3">
            <CardTitle className="text-base">Antigüedad de cuentas por pagar</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/cxp">Ver detalle</Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-4">
            <Aging datos={data?.agingCxP ?? []} moneda={moneda} color="var(--color-chart-4)" />
          </CardContent>
        </Card>
      </div>

      {/* 3. Analítica de operación */}
      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="border-b pb-3">
            <CardTitle className="text-base">Ingresos, gastos y utilidad (12 meses)</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {(data?.mensual ?? []).length > 0 ? (
              <IngresosGastos datos={data!.mensual} moneda={moneda} />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">Sin asientos contables.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="border-b pb-3">
            <CardTitle className="text-base">Estructura de gastos</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {(data?.topGastos ?? []).length > 0 ? (
              <Distribucion
                datos={(data?.topGastos ?? []).map((g) => ({ nombre: g.nombre, monto: g.monto }))}
                moneda={moneda}
              />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">Sin gastos registrados.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="border-b pb-3">
            <CardTitle className="text-base">Ingresos por centro de costo</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Centro de costo</TableHead>
                  <TableHead className="text-right">Ingresos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.porCentro ?? []).map((c) => (
                  <TableRow key={c.nombre}>
                    <TableCell>{c.nombre}</TableCell>
                    <TableCell className="tabular text-right">{money(c.monto, moneda)}</TableCell>
                  </TableRow>
                ))}
                {(data?.porCentro ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      Sin ingresos contabilizados en el período.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* 4. Accesos rápidos */}
        <div className="grid gap-4">
          <Card>
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-base">Accesos rápidos</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 pt-4 sm:grid-cols-2">
              {ACCESOS().map(({ to, label, icono: Icono }) => (
                <Button key={to} asChild variant="outline" className="justify-start">
                  <Link to={to}>
                    <Icono className="size-4" /> {label}
                  </Link>
                </Button>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-base">Consultas contables</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 pt-4 sm:grid-cols-2">
              {REPORTES.map(({ to, label, icono: Icono }) => (
                <Button key={to} asChild variant="ghost" className="justify-start">
                  <Link to={to}>
                    <Icono className="size-4" /> {label}
                  </Link>
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Últimas facturas */}
      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4" /> Últimas facturas
          </CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/facturas">Ver todas</Link>
          </Button>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>NCF</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(resumen?.ultimas ?? []).map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-mono text-xs">
                    <Link
                      to="/facturas/$id"
                      params={{ id: String(f.id) }}
                      className="font-medium text-primary hover:underline"
                    >
                      {f.ncf}
                    </Link>
                  </TableCell>
                  <TableCell>{f.cliente_nombre}</TableCell>
                  <TableCell>{fechaCorta(f.fecha)}</TableCell>
                  <TableCell className="tabular text-right">{money(f.total, f.moneda)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        f.estado === "pagada" ? "default" : f.estado === "anulada" ? "destructive" : "secondary"
                      }
                    >
                      {f.estado}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {(resumen?.ultimas ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Aún no hay facturas emitidas.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
