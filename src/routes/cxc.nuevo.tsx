import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Printer, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import {
  guardarMovimientoCxC,
  obtenerDocumentosPendientes,
  obtenerListasCxC,
} from "@/lib/cxc.functions";
import { obtenerClientes } from "@/lib/erp.functions";
import { fechaCorta, hoyISO, money, round2 } from "@/lib/erp-types";

export const Route = createFileRoute("/cxc/nuevo")({
  validateSearch: (search: Record<string, unknown>) => ({
    cliente: typeof search["cliente"] === "string" ? search["cliente"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Nuevo movimiento de cobro — ERP Contable RD" },
      {
        name: "description",
        content:
          "Registra recibos de cobro, notas de crédito o débito y avances aplicándolos a los documentos pendientes del cliente.",
      },
      { property: "og:title", content: "Nuevo movimiento de cobro — ERP Contable RD" },
      {
        property: "og:description",
        content: "Aplica cobros a documentos pendientes con retenciones de ITBIS y multimoneda.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NuevoMovimientoPage,
});

const SIN = "sin";

interface FilaAplicacion {
  marcado: boolean;
  valor: number;
  descuento: number;
}

function NuevoMovimientoPage() {
  const { cliente: clienteInicial } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [clienteId, setClienteId] = useState(clienteInicial);
  const [tipoId, setTipoId] = useState("P");
  const [fecha, setFecha] = useState(hoyISO());
  const [documento, setDocumento] = useState("");
  const [sucursalId, setSucursalId] = useState("");
  const [vendedorId, setVendedorId] = useState("");
  const [moneda, setMoneda] = useState("DOP");
  const [tasa, setTasa] = useState(1);
  const [monto, setMonto] = useState(0);
  const [itbisRetenido, setItbisRetenido] = useState(0);
  const [anticipo, setAnticipo] = useState(0);
  const [concepto, setConcepto] = useState("");
  const [pagoFecha, setPagoFecha] = useState(hoyISO());
  const [formaPago, setFormaPago] = useState("");
  const [bancoId, setBancoId] = useState(SIN);
  const [pagoNumero, setPagoNumero] = useState("");
  const [filas, setFilas] = useState<Record<number, FilaAplicacion>>({});

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes", ""],
    queryFn: () => obtenerClientes({ data: { busqueda: "" } }),
  });
  const { data: listas } = useQuery({
    queryKey: ["listas-cxc"],
    queryFn: () => obtenerListasCxC(),
    staleTime: 300_000,
  });
  const { data: pendientes = [], isLoading: cargandoDocs } = useQuery({
    queryKey: ["cxc-pendientes", clienteId],
    queryFn: () => obtenerDocumentosPendientes({ data: { clienteId } }),
    enabled: clienteId.length > 0,
  });

  const cliente = clientes.find((c) => String(c.id) === clienteId);
  const tipo = (listas?.tipos ?? []).find((t) => t.id === tipoId);

  const fila = (ref: number): FilaAplicacion =>
    filas[ref] ?? { marcado: false, valor: 0, descuento: 0 };
  const setFila = (ref: number, cambio: Partial<FilaAplicacion>) =>
    setFilas((prev) => ({ ...prev, [ref]: { ...fila(ref), ...cambio } }));

  const totales = useMemo(() => {
    const valores = pendientes.reduce((a, d) => a + fila(d.referencia).valor, 0);
    const descuentos = pendientes.reduce((a, d) => a + fila(d.referencia).descuento, 0);
    const pendiente = pendientes.reduce((a, d) => a + d.balance, 0);
    return {
      valores: round2(valores),
      descuentos: round2(descuentos),
      pendiente: round2(pendiente),
      neto: round2(monto - itbisRetenido - anticipo),
      porAplicar: round2(monto - valores),
    };
  }, [pendientes, filas, monto, itbisRetenido, anticipo]);

  /** Reparte el valor a aplicar entre los documentos marcados, del más antiguo al más nuevo. */
  const distribuir = () => {
    let resta = monto;
    const siguiente: Record<number, FilaAplicacion> = { ...filas };
    const marcados = pendientes.filter((d) => fila(d.referencia).marcado);
    const objetivo = marcados.length ? marcados : pendientes;
    for (const d of objetivo) {
      const aplicar = Math.min(Math.max(resta, 0), Math.max(d.balance, 0));
      siguiente[d.referencia] = {
        ...fila(d.referencia),
        marcado: aplicar > 0,
        valor: round2(aplicar),
      };
      resta = round2(resta - aplicar);
    }
    setFilas(siguiente);
  };

  const marcarTodos = (valor: boolean) => {
    const siguiente: Record<number, FilaAplicacion> = { ...filas };
    for (const d of pendientes) siguiente[d.referencia] = { ...fila(d.referencia), marcado: valor };
    setFilas(siguiente);
  };

  const limpiar = () => {
    setFilas({});
    setMonto(0);
    setItbisRetenido(0);
    setAnticipo(0);
    setConcepto("");
    setPagoNumero("");
    setDocumento("");
  };

  const guardar = useMutation({
    mutationFn: async (imprimir: boolean) => {
      const aplicaciones = pendientes
        .map((d) => ({
          referencia: d.referencia,
          valor: round2(fila(d.referencia).valor),
          descuento: round2(fila(d.referencia).descuento),
        }))
        .filter((a) => a.valor > 0 || a.descuento > 0);
      const mov = await guardarMovimientoCxC({
        data: {
          cliente_id: clienteId,
          tipo_id: tipoId,
          fecha,
          ...(documento ? { documento: Number(documento) } : {}),
          ...(sucursalId ? { sucursal_id: sucursalId } : {}),
          ...(vendedorId ? { vendedor_id: vendedorId } : {}),
          moneda,
          tasa_cambio: tasa || 1,
          monto: round2(monto),
          itbis_retenido: round2(itbisRetenido),
          anticipo_retenido: round2(anticipo),
          concepto,
          pago_fecha: pagoFecha,
          forma_pago_id: formaPago,
          ...(bancoId !== SIN ? { banco_id: bancoId } : {}),
          pago_numero: pagoNumero,
          aplicaciones,
        },
      });
      return { mov, imprimir };
    },
    onSuccess: ({ imprimir }) => {
      toast.success("Movimiento registrado");
      void qc.invalidateQueries({ queryKey: ["cxc-movimientos"] });
      void qc.invalidateQueries({ queryKey: ["cxc-balances"] });
      void qc.invalidateQueries({ queryKey: ["cxc-pendientes"] });
      if (imprimir) window.print();
      void navigate({ to: "/cxc" });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "No se pudo registrar el movimiento"),
  });

  const puedeGuardar = clienteId.length > 0 && tipoId.length > 0 && monto > 0;

  return (
    <div>
      <PageHeader
        titulo="Movimientos de cuentas por cobrar"
        descripcion="Aplica cobros, notas y avances a los documentos pendientes del cliente."
        acciones={
          <div className="flex gap-2">
            <Button variant="outline" onClick={limpiar}>
              <RotateCcw className="size-4" /> Limpiar
            </Button>
            <Button
              variant="outline"
              disabled={!puedeGuardar || guardar.isPending}
              onClick={() => guardar.mutate(true)}
            >
              <Printer className="size-4" /> Guardar e imprimir
            </Button>
            <Button disabled={!puedeGuardar || guardar.isPending} onClick={() => guardar.mutate(false)}>
              <Save className="size-4" /> Guardar
            </Button>
          </div>
        }
      />

      <Card className="mb-4">
        <CardContent className="grid gap-3 pt-6 md:grid-cols-2 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Label>Cliente</Label>
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona el cliente" />
              </SelectTrigger>
              <SelectContent>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.id} — {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {cliente?.rnc ? (
              <p className="mt-1 text-xs text-muted-foreground">RNC/Cédula: {cliente.rnc}</p>
            ) : null}
          </div>
          <div>
            <Label>Tipo de transacción</Label>
            <Select value={tipoId} onValueChange={setTipoId}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                {(listas?.tipos ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tipo ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {tipo.signo === "C" ? "Abona al cliente" : "Carga al cliente"}
                {tipo.ncf ? " · requiere NCF" : ""}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="fecha">Fecha de transacción</Label>
            <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="doc">Documento No.</Label>
            <Input
              id="doc"
              inputMode="numeric"
              placeholder="Automático"
              value={documento}
              onChange={(e) => setDocumento(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div>
            <Label>Sucursal</Label>
            <Select value={sucursalId} onValueChange={setSucursalId}>
              <SelectTrigger>
                <SelectValue placeholder="Principal" />
              </SelectTrigger>
              <SelectContent>
                {(listas?.sucursales ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Vendedor</Label>
            <Select value={vendedorId} onValueChange={setVendedorId}>
              <SelectTrigger>
                <SelectValue placeholder="Oficina" />
              </SelectTrigger>
              <SelectContent>
                {(listas?.vendedores ?? []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardContent className="pt-6">
            <Tabs defaultValue="pendientes">
              <TabsList className="mb-3">
                <TabsTrigger value="pendientes">Documentos pendientes</TabsTrigger>
                <TabsTrigger value="concepto">Concepto</TabsTrigger>
              </TabsList>

              <TabsContent value="pendientes">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => marcarTodos(true)}>
                    Todos los documentos
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => marcarTodos(false)}>
                    Ninguno
                  </Button>
                  <Button variant="secondary" size="sm" onClick={distribuir}>
                    Aplicar valor a los documentos
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <Table className="min-w-[720px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>Documento No.</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead className="text-right">Balance pendiente</TableHead>
                        <TableHead className="w-32 text-right">Valor CxC</TableHead>
                        <TableHead className="w-32 text-right">Descuento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!clienteId && (
                        <TableRow>
                          <TableCell colSpan={6}>Selecciona un cliente.</TableCell>
                        </TableRow>
                      )}
                      {clienteId && cargandoDocs && (
                        <TableRow>
                          <TableCell colSpan={6}>Cargando…</TableCell>
                        </TableRow>
                      )}
                      {clienteId && !cargandoDocs && pendientes.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6}>Este cliente no tiene documentos pendientes.</TableCell>
                        </TableRow>
                      )}
                      {pendientes.map((d) => {
                        const f = fila(d.referencia);
                        return (
                          <TableRow key={d.referencia}>
                            <TableCell>
                              <Checkbox
                                checked={f.marcado}
                                onCheckedChange={(v) => setFila(d.referencia, { marcado: v === true })}
                                aria-label={`Documento ${d.referencia}`}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-xs">{d.referencia}</TableCell>
                            <TableCell>{d.fecha ? fechaCorta(d.fecha) : "—"}</TableCell>
                            <TableCell className="text-right">
                              {money(d.balance, d.moneda)}
                            </TableCell>
                            <TableCell>
                              <Input
                                className="text-right"
                                inputMode="decimal"
                                value={f.valor || ""}
                                onChange={(e) =>
                                  setFila(d.referencia, {
                                    valor: Number(e.target.value) || 0,
                                    marcado: true,
                                  })
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                className="text-right"
                                inputMode="decimal"
                                value={f.descuento || ""}
                                onChange={(e) =>
                                  setFila(d.referencia, { descuento: Number(e.target.value) || 0 })
                                }
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {pendientes.length > 0 && (
                        <TableRow className="font-medium">
                          <TableCell colSpan={3}>Totales</TableCell>
                          <TableCell className="text-right">
                            {money(totales.pendiente, moneda)}
                          </TableCell>
                          <TableCell className="text-right">
                            {money(totales.valores, moneda)}
                          </TableCell>
                          <TableCell className="text-right">
                            {money(totales.descuentos, moneda)}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="concepto">
                <Label htmlFor="concepto">Concepto</Label>
                <Textarea
                  id="concepto"
                  rows={6}
                  value={concepto}
                  onChange={(e) => setConcepto(e.target.value)}
                  placeholder="Detalle del cobro o de la nota"
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Información del movimiento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Moneda</Label>
                  <Select value={moneda} onValueChange={setMoneda}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(listas?.monedas ?? []).map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.simbolo} — {m.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tasa">Tasa de cambio</Label>
                  <Input
                    id="tasa"
                    inputMode="decimal"
                    value={tasa}
                    onChange={(e) => setTasa(Number(e.target.value) || 0)}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="monto">Valor a aplicar</Label>
                <Input
                  id="monto"
                  className="text-right"
                  inputMode="decimal"
                  value={monto || ""}
                  onChange={(e) => setMonto(Number(e.target.value) || 0)}
                />
              </div>
              <div>
                <Label htmlFor="itbis">ITBIS retenido</Label>
                <Input
                  id="itbis"
                  className="text-right"
                  inputMode="decimal"
                  value={itbisRetenido || ""}
                  onChange={(e) => setItbisRetenido(Number(e.target.value) || 0)}
                />
              </div>
              <div>
                <Label htmlFor="anticipo">Anticipo / ISR retenido</Label>
                <Input
                  id="anticipo"
                  className="text-right"
                  inputMode="decimal"
                  value={anticipo || ""}
                  onChange={(e) => setAnticipo(Number(e.target.value) || 0)}
                />
              </div>
              <dl className="space-y-1 border-t pt-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Descuento</dt>
                  <dd>{money(totales.descuentos, moneda)}</dd>
                </div>
                <div className="flex justify-between font-medium">
                  <dt>Neto cobrado</dt>
                  <dd>{money(totales.neto, moneda)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Por aplicar</dt>
                  <dd>{money(totales.porAplicar, moneda)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Información del pago</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="pfecha">Fecha</Label>
                <Input
                  id="pfecha"
                  type="date"
                  value={pagoFecha}
                  onChange={(e) => setPagoFecha(e.target.value)}
                />
              </div>
              <div>
                <Label>Forma</Label>
                <Select value={formaPago} onValueChange={setFormaPago}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    {(listas?.formas ?? []).map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Banco</Label>
                <Select value={bancoId} onValueChange={setBancoId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN}>Sin banco</SelectItem>
                    {(listas?.bancos ?? []).map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="pnum">Número</Label>
                <Input id="pnum" value={pagoNumero} onChange={(e) => setPagoNumero(e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
