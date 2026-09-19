import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FileCheck2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { usePermisoPantalla } from "@/components/Sesion";
import { SelectorBuscable } from "@/components/SelectorBuscable";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { eliminarPedido, facturarPedido, obtenerClientes, obtenerFacturas } from "@/lib/erp.functions";
import {
  dop,
  money,
  fechaCorta,
  hoyISO,
  ETIQUETA_ESTADO,
  TIPOS_NCF,
  type EstadoFactura,
  type TipoNCF,
} from "@/lib/erp-types";

export const Route = createFileRoute("/facturas/")({
  head: () => ({
    meta: [
      { title: "Pedidos y facturas — ERP Contable RD" },
      {
        name: "description",
        content: "Listado de pedidos y facturas con NCF, filtros por fecha, cliente, tipo y estado.",
      },
      { property: "og:title", content: "Pedidos y facturas — ERP Contable RD" },
      {
        property: "og:description",
        content: "Listado y filtros de pedidos y facturas con NCF e ITBIS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Facturas,
});

const TODOS = "todos";

function Facturas() {
  const { puedeAgregar } = usePermisoPantalla();
  const inicioMes = `${hoyISO().slice(0, 7)}-01`;
  const [desde, setDesde] = useState(inicioMes);
  const [hasta, setHasta] = useState(hoyISO());
  const [cliente, setCliente] = useState(TODOS);
  const [tipo, setTipo] = useState(TODOS);
  const [estado, setEstado] = useState(TODOS);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes", ""],
    queryFn: () => obtenerClientes({ data: { busqueda: "" } }),
  });

  const filtro = {
    desde,
    hasta,
    ...(cliente !== TODOS ? { clienteId: cliente } : {}),
    ...(tipo !== TODOS ? { tipo: tipo as TipoNCF } : {}),
    ...(estado !== TODOS ? { estado: estado as EstadoFactura } : {}),
  };

  const { data: facturas = [], isLoading } = useQuery({
    queryKey: ["facturas", filtro],
    queryFn: () => obtenerFacturas({ data: filtro }),
  });

  const qc = useQueryClient();
  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ["facturas"] });
    void qc.invalidateQueries({ queryKey: ["secuencias"] });
    void qc.invalidateQueries({ queryKey: ["resumen"] });
  };

  const facturar = useMutation({
    mutationFn: (id: number) => facturarPedido({ data: { id } }),
    onSuccess: (f) => {
      toast.success(`Pedido convertido en factura ${f.ncf}`);
      refrescar();
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo facturar el pedido"),
  });

  const borrar = useMutation({
    mutationFn: (id: number) => eliminarPedido({ data: { id } }),
    onSuccess: () => {
      toast.success("Pedido borrado");
      refrescar();
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo borrar el pedido"),
  });

  const totalPeriodo = facturas
    .filter((f) => f.estado !== "anulada")
    .reduce((a, f) => a + f.total, 0);

  return (
    <div>
      <PageHeader
        titulo="Pedidos y facturas"
        descripcion="Los pedidos sin NCF están pendientes de facturar"
        acciones={
          puedeAgregar ? (
            <Button asChild>
              <Link to="/facturas/nueva">
                <Plus className="size-4" /> Nuevo pedido
              </Link>
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-4 border-border/80 bg-muted/25">
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label htmlFor="desde">Desde</Label>
            <Input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="hasta">Hasta</Label>
            <Input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div>
            <Label>Cliente</Label>
            <SelectorBuscable
              opciones={[
                { valor: TODOS, etiqueta: "Todos" },
                ...clientes.map((c) => ({
                  valor: String(c.id),
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
            <Label>Tipo de NCF</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {TIPOS_NCF.map((t) => (
                  <SelectItem key={t.codigo} value={t.codigo}>
                    {t.codigo}
                  </SelectItem>
                ))}
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
                <SelectItem value={TODOS}>Todos</SelectItem>
                <SelectItem value="pedido">Pedido (sin facturar)</SelectItem>
                <SelectItem value="emitida">Facturada</SelectItem>
                <SelectItem value="pagada">Pagada</SelectItem>
                <SelectItem value="anulada">Anulada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="px-0 pb-0 pt-0">
          <Table className="min-w-[1040px]">
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>NCF</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">ITBIS</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {facturas.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-mono text-xs">
                     <Link to="/facturas/$id" params={{ id: String(f.id) }} className="font-semibold text-primary hover:underline">
                      {f.id}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{f.ncf || "—"}</TableCell>
                  <TableCell className="font-medium">{f.cliente_nombre}</TableCell>
                  <TableCell>{fechaCorta(f.fecha)}</TableCell>
                  <TableCell className="text-xs">{(f.moneda || "DOP").toUpperCase()}</TableCell>
                  <TableCell>{fechaCorta(f.vencimiento)}</TableCell>
                  <TableCell className="tabular text-right">{money(f.subtotal, f.moneda)}</TableCell>
                  <TableCell className="tabular text-right">{money(f.itbis, f.moneda)}</TableCell>
                  <TableCell className="tabular text-right font-medium">{money(f.total, f.moneda)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        f.estado === "pagada"
                          ? "default"
                          : f.estado === "anulada"
                            ? "destructive"
                            : f.estado === "pedido"
                              ? "outline"
                              : "secondary"
                      }
                    >
                      {ETIQUETA_ESTADO[f.estado]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {f.estado === "pedido" && puedeAgregar && (
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={facturar.isPending}
                          onClick={() => facturar.mutate(f.id)}
                        >
                          <FileCheck2 className="size-4" /> Facturar
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" disabled={borrar.isPending}>
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Borrar el pedido {f.id}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Se eliminará el pedido de {f.cliente_nombre} por{" "}
                                {money(f.total, f.moneda)} con todas sus líneas. Esta acción no se
                                puede deshacer.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => borrar.mutate(f.id)}>
                                Borrar pedido
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && facturas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground">
                    No hay pedidos ni facturas en este período.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <p className="border-t bg-muted/35 px-5 py-4 text-right text-sm text-muted-foreground">
            Total del período (sin anuladas):{" "}
            <span className="tabular font-semibold text-foreground">{dop(totalPeriodo)}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
