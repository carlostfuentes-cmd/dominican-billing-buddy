import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Calculator, Save } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { AsientoContable } from "@/components/AsientoContable";
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
import { obtenerListasCompras } from "@/lib/compras.functions";
import {
  guardarFacturaSuplidor,
  obtenerAsientoFacturaSuplidor,
} from "@/lib/cxp.functions";
import {
  hoyISO,
  money,
  round2,
  sumarDias,
  totalFacturaSuplidor,
  type LineaAsiento,
} from "@/lib/erp-types";

export const Route = createFileRoute("/cxp/nueva")({
  head: () => ({
    meta: [
      { title: "Nueva factura de suplidor — ERP Contable RD" },
      {
        name: "description",
        content:
          "Captura la factura de un suplidor sin orden de compra: NCF, bienes y servicios, ITBIS, retenciones y asiento contable.",
      },
      { property: "og:title", content: "Nueva factura de suplidor — ERP Contable RD" },
      {
        property: "og:description",
        content: "Factura de gastos y servicios que afecta solo cuentas por pagar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NuevaFacturaSuplidorPage,
});

const SIN = "sin";

function NuevaFacturaSuplidorPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [suplidorId, setSuplidorId] = useState("");
  const [tipoId, setTipoId] = useState("I");
  const [numero, setNumero] = useState("");
  const [ncf, setNcf] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [diasCredito, setDiasCredito] = useState(0);
  const [moneda, setMoneda] = useState("DOP");
  const [tasa, setTasa] = useState(1);
  const [comprobanteId, setComprobanteId] = useState(SIN);
  const [gastoId, setGastoId] = useState(SIN);
  const [formaPagoId, setFormaPagoId] = useState(SIN);
  const [sucursalId, setSucursalId] = useState("1");
  const [bienes, setBienes] = useState(0);
  const [servicios, setServicios] = useState(0);
  const [propina, setPropina] = useState(0);
  const [isc, setIsc] = useState(0);
  const [otros, setOtros] = useState(0);
  const [itbis, setItbis] = useState(0);
  const [itbisRetenido, setItbisRetenido] = useState(0);
  const [isrId, setIsrId] = useState(SIN);
  const [isrRetenido, setIsrRetenido] = useState(0);
  const [itbisCosto, setItbisCosto] = useState(0);
  const [conduce, setConduce] = useState(false);
  const [informal, setInformal] = useState(false);
  const [gastoMenor, setGastoMenor] = useState(false);
  const [uso, setUso] = useState("");
  const [notas, setNotas] = useState("");
  const [asiento, setAsiento] = useState<LineaAsiento[]>([]);
  const [advertencias, setAdvertencias] = useState<string[]>([]);

  const { data: listas } = useQuery({
    queryKey: ["listas-compras"],
    queryFn: () => obtenerListasCompras(),
    staleTime: 300_000,
  });

  const total = totalFacturaSuplidor({
    bienes,
    servicios,
    propina,
    isc,
    otros_impuestos: otros,
    itbis,
    itbis_retenido: itbisRetenido,
    isr_retenido: isrRetenido,
  });

  const datos = () => ({
    suplidor_id: suplidorId,
    tipo_id: tipoId,
    factura: {
      numero,
      ncf,
      fecha,
      vencimiento: sumarDias(fecha, diasCredito),
      dias_credito: diasCredito,
      moneda,
      tasa_cambio: tasa,
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
      informal,
      gasto_menor: gastoMenor,
      sucursal_id: sucursalId,
      uso,
      notas,
    },
  });

  const calcular = useMutation({
    mutationFn: () =>
      obtenerAsientoFacturaSuplidor({
        data: {
          suplidor_id: suplidorId,
          bienes,
          servicios,
          propina,
          isc,
          otros_impuestos: otros,
          itbis,
          itbis_costo: itbisCosto,
          itbis_retenido: itbisRetenido,
          isr_retenido: isrRetenido,
        },
      }),
    onSuccess: (res) => {
      setAsiento(res.lineas);
      setAdvertencias(res.advertencias);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const guardar = useMutation({
    mutationFn: () => guardarFacturaSuplidor({ data: { ...datos(), asiento } }),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["cxp-movimientos"] });
      await qc.invalidateQueries({ queryKey: ["cxp-balances"] });
      toast.success(`Factura ${res.documento} registrada por ${money(res.total, moneda)}`);
      void navigate({ to: "/cxp" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        titulo="Nueva factura de suplidor"
        descripcion="Para gastos y servicios sin orden de compra. Afecta cuentas por pagar y contabilidad, no el inventario."
        acciones={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => calcular.mutate()}
              disabled={calcular.isPending || !suplidorId}
            >
              <Calculator className="size-4" /> Ver cuentas
            </Button>
            <Button
              onClick={() => guardar.mutate()}
              disabled={guardar.isPending || !suplidorId || total <= 0}
            >
              <Save className="size-4" /> Guardar factura
            </Button>
          </div>
        }
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Datos del suplidor y de la factura</CardTitle>
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
            <Label>Tipo de transacción</Label>
            <Select value={tipoId} onValueChange={setTipoId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(listas?.tipos_cxp ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="num">Factura No.</Label>
            <Input
              id="num"
              value={numero}
              maxLength={15}
              onChange={(e) => setNumero(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ncf">NCF No.</Label>
            <Input
              id="ncf"
              value={ncf}
              maxLength={19}
              onChange={(e) => setNcf(e.target.value.toUpperCase())}
            />
          </div>
          <div>
            <Label htmlFor="fecha">Fecha de la factura</Label>
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
              min="0"
              value={diasCredito}
              onChange={(e) => setDiasCredito(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Vence</Label>
            <Input value={sumarDias(fecha, diasCredito)} readOnly />
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
          <div className="lg:col-span-2">
            <Label htmlFor="uso">Uso que se le dará</Label>
            <Input id="uso" value={uso} maxLength={200} onChange={(e) => setUso(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Valores e impuestos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Monto etiqueta="Subtotal bienes" valor={bienes} onCambiar={setBienes} />
          <Monto etiqueta="Subtotal servicios" valor={servicios} onCambiar={setServicios} />
          <Monto etiqueta="Total propina" valor={propina} onCambiar={setPropina} />
          <Monto etiqueta="ISC" valor={isc} onCambiar={setIsc} />
          <Monto etiqueta="Otros impuestos" valor={otros} onCambiar={setOtros} />
          <div>
            <Label htmlFor="itbis">ITBIS</Label>
            <div className="flex gap-2">
              <Input
                id="itbis"
                type="number"
                step="0.01"
                min="0"
                value={itbis}
                onChange={(e) => setItbis(Number(e.target.value))}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setItbis(round2(((bienes + servicios) * 18) / 100))}
              >
                18%
              </Button>
            </div>
          </div>
          <Monto etiqueta="ITBIS retenido" valor={itbisRetenido} onCambiar={setItbisRetenido} />
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
          <Monto etiqueta="ISR retenido" valor={isrRetenido} onCambiar={setIsrRetenido} />
          <Monto etiqueta="ITBIS llevado al costo" valor={itbisCosto} onCambiar={setItbisCosto} />
          <div className="flex items-end gap-2">
            <Checkbox
              id="conduce"
              checked={conduce}
              onCheckedChange={(v) => setConduce(v === true)}
            />
            <Label htmlFor="conduce">Conduce</Label>
          </div>
          <div className="flex items-end gap-2">
            <Checkbox
              id="informal"
              checked={informal}
              onCheckedChange={(v) => setInformal(v === true)}
            />
            <Label htmlFor="informal">Proveedor informal</Label>
          </div>
          <div className="flex items-end gap-2">
            <Checkbox
              id="menor"
              checked={gastoMenor}
              onCheckedChange={(v) => setGastoMenor(v === true)}
            />
            <Label htmlFor="menor">Gasto menor</Label>
          </div>
          <div className="lg:col-span-3">
            <Label htmlFor="obs">Observaciones</Label>
            <Textarea id="obs" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
          <div className="flex items-end justify-end text-sm tabular-nums lg:col-span-4">
            <span className="text-muted-foreground">
              Total factura <strong className="text-foreground">{money(total, moneda)}</strong>
            </span>
          </div>
        </CardContent>
      </Card>

      <AsientoContable
        lineas={asiento}
        onCambiar={setAsiento}
        advertencias={advertencias}
        cargando={calcular.isPending}
        nota="Propuestas según las cuentas del suplidor. Puedes cambiarlas antes de guardar."
      />
    </div>
  );
}

function Monto({
  etiqueta,
  valor,
  onCambiar,
}: {
  etiqueta: string;
  valor: number;
  onCambiar: (v: number) => void;
}) {
  const id = etiqueta.replace(/\s+/g, "-").toLowerCase();
  return (
    <div>
      <Label htmlFor={id}>{etiqueta}</Label>
      <Input
        id={id}
        type="number"
        step="0.01"
        min="0"
        value={valor}
        onChange={(e) => onCambiar(Number(e.target.value))}
      />
    </div>
  );
}
