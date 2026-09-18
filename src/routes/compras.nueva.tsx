import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { SelectorBuscable } from "@/components/SelectorBuscable";
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
import { Textarea } from "@/components/ui/textarea";
import { guardarCompra, obtenerListasCompras } from "@/lib/compras.functions";
import { obtenerItems } from "@/lib/erp.functions";
import { hoyISO, money, round2 } from "@/lib/erp-types";

export const Route = createFileRoute("/compras/nueva")({
  head: () => ({
    meta: [
      { title: "Nueva orden de compra — ERP Contable RD" },
      {
        name: "description",
        content:
          "Registra una orden de compra al suplidor con productos, costos, descuentos, ITBIS, moneda y tasa de cambio.",
      },
      { property: "og:title", content: "Nueva orden de compra — ERP Contable RD" },
      {
        property: "og:description",
        content: "Orden de compra con productos, costos y condiciones del suplidor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NuevaCompraPage,
});

const SIN = "sin";

interface Fila {
  producto_id: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
  precio: number;
  descuento_pct: number;
  tasa_itbis: number;
  notas: string;
}

const filaVacia: Fila = {
  producto_id: "",
  codigo: "",
  descripcion: "",
  cantidad: 1,
  precio: 0,
  descuento_pct: 0,
  tasa_itbis: 18,
  notas: "",
};

function NuevaCompraPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [suplidorId, setSuplidorId] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [moneda, setMoneda] = useState("DOP");
  const [tasa, setTasa] = useState(1);
  const [almacenId, setAlmacenId] = useState("");
  const [sucursalId, setSucursalId] = useState("");
  const [departamentoId, setDepartamentoId] = useState(SIN);
  const [formaPagoId, setFormaPagoId] = useState(SIN);
  const [diasCredito, setDiasCredito] = useState(0);
  const [destino, setDestino] = useState("");
  const [lugar, setLugar] = useState("");
  const [uso, setUso] = useState("");
  const [cotizacion, setCotizacion] = useState("");
  const [notas, setNotas] = useState("");
  const [filas, setFilas] = useState<Fila[]>([{ ...filaVacia }]);

  const { data: listas } = useQuery({
    queryKey: ["listas-compras"],
    queryFn: () => obtenerListasCompras(),
    staleTime: 300_000,
  });
  const { data: productos = [] } = useQuery({
    queryKey: ["items", ""],
    queryFn: () => obtenerItems({ data: { busqueda: "" } }),
    staleTime: 300_000,
  });

  const totalFila = (f: Fila) => {
    const bruto = round2(f.cantidad * f.precio);
    const subtotal = round2(bruto - (bruto * f.descuento_pct) / 100);
    const itbis = round2((subtotal * f.tasa_itbis) / 100);
    return { subtotal, itbis, total: round2(subtotal + itbis) };
  };
  const totales = filas.reduce(
    (a, f) => {
      const t = totalFila(f);
      return {
        subtotal: round2(a.subtotal + t.subtotal),
        itbis: round2(a.itbis + t.itbis),
        total: round2(a.total + t.total),
      };
    },
    { subtotal: 0, itbis: 0, total: 0 },
  );

  const cambiar = (i: number, cambios: Partial<Fila>) =>
    setFilas(filas.map((f, idx) => (idx === i ? { ...f, ...cambios } : f)));

  const elegirProducto = (i: number, id: string) => {
    const p = productos.find((x) => String(x.id) === id);
    cambiar(i, {
      producto_id: id,
      codigo: p?.codigo ?? id,
      descripcion: p?.descripcion ?? "",
      precio: p?.costo && p.costo > 0 ? p.costo : 0,
      tasa_itbis: p?.tasa_itbis ?? 18,
    });
  };

  const guardar = useMutation({
    mutationFn: () =>
      guardarCompra({
        data: {
          suplidor_id: suplidorId,
          fecha,
          moneda,
          tasa_cambio: tasa,
          almacen_id: almacenId,
          sucursal_id: sucursalId,
          departamento_id: departamentoId === SIN ? "" : departamentoId,
          forma_pago_id: formaPagoId === SIN ? "" : formaPagoId,
          dias_credito: diasCredito,
          descuento_pct: 0,
          destino,
          lugar,
          uso,
          cotizacion,
          notas,
          estado: "A",
          lineas: filas
            .filter((f) => f.producto_id && f.cantidad > 0)
            .map((f) => ({
              producto_id: f.producto_id,
              descripcion: f.descripcion,
              cantidad: f.cantidad,
              precio: f.precio,
              descuento_pct: f.descuento_pct,
              tasa_itbis: f.tasa_itbis,
              notas: f.notas,
            })),
        },
      }),
    onSuccess: async (orden) => {
      await qc.invalidateQueries({ queryKey: ["compras"] });
      toast.success(`Orden de compra ${orden.id} guardada`);
      void navigate({ to: "/compras/$id", params: { id: String(orden.id) } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        titulo="Nueva orden de compra"
        descripcion="Agrega los productos que vas a comprar; la recepción se registra después."
        acciones={
          <Button onClick={() => guardar.mutate()} disabled={guardar.isPending || !suplidorId}>
            <Save className="size-4" /> Guardar orden
          </Button>
        }
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Datos de la orden</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Label>Suplidor</Label>
            <SelectorBuscable
              opciones={(listas?.suplidores ?? []).map((s) => ({
                valor: s.id,
                etiqueta: `${s.id} — ${s.nombre}`,
              }))}
              valor={suplidorId}
              placeholder="Selecciona el suplidor"
              placeholderBusqueda="Escribe código o nombre…"
              vacio="Sin suplidores que coincidan"
              onSeleccionar={setSuplidorId}
            />
          </div>
          <div>
            <Label htmlFor="fecha">Fecha</Label>
            <Input
              id="fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div>
            <Label>Moneda</Label>
            <Select value={moneda} onValueChange={setMoneda}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(listas?.monedas ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.id} — {m.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="tasa">Tasa de cambio</Label>
            <Input
              id="tasa"
              type="number"
              step="0.0001"
              min="0"
              value={tasa}
              onChange={(e) => setTasa(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Almacén de destino</Label>
            <Select value={almacenId} onValueChange={setAlmacenId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona" />
              </SelectTrigger>
              <SelectContent>
                {(listas?.almacenes ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sucursal</Label>
            <Select value={sucursalId} onValueChange={setSucursalId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona" />
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
            <Label htmlFor="dias">Días de crédito</Label>
            <Input
              id="dias"
              type="number"
              min="0"
              value={diasCredito}
              onChange={(e) => setDiasCredito(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Forma de pago</Label>
            <Select value={formaPagoId} onValueChange={setFormaPagoId}>
              <SelectTrigger>
                <SelectValue placeholder="Sin especificar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN}>Sin especificar</SelectItem>
                {(listas?.formas ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Centro de costo</Label>
            <Select value={departamentoId} onValueChange={setDepartamentoId}>
              <SelectTrigger>
                <SelectValue placeholder="Sin centro de costo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN}>Sin centro de costo</SelectItem>
                {(listas?.departamentos ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="cotiza">Cotización del suplidor</Label>
            <Input
              id="cotiza"
              value={cotizacion}
              maxLength={20}
              onChange={(e) => setCotizacion(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="destino">Destino</Label>
            <Input
              id="destino"
              value={destino}
              maxLength={100}
              onChange={(e) => setDestino(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="lugar">Lugar de entrega</Label>
            <Input
              id="lugar"
              value={lugar}
              maxLength={100}
              onChange={(e) => setLugar(e.target.value)}
            />
          </div>
          <div className="lg:col-span-2">
            <Label htmlFor="uso">Uso que se le dará</Label>
            <Input id="uso" value={uso} maxLength={200} onChange={(e) => setUso(e.target.value)} />
          </div>
          <div className="lg:col-span-4">
            <Label htmlFor="notas">Observaciones</Label>
            <Textarea
              id="notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Productos</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setFilas([...filas, { ...filaVacia }])}>
            <Plus className="size-4" /> Agregar línea
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[260px]">Producto</TableHead>
                  <TableHead className="w-24">Cantidad</TableHead>
                  <TableHead className="w-32">Costo</TableHead>
                  <TableHead className="w-24">Desc. %</TableHead>
                  <TableHead className="w-24">ITBIS %</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((f, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <SelectorBuscable
                        opciones={productos.map((p) => ({
                          valor: String(p.id),
                          etiqueta: `${p.codigo} — ${p.descripcion}`,
                        }))}
                        valor={f.producto_id}
                        placeholder="Selecciona el producto"
                        placeholderBusqueda="Escribe código o descripción…"
                        vacio="Sin productos que coincidan"
                        onSeleccionar={(v) => elegirProducto(i, v)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={f.cantidad}
                        onChange={(e) => cambiar(i, { cantidad: Number(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={f.precio}
                        onChange={(e) => cambiar(i, { precio: Number(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={f.descuento_pct}
                        onChange={(e) => cambiar(i, { descuento_pct: Number(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={String(f.tasa_itbis)}
                        onValueChange={(v) => cambiar(i, { tasa_itbis: Number(v) })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">0</SelectItem>
                          <SelectItem value="16">16</SelectItem>
                          <SelectItem value="18">18</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(totalFila(f).total, moneda)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Quitar línea"
                        onClick={() => setFilas(filas.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap justify-end gap-6 border-t pt-3 text-sm tabular-nums">
            <span className="text-muted-foreground">
              Subtotal <strong className="text-foreground">{money(totales.subtotal, moneda)}</strong>
            </span>
            <span className="text-muted-foreground">
              ITBIS <strong className="text-foreground">{money(totales.itbis, moneda)}</strong>
            </span>
            <span className="text-muted-foreground">
              Total <strong className="text-foreground">{money(totales.total, moneda)}</strong>
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
