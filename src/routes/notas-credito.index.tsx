import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/AppShell";
import { usePermisoPantalla } from "@/components/Sesion";
import { SelectorBuscable } from "@/components/SelectorBuscable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { obtenerClientes } from "@/lib/erp.functions";
import { obtenerNotasCredito } from "@/lib/notascredito.functions";
import { dop, fechaCorta, hoyISO, money } from "@/lib/erp-types";

const TODOS = "todos";

export const Route = createFileRoute("/notas-credito/")({
  head: () => ({
    meta: [
      { title: "Notas de crédito — ERP Contable RD" },
      {
        name: "description",
        content:
          "Notas de crédito fiscales (NCF B04) emitidas sobre facturas, con motivo DGII, disponible y estado.",
      },
      { property: "og:title", content: "Notas de crédito — ERP Contable RD" },
      {
        property: "og:description",
        content: "Notas de crédito fiscales sobre facturas con motivo DGII y control de disponible.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ListaNotas,
});

function ListaNotas() {
  const { puedeAgregar } = usePermisoPantalla();
  const [desde, setDesde] = useState(`${hoyISO().slice(0, 4)}-01-01`);
  const [hasta, setHasta] = useState(hoyISO());
  const [cliente, setCliente] = useState(TODOS);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes", ""],
    queryFn: () => obtenerClientes({ data: { busqueda: "" } }),
  });

  const filtro = { desde, hasta, ...(cliente !== TODOS ? { clienteId: cliente } : {}) };
  const { data: notas = [], isLoading } = useQuery({
    queryKey: ["notas-credito", filtro],
    queryFn: () => obtenerNotasCredito({ data: filtro }),
  });

  const total = notas
    .filter((n) => !n.anulada)
    .reduce((a, n) => a + n.total * (n.tasa_cambio || 1), 0);

  return (
    <div>
      <PageHeader
        titulo="Notas de crédito"
        descripcion="Documento fiscal (NCF B04) que rebaja o anula una factura emitida."
        acciones={
          puedeAgregar ? (
            <Button asChild>
              <Link to="/notas-credito/nueva">
                <Plus className="size-4" /> Nueva nota de crédito
              </Link>
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-4 border-border/80 bg-muted/25">
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-3">
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
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="overflow-x-auto px-0 pb-0 pt-0">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>No.</TableHead>
                <TableHead>NCF</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Factura</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead className="text-right">ITBIS</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notas.map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="font-mono text-xs">
                    <Link
                      to="/notas-credito/$id"
                      params={{ id: String(n.id) }}
                      className="font-semibold text-primary hover:underline"
                    >
                      {n.id}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{n.ncf || "—"}</TableCell>
                  <TableCell className="font-medium">{n.cliente_nombre}</TableCell>
                  <TableCell>{fechaCorta(n.fecha)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {n.pedido_id ? (
                      <Link
                        to="/facturas/$id"
                        params={{ id: String(n.pedido_id) }}
                        className="text-primary hover:underline"
                      >
                        {n.factura_ncf || n.factura_id}
                      </Link>
                    ) : (
                      n.factura_ncf || n.factura_id || "—"
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{n.motivo || "—"}</TableCell>
                  <TableCell className="text-xs">{n.moneda}</TableCell>
                  <TableCell className="tabular text-right">{money(n.itbis, n.moneda)}</TableCell>
                  <TableCell className="tabular text-right font-medium">
                    {money(n.total, n.moneda)}
                  </TableCell>
                  <TableCell>
                    {n.anulada ? (
                      <Badge variant="destructive">Anulada</Badge>
                    ) : (
                      <Badge>Aplicada</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && notas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground">
                    No hay notas de crédito en este período.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <p className="border-t bg-muted/35 px-5 py-4 text-right text-sm text-muted-foreground">
            Total acreditado del período en pesos:{" "}
            <span className="tabular font-semibold text-foreground">{dop(total)}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
