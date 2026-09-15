import { Link } from "@tanstack/react-router";
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
import { obtenerClientes } from "@/lib/erp.functions";
import { obtenerDocumentos } from "@/lib/documentos.functions";
import { DOCUMENTOS, dop, fechaCorta, hoyISO, money, type TipoDocumento } from "@/lib/erp-types";

const TODOS = "todos";

export function DocumentoLista({ tipo }: { tipo: TipoDocumento }) {
  const cfg = DOCUMENTOS[tipo];
  const inicioAno = `${hoyISO().slice(0, 4)}-01-01`;
  const [desde, setDesde] = useState(inicioAno);
  const [hasta, setHasta] = useState(hoyISO());
  const [cliente, setCliente] = useState(TODOS);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes", ""],
    queryFn: () => obtenerClientes({ data: { busqueda: "" } }),
  });

  const filtro = {
    tipo,
    desde,
    hasta,
    ...(cliente !== TODOS ? { clienteId: cliente } : {}),
  };

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["documentos", filtro],
    queryFn: () => obtenerDocumentos({ data: filtro }),
  });

  const total = docs.filter((d) => !d.anulado).reduce((a, d) => a + d.total * (d.tasa_cambio || 1), 0);

  return (
    <div>
      <PageHeader
        titulo={cfg.plural}
        descripcion={cfg.descripcion}
        acciones={
          <Button asChild>
            <Link to={cfg.rutaNueva}>
              <Plus className="size-4" /> {cfg.nuevo}
            </Link>
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-3">
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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <Table className="min-w-[880px]">
            <TableHeader>
              <TableRow>
                <TableHead>No.</TableHead>
                {tipo === "devolucion" && <TableHead>NCF</TableHead>}
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha</TableHead>
                {tipo === "conduce" && <TableHead>Entrega</TableHead>}
                <TableHead>Referencia</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">ITBIS</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs">
                    <Link to={cfg.rutaDetalle} params={{ id: String(d.id) }} className="underline">
                      {d.id}
                    </Link>
                  </TableCell>
                  {tipo === "devolucion" && (
                    <TableCell className="font-mono text-xs">{d.ncf || "—"}</TableCell>
                  )}
                  <TableCell className="font-medium">{d.cliente_nombre}</TableCell>
                  <TableCell>{fechaCorta(d.fecha)}</TableCell>
                  {tipo === "conduce" && (
                    <TableCell>{d.fecha_entrega ? fechaCorta(d.fecha_entrega) : "—"}</TableCell>
                  )}
                  <TableCell className="text-xs text-muted-foreground">
                    {tipo === "devolucion"
                      ? d.factura_id
                        ? `Factura ${d.factura_id}`
                        : "—"
                      : tipo === "conduce"
                        ? d.pedido_id
                          ? `Pedido ${d.pedido_id}`
                          : d.cotizacion_id
                            ? `Cotización ${d.cotizacion_id}`
                            : "—"
                        : d.orden_cliente || "—"}
                  </TableCell>
                  <TableCell className="text-xs">{d.moneda}</TableCell>
                  <TableCell className="tabular text-right">{money(d.subtotal, d.moneda)}</TableCell>
                  <TableCell className="tabular text-right">{money(d.itbis, d.moneda)}</TableCell>
                  <TableCell className="tabular text-right font-medium">
                    {money(d.total, d.moneda)}
                  </TableCell>
                  <TableCell>
                    {d.anulado ? (
                      <Badge variant="destructive">Anulada</Badge>
                    ) : d.aplicada ? (
                      <Badge>{tipo === "conduce" ? "Entregado" : "Aplicada"}</Badge>
                    ) : (
                      <Badge variant="outline">Abierto</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && docs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground">
                    No hay documentos en este período.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <p className="mt-4 text-right text-sm text-muted-foreground">
            Total del período en pesos:{" "}
            <span className="tabular font-semibold text-foreground">{dop(total)}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
