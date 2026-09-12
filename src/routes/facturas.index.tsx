import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/AppShell";
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
import { obtenerClientes, obtenerFacturas } from "@/lib/erp.functions";
import {
  dop,
  fechaCorta,
  hoyISO,
  TIPOS_NCF,
  type EstadoFactura,
  type TipoNCF,
} from "@/lib/erp-types";

export const Route = createFileRoute("/facturas/")({
  head: () => ({
    meta: [
      { title: "Facturas emitidas — ERP Contable RD" },
      {
        name: "description",
        content: "Listado de facturas con NCF, filtros por fecha, cliente, tipo y estado.",
      },
      { property: "og:title", content: "Facturas emitidas — ERP Contable RD" },
      { property: "og:description", content: "Listado y filtros de facturas con NCF e ITBIS." },
    ],
  }),
  component: Facturas,
});

const TODOS = "todos";

function Facturas() {
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

  const totalPeriodo = facturas
    .filter((f) => f.estado !== "anulada")
    .reduce((a, f) => a + f.total, 0);

  return (
    <div>
      <PageHeader
        titulo="Facturas"
        descripcion="Comprobantes emitidos con su NCF"
        acciones={
          <Button asChild>
            <Link to="/facturas/nueva">
              <Plus className="size-4" /> Nueva factura
            </Link>
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-5">
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
            <Select value={cliente} onValueChange={setCliente}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                <SelectItem value="emitida">Emitida</SelectItem>
                <SelectItem value="pagada">Pagada</SelectItem>
                <SelectItem value="anulada">Anulada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>NCF</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">ITBIS</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {facturas.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-mono text-xs">
                    <Link to="/facturas/$id" params={{ id: String(f.id) }} className="underline">
                      {f.ncf}
                    </Link>
                  </TableCell>
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
                            : "secondary"
                      }
                    >
                      {f.estado}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && facturas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No hay facturas en este período.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <p className="mt-4 text-right text-sm text-muted-foreground">
            Total del período (sin anuladas):{" "}
            <span className="tabular font-semibold text-foreground">{dop(totalPeriodo)}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
