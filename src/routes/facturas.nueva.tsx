import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  guardarPedido,
  obtenerClientes,
  obtenerItems,
  obtenerListasFactura,
  obtenerSecuencias,
} from "@/lib/erp.functions";
import {
  calcularTotales,
  dop,
  enDOP,
  formatearNCF,
  hoyISO,
  money,
  sumarDias,
  TIPOS_NCF,
  type LineaEntrada,
  type TipoNCF,
} from "@/lib/erp-types";

export const Route = createFileRoute("/facturas/nueva")({
  head: () => ({
    meta: [
      { title: "Nueva factura — ERP Contable RD" },
      {
        name: "description",
        content: "Emite una factura con NCF automático, ITBIS, moneda y tasa de cambio.",
      },
      { property: "og:title", content: "Nueva factura — ERP Contable RD" },
      {
        property: "og:description",
        content: "Emisión de factura con NCF, ITBIS y multimoneda.",
      },
    ],
  }),
  component: NuevaFactura,
});

const SIN = "-";

const lineaVacia: LineaEntrada = {
  item_id: null,
  codigo: "",
  descripcion: "",
  cantidad: 1,
  oferta: 0,
  precio: 0,
  descuento_pct: 0,
  tasa_itbis: 18,
};

function NuevaFactura() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [clienteId, setClienteId] = useState("");
  const [tipo, setTipo] = useState<TipoNCF>("B02");
  const [fecha, setFecha] = useState(hoyISO());
  const [dias, setDias] = useState(0);
  const [notas, setNotas] = useState("");
  const [moneda, setMoneda] = useState("DOP");
  const [tasa, setTasa] = useState(1);
  const [incluyeItbis, setIncluyeItbis] = useState(false);
  const [vendedor, setVendedor] = useState(SIN);
  const [tecnico, setTecnico] = useState(SIN);
  const [almacen, setAlmacen] = useState(SIN);
  const [sucursal, setSucursal] = useState(SIN);
  const [departamento, setDepartamento] = useState(SIN);
  const [proyecto, setProyecto] = useState(SIN);
  const [cotizacion, setCotizacion] = useState("");
  const [ordenCliente, setOrdenCliente] = useState("");
  const [ordenVendedor, setOrdenVendedor] = useState("");
  const [efectivo, setEfectivo] = useState(0);
  const [tarjeta, setTarjeta] = useState(0);
  const [cheque, setCheque] = useState(0);
  const [transferencia, setTransferencia] = useState(0);
  const [lineas, setLineas] = useState<LineaEntrada[]>([{ ...lineaVacia }]);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes", ""],
    queryFn: () => obtenerClientes({ data: { busqueda: "" } }),
  });
  const { data: items = [] } = useQuery({
    queryKey: ["items", ""],
    queryFn: () => obtenerItems({ data: { busqueda: "" } }),
  });
  const { data: secuencias = [] } = useQuery({
    queryKey: ["secuencias"],
    queryFn: () => obtenerSecuencias(),
  });
  const { data: listas } = useQuery({
    queryKey: ["listas-factura"],
    queryFn: () => obtenerListasFactura(),
  });

  const cliente = clientes.find((c) => String(c.id) === clienteId);
  const secuencia = secuencias.find((s) => s.tipo_ncf === tipo);
  const esDOP = moneda.toUpperCase() === "DOP";
  const lineasCalculo = useMemo(
    () => lineas.map((l) => ({ ...l, precio_incluye_itbis: incluyeItbis })),
    [lineas, incluyeItbis],
  );
  const { totales } = useMemo(() => calcularTotales(lineasCalculo), [lineasCalculo]);
  const cobrado = efectivo + tarjeta + cheque + transferencia;

  const guardar = useMutation({
    mutationFn: (opciones: { facturar: boolean; imprimir?: boolean }) =>
      guardarPedido({
        data: {
          cliente_id: clienteId,
          tipo_ncf: tipo,
          fecha,
          dias_credito: dias,
          notas,
          moneda,
          tasa_cambio: tasa,
          ...(vendedor !== SIN ? { vendedor_id: vendedor } : {}),
          ...(tecnico !== SIN ? { tecnico_id: tecnico } : {}),
          ...(almacen !== SIN ? { almacen_id: almacen } : {}),
          ...(sucursal !== SIN ? { sucursal_id: sucursal } : {}),
          ...(departamento !== SIN ? { departamento_id: departamento } : {}),
          ...(proyecto !== SIN ? { proyecto_id: proyecto } : {}),
          ...(cotizacion ? { cotizacion_id: cotizacion } : {}),
          orden_cliente: ordenCliente,
          orden_vendedor: ordenVendedor,
          pagos: { efectivo, tarjeta, cheque, transferencia, cardnet: 0 },
          lineas: lineasCalculo.map((l) => ({ ...l, item_id: l.item_id ?? null })),
          facturar: opciones.facturar,
        },
      }),
    onSuccess: (doc, opciones) => {
      toast.success(
        opciones.facturar ? `Factura ${doc.ncf} guardada` : `Pedido ${doc.id} guardado`,
      );
      void qc.invalidateQueries({ queryKey: ["facturas"] });
      void qc.invalidateQueries({ queryKey: ["secuencias"] });
      void qc.invalidateQueries({ queryKey: ["resumen"] });
      void navigate({
        to: "/facturas/$id",
        params: { id: String(doc.id) },
        ...(opciones.imprimir ? { search: { imprimir: true } } : {}),
      });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar el documento"),
  });

  const actualizar = (i: number, cambios: Partial<LineaEntrada>) =>
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...cambios } : l)));

  const seleccionarItem = (i: number, valor: string) => {
    const item = items.find((x) => String(x.id) === valor);
    if (!item) return;
    actualizar(i, {
      item_id: item.id,
      codigo: item.codigo,
      descripcion: item.descripcion,
      precio: item.precio,
      tasa_itbis: item.tasa_itbis,
    });
  };

  const enviar = (facturar: boolean, imprimir = false) => {
    if (!clienteId) { toast.error("Selecciona un cliente"); return; }
    if (!esDOP && (!tasa || tasa <= 0)) {
      toast.error("Indica la tasa de cambio a aplicar");
      return;
    }
    if (!lineas.length) { toast.error("Agrega al menos una línea"); return; }
    for (const l of lineas) {
      if (!l.descripcion.trim()) { toast.error("Cada línea necesita una descripción"); return; }
      if (l.cantidad <= 0) { toast.error("La cantidad debe ser mayor que cero"); return; }
    }
    if (cobrado > totales.total + 0.01) {
      toast.error("Los cobros superan el total del pedido");
      return;
    }
    // El NCF sólo se necesita al convertir el pedido en factura.
    if (facturar && (!secuencia || !secuencia.activa || secuencia.proximo > secuencia.hasta))
      { toast.error(`No hay NCF ${tipo} disponible. Revisa las secuencias.`); return; }
    guardar.mutate({ facturar, imprimir });
  };

  const lista = (opciones: { id: string; nombre: string }[] | undefined) => opciones ?? [];

  return (
    <div>
      <PageHeader
        titulo="Nueva factura"
        descripcion="El NCF se asigna automáticamente al emitir. Indica moneda y tasa de cambio."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos del cliente</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div>
              <Label>Cliente</Label>
              <Select
                value={clienteId}
                onValueChange={(v) => {
                  setClienteId(v);
                  const c = clientes.find((x) => String(x.id) === v);
                  if (c) {
                    setTipo(c.tipo_ncf);
                    setDias(c.dias_credito);
                    if (c.vendedor_id) setVendedor(String(c.vendedor_id));
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientes
                    .filter((c) => c.activo)
                    .map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.id} — {c.nombre}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1 text-sm">
              <p>
                <span className="text-muted-foreground">RNC/Cédula: </span>
                {cliente?.rnc || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Dirección: </span>
                {cliente?.direccion || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Teléfono: </span>
                {cliente?.telefono || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Crédito disponible: </span>
                {cliente?.monto_credito ? dop(cliente.monto_credito) : "—"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos del pedido</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="fecha">Emisión</Label>
              <Input
                id="fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="dias">Condiciones (días)</Label>
              <Input
                id="dias"
                type="number"
                min={0}
                max={365}
                value={dias}
                onChange={(e) => setDias(Math.max(0, Number(e.target.value) || 0))}
              />
              <p className="mt-1 text-xs text-muted-foreground">Vence el {sumarDias(fecha, dias)}</p>
            </div>
            <div>
              <Label>Moneda</Label>
              <Select
                value={moneda}
                onValueChange={(v) => {
                  setMoneda(v);
                  if (v.toUpperCase() === "DOP") setTasa(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {lista(listas?.monedas).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.id} — {m.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="tasa">Tasa de cambio a aplicar</Label>
              <Input
                id="tasa"
                type="number"
                min={0}
                step="0.0001"
                value={tasa}
                disabled={esDOP}
                onChange={(e) => setTasa(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>Vendedor</Label>
              <Select value={vendedor} onValueChange={setVendedor}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin vendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN}>Sin especificar</SelectItem>
                  {lista(listas?.vendedores).map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Técnico</Label>
              <Select value={tecnico} onValueChange={setTecnico}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin técnico" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN}>Sin especificar</SelectItem>
                  {lista(listas?.tecnicos).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de comprobante</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoNCF)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_NCF.map((t) => (
                    <SelectItem key={t.codigo} value={t.codigo}>
                      {t.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {secuencia
                  ? `Próximo: ${formatearNCF(tipo, secuencia.proximo)} · ${Math.max(
                      0,
                      secuencia.hasta - secuencia.proximo + 1,
                    )} disponibles`
                  : "Sin secuencia configurada"}
              </p>
            </div>
            <div className="flex items-end gap-2 pb-2">
              <Checkbox
                id="incluye"
                checked={incluyeItbis}
                onCheckedChange={(v) => setIncluyeItbis(v === true)}
              />
              <Label htmlFor="incluye" className="text-sm font-normal">
                El precio incluye ITBIS
              </Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Referencias</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div>
              <Label htmlFor="cot">Cotización</Label>
              <Input
                id="cot"
                value={cotizacion}
                maxLength={10}
                onChange={(e) => setCotizacion(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div>
              <Label htmlFor="oc">Orden cliente</Label>
              <Input
                id="oc"
                value={ordenCliente}
                maxLength={10}
                onChange={(e) => setOrdenCliente(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ov">Orden servicio / vendedor</Label>
              <Input
                id="ov"
                value={ordenVendedor}
                maxLength={10}
                onChange={(e) => setOrdenVendedor(e.target.value)}
              />
            </div>
            <div>
              <Label>Almacén</Label>
              <Select value={almacen} onValueChange={setAlmacen}>
                <SelectTrigger>
                  <SelectValue placeholder="Predeterminado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN}>Predeterminado</SelectItem>
                  {lista(listas?.almacenes).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sucursal</Label>
              <Select value={sucursal} onValueChange={setSucursal}>
                <SelectTrigger>
                  <SelectValue placeholder="Predeterminada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN}>Predeterminada</SelectItem>
                  {lista(listas?.sucursales).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Departamento</Label>
              <Select value={departamento} onValueChange={setDepartamento}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin departamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN}>Sin especificar</SelectItem>
                  {lista(listas?.departamentos).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {lista(listas?.proyectos).length > 0 && (
              <div>
                <Label>Proyecto</Label>
                <Select value={proyecto} onValueChange={setProyecto}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin proyecto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN}>Sin especificar</SelectItem>
                    {lista(listas?.proyectos).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Detalle del producto o servicio</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLineas((p) => [...p, { ...lineaVacia }])}
          >
            <Plus className="size-4" /> Agregar línea
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-52">Código / ítem</TableHead>
                <TableHead className="min-w-52">Producto</TableHead>
                <TableHead className="w-24">Cant.</TableHead>
                <TableHead className="w-24">Oferta</TableHead>
                <TableHead className="w-32">Precio</TableHead>
                <TableHead className="w-24">Desc. %</TableHead>
                <TableHead className="w-28">ITBIS</TableHead>
                <TableHead className="text-right">Sub-total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineas.map((l, i) => {
                const precioNeto = incluyeItbis
                  ? l.precio / (1 + (l.tasa_itbis || 0) / 100)
                  : l.precio;
                const importe = l.cantidad * precioNeto * (1 - l.descuento_pct / 100);
                return (
                  <TableRow key={i}>
                    <TableCell>
                      <Select
                        value={l.item_id ? String(l.item_id) : ""}
                        onValueChange={(v) => seleccionarItem(i, v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar (opcional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {items
                            .filter((it) => it.activo)
                            .map((it) => (
                              <SelectItem key={it.id} value={String(it.id)}>
                                {it.codigo} — {it.descripcion}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={l.descripcion}
                        maxLength={200}
                        onChange={(e) => actualizar(i, { descripcion: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.cantidad}
                        onChange={(e) => actualizar(i, { cantidad: Number(e.target.value) || 0 })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.oferta ?? 0}
                        onChange={(e) => actualizar(i, { oferta: Number(e.target.value) || 0 })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.precio}
                        onChange={(e) => actualizar(i, { precio: Number(e.target.value) || 0 })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={l.descuento_pct}
                        onChange={(e) =>
                          actualizar(i, {
                            descuento_pct: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={String(l.tasa_itbis)}
                        onValueChange={(v) => actualizar(i, { tasa_itbis: Number(v) })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="18">18%</SelectItem>
                          <SelectItem value="16">16%</SelectItem>
                          <SelectItem value="0">0%</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="tabular text-right">{money(importe, moneda)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLineas((p) => p.filter((_, idx) => idx !== i))}
                        disabled={lineas.length === 1}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Forma de pago y observaciones</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="efec">Efectivo</Label>
              <Input
                id="efec"
                type="number"
                min={0}
                step="0.01"
                value={efectivo}
                onChange={(e) => setEfectivo(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label htmlFor="tarj">Tarjeta / Transferencia</Label>
              <Input
                id="tarj"
                type="number"
                min={0}
                step="0.01"
                value={tarjeta}
                onChange={(e) => setTarjeta(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label htmlFor="cheq">Cheque</Label>
              <Input
                id="cheq"
                type="number"
                min={0}
                step="0.01"
                value={cheque}
                onChange={(e) => setCheque(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label htmlFor="tran">Transferencia bancaria</Label>
              <Input
                id="tran"
                type="number"
                min={0}
                step="0.01"
                value={transferencia}
                onChange={(e) => setTransferencia(Number(e.target.value) || 0)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="notas">Observaciones generales</Label>
              <Textarea
                id="notas"
                value={notas}
                maxLength={300}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Referencias, condiciones, instrucciones de entrega…"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Totales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sub-total</span>
              <span className="tabular">{money(totales.subtotal, moneda)}</span>
            </div>
            {totales.descuento > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Descuentos</span>
                <span className="tabular">-{money(totales.descuento, moneda)}</span>
              </div>
            )}
            {totales.itbisPorTasa.map((t) => (
              <div key={t.tasa} className="flex justify-between">
                <span className="text-muted-foreground">
                  ITBIS {t.tasa}% sobre {money(t.base, moneda)}
                </span>
                <span className="tabular">{money(t.itbis, moneda)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="tabular">{money(totales.total, moneda)}</span>
            </div>
            {!esDOP && (
              <p className="text-xs text-muted-foreground">
                Equivale a {dop(enDOP(totales.total, tasa))} a la tasa {tasa || 0}
              </p>
            )}
            <div className="flex justify-between pt-2">
              <span className="text-muted-foreground">Cobrado</span>
              <span className="tabular">{money(cobrado, moneda)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pendiente</span>
              <span className="tabular">
                {money(Math.max(0, totales.total - cobrado), moneda)}
              </span>
            </div>
            <div className="mt-4 space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => enviar(false)}
                disabled={guardar.isPending}
              >
                <Save className="mr-2 h-4 w-4" />
                Guardar pedido
              </Button>
              <Button
                className="w-full"
                onClick={() => enviar(true)}
                disabled={guardar.isPending}
              >
                <FileText className="mr-2 h-4 w-4" />
                Guardar factura
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => enviar(true, true)}
                disabled={guardar.isPending}
              >
                <Printer className="mr-2 h-4 w-4" />
                Imprimir y guardar factura
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
