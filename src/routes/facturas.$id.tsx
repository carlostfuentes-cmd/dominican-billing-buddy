import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, CheckCircle2, Printer } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cambiarEstadoFactura, obtenerEmpresa, obtenerFactura } from "@/lib/erp.functions";
import { dop, fechaCorta, round2 } from "@/lib/erp-types";

export const Route = createFileRoute("/facturas/$id")({
  head: () => ({
    meta: [
      { title: "Detalle de factura — ERP Contable RD" },
      {
        name: "description",
        content: "Vista imprimible de la factura con NCF, desglose de ITBIS y datos fiscales.",
      },
      { property: "og:title", content: "Detalle de factura — ERP Contable RD" },
      { property: "og:description", content: "Factura imprimible con NCF y desglose de ITBIS." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DetalleFactura,
});

function DetalleFactura() {
  const { id } = useParams({ from: "/facturas/$id" });
  const qc = useQueryClient();
  const idNum = Number(id);

  const { data: factura, isLoading } = useQuery({
    queryKey: ["factura", idNum],
    queryFn: () => obtenerFactura({ data: { id: idNum } }),
    enabled: Number.isFinite(idNum) && idNum > 0,
  });
  const { data: empresa } = useQuery({ queryKey: ["empresa"], queryFn: () => obtenerEmpresa() });

  const cambiar = useMutation({
    mutationFn: (estado: "pagada" | "anulada") =>
      cambiarEstadoFactura({ data: { id: idNum, estado } }),
    onSuccess: () => {
      toast.success("Factura actualizada");
      void qc.invalidateQueries({ queryKey: ["factura", idNum] });
      void qc.invalidateQueries({ queryKey: ["facturas"] });
      void qc.invalidateQueries({ queryKey: ["resumen"] });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo actualizar la factura"),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando factura…</p>;
  if (!factura)
    return (
      <div>
        <p className="text-sm text-muted-foreground">No encontramos esa factura.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/facturas">Volver a facturas</Link>
        </Button>
      </div>
    );

  const porTasa = new Map<number, { base: number; itbis: number }>();
  for (const l of factura.lineas) {
    const a = porTasa.get(l.tasa_itbis) ?? { base: 0, itbis: 0 };
    porTasa.set(l.tasa_itbis, {
      base: round2(a.base + l.subtotal),
      itbis: round2(a.itbis + l.itbis),
    });
  }

  return (
    <div>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/facturas">
            <ArrowLeft className="size-4" /> Facturas
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Imprimir / PDF
          </Button>
          {factura.estado === "emitida" && (
            <>
              <Button size="sm" onClick={() => cambiar.mutate("pagada")}>
                <CheckCircle2 className="size-4" /> Marcar pagada
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (window.confirm("¿Anular esta factura? El NCF queda registrado como anulado."))
                    cambiar.mutate("anulada");
                }}
              >
                <Ban className="size-4" /> Anular
              </Button>
            </>
          )}
        </div>
      </div>

      <Card className="print-area mx-auto max-w-3xl">
        <CardContent className="p-8">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
            <div>
              <h1 className="text-lg font-semibold">{empresa?.nombre ?? "Mi Empresa"}</h1>
              <p className="text-sm text-muted-foreground">RNC {empresa?.rnc}</p>
              <p className="max-w-xs text-sm text-muted-foreground">{empresa?.direccion}</p>
              <p className="text-sm text-muted-foreground">
                {empresa?.telefono} {empresa?.email ? `· ${empresa.email}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Factura de crédito fiscal / consumo
              </p>
              <p className="font-mono text-xl font-semibold">{factura.ncf}</p>
              <p className="text-sm text-muted-foreground">Tipo {factura.tipo_ncf}</p>
              <Badge
                className="mt-2"
                variant={
                  factura.estado === "pagada"
                    ? "default"
                    : factura.estado === "anulada"
                      ? "destructive"
                      : "secondary"
                }
              >
                {factura.estado}
              </Badge>
            </div>
          </div>

          <div className="grid gap-4 py-6 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Cliente</p>
              <p className="font-medium">{factura.cliente_nombre}</p>
              <p className="text-sm text-muted-foreground">RNC/Cédula {factura.cliente_rnc}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-sm">
                <span className="text-muted-foreground">Fecha de emisión: </span>
                {fechaCorta(factura.fecha)}
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Vencimiento: </span>
                {fechaCorta(factura.vencimiento)}
              </p>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">ITBIS</TableHead>
                <TableHead className="text-right">Importe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {factura.lineas.map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{l.codigo || "—"}</TableCell>
                  <TableCell>{l.descripcion}</TableCell>
                  <TableCell className="tabular text-right">{l.cantidad}</TableCell>
                  <TableCell className="tabular text-right">{dop(l.precio)}</TableCell>
                  <TableCell className="tabular text-right">{l.tasa_itbis}%</TableCell>
                  <TableCell className="tabular text-right">{dop(l.subtotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-6 ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular">{dop(factura.subtotal)}</span>
            </div>
            {[...porTasa.entries()]
              .sort((a, b) => b[0] - a[0])
              .map(([tasa, v]) => (
                <div key={tasa} className="flex justify-between">
                  <span className="text-muted-foreground">
                    ITBIS {tasa}% sobre {dop(v.base)}
                  </span>
                  <span className="tabular">{dop(v.itbis)}</span>
                </div>
              ))}
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="tabular">{dop(factura.total)}</span>
            </div>
          </div>

          {factura.notas ? (
            <p className="mt-6 border-t pt-4 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Notas: </span>
              {factura.notas}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
