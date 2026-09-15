import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Plus, Save, Trash2 } from "lucide-react";
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
  guardarDocumento,
  lineasDesdePedido,
  obtenerMotivosDevolucion,
} from "@/lib/documentos.functions";
import { obtenerClientes, obtenerItems, obtenerListasFactura } from "@/lib/erp.functions";
import {
  calcularTotales,
  DOCUMENTOS,
  dop,
  enDOP,
  hoyISO,
  money,
  type LineaEntrada,
  type OpcionId,
  type TipoDocumento,
} from "@/lib/erp-types";

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

const lista = (v: OpcionId[] | undefined): OpcionId[] => v ?? [];

export function DocumentoForm({ tipo }: { tipo: TipoDocumento }) {
  const cfg = DOCUMENTOS[tipo];
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [clienteId, setClienteId] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [fechaEntrega, setFechaEntrega] = useState(hoyISO());
  const [dias, setDias] = useState(0);
  const [moneda, setMoneda] = useState("DOP");
  const [tasa, setTasa] = useState(1);
  const [incluyeItbis, setIncluyeItbis] = useState(false);
  const [contacto, setContacto] = useState("");
  const [vendedor, setVendedor] = useState(SIN);
  const [tecnico, setTecnico] = useState(SIN);
  const [almacen, setAlmacen] = useState(SIN);
  const [sucursal, setSucursal] = useState(SIN);
  const [departamento, setDepartamento] = useState(SIN);
  const [proyecto, setProyecto] = useState(SIN);
  const [ordenCliente, setOrdenCliente] = useState("");
  const [referencia, setReferencia] = useState("");
  const [motivo, setMotivo] = useState(SIN);
  const [notas, setNotas] = useState("");
  const [lineas, setLineas] = useState<LineaEntrada[]>([{ ...lineaVacia }]);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes", ""],
    queryFn: () => obtenerClientes({ data: { busqueda: "" } }),
  });
  const { data: items = [] } = useQuery({
    queryKey: ["items", ""],
    queryFn: () => obtenerItems({ data: { busqueda: "" } }),
  });
  const { data: listas } = useQuery({
    queryKey: ["listas-factura"],
    queryFn: () => obtenerListasFactura(),
  });
  const { data: motivos = [] } = useQuery({
    queryKey: ["motivos-devolucion"],
    queryFn: () => obtenerMotivosDevolucion(),
    enabled: tipo === "devolucion",
  });

  const cliente = clientes.find((c) => String(c.id) === clienteId);
  const esDOP = moneda.toUpperCase() === "DOP";
  const lineasCalculo = useMemo(
    () => lineas.map((l) => ({ ...l, precio_incluye_itbis: incluyeItbis })),
    [lineas, incluyeItbis],
  );
  const { totales } = useMemo(() => calcularTotales(lineasCalculo), [lineasCalculo]);

  const traer = useMutation({
    mutationFn: (id: number) => lineasDesdePedido({ data: { id } }),
    onSuccess: (l) => {
      if (!l.length) {
        toast.error("No se encontraron líneas en ese documento");
        return;
      }
      setLineas(
        l.map((x) => ({
          item_id: x.item_id,
          codigo: x.codigo,
          descripcion: x.descripcion,
          cantidad: x.cantidad,
          oferta: x.oferta ?? 0,
          precio: x.precio,
          descuento_pct: x.descuento_pct,
          tasa_itbis: x.tasa_itbis,
        })),
      );
      setIncluyeItbis(false);
      toast.success(`${l.length} líneas copiadas`);
    },
    onError: (e: Error) => toast.error(e.message || "No se pudieron traer las líneas"),
  });

  const guardar = useMutation({
    mutationFn: () =>
      guardarDocumento({
        data: {
          tipo,
          cliente_id: clienteId,
          fecha,
          ...(tipo === "conduce" ? { fecha_entrega: fechaEntrega } : {}),
          dias_credito: dias,
          notas,
          contacto,
          moneda,
          tasa_cambio: tasa,
          ...(vendedor !== SIN ? { vendedor_id: vendedor } : {}),
          ...(tecnico !== SIN ? { tecnico_id: tecnico } : {}),
          ...(almacen !== SIN ? { almacen_id: almacen } : {}),
          ...(sucursal !== SIN ? { sucursal_id: sucursal } : {}),
          ...(departamento !== SIN ? { departamento_id: departamento } : {}),
          ...(proyecto !== SIN ? { proyecto_id: proyecto } : {}),
          orden_cliente: ordenCliente,
          ...(tipo === "conduce" && referencia ? { pedido_id: Number(referencia) } : {}),
          ...(tipo === "devolucion" && referencia ? { factura_id: Number(referencia) } : {}),
          ...(tipo === "devolucion" && motivo !== SIN ? { motivo_id: Number(motivo) } : {}),
          lineas: lineasCalculo.map((l) => ({ ...l, item_id: l.item_id ?? null })),
        },
      }),
    onSuccess: (doc) => {
      toast.success(`${cfg.singular} ${doc.id} guardada`);
      void qc.invalidateQueries({ queryKey: ["documentos"] });
      void qc.invalidateQueries({ queryKey: ["secuencias"] });
      void navigate({ to: cfg.rutaDetalle, params: { id: String(doc.id) } });
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

  const enviar = (): void => {
    if (!clienteId) {
      toast.error("Selecciona un cliente");
      return;
    }
    if (!esDOP && (!tasa || tasa <= 0)) {
      toast.error("Indica la tasa de cambio a aplicar");
      return;
    }
    if (tipo === "devolucion" && !referencia) {
      toast.error("Indica el número de factura que se devuelve");
      return;
    }
    for (const l of lineas) {
      if (!l.descripcion.trim()) {
        toast.error("Cada línea necesita una descripción");
        return;
      }
      if (l.cantidad <= 0) {
        toast.error("La cantidad debe ser mayor que cero");
        return;
      }
    }
    guardar.mutate();
  };

  return (
    <div>
      <PageHeader
        titulo={cfg.nuevo}
        descripcion={cfg.descripcion}
        acciones={
          <Button onClick={enviar} disabled={guardar.isPending}>
            <Save className="size-4" /> Guardar {cfg.singular.toLowerCase()}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cliente</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div>
              <Label>Cliente</Label>
              <SelectorBuscable
                opciones={opcionesClientes}
                valor={clienteId}
                placeholder="Seleccionar cliente"
                placeholderBusqueda="Escribe código, nombre o RNC…"
                vacio="Sin clientes que coincidan"
                onSeleccionar={(v) => {
                  setClienteId(v);
                  const c = clientes.find((x) => String(x.id) === v);
                  if (c) setDias(c.dias_credito);
                }}
              />
            </div>
            <div>
              <Label>RNC / Cédula</Label>
              <Input value={cliente?.rnc ?? ""} readOnly />
            </div>
            <div>
              <Label>Dirección</Label>
              <Input value={cliente?.direccion ?? ""} readOnly />
            </div>
            <div>
              <Label htmlFor="contacto">Contacto</Label>
              <Input
                id="contacto"
                value={contacto}
                maxLength={200}
                onChange={(e) => setContacto(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos del documento</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="fecha">Fecha</Label>
              <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            {tipo === "conduce" ? (
              <div>
                <Label htmlFor="entrega">Fecha de entrega</Label>
                <Input
                  id="entrega"
                  type="date"
                  value={fechaEntrega}
                  onChange={(e) => setFechaEntrega(e.target.value)}
                />
              </div>
            ) : (
              <div>
                <Label htmlFor="dias">Días de crédito</Label>
                <Input
                  id="dias"
                  type="number"
                  min={0}
                  value={dias}
                  onChange={(e) => setDias(Number(e.target.value) || 0)}
                />
              </div>
            )}
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
                  {(listas?.monedas ?? [{ id: "DOP", nombre: "Peso dominicano", simbolo: "RD$" }]).map(
                    (m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.id} — {m.nombre}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="tasa">Tasa de cambio</Label>
              <Input
                id="tasa"
                type="number"
                step="0.0001"
                min={0}
                value={tasa}
                readOnly={esDOP}
                onChange={(e) => setTasa(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label>Vendedor</Label>
              <Select value={vendedor} onValueChange={setVendedor}>
                <SelectTrigger>
                  <SelectValue placeholder="Predeterminado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN}>Predeterminado</SelectItem>
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
            <div className="flex items-end gap-2 pb-2 sm:col-span-2">
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
            {tipo !== "cotizacion" && (
              <div>
                <Label htmlFor="ref">
                  {tipo === "devolucion" ? "Factura / pedido a devolver" : "Pedido a entregar"}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="ref"
                    value={referencia}
                    maxLength={10}
                    onChange={(e) => setReferencia(e.target.value.replace(/\D/g, ""))}
                  />
                  <Button
                    variant="outline"
                    disabled={!referencia || traer.isPending}
                    onClick={() => traer.mutate(Number(referencia))}
                  >
                    <Download className="size-4" /> Traer líneas
                  </Button>
                </div>
              </div>
            )}
            {tipo === "devolucion" && (
              <div>
                <Label>Motivo de la devolución</Label>
                <Select value={motivo} onValueChange={setMotivo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar motivo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN}>Sin especificar</SelectItem>
                    {motivos.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label htmlFor="oc">Orden del cliente</Label>
              <Input
                id="oc"
                value={ordenCliente}
                maxLength={10}
                onChange={(e) => setOrdenCliente(e.target.value)}
              />
            </div>
            {tipo !== "cotizacion" && (
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
            )}
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
            {tipo === "cotizacion" && (
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
            )}
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
          <Table className="min-w-[1080px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-52 min-w-52">Código / ítem</TableHead>
                <TableHead className="w-52 min-w-52">Producto</TableHead>
                <TableHead className="w-24 min-w-24">Cant.</TableHead>
                {tipo !== "conduce" && <TableHead className="w-24 min-w-24">Oferta</TableHead>}
                <TableHead className="w-32 min-w-32">Precio</TableHead>
                <TableHead className="w-24 min-w-24">Desc. %</TableHead>
                <TableHead className="w-28 min-w-28">ITBIS</TableHead>
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
                      <SelectorBuscable
                        opciones={opcionesItems}
                        valor={l.item_id ? String(l.item_id) : ""}
                        placeholder="Buscar producto"
                        placeholderBusqueda="Escribe código o nombre…"
                        vacio="Sin productos que coincidan"
                        onSeleccionar={(v) => seleccionarItem(i, v)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={l.descripcion}
                        onChange={(e) => actualizar(i, { descripcion: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="0.001"
                        value={l.cantidad}
                        onChange={(e) => actualizar(i, { cantidad: Number(e.target.value) || 0 })}
                      />
                    </TableCell>
                    {tipo !== "conduce" && (
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={l.oferta ?? 0}
                          onChange={(e) => actualizar(i, { oferta: Number(e.target.value) || 0 })}
                        />
                      </TableCell>
                    )}
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
                          actualizar(i, { descuento_pct: Number(e.target.value) || 0 })
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
                          <SelectItem value="0">Exento</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="tabular text-right">{money(importe, moneda)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setLineas((p) => p.filter((_, idx) => idx !== i))}
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
            <CardTitle className="text-base">Observaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notas}
              maxLength={500}
              rows={5}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Detalle u observaciones del documento"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Totales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sub-total</span>
              <span className="tabular">{money(totales.subtotal, moneda)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Descuentos</span>
              <span className="tabular">{money(totales.descuento, moneda)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">ITBIS</span>
              <span className="tabular">{money(totales.itbis, moneda)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="tabular">{money(totales.total, moneda)}</span>
            </div>
            {!esDOP && (
              <p className="pt-1 text-xs text-muted-foreground">
                Equivalente: {dop(enDOP(totales.total, tasa))} (tasa {tasa})
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
