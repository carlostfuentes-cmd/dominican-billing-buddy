import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Calculator, Save } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { AsientoContable } from "@/components/AsientoContable";
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
  obtenerAsientoRecepcion,
  obtenerCompra,
  obtenerListasCompras,
  registrarRecepcion,
} from "@/lib/compras.functions";
import {
  hoyISO,
  money,
  round2,
  sumarDias,
  totalFacturaSuplidor,
  type DatosFacturaSuplidor,
  type LineaAsiento,
} from "@/lib/erp-types";

export const Route = createFileRoute("/compras/$id/recepcion")({
  head: () => ({
    meta: [
      { title: "Recepción de mercancías — ERP Contable RD" },
      {
        name: "description",
        content:
          "Recibe la mercancía de la orden de compra en almacén o en contabilidad, afectando inventario y la factura del suplidor.",
      },
      { property: "og:title", content: "Recepción de mercancías — ERP Contable RD" },
      {
        property: "og:description",
        content: "Recepción parcial o total con asiento de inventario y factura del suplidor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecepcionPage,
});

const SIN = "sin";

interface FilaRecibir {
  linea_id: number;
  producto_id: string;
  codigo: string;
  descripcion: string;
  solicitado: number;
  recibido: number;
  pendiente: number;
  recibir: number;
  precio: number;
}

function RecepcionPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: orden } = useQuery({
    queryKey: ["compra", id],
    queryFn: () => obtenerCompra({ data: { id: Number(id) } }),
  });
  const { data: listas } = useQuery({
    queryKey: ["listas-compras"],
    queryFn: () => obtenerListasCompras(),
    staleTime: 300_000,
  });

  const [modalidad, setModalidad] = useState<"almacen" | "contabilidad">("contabilidad");
  const [fecha, setFecha] = useState(hoyISO());
  const [almacenId, setAlmacenId] = useState("");
  const [notas, setNotas] = useState("");
  const [filas, setFilas] = useState<FilaRecibir[]>([]);
  const [asiento, setAsiento] = useState<LineaAsiento[]>([]);
  const [advertencias, setAdvertencias] = useState<string[]>([]);

  // Datos de la factura del suplidor.
  const [numero, setNumero] = useState("");
  const [ncf, setNcf] = useState("");
  const [fechaFactura, setFechaFactura] = useState(hoyISO());
  const [comprobanteId, setComprobanteId] = useState(SIN);
  const [gastoId, setGastoId] = useState(SIN);
  const [formaPagoId, setFormaPagoId] = useState(SIN);
  const [isrId, setIsrId] = useState(SIN);
  const [servicios, setServicios] = useState(0);
  const [propina, setPropina] = useState(0);
  const [isc, setIsc] = useState(0);
  const [otros, setOtros] = useState(0);
  const [itbisRetenido, setItbisRetenido] = useState(0);
  const [isrRetenido, setIsrRetenido] = useState(0);
  const [itbisCosto, setItbisCosto] = useState(0);
  const [conduce, setConduce] = useState(false);

  useEffect(() => {
    if (!orden) return;
    setAlmacenId((a) => a || orden.almacen_id);
    setFilas(
      orden.lineas.map((l) => {
        const pendiente = round2(l.cantidad - l.recibida);
        return {
          linea_id: l.id ?? 0,
          producto_id: l.producto_id,
          codigo: l.codigo,
          descripcion: l.descripcion,
          solicitado: l.cantidad,
          recibido: l.recibida,
          pendiente,
          recibir: pendiente > 0 ? pendiente : 0,
          precio: l.precio,
        };
      }),
    );
  }, [orden]);

  const moneda = orden?.moneda ?? "DOP";
  const bienes = round2(filas.reduce((a, f) => a + f.recibir * f.precio, 0));
  const tasaItbis = orden?.lineas[0]?.tasa_itbis ?? 18;
  const itbis = round2(((bienes + servicios) * tasaItbis) / 100);

  const factura: DatosFacturaSuplidor = useMemo(
    () => ({
      numero,
      ncf,
      fecha: fechaFactura,
      vencimiento: sumarDias(fechaFactura, orden?.dias_credito ?? 0),
      dias_credito: orden?.dias_credito ?? 0,
      moneda,
      tasa_cambio: orden?.tasa_cambio ?? 1,
      comprobante_id: comprobanteId === SIN ? "" : comprobanteId,
      gasto_id: gastoId === SIN ? "" : gastoId,
      forma_pago_id: formaPagoId === SIN ? "" : formaPagoId,
      bienes,
      servicios,
      propina,
      isc,
      otros_impuestos: otros,
      itbis,
      itbis_retenido: itbisRetenido,
      isr_id: isrId === SIN ? "" : isrId,
      isr_retenido: isrRetenido,
      itbis_costo: itbisCosto,
      itbis_proporcional: 0,
      conduce,
      informal: false,
      gasto_menor: false,
      sucursal_id: orden?.sucursal_id ?? "1",
      uso: orden?.uso ?? "",
      notas,
    }),
    [
      numero,
      ncf,
      fechaFactura,
      orden,
      moneda,
      comprobanteId,
      gastoId,
      formaPagoId,
      bienes,
      servicios,
      propina,
      isc,
      otros,
      itbis,
      itbisRetenido,
      isrId,
      isrRetenido,
      itbisCosto,
      conduce,
      notas,
    ],
  );

  const totalFactura = totalFacturaSuplidor({
    bienes,
    servicios,
    propina,
    isc,
    otros_impuestos: otros,
    itbis,
    itbis_retenido: itbisRetenido,
    isr_retenido: isrRetenido,
  });

  const datosRecepcion = () => ({
    orden_id: Number(id),
    modalidad,
    fecha,
    almacen_id: almacenId,
    descuento_pct: 0,
    notas,
    lineas: filas
      .filter((f) => f.recibir > 0)
      .map((f) => ({
        linea_id: f.linea_id,
        producto_id: f.producto_id,
        recibida: f.recibir,
        precio: f.precio,
      })),
    ...(modalidad === "contabilidad" ? { factura } : {}),
  });

  const calcular = useMutation({
    mutationFn: () => obtenerAsientoRecepcion({ data: datosRecepcion() }),
    onSuccess: (res) => {
      setAsiento(res.lineas);
      setAdvertencias(res.advertencias);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const guardar = useMutation({
    mutationFn: () => registrarRecepcion({ data: { ...datosRecepcion(), asiento } }),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["compra", id] });
      await qc.invalidateQueries({ queryKey: ["compras"] });
      await qc.invalidateQueries({ queryKey: ["cxp-movimientos"] });
      toast.success(
        `Recepción guardada. Inventario ${res.documento_inventario}` +
          (res.factura ? ` · Factura del suplidor ${res.factura}` : ""),
      );
      void navigate({ to: "/compras/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!orden) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  return (
    <div>
      <PageHeader
        titulo={`Recepción de mercancías — orden ${orden.id}`}
        descripcion={`${orden.suplidor} · ${moneda} · ${orden.almacen}`}
        acciones={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => calcular.mutate()} disabled={calcular.isPending}>
              <Calculator className="size-4" /> Ver cuentas
            </Button>
            <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>
              <Save className="size-4" /> Guardar recepción
            </Button>
          </div>
        }
      />

      <Card className="mb-4">
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>Recibe</Label>
            <Select
              value={modalidad}
              onValueChange={(v) => setModalidad(v as "almacen" | "contabilidad")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="almacen">Almacén (sin precios ni factura)</SelectItem>
                <SelectItem value="contabilidad">Contabilidad (con factura)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="frec">Fecha de recepción</Label>
            <Input
              id="frec"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div>
            <Label>Almacén</Label>
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
            <Label htmlFor="obs">Observaciones</Label>
            <Textarea id="obs" rows={1} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="orden">
        <TabsList className="mb-4">
          <TabsTrigger value="orden">Datos orden de compra</TabsTrigger>
          <TabsTrigger value="factura" disabled={modalidad === "almacen"}>
            Datos factura
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orden">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Cantidades a recibir</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right">Solicitado</TableHead>
                      <TableHead className="text-right">Ya recibido</TableHead>
                      <TableHead className="text-right">Pendiente</TableHead>
                      <TableHead className="w-28">Recibir</TableHead>
                      <TableHead className="w-32">Costo</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filas.map((f, i) => (
                      <TableRow key={f.linea_id}>
                        <TableCell className="font-mono text-xs">{f.codigo}</TableCell>
                        <TableCell>{f.descripcion}</TableCell>
                        <TableCell className="text-right tabular-nums">{f.solicitado}</TableCell>
                        <TableCell className="text-right tabular-nums">{f.recibido}</TableCell>
                        <TableCell className="text-right tabular-nums">{f.pendiente}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={f.recibir}
                            onChange={(e) =>
                              setFilas(
                                filas.map((x, idx) =>
                                  idx === i ? { ...x, recibir: Number(e.target.value) } : x,
                                ),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={f.precio}
                            disabled={modalidad === "almacen"}
                            onChange={(e) =>
                              setFilas(
                                filas.map((x, idx) =>
                                  idx === i ? { ...x, precio: Number(e.target.value) } : x,
                                ),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(round2(f.recibir * f.precio), moneda)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end border-t px-5 py-4 text-sm tabular-nums">
                <span className="text-muted-foreground">
                  Mercancía recibida{" "}
                  <strong className="text-foreground">{money(bienes, moneda)}</strong>
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="factura">
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Factura del suplidor</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label htmlFor="num">Número de factura</Label>
                <Input
                  id="num"
                  value={numero}
                  maxLength={15}
                  onChange={(e) => setNumero(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ncf">NCF del suplidor</Label>
                <Input
                  id="ncf"
                  value={ncf}
                  maxLength={19}
                  onChange={(e) => setNcf(e.target.value.toUpperCase())}
                />
              </div>
              <div>
                <Label htmlFor="ffac">Fecha de la factura</Label>
                <Input
                  id="ffac"
                  type="date"
                  value={fechaFactura}
                  onChange={(e) => setFechaFactura(e.target.value)}
                />
              </div>
              <div>
                <Label>Tipo de comprobante</Label>
                <Select value={comprobanteId} onValueChange={setComprobanteId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin especificar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN}>Sin especificar</SelectItem>
                    {(listas?.comprobantes ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de gasto</Label>
                <Select value={gastoId} onValueChange={setGastoId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin especificar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN}>Sin especificar</SelectItem>
                    {(listas?.gastos ?? []).map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Label htmlFor="serv">Servicios</Label>
                <Input
                  id="serv"
                  type="number"
                  step="0.01"
                  min="0"
                  value={servicios}
                  onChange={(e) => setServicios(Number(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="prop">Propina legal</Label>
                <Input
                  id="prop"
                  type="number"
                  step="0.01"
                  min="0"
                  value={propina}
                  onChange={(e) => setPropina(Number(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="isc">ISC</Label>
                <Input
                  id="isc"
                  type="number"
                  step="0.01"
                  min="0"
                  value={isc}
                  onChange={(e) => setIsc(Number(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="otros">Otros impuestos</Label>
                <Input
                  id="otros"
                  type="number"
                  step="0.01"
                  min="0"
                  value={otros}
                  onChange={(e) => setOtros(Number(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="itbisret">ITBIS retenido</Label>
                <Input
                  id="itbisret"
                  type="number"
                  step="0.01"
                  min="0"
                  value={itbisRetenido}
                  onChange={(e) => setItbisRetenido(Number(e.target.value))}
                />
              </div>
              <div>
                <Label>Concepto de retención ISR</Label>
                <Select
                  value={isrId}
                  onValueChange={(v) => {
                    setIsrId(v);
                    const r = (listas?.retenciones ?? []).find((x) => x.id === v);
                    if (r) setIsrRetenido(round2(((bienes + servicios) * r.tasa) / 100));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin retención" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN}>Sin retención</SelectItem>
                    {(listas?.retenciones ?? []).map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.nombre} ({r.tasa}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="isrret">ISR retenido</Label>
                <Input
                  id="isrret"
                  type="number"
                  step="0.01"
                  min="0"
                  value={isrRetenido}
                  onChange={(e) => setIsrRetenido(Number(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="itbiscosto">ITBIS llevado al costo</Label>
                <Input
                  id="itbiscosto"
                  type="number"
                  step="0.01"
                  min="0"
                  value={itbisCosto}
                  onChange={(e) => setItbisCosto(Number(e.target.value))}
                />
              </div>
              <div className="flex items-end gap-2">
                <Checkbox
                  id="conduce"
                  checked={conduce}
                  onCheckedChange={(v) => setConduce(v === true)}
                />
                <Label htmlFor="conduce">Es conduce, no factura definitiva</Label>
              </div>
              <div className="lg:col-span-4">
                <div className="flex flex-wrap justify-end gap-6 border-t pt-3 text-sm tabular-nums">
                  <span className="text-muted-foreground">
                    Bienes <strong className="text-foreground">{money(bienes, moneda)}</strong>
                  </span>
                  <span className="text-muted-foreground">
                    ITBIS <strong className="text-foreground">{money(itbis, moneda)}</strong>
                  </span>
                  <span className="text-muted-foreground">
                    Total a pagar{" "}
                    <strong className="text-foreground">{money(totalFactura, moneda)}</strong>
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="mt-4">
        <AsientoContable
          lineas={asiento}
          onCambiar={setAsiento}
          advertencias={advertencias}
          cargando={calcular.isPending}
          nota="Propuestas según la clasificación del producto y las cuentas del suplidor. Puedes cambiarlas antes de guardar."
        />
      </div>
    </div>
  );
}
