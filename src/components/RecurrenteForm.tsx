import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { SelectorBuscable } from "@/components/SelectorBuscable";
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
import { obtenerClientes, obtenerItems, obtenerListasFactura } from "@/lib/erp.functions";
import { guardarRecurrente } from "@/lib/recurrentes.functions";
import {
  calcularTotales,
  FRECUENCIAS,
  hoyISO,
  money,
  type FrecuenciaRecurrente,
  type LineaRecurrente,
  type PlantillaRecurrente,
} from "@/lib/erp-types";

type Fin = "sin" | "repeticiones" | "fecha";

const lineaVacia = (): LineaRecurrente => ({
  item_id: "",
  codigo: "",
  descripcion: "",
  detalle: "",
  cantidad: 1,
  precio: 0,
  descuento_pct: 0,
  tasa_itbis: 18,
});

export function RecurrenteForm({ plantilla }: { plantilla?: PlantillaRecurrente | undefined }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [activa, setActiva] = useState(plantilla?.activa ?? true);
  const [nombre, setNombre] = useState(plantilla?.nombre ?? "");
  const [clienteId, setClienteId] = useState(plantilla?.cliente_id ?? "");
  const [moneda, setMoneda] = useState(plantilla?.moneda ?? "DOP");
  const [cada, setCada] = useState(String(plantilla?.cada ?? 1));
  const [frecuencia, setFrecuencia] = useState<FrecuenciaRecurrente>(plantilla?.frecuencia ?? "M");
  const [inicio, setInicio] = useState(plantilla?.inicio ?? hoyISO());
  const [fin, setFin] = useState(plantilla?.fin ?? "");
  const [repeticiones, setRepeticiones] = useState(String(plantilla?.repeticiones ?? 0));
  const [tipoFin, setTipoFin] = useState<Fin>(
    plantilla ? (plantilla.sin_fin ? "sin" : plantilla.fin ? "fecha" : "repeticiones") : "sin",
  );
  const [notificar, setNotificar] = useState(plantilla?.notificar ?? "");
  const [notas, setNotas] = useState(plantilla?.notas ?? "");
  const [lineas, setLineas] = useState<LineaRecurrente[]>(
    plantilla?.lineas.length ? plantilla.lineas : [lineaVacia()],
  );

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

  const cliente = clientes.find((c) => c.id === clienteId);
  const { totales } = useMemo(() => calcularTotales(lineas), [lineas]);

  const cambiar = (i: number, cambios: Partial<LineaRecurrente>) =>
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...cambios } : l)));

  const elegirItem = (i: number, itemId: string) => {
    const it = items.find((x) => x.id === itemId);
    if (!it) return;
    cambiar(i, {
      item_id: it.id,
      codigo: it.codigo,
      descripcion: it.descripcion,
      precio: it.precio,
      tasa_itbis: it.tasa_itbis,
    });
  };

  const guardar = useMutation({
    mutationFn: () =>
      guardarRecurrente({
        data: {
          ...(plantilla ? { id: plantilla.id } : {}),
          activa,
          nombre: nombre.trim(),
          cliente_id: clienteId,
          moneda,
          cada: Number(cada) || 1,
          frecuencia,
          inicio,
          ...(tipoFin === "fecha" && fin ? { fin } : {}),
          sin_fin: tipoFin === "sin",
          repeticiones: tipoFin === "repeticiones" ? Number(repeticiones) || 0 : 0,
          notificar: notificar.trim(),
          notas: notas.trim(),
          lineas: lineas.filter((l) => l.item_id),
        },
      }),
    onSuccess: async (p) => {
      await qc.invalidateQueries({ queryKey: ["recurrentes"] });
      toast.success("Facturación recurrente guardada");
      await navigate({ to: "/recurrentes/$id", params: { id: String(p.id) } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        titulo={plantilla ? `Facturación recurrente ${plantilla.id}` : "Nueva facturación recurrente"}
        descripcion="Plantilla que se factura periódicamente al mismo cliente."
        acciones={
          <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>
            <Save className="size-4" /> Guardar
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cliente y concepto</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Cliente</Label>
              <SelectorBuscable
                opciones={clientes.map((c) => ({
                  valor: c.id,
                  etiqueta: `${c.id} — ${c.nombre}`,
                  detalle: c.rnc ?? "",
                }))}
                valor={clienteId}
                placeholder="Selecciona el cliente"
                placeholderBusqueda="Escribe código, nombre o RNC…"
                vacio="Sin clientes que coincidan"
                onSeleccionar={setClienteId}
              />
              {cliente && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Condición: {cliente.dias_credito === 0 ? "Contado" : `${cliente.dias_credito} días`}{" "}
                  · Comprobante {cliente.tipo_ncf}
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="nombre">Concepto / nombre de la plantilla</Label>
              <Input
                id="nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej.: Mantenimiento mensual de equipos"
              />
            </div>
            <div>
              <Label>Moneda</Label>
              <Select value={moneda} onValueChange={setMoneda}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(listas?.monedas ?? [{ id: "DOP", nombre: "PESOS DOMINICANOS", simbolo: "RD$" }]).map(
                    (m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.id} — {m.nombre}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Checkbox
                id="activa"
                checked={activa}
                onCheckedChange={(v) => setActiva(Boolean(v))}
              />
              <Label htmlFor="activa" className="mb-0">
                Plantilla activa
              </Label>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="mailto">Notificar a (correos separados por coma)</Label>
              <Input id="mailto" value={notificar} onChange={(e) => setNotificar(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="notas">Observaciones</Label>
              <Textarea id="notas" value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Frecuencia</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cada">Cada</Label>
                <Input
                  id="cada"
                  type="number"
                  min={1}
                  value={cada}
                  onChange={(e) => setCada(e.target.value)}
                />
              </div>
              <div>
                <Label>Período</Label>
                <Select
                  value={frecuencia}
                  onValueChange={(v) => setFrecuencia(v as FrecuenciaRecurrente)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FRECUENCIAS.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="inicio">Comenzando el</Label>
              <Input
                id="inicio"
                type="date"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
              />
            </div>
            <div>
              <Label>Finalización</Label>
              <Select value={tipoFin} onValueChange={(v) => setTipoFin(v as Fin)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sin">Sin fecha de finalización</SelectItem>
                  <SelectItem value="repeticiones">Finalizar después de X repeticiones</SelectItem>
                  <SelectItem value="fecha">Finalizar el</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {tipoFin === "repeticiones" && (
              <div>
                <Label htmlFor="rep">Repeticiones</Label>
                <Input
                  id="rep"
                  type="number"
                  min={1}
                  value={repeticiones}
                  onChange={(e) => setRepeticiones(e.target.value)}
                />
              </div>
            )}
            {tipoFin === "fecha" && (
              <div>
                <Label htmlFor="fin">Finalizar el</Label>
                <Input id="fin" type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
              </div>
            )}
            {plantilla && (
              <p className="text-xs text-muted-foreground">
                Emisiones realizadas: {plantilla.emitidas}
                {plantilla.proxima ? ` · Próxima: ${plantilla.proxima}` : " · Vigencia completada"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
          <CardTitle className="text-base">Servicios a facturar</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setLineas((p) => [...p, lineaVacia()])}>
            <Plus className="size-4" /> Agregar línea
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[280px]">Producto / servicio</TableHead>
                <TableHead className="w-[110px] text-right">Cantidad</TableHead>
                <TableHead className="w-[130px] text-right">Precio</TableHead>
                <TableHead className="w-[100px] text-right">Dcto. %</TableHead>
                <TableHead>Detalle</TableHead>
                <TableHead className="w-[130px] text-right">Sub-total</TableHead>
                <TableHead className="w-[48px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineas.map((l, i) => {
                const sub =
                  l.cantidad * l.precio * (1 - (l.descuento_pct || 0) / 100);
                return (
                  <TableRow key={i}>
                    <TableCell>
                      <SelectorBuscable
                        opciones={items.map((it) => ({
                          valor: it.id,
                          etiqueta: `${it.codigo} — ${it.descripcion}`,
                          detalle: String(it.precio),
                        }))}
                        valor={l.item_id}
                        placeholder="Selecciona el producto"
                        placeholderBusqueda="Escribe código o descripción…"
                        vacio="Sin productos que coincidan"
                        onSeleccionar={(v) => elegirItem(i, v)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="text-right"
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.cantidad}
                        onChange={(e) => cambiar(i, { cantidad: Number(e.target.value) || 0 })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="text-right"
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.precio}
                        onChange={(e) => cambiar(i, { precio: Number(e.target.value) || 0 })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="text-right"
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={l.descuento_pct}
                        onChange={(e) => cambiar(i, { descuento_pct: Number(e.target.value) || 0 })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={l.detalle}
                        placeholder="Texto del período, admite <INICIO_MES> y <FIN_MES>"
                        onChange={(e) => cambiar(i, { detalle: e.target.value })}
                      />
                    </TableCell>
                    <TableCell className="tabular text-right">{money(sub, moneda)}</TableCell>
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
          <div className="border-t bg-muted/35 px-5 py-4 text-right text-sm">
            <p className="text-muted-foreground">
              Sub-total <span className="tabular ml-2 text-foreground">{money(totales.subtotal, moneda)}</span>
            </p>
            <p className="text-muted-foreground">
              ITBIS <span className="tabular ml-2 text-foreground">{money(totales.itbis, moneda)}</span>
            </p>
            <p className="mt-1 font-display text-lg font-semibold">
              Total {money(totales.total, moneda)}
            </p>
          </div>
        </CardContent>
      </Card>

      <p className="mt-3 text-xs text-muted-foreground">
        Las condiciones de pago, el vendedor y la secuencia de comprobante se toman del cliente al
        momento de emitir. En el detalle puedes usar <code>&lt;INICIO_MES&gt;</code> y{" "}
        <code>&lt;FIN_MES&gt;</code>: se reemplazan por las fechas del mes facturado.
      </p>
    </div>
  );
}
