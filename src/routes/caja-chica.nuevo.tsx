import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";

import { AsientoContable } from "@/components/AsientoContable";
import { PageHeader } from "@/components/AppShell";
import { SelectorBuscable } from "@/components/SelectorBuscable";
import { Badge } from "@/components/ui/badge";
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
  guardarComprobanteCaja,
  obtenerComprobanteCaja,
  obtenerListasCajaChica,
  proponerAsientoCaja,
} from "@/lib/cajachica.functions";
import {
  hoyISO,
  money,
  round2,
  totalComprobanteCaja,
  type LineaAsiento,
} from "@/lib/erp-types";

export const Route = createFileRoute("/caja-chica/nuevo")({
  validateSearch: (s: Record<string, unknown>) => ({
    caja: typeof s["caja"] === "string" ? s["caja"] : undefined,
    id: s["id"] ? Number(s["id"]) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Comprobante de caja chica — ERP Contable RD" },
      {
        name: "description",
        content:
          "Registro del gasto de caja chica con beneficiario, comprobante fiscal, ITBIS, retenciones, cuentas contables y centro de costo.",
      },
      { property: "og:title", content: "Comprobante de caja chica — ERP Contable RD" },
      {
        property: "og:description",
        content: "Captura del vale de gasto con su sustento fiscal y su asiento contable.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NuevoComprobantePage,
});

const SIN = "sin";
/** Tipos de comprobante fiscal que se reportan en el formato 606. */
const NCF_EN_606 = ["1", "5", "7", "9", "11"];

function NuevoComprobantePage() {
  const { caja: cajaBuscada, id: idEditar } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: listas } = useQuery({
    queryKey: ["listas-caja-chica"],
    queryFn: () => obtenerListasCajaChica(),
    staleTime: 300_000,
  });

  const { data: existente, isLoading: cargandoExistente } = useQuery({
    queryKey: ["comprobante-caja", idEditar],
    queryFn: () => {
      if (!idEditar) throw new Error("Comprobante inválido");
      return obtenerComprobanteCaja({ data: { id: idEditar } });
    },
    enabled: Boolean(idEditar),
    retry: 1,
  });

  const [caja, setCaja] = useState(cajaBuscada ?? "");
  const [tipo, setTipo] = useState("E");
  const [fecha, setFecha] = useState(hoyISO());
  const [referencia, setReferencia] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [beneficiario, setBeneficiario] = useState("");
  const [rnc, setRnc] = useState("");
  const [cedula, setCedula] = useState("");
  const [ncfId, setNcfId] = useState("1");
  const [ncf, setNcf] = useState("");
  const [autorizacion, setAutorizacion] = useState("");
  const [vigencia, setVigencia] = useState("");
  const [gastoMenor, setGastoMenor] = useState(false);
  const [gastoId, setGastoId] = useState("");
  const [isrId, setIsrId] = useState("");
  const [proyectoId, setProyectoId] = useState("");
  const [bienes, setBienes] = useState(0);
  const [servicios, setServicios] = useState(0);
  const [itbis, setItbis] = useState(0);
  const [propina, setPropina] = useState(0);
  const [isc, setIsc] = useState(0);
  const [otros, setOtros] = useState(0);
  const [retItbis, setRetItbis] = useState(0);
  const [retIsr, setRetIsr] = useState(0);
  const [estado, setEstado] = useState("A");
  const [cuentaGasto, setCuentaGasto] = useState("");
  const [cuentaItbis, setCuentaItbis] = useState("");
  const [cuentaIsr, setCuentaIsr] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [asiento, setAsiento] = useState<LineaAsiento[]>([]);
  const [asientoTocado, setAsientoTocado] = useState(false);

  const cajas = listas?.cajas ?? [];
  const cajaId = caja || cajas[0]?.id || "";

  // Datos del comprobante que se está modificando.
  useEffect(() => {
    if (!existente) return;
    setCaja(existente.caja_id);
    setTipo(existente.tipo);
    setFecha(existente.fecha);
    setReferencia(existente.referencia);
    setDescripcion(existente.descripcion);
    setBeneficiario(existente.beneficiario);
    setRnc(existente.rnc);
    setCedula(existente.cedula);
    setNcfId(existente.ncf_id || "1");
    setNcf(existente.ncf);
    setAutorizacion(existente.autorizacion);
    setVigencia(existente.vigencia);
    setGastoMenor(existente.gasto_menor);
    setGastoId(existente.gasto_id);
    setIsrId(existente.isr_id);
    setProyectoId(existente.proyecto_id);
    setBienes(existente.bienes);
    setServicios(existente.servicios);
    setItbis(existente.itbis);
    setPropina(existente.propina);
    setIsc(existente.isc);
    setOtros(existente.otros_impuestos);
    setRetItbis(existente.retencion_itbis);
    setRetIsr(existente.retencion_isr);
    setEstado(existente.estado);
    setCuentaGasto(existente.cuenta_gasto);
    setCuentaItbis(existente.cuenta_itbis);
    setCuentaIsr(existente.cuenta_isr);
    if (existente.asiento.length) {
      setAsiento(existente.asiento);
      setAsientoTocado(true);
    }
  }, [existente]);

  const total = totalComprobanteCaja({
    bienes,
    servicios,
    itbis,
    propina,
    isc,
    otros_impuestos: otros,
    retencion_itbis: retItbis,
    retencion_isr: retIsr,
  });

  const entrada = useMemo(
    () => ({
      ...(idEditar ? { id: idEditar } : {}),
      caja_id: cajaId,
      tipo,
      fecha,
      referencia,
      descripcion,
      bienes,
      servicios,
      itbis,
      retencion_itbis: retItbis,
      retencion_isr: retIsr,
      propina,
      isc,
      otros_impuestos: otros,
      estado,
      cedula,
      rnc,
      beneficiario,
      ncf,
      autorizacion,
      gasto_menor: gastoMenor,
      ncf_id: ncfId,
      gasto_id: gastoId,
      cuenta_gasto: cuentaGasto,
      ...(vigencia ? { vigencia } : {}),
      ...(isrId ? { isr_id: isrId } : {}),
      ...(proyectoId ? { proyecto_id: proyectoId } : {}),
      ...(cuentaItbis ? { cuenta_itbis: cuentaItbis } : {}),
      ...(cuentaIsr ? { cuenta_isr: cuentaIsr } : {}),
    }),
    [
      idEditar,
      cajaId,
      tipo,
      fecha,
      referencia,
      descripcion,
      bienes,
      servicios,
      itbis,
      retItbis,
      retIsr,
      propina,
      isc,
      otros,
      estado,
      cedula,
      rnc,
      beneficiario,
      ncf,
      autorizacion,
      gastoMenor,
      ncfId,
      gastoId,
      cuentaGasto,
      vigencia,
      isrId,
      proyectoId,
      cuentaItbis,
      cuentaIsr,
    ],
  );

  const { data: propuesta, isFetching: calculando } = useQuery({
    queryKey: [
      "propuesta-caja",
      cajaId,
      tipo,
      total,
      bienes,
      servicios,
      itbis,
      retItbis,
      retIsr,
      cuentaGasto,
      cuentaItbis,
      cuentaIsr,
    ],
    queryFn: () => proponerAsientoCaja({ data: entrada }),
    enabled: Boolean(cajaId) && total > 0,
  });

  useEffect(() => {
    if (!propuesta || asientoTocado) return;
    setAsiento(
      propuesta.lineas.map((l) => ({
        ...l,
        departamento_id: l.departamento_id ?? (departamento || undefined),
      })),
    );
  }, [propuesta, asientoTocado, departamento]);

  const retencionSugerida = useMemo(() => {
    const r = (listas?.retenciones ?? []).find((x) => x.id === isrId);
    if (!r) return 0;
    return round2(((Math.abs(bienes) + Math.abs(servicios)) * r.tasa) / 100);
  }, [listas, isrId, bienes, servicios]);

  const guardar = useMutation({
    mutationFn: () => guardarComprobanteCaja({ data: { ...entrada, asiento } }),
    onSuccess: async (resultado) => {
      toast.success(idEditar ? "Comprobante actualizado" : "Comprobante registrado");
      await qc.invalidateQueries({ queryKey: ["comprobantes-caja"] });
      await qc.invalidateQueries({ queryKey: ["resumen-caja-chica"] });
      await qc.invalidateQueries({ queryKey: ["comprobante-caja", resultado.id] });
      await navigate({
        to: "/caja-chica/$id",
        params: { id: String(resultado.id) },
        search: { imprimir: !idEditar },
      });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el comprobante"),
  });

  const faltantes = () => {
    const f: string[] = [];
    if (!cajaId) f.push("la caja chica");
    if (!descripcion.trim()) f.push("el concepto del gasto");
    if (total <= 0) f.push("el monto del gasto");
    if (tipo === "E" && !beneficiario.trim()) f.push("el beneficiario");
    if (tipo === "E" && !gastoId) f.push("la categoría de gasto de la DGII");
    if (!cuentaGasto) f.push("la cuenta contable del gasto");
    const debito = round2(asiento.reduce((s, l) => s + Math.abs(l.debito), 0));
    const credito = round2(asiento.reduce((s, l) => s + Math.abs(l.credito), 0));
    if (Math.abs(debito - credito) > 0.01) f.push("cuadrar el asiento contable");
    if (asiento.some((l) => !l.cuenta)) f.push("la cuenta de todas las líneas del asiento");
    return f;
  };

  const intentarGuardar = () => {
    const f = faltantes();
    if (f.length) {
      toast.error(`Falta completar: ${f.join(", ")}`);
      return;
    }
    guardar.mutate();
  };

  const opcionesCuentas = (listas?.cuentas ?? []).map((c) => ({
    valor: c.cuenta,
    etiqueta: `${c.cuenta} — ${c.nombre}`,
    detalle: c.clasificacion ?? "",
  }));

  const en606 = tipo === "E" && NCF_EN_606.includes(ncfId) && Boolean(ncf.trim());

  if (idEditar && cargandoExistente)
    return (
      <>
        <PageHeader titulo="Comprobante de caja chica" />
        <p className="text-sm text-muted-foreground">Cargando el comprobante…</p>
      </>
    );

  if (idEditar && existente && !existente.editable)
    return (
      <>
        <PageHeader titulo="Comprobante de caja chica" />
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm">
              Este comprobante ya fue repuesto (No. {existente.reposicion_numero}) y no se puede
              modificar.
            </p>
            <Button asChild variant="outline">
              <Link to="/caja-chica" search={{}}>
                <ArrowLeft className="size-4" /> Volver a caja chica
              </Link>
            </Button>
          </CardContent>
        </Card>
      </>
    );

  return (
    <>
      <PageHeader
        titulo={idEditar ? `Comprobante de caja chica ${idEditar}` : "Nuevo comprobante de caja chica"}
        descripcion="Gasto pagado con el fondo de efectivo, con su comprobante fiscal y su asiento contable."
        acciones={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/caja-chica" search={{}}>
                <ArrowLeft className="size-4" /> Volver
              </Link>
            </Button>
            <Button onClick={intentarGuardar} disabled={guardar.isPending}>
              <Save className="size-4" /> {guardar.isPending ? "Guardando…" : "Guardar comprobante"}
            </Button>
          </div>
        }
      />

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Fondo y custodio</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <Label>Caja chica</Label>
              <Select value={cajaId} onValueChange={setCaja}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona la caja" />
                </SelectTrigger>
                <SelectContent>
                  {cajas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de movimiento</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="E">Gasto (desembolso)</SelectItem>
                  <SelectItem value="I">Aumento del fondo</SelectItem>
                  <SelectItem value="A">Apertura del fondo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estado</Label>
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="P">Pendiente de aprobación</SelectItem>
                  <SelectItem value="A">Aprobado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha del comprobante</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <Label>Referencia interna</Label>
              <Input
                value={referencia}
                maxLength={15}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Vale, solicitud…"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Período contable</Label>
              <Input value={fecha ? fecha.slice(0, 7) : ""} readOnly className="bg-muted/40" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Proveedor y comprobante fiscal</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <Label>Nombre del proveedor o beneficiario</Label>
              <Input
                value={beneficiario}
                maxLength={50}
                onChange={(e) => setBeneficiario(e.target.value)}
              />
            </div>
            <div>
              <Label>RNC</Label>
              <Input value={rnc} maxLength={15} onChange={(e) => setRnc(e.target.value)} />
            </div>
            <div>
              <Label>Cédula</Label>
              <Input value={cedula} maxLength={15} onChange={(e) => setCedula(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label>Tipo de comprobante</Label>
              <Select
                value={ncfId}
                onValueChange={(v) => {
                  setNcfId(v);
                  // El registro de gastos menores (B13/E43) es el sustento cuando
                  // el proveedor no emite comprobante fiscal.
                  setGastoMenor(v === "7");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona el tipo" />
                </SelectTrigger>
                <SelectContent>
                  {(listas?.comprobantes_fiscales ?? []).map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Número de NCF / e-CF</Label>
              <Input
                value={ncf}
                maxLength={19}
                onChange={(e) => setNcf(e.target.value.toUpperCase())}
                placeholder="B0100000001"
              />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Checkbox
                id="gasto-menor"
                checked={gastoMenor}
                onCheckedChange={(v) => setGastoMenor(Boolean(v))}
              />
              <Label htmlFor="gasto-menor" className="text-sm font-normal">
                Gasto menor
              </Label>
            </div>
            {gastoMenor ? (
              <>
                <div>
                  <Label>Autorización DGII</Label>
                  <Input
                    value={autorizacion}
                    maxLength={15}
                    onChange={(e) => setAutorizacion(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Vigencia del comprobante</Label>
                  <Input
                    type="date"
                    value={vigencia}
                    onChange={(e) => setVigencia(e.target.value)}
                  />
                </div>
              </>
            ) : null}
            <div className="md:col-span-2">
              <Label>Categoría de gasto (DGII)</Label>
              <Select value={gastoId || SIN} onValueChange={(v) => setGastoId(v === SIN ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona la categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN}>Sin categoría</SelectItem>
                  {(listas?.gastos ?? []).map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end md:col-span-2">
              <Badge variant={en606 ? "default" : "outline"}>
                {en606
                  ? "Se incluye en el formato 606"
                  : "No se incluye en el 606 (falta NCF o el tipo no aplica)"}
              </Badge>
            </div>
            <div className="md:col-span-4">
              <Label>Concepto del gasto</Label>
              <Textarea
                value={descripcion}
                maxLength={500}
                rows={2}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Detalle claro del gasto efectuado"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Montos y retenciones</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <Numero label="Bienes" valor={bienes} onCambio={setBienes} />
            <Numero label="Servicios" valor={servicios} onCambio={setServicios} />
            <Numero label="ITBIS facturado" valor={itbis} onCambio={setItbis} />
            <Numero label="Propina legal" valor={propina} onCambio={setPropina} />
            <Numero label="Impuesto selectivo (ISC)" valor={isc} onCambio={setIsc} />
            <Numero label="Otros impuestos" valor={otros} onCambio={setOtros} />
            <Numero label="Retención de ITBIS" valor={retItbis} onCambio={setRetItbis} />
            <div>
              <Label>Tipo de retención de ISR</Label>
              <Select value={isrId || SIN} onValueChange={(v) => setIsrId(v === SIN ? "" : v)}>
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
            <Numero label="Retención de ISR" valor={retIsr} onCambio={setRetIsr} />
            {retencionSugerida > 0 && round2(retIsr) !== retencionSugerida ? (
              <div className="flex items-end md:col-span-2">
                <Button variant="outline" size="sm" onClick={() => setRetIsr(retencionSugerida)}>
                  Usar retención calculada: {money(retencionSugerida)}
                </Button>
              </div>
            ) : null}
            <div className="md:col-span-4 flex justify-end border-t pt-3 text-sm">
              <span className="text-muted-foreground">
                Total del comprobante{" "}
                <strong className="text-foreground tabular-nums">{money(total)}</strong>
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cuentas y centro de costo</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Cuenta contable del gasto</Label>
              <SelectorBuscable
                opciones={opcionesCuentas}
                valor={cuentaGasto}
                onSeleccionar={(v) => {
                  setCuentaGasto(v);
                  setAsientoTocado(false);
                }}
                placeholder="Cuenta del gasto"
              />
            </div>
            <div>
              <Label>Centro de costo</Label>
              <Select
                value={departamento || SIN}
                onValueChange={(v) => {
                  const dep = v === SIN ? "" : v;
                  setDepartamento(dep);
                  setAsiento((ls) =>
                    ls.map((l) => ({ ...l, departamento_id: dep || undefined })),
                  );
                }}
              >
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
              <Label>Cuenta de retención de ITBIS</Label>
              <SelectorBuscable
                opciones={opcionesCuentas}
                valor={cuentaItbis}
                onSeleccionar={(v) => {
                  setCuentaItbis(v);
                  setAsientoTocado(false);
                }}
                placeholder="Solo si hay retención"
              />
            </div>
            <div>
              <Label>Cuenta de retención de ISR</Label>
              <SelectorBuscable
                opciones={opcionesCuentas}
                valor={cuentaIsr}
                onSeleccionar={(v) => {
                  setCuentaIsr(v);
                  setAsientoTocado(false);
                }}
                placeholder="Solo si hay retención"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Proyecto contable</Label>
              <Select
                value={proyectoId || SIN}
                onValueChange={(v) => setProyectoId(v === SIN ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin proyecto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN}>Sin proyecto</SelectItem>
                  {(listas?.proyectos ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <AsientoContable
          lineas={asiento}
          onCambiar={(ls) => {
            setAsientoTocado(true);
            setAsiento(ls);
          }}
          advertencias={propuesta?.advertencias ?? []}
          cargando={calculando && !asiento.length}
          nota="Se debita el gasto y el ITBIS adelantado y se acredita la caja chica. Puedes cambiar cualquier cuenta antes de guardar."
        />
      </div>
    </>
  );
}

function Numero({
  label,
  valor,
  onCambio,
}: {
  label: string;
  valor: number;
  onCambio: (n: number) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        step="0.01"
        min="0"
        value={valor}
        onChange={(e) => onCambio(Math.abs(Number(e.target.value) || 0))}
        className="text-right tabular-nums"
      />
    </div>
  );
}
