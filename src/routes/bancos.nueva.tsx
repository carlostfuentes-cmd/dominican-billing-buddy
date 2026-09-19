import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Save, Wallet } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { AsientoContable } from "@/components/AsientoContable";
import { SelectorBuscable } from "@/components/SelectorBuscable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  guardarMovimientoBanco,
  obtenerAsientoBanco,
  obtenerListasBancos,
} from "@/lib/bancos.functions";
import { obtenerPendientesCxP } from "@/lib/cxp.functions";
import { fechaCorta, hoyISO, money, type LineaAsiento } from "@/lib/erp-types";

export const Route = createFileRoute("/bancos/nueva")({
  head: () => ({
    meta: [
      { title: "Nueva operación bancaria — ERP Contable RD" },
      {
        name: "description",
        content:
          "Registra cheques, depósitos, transferencias, pagos a suplidores y avances con su asiento contable y centro de costo.",
      },
      { property: "og:title", content: "Nueva operación bancaria — ERP Contable RD" },
      {
        property: "og:description",
        content: "Registro de movimientos del libro de bancos con asiento editable.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NuevaOperacionPage,
});

const TIPOS_PAGO = ["TS", "TC", "CP", "CB", "CK"];
const TIPO_TRANSFERENCIA = "TB";

function NuevaOperacionPage() {
  const navigate = useNavigate();
  const [bancoId, setBancoId] = useState("");
  const [tipoId, setTipoId] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [numero, setNumero] = useState("");
  const [monto, setMonto] = useState(0);
  const [tasa, setTasa] = useState(1);
  const [beneficiario, setBeneficiario] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [ncf, setNcf] = useState("");
  const [montoNcf, setMontoNcf] = useState(0);
  const [itbis, setItbis] = useState(0);
  const [comision, setComision] = useState(0);
  const [itbisRet, setItbisRet] = useState(0);
  const [isrRet, setIsrRet] = useState(0);
  const [conceptoId, setConceptoId] = useState("");
  const [suplidorId, setSuplidorId] = useState("");
  const [bancoDestinoId, setBancoDestinoId] = useState("");
  const [esAvance, setEsAvance] = useState(false);
  const [avanceAbierto, setAvanceAbierto] = useState(false);
  const [avanceSuplidor, setAvanceSuplidor] = useState("");
  const [avanceCuenta, setAvanceCuenta] = useState("");
  const [aplicaciones, setAplicaciones] = useState<Record<string, number>>({});
  const [lineas, setLineas] = useState<LineaAsiento[]>([]);
  const [advertencias, setAdvertencias] = useState<string[]>([]);

  const { data: listas } = useQuery({
    queryKey: ["listas-bancos"],
    queryFn: () => obtenerListasBancos(),
    staleTime: 300_000,
  });

  const banco = listas?.bancos.find((b) => b.id === bancoId);
  const tipo = listas?.tipos.find((t) => t.id === tipoId);
  const moneda = banco?.moneda ?? "DOP";
  const esPagoSuplidor = TIPOS_PAGO.includes(tipoId);
  const esTransferencia = tipoId === TIPO_TRANSFERENCIA;

  useEffect(() => {
    if (moneda === "DOP") setTasa(1);
  }, [moneda]);

  const { data: pendientes = [] } = useQuery({
    queryKey: ["cxp-pendientes", suplidorId],
    queryFn: () => obtenerPendientesCxP({ data: { suplidorId } }),
    enabled: esPagoSuplidor && suplidorId.length > 0,
  });

  const entrada = useMemo(
    () => ({
      banco_id: bancoId,
      tipo_id: tipoId,
      fecha,
      numero,
      monto,
      tasa_cambio: tasa,
      beneficiario,
      descripcion,
      ncf,
      monto_ncf: montoNcf,
      itbis,
      comision,
      itbis_retenido: itbisRet,
      isr_retenido: isrRet,
      ...(conceptoId ? { concepto_id: conceptoId } : {}),
      ...(suplidorId ? { suplidor_id: suplidorId } : {}),
      ...(esTransferencia && bancoDestinoId ? { banco_destino_id: bancoDestinoId } : {}),
      ...(esAvance && avanceSuplidor
        ? { avance: { suplidor_id: avanceSuplidor, cuenta_cxp: avanceCuenta } }
        : {}),
      aplicaciones: Object.entries(aplicaciones)
        .filter(([, v]) => v > 0)
        .map(([referencia, m]) => ({ referencia, monto: m })),
    }),
    [
      bancoId,
      tipoId,
      fecha,
      numero,
      monto,
      tasa,
      beneficiario,
      descripcion,
      ncf,
      montoNcf,
      itbis,
      comision,
      itbisRet,
      isrRet,
      conceptoId,
      suplidorId,
      esTransferencia,
      bancoDestinoId,
      esAvance,
      avanceSuplidor,
      avanceCuenta,
      aplicaciones,
    ],
  );

  const proponer = useMutation({
    mutationFn: () => obtenerAsientoBanco({ data: entrada }),
    onSuccess: (p) => {
      setLineas(p.lineas);
      setAdvertencias(p.advertencias);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const guardar = useMutation({
    mutationFn: () => guardarMovimientoBanco({ data: { ...entrada, asiento: lineas } }),
    onSuccess: (r) => {
      toast.success(`Operación bancaria No. ${r.numero} registrada`);
      navigate({ to: "/bancos/$id", params: { id: String(r.id) } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const listo = bancoId && tipoId && numero.trim() && monto > 0;

  return (
    <>
      <PageHeader
        titulo="Nueva operación bancaria"
        descripcion="El tipo de operación define los campos requeridos y las cuentas que se afectan."
        acciones={
          <Button
            disabled={!listo || lineas.length === 0 || guardar.isPending}
            onClick={() => guardar.mutate()}
          >
            <Save className="size-4" /> Guardar operación
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Datos de la operación</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <Label>Cuenta bancaria</Label>
              <SelectorBuscable
                opciones={(listas?.bancos ?? []).map((b) => ({
                  valor: b.id,
                  etiqueta: `${b.nombre} (${b.moneda})`,
                  detalle: b.numero_cuenta,
                }))}
                valor={bancoId}
                onSeleccionar={setBancoId}
                placeholder="Selecciona la cuenta"
              />
            </div>
            <div>
              <Label>Tipo de movimiento</Label>
              <SelectorBuscable
                opciones={(listas?.tipos ?? []).map((t) => ({
                  valor: t.id,
                  etiqueta: `${t.id} — ${t.nombre}`,
                  detalle: t.signo === "D" ? "Entrada" : "Salida",
                }))}
                valor={tipoId}
                onSeleccionar={setTipoId}
                placeholder="Selecciona el tipo"
              />
            </div>
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <Label>Documento No.</Label>
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} />
            </div>
            <div>
              <Label>Monto ({moneda})</Label>
              <Input
                type="number"
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Tasa de cambio</Label>
              <Input
                type="number"
                step="0.0001"
                value={tasa}
                onChange={(e) => setTasa(Number(e.target.value))}
                disabled={moneda === "DOP"}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Beneficiario</Label>
              <Input
                value={beneficiario}
                onChange={(e) => setBeneficiario(e.target.value)}
                maxLength={50}
              />
            </div>

            {esTransferencia ? (
              <div className="md:col-span-3">
                <Label>Cuenta bancaria de destino</Label>
                <SelectorBuscable
                  opciones={(listas?.bancos ?? [])
                    .filter((b) => b.id !== bancoId)
                    .map((b) => ({
                      valor: b.id,
                      etiqueta: `${b.nombre} (${b.moneda})`,
                      detalle: b.numero_cuenta,
                    }))}
                  valor={bancoDestinoId}
                  onSeleccionar={setBancoDestinoId}
                  placeholder="Selecciona el banco receptor"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Se registra la salida en esta cuenta y la entrada en la cuenta de destino con el
                  mismo número.
                </p>
              </div>
            ) : null}

            {esPagoSuplidor ? (
              <div className="md:col-span-3">
                <Label>Suplidor</Label>
                <SelectorBuscable
                  opciones={(listas?.suplidores ?? []).map((s) => ({
                    valor: s.id,
                    etiqueta: s.nombre,
                    detalle: s.rnc,
                  }))}
                  valor={suplidorId}
                  onSeleccionar={setSuplidorId}
                  placeholder="Selecciona el suplidor"
                />
              </div>
            ) : null}

            <div>
              <Label>NCF</Label>
              <Input value={ncf} onChange={(e) => setNcf(e.target.value)} maxLength={20} />
            </div>
            <div>
              <Label>Monto del NCF</Label>
              <Input
                type="number"
                step="0.01"
                value={montoNcf}
                onChange={(e) => setMontoNcf(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Concepto bancario</Label>
              <SelectorBuscable
                opciones={[
                  { valor: "", etiqueta: "Sin concepto" },
                  ...(listas?.conceptos ?? []).map((c) => ({
                    valor: c.id,
                    etiqueta: c.nombre,
                  })),
                ]}
                valor={conceptoId}
                onSeleccionar={setConceptoId}
                placeholder="Sin concepto"
              />
            </div>
            <div>
              <Label>ITBIS del cargo</Label>
              <Input
                type="number"
                step="0.01"
                value={itbis}
                onChange={(e) => setItbis(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Comisión / cargo bancario</Label>
              <Input
                type="number"
                step="0.01"
                value={comision}
                onChange={(e) => setComision(Number(e.target.value))}
              />
            </div>
            <div className="hidden md:block" />
            <div>
              <Label>ITBIS retenido</Label>
              <Input
                type="number"
                step="0.01"
                value={itbisRet}
                onChange={(e) => setItbisRet(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>ISR retenido</Label>
              <Input
                type="number"
                step="0.01"
                value={isrRet}
                onChange={(e) => setIsrRet(Number(e.target.value))}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={esAvance}
                  onCheckedChange={(v) => {
                    const on = v === true;
                    setEsAvance(on);
                    if (on) setAvanceAbierto(true);
                  }}
                />
                Avance a suplidor
              </label>
            </div>

            <div className="md:col-span-3">
              <Label>Descripción</Label>
              <Textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                maxLength={240}
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="flex justify-between">
              <span className="text-muted-foreground">Tipo</span>
              <span>{tipo ? `${tipo.nombre} (${tipo.signo === "D" ? "entrada" : "salida"})` : "—"}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-muted-foreground">Monto</span>
              <span className="tabular-nums">{money(monto, moneda)}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-muted-foreground">Retenciones</span>
              <span className="tabular-nums">{money(itbisRet + isrRet, moneda)}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-muted-foreground">Comisión + ITBIS</span>
              <span className="tabular-nums">{money(comision + itbis, moneda)}</span>
            </p>
            {esAvance && avanceSuplidor ? (
              <p className="rounded-md bg-muted px-2 py-1.5 text-xs">
                Avance registrado en cuentas por pagar al suplidor seleccionado.
              </p>
            ) : null}
            <Button
              className="w-full"
              variant="secondary"
              disabled={!listo || proponer.isPending}
              onClick={() => proponer.mutate()}
            >
              <Wallet className="size-4" /> Proponer asiento contable
            </Button>
            {advertencias.map((a) => (
              <p key={a} className="text-xs text-warning">
                {a}
              </p>
            ))}
          </CardContent>
        </Card>
      </div>

      {esPagoSuplidor && suplidorId ? (
        <Card className="mt-5">
          <CardHeader>
            <CardTitle className="text-base">Facturas pendientes del suplidor</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Documento</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead className="text-right">Pendiente</TableHead>
                  <TableHead className="text-right">Aplicar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendientes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Este suplidor no tiene documentos pendientes.
                    </TableCell>
                  </TableRow>
                ) : (
                  pendientes.map((p) => (
                    <TableRow key={p.documento}>
                      <TableCell className="font-medium">{p.documento}</TableCell>
                      <TableCell>{fechaCorta(p.fecha)}</TableCell>
                      <TableCell>{p.vencimiento ? fechaCorta(p.vencimiento) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(p.pendiente, p.moneda)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          className="ml-auto w-32 text-right"
                          type="number"
                          step="0.01"
                          value={aplicaciones[p.documento] ?? 0}
                          onChange={(e) =>
                            setAplicaciones((prev) => ({
                              ...prev,
                              [p.documento]: Number(e.target.value),
                            }))
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {lineas.length > 0 ? (
        <div className="mt-5">
          <AsientoContable lineas={lineas} onCambio={setLineas} moneda={moneda} />
        </div>
      ) : null}

      <Dialog open={avanceAbierto} onOpenChange={setAvanceAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Avance a suplidor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Suplidor</Label>
              <SelectorBuscable
                opciones={(listas?.suplidores ?? []).map((s) => ({
                  valor: s.id,
                  etiqueta: s.nombre,
                  detalle: s.rnc,
                }))}
                valor={avanceSuplidor}
                onSeleccionar={setAvanceSuplidor}
                placeholder="Selecciona el suplidor"
              />
            </div>
            <div>
              <Label>Cuenta de cuentas por pagar</Label>
              <Input
                value={avanceCuenta}
                onChange={(e) => setAvanceCuenta(e.target.value)}
                placeholder="Se toma de la maestra del suplidor"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setEsAvance(false);
                setAvanceSuplidor("");
                setAvanceAbierto(false);
              }}
            >
              Cancelar
            </Button>
            <Button disabled={!avanceSuplidor} onClick={() => setAvanceAbierto(false)}>
              Aceptar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
