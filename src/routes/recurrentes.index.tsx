import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, Pencil, Play, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { usePermisoPantalla } from "@/components/Sesion";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { obtenerClientes } from "@/lib/erp.functions";
import {
  cambiarEstadoRecurrente,
  eliminarRecurrente,
  emitirRecurrentes,
  obtenerRecurrentes,
} from "@/lib/recurrentes.functions";
import { ETIQUETA_FRECUENCIA, fechaCorta, money } from "@/lib/erp-types";

const TODOS = "todos";

export const Route = createFileRoute("/recurrentes/")({
  head: () => ({
    meta: [
      { title: "Facturas recurrentes — ERP Contable RD" },
      {
        name: "description",
        content:
          "Plantillas de facturación periódica: cliente, concepto, frecuencia, última y próxima emisión.",
      },
      { property: "og:title", content: "Facturas recurrentes — ERP Contable RD" },
      {
        property: "og:description",
        content: "Facturación periódica con control de vigencia y emisión por lote.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ListaRecurrentes,
});

function ListaRecurrentes() {
  const { puedeAgregar, puedeEditar, puedeEliminar } = usePermisoPantalla();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busqueda, setBusqueda] = useState("");
  const [cliente, setCliente] = useState(TODOS);
  const [estado, setEstado] = useState<"todas" | "activas" | "inactivas" | "vencidas">("todas");
  const [marcadas, setMarcadas] = useState<number[]>([]);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes", ""],
    queryFn: () => obtenerClientes({ data: { busqueda: "" } }),
  });

  const filtro = {
    estado,
    ...(busqueda ? { busqueda } : {}),
    ...(cliente !== TODOS ? { clienteId: cliente } : {}),
  };
  const { data: plantillas = [], isLoading } = useQuery({
    queryKey: ["recurrentes", filtro],
    queryFn: () => obtenerRecurrentes({ data: filtro }),
  });

  const vencidas = plantillas.filter((p) => p.vencida);

  const refrescar = async () => {
    setMarcadas([]);
    await qc.invalidateQueries({ queryKey: ["recurrentes"] });
    await qc.invalidateQueries({ queryKey: ["facturas"] });
    await qc.invalidateQueries({ queryKey: ["resumen"] });
  };

  const emitir = useMutation({
    mutationFn: (v: { ids: number[]; facturar: boolean }) => emitirRecurrentes({ data: v }),
    onSuccess: async (res) => {
      const ok = res.filter((r) => !r.error);
      const fallos = res.filter((r) => r.error);
      if (ok.length) {
        toast.success(
          ok.length === 1
            ? `Documento ${ok[0]?.ncf || ok[0]?.pedido_id} emitido`
            : `${ok.length} documentos emitidos`,
        );
      }
      for (const f of fallos) toast.error(`${f.nombre || f.plantilla_id}: ${f.error}`);
      await refrescar();
      if (ok.length === 1 && ok[0]?.pedido_id) {
        await navigate({ to: "/facturas/$id", params: { id: String(ok[0].pedido_id) } });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const estadoPlantilla = useMutation({
    mutationFn: (v: { id: number; activa: boolean }) => cambiarEstadoRecurrente({ data: v }),
    onSuccess: refrescar,
    onError: (e: Error) => toast.error(e.message),
  });

  const borrar = useMutation({
    mutationFn: (id: number) => eliminarRecurrente({ data: { id } }),
    onSuccess: async () => {
      toast.success("Plantilla eliminada");
      await refrescar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alternar = (id: number) =>
    setMarcadas((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div>
      <PageHeader
        titulo="Facturas recurrentes"
        descripcion="Plantillas que se facturan periódicamente al mismo cliente."
        acciones={
          <div className="flex gap-2">
            {puedeAgregar && marcadas.length > 0 && (
              <>
                <Button
                  variant="outline"
                  onClick={() => emitir.mutate({ ids: marcadas, facturar: false })}
                  disabled={emitir.isPending}
                >
                  Emitir como pedido
                </Button>
                <Button
                  onClick={() => emitir.mutate({ ids: marcadas, facturar: true })}
                  disabled={emitir.isPending}
                >
                  <Play className="size-4" /> Facturar {marcadas.length}
                </Button>
              </>
            )}
            {puedeAgregar && (
              <Button asChild variant={marcadas.length ? "outline" : "default"}>
                <Link to="/recurrentes/nueva">
                  <Plus className="size-4" /> Nueva plantilla
                </Link>
              </Button>
            )}
          </div>
        }
      />

      {vencidas.length > 0 && (
        <Card className="mb-4 border-warning/30 bg-warning/8">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-warning-foreground">
              <AlertTriangle className="size-4" /> {vencidas.length} plantilla
              {vencidas.length === 1 ? "" : "s"} con emisión pendiente
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-warning-foreground">
            <p>
              {vencidas
                .slice(0, 4)
                .map((p) => `${p.cliente_nombre} (${fechaCorta(p.proxima ?? "")})`)
                .join(" · ")}
              {vencidas.length > 4 ? " …" : ""}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => setMarcadas(vencidas.map((p) => p.id))}
            >
              Seleccionar todas las pendientes
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="mb-4 border-border/80 bg-muted/25">
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label htmlFor="busqueda">Buscar</Label>
            <Input
              id="busqueda"
              value={busqueda}
              placeholder="Concepto o cliente"
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <div>
            <Label>Cliente</Label>
            <SelectorBuscable
              opciones={[
                { valor: TODOS, etiqueta: "Todos" },
                ...clientes.map((c) => ({
                  valor: c.id,
                  etiqueta: `${c.id} — ${c.nombre}`,
                  detalle: c.rnc ?? "",
                })),
              ]}
              valor={cliente}
              placeholder="Todos"
              placeholderBusqueda="Escribe código, nombre o RNC…"
              vacio="Sin clientes que coincidan"
              onSeleccionar={setCliente}
            />
          </div>
          <div>
            <Label>Estado</Label>
            <Select value={estado} onValueChange={(v) => setEstado(v as typeof estado)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="activas">Activas</SelectItem>
                <SelectItem value="inactivas">Inactivas</SelectItem>
                <SelectItem value="vencidas">Con emisión pendiente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="overflow-x-auto px-0 pb-0 pt-0">
          <Table className="min-w-[1040px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[42px]" />
                <TableHead>No.</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead>Frecuencia</TableHead>
                <TableHead>Última</TableHead>
                <TableHead>Próxima</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {plantillas.map((p) => (
                <TableRow key={p.id} className={p.vencida ? "bg-warning/8" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={marcadas.includes(p.id)}
                      onCheckedChange={() => alternar(p.id)}
                      disabled={!p.activa || !p.proxima}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <Link
                      to="/recurrentes/$id"
                      params={{ id: String(p.id) }}
                      className="font-semibold text-primary hover:underline"
                    >
                      {p.id}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">{p.cliente_nombre}</TableCell>
                  <TableCell className="text-sm">{p.nombre}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    Cada {p.cada} {ETIQUETA_FRECUENCIA[p.frecuencia].toLowerCase()}
                    {p.sin_fin
                      ? ""
                      : p.fin
                        ? ` · hasta ${fechaCorta(p.fin)}`
                        : ` · ${p.emitidas}/${p.repeticiones}`}
                  </TableCell>
                  <TableCell>{p.ultima_emision ? fechaCorta(p.ultima_emision) : "—"}</TableCell>
                  <TableCell className={p.vencida ? "font-semibold text-warning-foreground" : ""}>
                    {p.proxima ? fechaCorta(p.proxima) : "Completada"}
                  </TableCell>
                  <TableCell className="tabular text-right">{money(p.total, p.moneda)}</TableCell>
                  <TableCell>
                    {p.activa ? <Badge>Activa</Badge> : <Badge variant="outline">Inactiva</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {puedeAgregar && p.activa && p.proxima && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Emitir ahora"
                          onClick={() => emitir.mutate({ ids: [p.id], facturar: true })}
                          disabled={emitir.isPending}
                        >
                          <Play className="size-4" />
                        </Button>
                      )}
                      {puedeEditar && (
                        <>
                          <Button variant="ghost" size="icon" asChild title="Editar">
                            <Link to="/recurrentes/$id" params={{ id: String(p.id) }}>
                              <Pencil className="size-4" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={p.activa ? "Desactivar" : "Activar"}
                            onClick={() =>
                              estadoPlantilla.mutate({ id: p.id, activa: !p.activa })
                            }
                          >
                            <Power className="size-4" />
                          </Button>
                        </>
                      )}
                      {puedeEliminar && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Eliminar"
                          onClick={() => {
                            if (confirm(`¿Eliminar la plantilla ${p.id}?`)) borrar.mutate(p.id);
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && plantillas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground">
                    No hay plantillas de facturación recurrente.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
