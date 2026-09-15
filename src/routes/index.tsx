import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CircleDollarSign, FileCheck2, FileText, Plus, ReceiptText } from "lucide-react";

import { PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { obtenerResumen } from "@/lib/erp.functions";
import { dop, fechaCorta } from "@/lib/erp-types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Panel de facturación — ERP Contable RD" },
      {
        name: "description",
        content:
          "Resumen mensual de ventas, ITBIS cobrado, facturas emitidas y disponibilidad de NCF.",
      },
      { property: "og:title", content: "Panel de facturación — ERP Contable RD" },
      {
        property: "og:description",
        content: "Resumen mensual de ventas, ITBIS y disponibilidad de NCF.",
      },
    ],
  }),
  component: Panel,
});

function EstadoBadge({ estado }: { estado: string }) {
  const variante =
    estado === "pagada" ? "default" : estado === "anulada" ? "destructive" : "secondary";
  return <Badge variant={variante}>{estado}</Badge>;
}

function Panel() {
  const { data, isLoading } = useQuery({
    queryKey: ["resumen"],
    queryFn: () => obtenerResumen(),
  });

  const alertas = (data?.alertasNCF ?? []).filter((a) => a.restantes <= 20);

  const indicadores = [
    { titulo: "Facturado sin ITBIS", valor: dop(data?.facturado ?? 0), icono: ReceiptText },
    { titulo: "ITBIS cobrado", valor: dop(data?.itbis ?? 0), icono: FileCheck2 },
    { titulo: "Facturas emitidas", valor: String(data?.cantidad ?? 0), icono: FileText },
    { titulo: "Pendiente de cobro", valor: dop(data?.porCobrar ?? 0), icono: CircleDollarSign },
  ];

  return (
    <div>
      <PageHeader
        titulo="Panel"
        descripcion="Resumen del mes en curso"
        acciones={
          <Button asChild>
            <Link to="/facturas/nueva">
              <Plus className="size-4" /> Nuevo pedido
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {indicadores.map((k, index) => (
          <Card key={k.titulo} className={index === 0 ? "border-primary/20" : undefined}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">
                {k.titulo}
              </CardTitle>
              <span className="flex size-8 items-center justify-center rounded-md bg-accent text-primary">
                <k.icono className="size-4" />
              </span>
            </CardHeader>
            <CardContent>
              <p className="tabular font-display text-2xl font-semibold">{isLoading ? "—" : k.valor}</p>
              <p className="mt-2 text-xs text-muted-foreground">Mes en curso</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {alertas.length > 0 && (
        <Card className="mt-6 border-warning/30 bg-warning/8">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-warning-foreground">
              <AlertTriangle className="size-4" /> Secuencias NCF por agotarse
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-warning-foreground">
            {alertas.map((a) => (
              <p key={a.tipo_ncf}>
                {a.tipo_ncf}: quedan {a.restantes} comprobantes (vence {fechaCorta(a.vence)}).
              </p>
            ))}
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link to="/ncf">Administrar secuencias</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4" /> Últimas facturas
          </CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/facturas">Ver todas</Link>
          </Button>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>NCF</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.ultimas ?? []).map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-mono text-xs">
                    <Link to="/facturas/$id" params={{ id: String(f.id) }} className="font-medium text-primary hover:underline">
                      {f.ncf}
                    </Link>
                  </TableCell>
                  <TableCell>{f.cliente_nombre}</TableCell>
                  <TableCell>{fechaCorta(f.fecha)}</TableCell>
                  <TableCell className="tabular text-right">{dop(f.total)}</TableCell>
                  <TableCell>
                    <EstadoBadge estado={f.estado} />
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && (data?.ultimas ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Aún no hay facturas emitidas.
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
