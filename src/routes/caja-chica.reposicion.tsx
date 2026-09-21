import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Wallet } from "lucide-react";
import { toast } from "sonner";

import { AsientoContable } from "@/components/AsientoContable";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  obtenerComprobantesCaja,
  obtenerListasCajaChica,
  proponerAsientoReposicion,
  reponerFondoCaja,
} from "@/lib/cajachica.functions";
import { obtenerListasBancos } from "@/lib/bancos.functions";
import { fechaCorta, hoyISO, money, round2, type LineaAsiento } from "@/lib/erp-types";

export const Route = createFileRoute("/caja-chica/reposicion")({
  validateSearch: (s: Record<string, unknown>) => ({
    caja: typeof s["caja"] === "string" ? s["caja"] : undefined,
    ids: typeof s["ids"] === "string" ? s["ids"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Reposición de caja chica — ERP Contable RD" },
      {
        name: "description",
        content:
          "Reposición del fondo de caja chica: selección de comprobantes, cuenta bancaria del reembolso y asiento contable.",
      },
      { property: "og:title", content: "Reposición de caja chica — ERP Contable RD" },
      {
        property: "og:description",
        content: "Restituye el efectivo del fondo con cheque o transferencia desde el banco.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReposicionPage,
});

function ReposicionPage() {
  const { caja: cajaBuscada, ids } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: listas } = useQuery({
    queryKey: ["listas-caja-chica"],
    queryFn: () => obtenerListasCajaChica(),
    staleTime: 300_000,
  });
  const { data: listasBanco } = useQuery({
    queryKey: ["listas-bancos"],
    queryFn: () => obtenerListasBancos(),
    staleTime: 300_000,
  });

  const [caja, setCaja] = useState(cajaBuscada ?? "");
  const [banco, setBanco] = useState("");
  const [tipoOperacion, setTipoOperacion] = useState("");
  const [numero, setNumero] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [descripcion, setDescripcion] = useState("Reposición de fondo de caja chica");
  const [seleccion, setSeleccion] = useState<number[]>(
    ids ? ids.split(",").map(Number).filter((n) => n > 0) : [],
  );
  const [asiento, setAsiento] = useState<LineaAsiento[]>([]);
  const [asientoTocado, setAsientoTocado] = useState(false);

  const cajas = listas?.cajas ?? [];
  const cajaId = caja || cajas[0]?.id || "";

  const { data: pendientes = [], isLoading } = useQuery({
    queryKey: ["comprobantes-caja", { cajaId, estado: "pendiente" }],
    queryFn: () => obtenerComprobantesCaja({ data: { cajaId, estado: "pendiente" } }),
    enabled: Boolean(cajaId),
  });

  const egresos = useMemo(
    () => pendientes.filter((c) => c.tipo === "E" && c.editable),
    [pendientes],
  );
  const total = round2(
    egresos.filter((c) => seleccion.includes(c.id)).reduce((s, c) => s + c.total, 0),
  );

  const entrada = {
    caja_id: cajaId,
    banco_id: banco,
    tipo_id: tipoOperacion,
    numero,
    fecha,
    descripcion,
    comprobantes: seleccion,
  };

  const { data: propuesta, isFetching: calculando } = useQuery({
    queryKey: ["propuesta-reposicion", cajaId, banco, total, seleccion.join(",")],
    queryFn: () => proponerAsientoReposicion({ data: entrada }),
    enabled: Boolean(cajaId) && Boolean(banco) && seleccion.length > 0,
  });

  useEffect(() => {
    if (!propuesta || asientoTocado) return;
    setAsiento(propuesta.lineas);
  }, [propuesta, asientoTocado]);

  const reponer = useMutation({
    mutationFn: () => reponerFondoCaja({ data: { ...entrada, asiento } }),
    onSuccess: async (r) => {
      toast.success(`Fondo repuesto con el documento No. ${r.numero} por ${money(r.total)}`);
      await qc.invalidateQueries({ queryKey: ["comprobantes-caja"] });
      await qc.invalidateQueries({ queryKey: ["resumen-caja-chica"] });
      await qc.invalidateQueries({ queryKey: ["movimientos-banco"] });
      await navigate({ to: "/caja-chica", search: {} });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "No se pudo reponer el fondo"),
  });

  const intentar = () => {
    const f: string[] = [];
    if (!cajaId) f.push("la caja chica");
    if (!seleccion.length) f.push("al menos un comprobante");
    if (!banco) f.push("la cuenta bancaria del reembolso");
    if (!tipoOperacion) f.push("el tipo de operación bancaria");
    if (!numero.trim()) f.push("el número del cheque o transferencia");
    const debito = round2(asiento.reduce((s, l) => s + Math.abs(l.debito), 0));
    const credito = round2(asiento.reduce((s, l) => s + Math.abs(l.credito), 0));
    if (Math.abs(debito - credito) > 0.01) f.push("cuadrar el asiento contable");
    if (f.length) {
      toast.error(`Falta completar: ${f.join(", ")}`);
      return;
    }
    reponer.mutate();
  };

  return (
    <>
      <PageHeader
        titulo="Reposición del fondo de caja chica"
        descripcion="Selecciona los comprobantes a reembolsar y el banco desde el cual se restituye el efectivo."
        acciones={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/caja-chica" search={{}}>
                <ArrowLeft className="size-4" /> Volver
              </Link>
            </Button>
            <Button onClick={intentar} disabled={reponer.isPending}>
              <Wallet className="size-4" /> {reponer.isPending ? "Procesando…" : "Reponer fondo"}
            </Button>
          </div>
        }
      />

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Datos del reembolso</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <Label>Caja chica</Label>
              <Select
                value={cajaId}
                onValueChange={(v) => {
                  setCaja(v);
                  setSeleccion([]);
                  setAsientoTocado(false);
                }}
              >
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
              <Label>Fecha del reembolso</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <Label>Número del documento</Label>
              <Input
                value={numero}
                maxLength={5}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="Cheque o transferencia"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Cuenta bancaria</Label>
              <Select
                value={banco}
                onValueChange={(v) => {
                  setBanco(v);
                  setAsientoTocado(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona la cuenta" />
                </SelectTrigger>
                <SelectContent>
                  {(listasBanco?.bancos ?? [])
                    .filter((c) => c.activa)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre} — {c.numero_cuenta} ({c.moneda})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Tipo de operación bancaria</Label>
              <Select value={tipoOperacion} onValueChange={setTipoOperacion}>
                <SelectTrigger>
                  <SelectValue placeholder="Cheque, transferencia…" />
                </SelectTrigger>
                <SelectContent>
                  {(listasBanco?.tipos ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-4">
              <Label>Concepto</Label>
              <Textarea
                value={descripcion}
                rows={2}
                maxLength={240}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>Comprobantes pendientes de reposición</CardTitle>
            <span className="text-sm text-muted-foreground">
              Total a reembolsar <strong className="text-foreground tabular-nums">{money(total)}</strong>
            </span>
          </CardHeader>
          <CardContent>
            <Table className="min-w-[960px]" topScrollbar>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={egresos.length > 0 && egresos.every((c) => seleccion.includes(c.id))}
                      onCheckedChange={(v) => {
                        setSeleccion(v ? egresos.map((c) => c.id) : []);
                        setAsientoTocado(false);
                      }}
                      aria-label="Seleccionar todos"
                    />
                  </TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Beneficiario</TableHead>
                  <TableHead>NCF</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Cargando comprobantes…
                    </TableCell>
                  </TableRow>
                ) : egresos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      No hay comprobantes pendientes en esta caja.
                    </TableCell>
                  </TableRow>
                ) : (
                  egresos.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Checkbox
                          checked={seleccion.includes(c.id)}
                          onCheckedChange={() => {
                            setAsientoTocado(false);
                            setSeleccion((s) =>
                              s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id],
                            );
                          }}
                          aria-label={`Seleccionar comprobante ${c.id}`}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{fechaCorta(c.fecha)}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{c.beneficiario}</TableCell>
                      <TableCell className="whitespace-nowrap">{c.ncf}</TableCell>
                      <TableCell className="max-w-[260px] truncate">{c.descripcion}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{c.cuenta_gasto}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(c.total)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
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
          titulo="Asiento de la reposición"
          nota="Se debita la caja chica y se acredita la cuenta bancaria del reembolso."
        />
      </div>
    </>
  );
}
