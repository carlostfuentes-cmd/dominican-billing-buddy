import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { SelectorBuscable } from "@/components/SelectorBuscable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  eliminarCuenta,
  guardarCuenta,
  obtenerAsientos,
  obtenerBalanceComprobacion,
  obtenerCatalogo,
  obtenerListasContabilidad,
  obtenerMayor,
} from "@/lib/contabilidad.functions";
import { dop, fechaCorta, hoyISO, type CuentaCatalogo, type Moneda } from "@/lib/erp-types";

const CLASIFICACIONES = [
  "NO DEFINIDO",
  "ACTIVOS CORRIENTES",
  "ACTIVOS FIJOS",
  "OTROS ACTIVOS",
  "PASIVO CORRIENTE",
  "CAPITAL Y RESERVAS",
  "INGRESOS",
  "OTROS INGRESOS",
  "COSTO DE VENTAS",
  "GASTOS ADMINISTRATIVOS",
  "GASTOS FINANCIEROS",
];

export const Route = createFileRoute("/contabilidad/")({
  head: () => ({
    meta: [
      { title: "Diario general — ERP Contable RD" },
      {
        name: "description",
        content:
          "Diario general: asientos contables, mayor general por cuenta, balance de comprobación y catálogo de cuentas.",
      },
      { property: "og:title", content: "Diario general — ERP Contable RD" },
      {
        property: "og:description",
        content: "Asientos, mayor general, balance de comprobación y catálogo de cuentas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContabilidadPage,
});

const TODOS = "__todos__";

function inicioAno(): string {
  return `${hoyISO().slice(0, 4)}-01-01`;
}

function ContabilidadPage() {
  const [desde, setDesde] = useState(inicioAno());
  const [hasta, setHasta] = useState(hoyISO());
  const [tipo, setTipo] = useState(TODOS);
  const [estado, setEstado] = useState(TODOS);
  const [cuenta, setCuenta] = useState("");
  const [busquedaCuenta, setBusquedaCuenta] = useState("");

  const { data: listas } = useQuery({
    queryKey: ["contabilidad", "listas"],
    queryFn: () => obtenerListasContabilidad(),
  });

  const { data: asientos = [], isLoading: cargandoAsientos } = useQuery({
    queryKey: ["contabilidad", "asientos", desde, hasta, tipo, estado],
    queryFn: () =>
      obtenerAsientos({
        data: {
          desde,
          hasta,
          ...(tipo === TODOS ? {} : { tipoId: tipo }),
          ...(estado === TODOS ? {} : { estadoId: estado }),
        },
      }),
  });

  const { data: mayor } = useQuery({
    queryKey: ["contabilidad", "mayor", cuenta, desde, hasta],
    queryFn: () => obtenerMayor({ data: { cuenta, desde, hasta } }),
    enabled: cuenta.length > 0,
  });

  const { data: balance = [], isLoading: cargandoBalance } = useQuery({
    queryKey: ["contabilidad", "balance", desde, hasta],
    queryFn: () => obtenerBalanceComprobacion({ data: { desde, hasta } }),
  });

  const { data: catalogo = [] } = useQuery({
    queryKey: ["contabilidad", "catalogo", busquedaCuenta],
    queryFn: () => obtenerCatalogo({ data: { busqueda: busquedaCuenta } }),
  });

  const [dialogoCuenta, setDialogoCuenta] = useState(false);
  const [cuentaEditando, setCuentaEditando] = useState<CuentaCatalogo | null>(null);

  const queryClient = useQueryClient();
  const refrescarCatalogo = () => {
    void queryClient.invalidateQueries({ queryKey: ["contabilidad", "catalogo"] });
    void queryClient.invalidateQueries({ queryKey: ["contabilidad", "listas"] });
  };

  const eliminar = useMutation({
    mutationFn: (cuenta: string) => eliminarCuenta({ data: { cuenta } }),
    onSuccess: () => {
      toast.success("Cuenta eliminada.");
      refrescarCatalogo();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const abrirNueva = () => {
    setCuentaEditando(null);
    setDialogoCuenta(true);
  };
  const abrirEdicion = (c: CuentaCatalogo) => {
    setCuentaEditando(c);
    setDialogoCuenta(true);
  };

  const opcionesCuentas = useMemo(
    () =>
      (listas?.cuentas ?? []).map((c) => ({
        valor: c.cuenta,
        etiqueta: `${c.cuenta} — ${c.nombre}`,
        detalle: c.clasificacion ?? "",
      })),
    [listas],
  );

  const totalesBalance = useMemo(
    () => ({
      debito: balance.reduce((a, l) => a + l.debito, 0),
      credito: balance.reduce((a, l) => a + l.credito, 0),
    }),
    [balance],
  );

  const periodo = (
    <div className="grid gap-3 border-b bg-muted/20 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <Label htmlFor="desde">Desde</Label>
        <Input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="hasta">Hasta</Label>
        <Input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
      </div>
      <div>
        <Label>Tipo de entrada</Label>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos</SelectItem>
            {(listas?.tipos ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Estado</Label>
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos</SelectItem>
            {(listas?.estados ?? []).map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader
        titulo="Diario general"
        descripcion="Asientos contables, mayor general por cuenta, balance de comprobación y catálogo de cuentas."
        acciones={
          <Button asChild>
            <Link to="/contabilidad/nuevo">
              <Plus className="size-4" /> Nuevo asiento
            </Link>
          </Button>
        }
      />

      <Tabs defaultValue="asientos">
        <TabsList className="mb-4">
          <TabsTrigger value="asientos">Asientos</TabsTrigger>
          <TabsTrigger value="mayor">Mayor general</TabsTrigger>
          <TabsTrigger value="balance">Balance de comprobación</TabsTrigger>
          <TabsTrigger value="catalogo">Catálogo de cuentas</TabsTrigger>
        </TabsList>

        <TabsContent value="asientos">
          <Card className="overflow-hidden">
            <CardContent className="px-0 pb-0 pt-0">
              {periodo}
              <p className="border-b bg-muted/30 px-5 py-3 text-sm text-muted-foreground">
                {asientos.length} asientos en el período
              </p>
              <div className="overflow-x-auto">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asiento</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Débito</TableHead>
                      <TableHead className="text-right">Crédito</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cargandoAsientos ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                          Cargando…
                        </TableCell>
                      </TableRow>
                    ) : asientos.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                          Sin asientos en el período seleccionado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      asientos.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-mono text-xs">
                            {a.numero} · {a.ano}
                          </TableCell>
                          <TableCell>{fechaCorta(a.fecha)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{a.tipo}</TableCell>
                          <TableCell>{a.descripcion}</TableCell>
                          <TableCell>
                            <Badge variant={a.estado_id === "C" ? "default" : "secondary"}>
                              {a.estado || a.estado_id}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{dop(a.debito)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {dop(a.credito)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mayor">
          <Card className="overflow-hidden">
            <CardContent className="px-0 pb-0 pt-0">
              <div className="grid gap-3 border-b bg-muted/20 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="lg:col-span-1">
                  <Label>Cuenta</Label>
                  <SelectorBuscable
                    opciones={opcionesCuentas}
                    valor={cuenta}
                    onSeleccionar={setCuenta}
                    placeholder="Selecciona la cuenta"
                    placeholderBusqueda="Escribe número o nombre de la cuenta…"
                  />
                </div>
                <div>
                  <Label htmlFor="mdesde">Desde</Label>
                  <Input
                    id="mdesde"
                    type="date"
                    value={desde}
                    onChange={(e) => setDesde(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="mhasta">Hasta</Label>
                  <Input
                    id="mhasta"
                    type="date"
                    value={hasta}
                    onChange={(e) => setHasta(e.target.value)}
                  />
                </div>
              </div>

              {!cuenta ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                  Selecciona una cuenta para ver su mayor general.
                </p>
              ) : (
                <>
                  <p className="border-b bg-muted/30 px-5 py-3 text-sm text-muted-foreground">
                    {mayor?.cuenta_nombre} · Saldo anterior{" "}
                    <span className="font-medium text-foreground">
                      {dop(mayor?.saldo_anterior ?? 0)}
                    </span>{" "}
                    · Saldo final{" "}
                    <span className="font-medium text-foreground">{dop(mayor?.saldo ?? 0)}</span>
                  </p>
                  <div className="overflow-x-auto">
                    <Table className="min-w-[980px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Asiento</TableHead>
                          <TableHead>Origen</TableHead>
                          <TableHead>Documento</TableHead>
                          <TableHead>Descripción</TableHead>
                          <TableHead className="text-right">Débito</TableHead>
                          <TableHead className="text-right">Crédito</TableHead>
                          <TableHead className="text-right">Saldo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(mayor?.movimientos ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={8}
                              className="py-8 text-center text-muted-foreground"
                            >
                              Sin movimientos en el período.
                            </TableCell>
                          </TableRow>
                        ) : (
                          (mayor?.movimientos ?? []).map((m) => (
                            <TableRow key={m.id}>
                              <TableCell>{fechaCorta(m.fecha)}</TableCell>
                              <TableCell className="font-mono text-xs">{m.asiento_id}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {m.origen || "—"}
                              </TableCell>
                              <TableCell>{m.documento || "—"}</TableCell>
                              <TableCell>{m.descripcion || m.operacion}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {m.debito ? dop(m.debito) : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {m.credito ? dop(m.credito) : "—"}
                              </TableCell>
                              <TableCell className="text-right font-medium tabular-nums">
                                {dop(m.saldo)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balance">
          <Card className="overflow-hidden">
            <CardContent className="px-0 pb-0 pt-0">
              {periodo}
              <p className="border-b bg-muted/30 px-5 py-3 text-sm text-muted-foreground">
                {balance.length} cuentas con movimiento · Débito{" "}
                <span className="font-medium text-foreground">{dop(totalesBalance.debito)}</span> ·
                Crédito{" "}
                <span className="font-medium text-foreground">{dop(totalesBalance.credito)}</span>
              </p>
              <div className="overflow-x-auto">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cuenta</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="text-right">Saldo anterior</TableHead>
                      <TableHead className="text-right">Débito</TableHead>
                      <TableHead className="text-right">Crédito</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cargandoBalance ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                          Cargando…
                        </TableCell>
                      </TableRow>
                    ) : balance.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                          Sin movimientos en el período seleccionado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      balance.map((l) => (
                        <TableRow key={l.cuenta}>
                          <TableCell className="font-mono text-xs">{l.cuenta}</TableCell>
                          <TableCell>{l.nombre}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {dop(l.saldo_anterior)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{dop(l.debito)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {dop(l.credito)}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {dop(l.saldo)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="catalogo">
          <Card className="overflow-hidden">
            <CardContent className="px-0 pb-0 pt-0">
              <div className="flex flex-wrap items-end gap-3 border-b bg-muted/20 px-5 py-4">
                <div className="min-w-56 flex-1">
                  <Label htmlFor="buscar">Buscar cuenta</Label>
                  <Input
                    id="buscar"
                    value={busquedaCuenta}
                    onChange={(e) => setBusquedaCuenta(e.target.value)}
                    placeholder="Número o nombre de la cuenta…"
                  />
                </div>
                <Button type="button" onClick={abrirNueva}>
                  <Plus className="mr-1.5 size-4" /> Nueva cuenta
                </Button>
              </div>
              <p className="border-b bg-muted/30 px-5 py-3 text-sm text-muted-foreground">
                {catalogo.length} cuentas
              </p>
              <div className="overflow-x-auto">
                <Table className="min-w-[880px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cuenta</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Nivel</TableHead>
                      <TableHead>Clasificación</TableHead>
                      <TableHead>Naturaleza</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="w-24 text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catalogo.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                          Sin cuentas para la búsqueda.
                        </TableCell>
                      </TableRow>
                    ) : (
                      catalogo.map((c) => (
                        <TableRow key={c.cuenta}>
                          <TableCell className="font-mono text-xs">{c.cuenta}</TableCell>
                          <TableCell>{c.nombre}</TableCell>
                          <TableCell>{c.nivel}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {c.clasificacion || "—"}
                          </TableCell>
                          <TableCell>{c.naturaleza === "D" ? "Débito" : "Crédito"}</TableCell>
                          <TableCell>
                            <Badge variant={c.detalle ? "default" : "secondary"}>
                              {c.detalle ? "Detalle" : "Grupo"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={c.status === "I" ? "secondary" : "default"}>
                              {c.status === "I" ? "Inactiva" : "Activa"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                title="Editar cuenta"
                                onClick={() => abrirEdicion(c)}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                title="Eliminar cuenta"
                                disabled={eliminar.isPending}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `¿Eliminar la cuenta ${c.cuenta} — ${c.nombre}?`,
                                    )
                                  )
                                    eliminar.mutate(c.cuenta);
                                }}
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          <FormularioCuenta
            key={cuentaEditando?.cuenta ?? "nueva"}
            abierto={dialogoCuenta}
            cuenta={cuentaEditando}
            cuentas={catalogo}
            monedas={listas?.monedas ?? []}
            onCerrar={(guardado) => {
              setDialogoCuenta(false);
              if (guardado) refrescarCatalogo();
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
