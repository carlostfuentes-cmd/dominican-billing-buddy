import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { usePermisoPantalla } from "@/components/Sesion";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  eliminarComprobanteCaja,
  obtenerComprobantesCaja,
  obtenerListasCajaChica,
  obtenerResumenCajaChica,
} from "@/lib/cajachica.functions";
import { fechaCorta, hoyISO, money } from "@/lib/erp-types";

export const Route = createFileRoute("/caja-chica/")({
  head: () => ({
    meta: [
      { title: "Caja chica — ERP Contable RD" },
      {
        name: "description",
        content:
          "Fondo de caja chica: comprobantes de gastos con NCF, ITBIS, retenciones, cuentas contables y reposición del fondo desde el banco.",
      },
      { property: "og:title", content: "Caja chica — ERP Contable RD" },
      {
        property: "og:description",
        content: "Control del fondo, gastos menores B13, formato 606 y reposición del efectivo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CajaChicaPage,
});

const TODOS = "todos";

function CajaChicaPage() {
  const { puedeAgregar, puedeEditar, puedeEliminar } = usePermisoPantalla();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const inicioAno = `${hoyISO().slice(0, 4)}-01-01`;

  const [caja, setCaja] = useState("");
  const [desde, setDesde] = useState(inicioAno);
  const [hasta, setHasta] = useState(hoyISO());
  const [estado, setEstado] = useState("pendiente");
  const [gasto, setGasto] = useState(TODOS);
  const [busqueda, setBusqueda] = useState("");
  const [seleccion, setSeleccion] = useState<number[]>([]);

  const { data: listas } = useQuery({
    queryKey: ["listas-caja-chica"],
    queryFn: () => obtenerListasCajaChica(),
    staleTime: 300_000,
  });

  const cajas = listas?.cajas ?? [];
  const cajaId = caja || cajas[0]?.id || "";
  const cajaActual = cajas.find((c) => c.id === cajaId);

  const filtro = {
    ...(cajaId ? { cajaId } : {}),
    desde,
    hasta,
    ...(estado !== TODOS ? { estado } : {}),
    ...(gasto !== TODOS ? { gastoId: gasto } : {}),
    ...(busqueda.trim() ? { busqueda: busqueda.trim() } : {}),
  };

  const { data: comprobantes = [], isLoading } = useQuery({
    queryKey: ["comprobantes-caja", filtro],
    queryFn: () => obtenerComprobantesCaja({ data: filtro }),
    enabled: Boolean(cajaId),
  });

  const { data: resumen } = useQuery({
    queryKey: ["resumen-caja-chica", cajaId, desde, hasta],
    queryFn: () => obtenerResumenCajaChica({ data: { cajaId, desde, hasta } }),
    enabled: Boolean(cajaId),
  });

  const borrar = useMutation({
    mutationFn: (id: number) => eliminarComprobanteCaja({ data: { id } }),
    onSuccess: async () => {
      toast.success("Comprobante eliminado");
      await qc.invalidateQueries({ queryKey: ["comprobantes-caja"] });
      await qc.invalidateQueries({ queryKey: ["resumen-caja-chica"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar el comprobante"),
  });

  const pendientes = useMemo(
    () => comprobantes.filter((c) => c.editable && c.tipo === "E"),
    [comprobantes],
  );
  const totalSeleccion = comprobantes
    .filter((c) => seleccion.includes(c.id))
    .reduce((s, c) => s + c.total, 0);

  const alternar = (id: number) =>
    setSeleccion((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const exportar = () => {
    const filas = [
      [
        "Fecha",
        "RNC/Cédula",
        "Beneficiario",
        "Tipo comprobante",
        "NCF",
        "Tipo de gasto",
        "Concepto",
        "Bienes",
        "Servicios",
        "ITBIS",
        "Ret. ITBIS",
        "Ret. ISR",
        "Propina",
        "Total",
        "Reposición",
      ],
      ...comprobantes.map((c) => [
        c.fecha,
        c.rnc || c.cedula,
        c.beneficiario,
        c.ncf_tipo,
        c.ncf,
        c.gasto,
        c.descripcion,
        c.bienes,
        c.servicios,
        c.itbis,
        c.retencion_itbis,
        c.retencion_isr,
        c.propina,
        c.total,
        c.reposicion_numero,
      ]),
    ];
    const csv = filas
      .map((f) => f.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `caja-chica-606-${desde}-${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        titulo="Caja chica"
        descripcion="Fondo, comprobantes de gastos con su sustento fiscal y reposición del efectivo."
        acciones={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportar} disabled={!comprobantes.length}>
              <Download className="size-4" /> Exportar 606
            </Button>
            {puedeAgregar ? (
              <>
                <Button
                  variant="outline"
                  onClick={() =>
                    navigate({
                      to: "/caja-chica/reposicion",
                      search: {
                        caja: cajaId,
                        ...(seleccion.length ? { ids: seleccion.join(",") } : {}),
                      },
                    })
                  }
                  disabled={!cajaId}
                >
                  <Wallet className="size-4" /> Reponer fondo
                </Button>
                <Button asChild>
                  <Link to="/caja-chica/nuevo" search={{ caja: cajaId }}>
                    <Plus className="size-4" /> Nuevo comprobante
                  </Link>
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <div className="space-y-5">
        <Card>
          <CardContent className="grid gap-3 pt-6 md:grid-cols-6">
            <div className="md:col-span-2">
              <Label>Caja chica</Label>
              <Select value={cajaId} onValueChange={setCaja}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona la caja" />
                </SelectTrigger>
                <SelectContent>
                  {cajas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre} {c.activa ? "" : "(inactiva)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Desde</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div>
              <Label>Hasta</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <div>
              <Label>Estado</Label>
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendiente">Pendientes de reposición</SelectItem>
                  <SelectItem value="repuesto">Ya repuestos</SelectItem>
                  <SelectItem value="borrador">En borrador</SelectItem>
                  <SelectItem value={TODOS}>Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de gasto</Label>
              <Select value={gasto} onValueChange={setGasto}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  {(listas?.gastos ?? []).map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-6">
              <Label>Buscar</Label>
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Concepto, beneficiario, RNC, NCF o referencia"
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-4">
          <Tarjeta titulo="Fondo asignado" valor={resumen?.fondo ?? 0} />
          <Tarjeta
            titulo="Pendiente de reposición"
            valor={resumen?.pendiente ?? 0}
            nota={`${resumen?.comprobantes_pendientes ?? 0} comprobante(s)`}
          />
          <Tarjeta titulo="Efectivo disponible" valor={resumen?.disponible ?? 0} />
          <Tarjeta titulo="Repuesto en el período" valor={resumen?.repuesto ?? 0} />
        </div>

        {cajaActual ? (
          <p className="text-xs text-muted-foreground">
            Custodio y cuenta contable del fondo: {cajaActual.cuenta_contable}{" "}
            {cajaActual.cuenta_contable_nombre} · Sucursal {cajaActual.sucursal || "—"}
          </p>
        ) : null}

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>Comprobantes</CardTitle>
            {seleccion.length ? (
              <span className="text-sm text-muted-foreground">
                {seleccion.length} seleccionado(s) · {money(totalSeleccion)}
              </span>
            ) : null}
          </CardHeader>
          <CardContent>
            <Table className="min-w-[1280px]" topScrollbar>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        pendientes.length > 0 &&
                        pendientes.every((c) => seleccion.includes(c.id))
                      }
                      onCheckedChange={(v) =>
                        setSeleccion(v ? pendientes.map((c) => c.id) : [])
                      }
                      aria-label="Seleccionar todos"
                    />
                  </TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Beneficiario</TableHead>
                  <TableHead>RNC/Cédula</TableHead>
                  <TableHead>Comprobante</TableHead>
                  <TableHead>NCF</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Tipo de gasto</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead className="text-right">ITBIS</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Reposición</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={13} className="py-8 text-center text-muted-foreground">
                      Cargando comprobantes…
                    </TableCell>
                  </TableRow>
                ) : comprobantes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="py-8 text-center text-muted-foreground">
                      No hay comprobantes con estos filtros.
                    </TableCell>
                  </TableRow>
                ) : (
                  comprobantes.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        {c.editable && c.tipo === "E" ? (
                          <Checkbox
                            checked={seleccion.includes(c.id)}
                            onCheckedChange={() => alternar(c.id)}
                            aria-label={`Seleccionar comprobante ${c.id}`}
                          />
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{fechaCorta(c.fecha)}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{c.beneficiario}</TableCell>
                      <TableCell>{c.rnc || c.cedula}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-xs">
                        {c.ncf_tipo}
                        {c.gasto_menor ? " · gasto menor" : ""}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{c.ncf}</TableCell>
                      <TableCell className="max-w-[240px] truncate">{c.descripcion}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-xs">{c.gasto}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{c.cuenta_gasto}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(c.itbis)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(c.total)}</TableCell>
                      <TableCell>
                        {c.reposicion_numero ? (
                          <Badge variant="secondary">
                            No. {c.reposicion_numero} · {fechaCorta(c.reposicion_fecha)}
                          </Badge>
                        ) : c.estado === "P" ? (
                          <Badge variant="outline">Borrador</Badge>
                        ) : (
                          <Badge>Pendiente</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {c.editable && puedeEditar ? (
                            <Button variant="ghost" size="icon" asChild aria-label="Editar">
                              <Link to="/caja-chica/nuevo" search={{ caja: c.caja_id, id: c.id }}>
                                <Pencil className="size-4" />
                              </Link>
                            </Button>
                          ) : null}
                          {c.editable && puedeEliminar ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Eliminar"
                              onClick={() => {
                                if (confirm("¿Eliminar este comprobante de caja chica?"))
                                  borrar.mutate(c.id);
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Tarjeta({
  titulo,
  valor,
  nota,
}: {
  titulo: string;
  valor: number;
  nota?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs font-medium uppercase text-muted-foreground">{titulo}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">{money(valor)}</p>
        {nota ? <p className="mt-1 text-xs text-muted-foreground">{nota}</p> : null}
      </CardContent>
    </Card>
  );
}
