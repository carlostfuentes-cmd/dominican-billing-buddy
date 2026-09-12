import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
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
  emitirFactura,
  obtenerClientes,
  obtenerItems,
  obtenerSecuencias,
} from "@/lib/erp.functions";
import {
  calcularTotales,
  dop,
  formatearNCF,
  hoyISO,
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
        content: "Emite una factura con NCF automático, cálculo de ITBIS y condición de pago.",
      },
      { property: "og:title", content: "Nueva factura — ERP Contable RD" },
      { property: "og:description", content: "Emisión de factura con NCF e ITBIS automáticos." },
    ],
  }),
  component: NuevaFactura,
});

const lineaVacia: LineaEntrada = {
  item_id: null,
  codigo: "",
  descripcion: "",
  cantidad: 1,
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

  const secuencia = secuencias.find((s) => s.tipo_ncf === tipo);
  const { totales } = useMemo(() => calcularTotales(lineas), [lineas]);

  const emitir = useMutation({
    mutationFn: () =>
      emitirFactura({
        data: {
          cliente_id: Number(clienteId),
          tipo_ncf: tipo,
          fecha,
          dias_credito: dias,
          notas,
          lineas: lineas.map((l) => ({ ...l, item_id: l.item_id ?? null })),
        },
      }),
    onSuccess: (factura) => {
      toast.success(`Factura ${factura.ncf} emitida`);
      void qc.invalidateQueries({ queryKey: ["facturas"] });
      void qc.invalidateQueries({ queryKey: ["secuencias"] });
      void qc.invalidateQueries({ queryKey: ["resumen"] });
      void navigate({ to: "/facturas/$id", params: { id: String(factura.id) } });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo emitir la factura"),
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

  const enviar = () => {
    if (!clienteId) return toast.error("Selecciona un cliente");
    if (!lineas.length) return toast.error("Agrega al menos una línea");
    for (const l of lineas) {
      if (!l.descripcion.trim()) return toast.error("Cada línea necesita una descripción");
      if (l.cantidad <= 0) return toast.error("La cantidad debe ser mayor que cero");
    }
    if (!secuencia || !secuencia.activa || secuencia.proximo > secuencia.hasta)
      return toast.error(`No hay NCF ${tipo} disponible. Revisa las secuencias.`);
    emitir.mutate();
  };

  return (
    <div>
      <PageHeader titulo="Nueva factura" descripcion="El NCF se asigna automáticamente al emitir" />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Datos del comprobante</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Cliente</Label>
              <Select
                value={clienteId}
                onValueChange={(v) => {
                  setClienteId(v);
                  const c = clientes.find((x) => String(x.id) === v);
                  if (c) {
                    setTipo(c.tipo_ncf);
                    setDias(c.dias_credito);
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
                        {c.nombre} — {c.rnc}
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
            <div>
              <Label htmlFor="fecha">Fecha de emisión</Label>
              <Input
                id="fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="dias">Días de crédito</Label>
              <Input
                id="dias"
                type="number"
                min={0}
                max={365}
                value={dias}
                onChange={(e) => setDias(Math.max(0, Number(e.target.value) || 0))}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Vence el {sumarDias(fecha, dias)}
              </p>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="notas">Notas</Label>
              <Textarea
                id="notas"
                value={notas}
                maxLength={300}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Orden de compra, referencia, condiciones…"
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
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular">{dop(totales.subtotal)}</span>
            </div>
            {totales.descuento > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Descuentos</span>
                <span className="tabular">-{dop(totales.descuento)}</span>
              </div>
            )}
            {totales.itbisPorTasa.map((t) => (
              <div key={t.tasa} className="flex justify-between">
                <span className="text-muted-foreground">
                  ITBIS {t.tasa}% sobre {dop(t.base)}
                </span>
                <span className="tabular">{dop(t.itbis)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="tabular">{dop(totales.total)}</span>
            </div>
            <Button className="mt-4 w-full" onClick={enviar} disabled={emitir.isPending}>
              {emitir.isPending ? "Emitiendo…" : "Emitir factura"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Detalle</CardTitle>
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
                <TableHead className="min-w-52">Ítem</TableHead>
                <TableHead className="min-w-52">Descripción</TableHead>
                <TableHead className="w-24">Cant.</TableHead>
                <TableHead className="w-32">Precio</TableHead>
                <TableHead className="w-24">Desc. %</TableHead>
                <TableHead className="w-28">ITBIS</TableHead>
                <TableHead className="text-right">Importe</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineas.map((l, i) => {
                const importe = l.cantidad * l.precio * (1 - l.descuento_pct / 100);
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
                    <TableCell className="tabular text-right">{dop(importe)}</TableCell>
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
    </div>
  );
}
