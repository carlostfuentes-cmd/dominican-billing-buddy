import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { AsientoContable } from "@/components/AsientoContable";
import { SelectorBuscable } from "@/components/SelectorBuscable";
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
import { Textarea } from "@/components/ui/textarea";
import { obtenerFacturas } from "@/lib/erp.functions";
import { obtenerMotivosDevolucion } from "@/lib/documentos.functions";
import {
  guardarNotaCredito,
  obtenerFacturaAcreditable,
  obtenerPropuestaNotaCredito,
} from "@/lib/notascredito.functions";
import {
  calcularTotales,
  fechaCorta,
  hoyISO,
  money,
  round2,
  type LineaAsiento,
} from "@/lib/erp-types";

const SIN_MOTIVO = "sin";

interface Fila {
  incluir: boolean;
  item_id: string | null;
  codigo: string;
  descripcion: string;
  cantidad: number;
  restante: number;
  precio: number;
  descuento_pct: number;
  tasa_itbis: number;
}

export const Route = createFileRoute("/notas-credito/nueva")({
  validateSearch: (search: Record<string, unknown>): { pedido?: number } => {
    const n = Number(search["pedido"]);
    return Number.isFinite(n) && n > 0 ? { pedido: n } : {};
  },
  head: () => ({
    meta: [
      { title: "Nueva nota de crédito — ERP Contable RD" },
      {
        name: "description",
        content:
          "Emite una nota de crédito fiscal sobre una factura: motivo DGII, líneas a acreditar, reposición de inventario y asiento contable.",
      },
      { property: "og:title", content: "Nueva nota de crédito — ERP Contable RD" },
      {
        property: "og:description",
        content: "Nota de crédito sobre factura con motivo DGII, NCF B04 y asiento contable.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NuevaNotaCredito,
});

function NuevaNotaCredito() {
  const { pedido } = useSearch({ from: "/notas-credito/nueva" });
  const navegar = useNavigate();
  const qc = useQueryClient();

  const [pedidoId, setPedidoId] = useState(pedido ? String(pedido) : "");
  const [fecha, setFecha] = useState(hoyISO());
  const [motivo, setMotivo] = useState(SIN_MOTIVO);
  const [reponer, setReponer] = useState(true);
  const [notas, setNotas] = useState("");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [asiento, setAsiento] = useState<LineaAsiento[]>([]);

  const { data: facturas = [] } = useQuery({
    queryKey: ["facturas", "acreditables"],
    queryFn: () => obtenerFacturas({ data: { facturadas: true } }),
  });
  const { data: motivos = [] } = useQuery({
    queryKey: ["motivos-devolucion"],
    queryFn: () => obtenerMotivosDevolucion(),
    staleTime: 300_000,
  });

  const idNum = Number(pedidoId);
  const { data: info } = useQuery({
    queryKey: ["factura-acreditable", idNum],
    queryFn: () => obtenerFacturaAcreditable({ data: { pedidoId: idNum } }),
    enabled: Number.isFinite(idNum) && idNum > 0,
  });

  // Al elegir la factura se cargan sus líneas con lo que queda por acreditar.
  useEffect(() => {
    if (!info) return;
    setFilas(
      info.lineas.map((l) => {
        const restante = round2(l.cantidad_facturada - l.cantidad_acreditada);
        return {
          incluir: restante > 0,
          item_id: l.item_id,
          codigo: l.codigo,
          descripcion: l.descripcion,
          cantidad: restante,
          restante,
          precio: l.precio,
          descuento_pct: l.descuento_pct,
          tasa_itbis: l.tasa_itbis,
        };
      }),
    );
  }, [info]);

  const lineasEntrada = filas
    .filter((f) => f.incluir && f.cantidad > 0)
    .map((f) => ({
      item_id: f.item_id,
      codigo: f.codigo,
      descripcion: f.descripcion,
      cantidad: f.cantidad,
      precio: f.precio,
      descuento_pct: f.descuento_pct,
      tasa_itbis: f.tasa_itbis,
    }));

  const { totales, lineas: calculadas } = calcularTotales(lineasEntrada);
  const moneda = info?.factura.moneda ?? "DOP";
  const excede = info ? totales.total > info.disponible + 0.01 : false;

  const lineasCuentas = calculadas.map((l) => ({
    producto_id: l.codigo,
    cantidad: l.cantidad,
    precio: l.precio,
    descuento: round2(l.cantidad * l.precio - l.subtotal),
    itbis: l.itbis,
  }));

  const { data: propuesta, isFetching: cargandoAsiento } = useQuery({
    queryKey: [
      "propuesta-nota-credito",
      info?.factura.cliente_id ?? "",
      moneda,
      reponer,
      JSON.stringify(lineasCuentas),
    ],
    queryFn: () =>
      obtenerPropuestaNotaCredito({
        data: {
          cliente_id: info?.factura.cliente_id ?? "",
          moneda,
          tasa_cambio: info?.factura.tasa_cambio ?? 1,
          reponer_inventario: reponer,
          lineas: lineasCuentas,
        },
      }),
    enabled: Boolean(info?.factura.cliente_id) && lineasCuentas.length > 0,
  });

  useEffect(() => {
    setAsiento(propuesta?.lineas ?? []);
  }, [propuesta]);

  const guardar = useMutation({
    mutationFn: () =>
      guardarNotaCredito({
        data: {
          pedido_id: idNum,
          fecha,
          ...(motivo !== SIN_MOTIVO ? { motivo_id: Number(motivo) } : {}),
          notas,
          reponer_inventario: reponer,
          ...(info?.factura.almacen_id ? { almacen_id: info.factura.almacen_id } : {}),
          lineas: lineasEntrada,
          ...(asiento.length ? { asiento } : {}),
        },
      }),
    onSuccess: (nota) => {
      toast.success(`Nota de crédito ${nota.ncf} emitida`);
      void qc.invalidateQueries({ queryKey: ["notas-credito"] });
      void qc.invalidateQueries({ queryKey: ["factura-acreditable"] });
      void qc.invalidateQueries({ queryKey: ["factura", idNum] });
      void qc.invalidateQueries({ queryKey: ["cxc"] });
      void navegar({ to: "/notas-credito/$id", params: { id: String(nota.id) } });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo emitir la nota de crédito"),
  });

  const puedeGuardar =
    Boolean(info?.factura.invoice_id) && lineasEntrada.length > 0 && !excede && !guardar.isPending;

  const cambiar = (i: number, cambios: Partial<Fila>) =>
    setFilas(filas.map((f, x) => (x === i ? { ...f, ...cambios } : f)));

  return (
    <div>
      <PageHeader
        titulo="Nueva nota de crédito"
        descripcion="Documento fiscal NCF B04 sobre una factura emitida: rebaja el balance del cliente y revierte la venta."
        acciones={
          <Button disabled={!puedeGuardar} onClick={() => guardar.mutate()}>
            <Save className="size-4" /> Emitir nota de crédito
          </Button>
        }
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Factura de origen</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Label>Factura</Label>
            <SelectorBuscable
              opciones={facturas.map((f) => ({
                valor: String(f.id),
                etiqueta: `${f.ncf || f.id} — ${f.cliente_nombre}`,
                detalle: `Pedido ${f.id} · ${fechaCorta(f.fecha)} · ${money(f.total, f.moneda)}`,
              }))}
              valor={pedidoId}
              placeholder="Busca por NCF, número o cliente"
              placeholderBusqueda="Escribe NCF, número de pedido o cliente…"
              vacio="Sin facturas que coincidan"
              onSeleccionar={setPedidoId}
            />
          </div>
          <div>
            <Label htmlFor="fecha">Fecha</Label>
            <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <Label>Motivo (DGII)</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona el motivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_MOTIVO}>Sin especificar</SelectItem>
                {motivos.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {info ? (
            <div className="grid gap-2 text-sm sm:col-span-2 lg:col-span-4">
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <span>
                  <span className="text-muted-foreground">Cliente: </span>
                  {info.factura.cliente_nombre}
                </span>
                <span>
                  <span className="text-muted-foreground">Moneda: </span>
                  {info.factura.moneda}
                  {(info.factura.moneda ?? "DOP").toUpperCase() !== "DOP"
                    ? ` · tasa ${info.factura.tasa_cambio ?? 1}`
                    : ""}
                </span>
                <span>
                  <span className="text-muted-foreground">Total facturado: </span>
                  <span className="tabular">{money(info.factura.total, moneda)}</span>
                </span>
                <span>
                  <span className="text-muted-foreground">Ya acreditado: </span>
                  <span className="tabular">{money(info.acreditado, moneda)}</span>
                </span>
                <span>
                  <span className="text-muted-foreground">Disponible: </span>
                  <span className="tabular font-semibold">{money(info.disponible, moneda)}</span>
                </span>
              </div>
              {!info.factura.invoice_id ? (
                <Badge variant="destructive" className="w-fit">
                  Este pedido aún no tiene factura emitida
                </Badge>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {info ? (
        <Card className="mb-4 overflow-hidden">
          <CardHeader>
            <CardTitle>Líneas a acreditar</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0 pb-0">
            <Table className="min-w-[820px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Incl.</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Facturada</TableHead>
                  <TableHead className="text-right">Por acreditar</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">ITBIS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((f, i) => (
                  <TableRow key={`${f.codigo}-${i}`} className={f.restante <= 0 ? "opacity-50" : ""}>
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Incluir ${f.codigo}`}
                        className="size-4 accent-primary"
                        checked={f.incluir}
                        disabled={f.restante <= 0}
                        onChange={(e) => cambiar(i, { incluir: e.target.checked })}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{f.codigo}</TableCell>
                    <TableCell>{f.descripcion}</TableCell>
                    <TableCell className="tabular text-right">
                      {round2(f.restante + (info.lineas[i]?.cantidad_acreditada ?? 0))}
                    </TableCell>
                    <TableCell className="tabular text-right">{f.restante}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        max={f.restante}
                        step="0.01"
                        className="ml-auto w-24 text-right"
                        value={f.cantidad}
                        onChange={(e) =>
                          cambiar(i, {
                            cantidad: Math.min(f.restante, Math.max(0, Number(e.target.value) || 0)),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="tabular text-right">{money(f.precio, moneda)}</TableCell>
                    <TableCell className="tabular text-right">{f.tasa_itbis}%</TableCell>
                  </TableRow>
                ))}
                {filas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      Selecciona una factura para ver sus líneas.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <div className="border-t bg-muted/35 px-5 py-4 text-right text-sm">
              <p>
                <span className="text-muted-foreground">Subtotal: </span>
                <span className="tabular">{money(totales.subtotal, moneda)}</span>
              </p>
              <p>
                <span className="text-muted-foreground">ITBIS: </span>
                <span className="tabular">{money(totales.itbis, moneda)}</span>
              </p>
              <p className="text-base font-semibold">
                Total a acreditar:{" "}
                <span className="tabular">{money(totales.total, moneda)}</span>
              </p>
              {excede ? (
                <p className="mt-1 text-sm font-medium text-destructive">
                  Excede el disponible de la factura ({money(info.disponible, moneda)}).
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {info ? (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Mercancía e información</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={reponer}
                  onChange={(e) => setReponer(e.target.checked)}
                />
                Devolver la mercancía al inventario
                {info.factura.almacen ? (
                  <span className="text-muted-foreground">({info.factura.almacen})</span>
                ) : null}
              </label>
              <div>
                <Label htmlFor="notas">Concepto / notas</Label>
                <Textarea
                  id="notas"
                  rows={4}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Motivo detallado de la nota de crédito"
                />
              </div>
            </CardContent>
          </Card>
          <AsientoContable
            lineas={asiento}
            onCambiar={setAsiento}
            advertencias={propuesta?.advertencias ?? []}
            cargando={cargandoAsiento}
            titulo="Cuentas contables de la nota de crédito"
            nota="Se toman de la clasificación del producto y del cliente. Puedes cambiarlas antes de emitir."
          />
        </div>
      ) : null}
    </div>
  );
}
