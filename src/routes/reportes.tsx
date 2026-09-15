import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download } from "lucide-react";

import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { obtenerReporte } from "@/lib/erp.functions";
import { dop, hoyISO } from "@/lib/erp-types";

export const Route = createFileRoute("/reportes")({
  head: () => ({
    meta: [
      { title: "Reportes de ventas e ITBIS — ERP Contable RD" },
      {
        name: "description",
        content:
          "Ventas por período, ITBIS por tasa, ventas por cliente y exportación de ventas en CSV.",
      },
      { property: "og:title", content: "Reportes de ventas e ITBIS — ERP Contable RD" },
      { property: "og:description", content: "Ventas por período, ITBIS por tasa y export CSV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reportes,
});

function Reportes() {
  const [desde, setDesde] = useState(`${hoyISO().slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(hoyISO());

  const { data, isLoading } = useQuery({
    queryKey: ["reporte", desde, hasta],
    queryFn: () => obtenerReporte({ data: { desde, hasta } }),
  });

  const descargarCSV = () => {
    if (!data) return;
    const encabezado = "RNC/Cedula,Tipo NCF,NCF,Fecha,Monto Facturado,ITBIS Facturado,Total";
    const filas = data.filas607.map((f) =>
      [f.rnc, f.tipo_ncf, f.ncf, f.fecha, f.subtotal, f.itbis, f.total].join(","),
    );
    const csv = [encabezado, ...filas].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventas-${desde}-a-${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        titulo="Reportes"
        descripcion="Ventas e ITBIS del período seleccionado (no incluye facturas anuladas)"
        acciones={
          <Button variant="outline" onClick={descargarCSV} disabled={!data}>
            <Download className="size-4" /> Exportar ventas (CSV)
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 lg:w-1/2">
          <div>
            <Label htmlFor="desde">Desde</Label>
            <Input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="hasta">Hasta</Label>
            <Input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { t: "Ventas (sin ITBIS)", v: dop(data?.totales.subtotal ?? 0) },
          { t: "ITBIS facturado", v: dop(data?.totales.itbis ?? 0) },
          { t: "Total facturado", v: dop(data?.totales.total ?? 0) },
          { t: "Comprobantes", v: String(data?.totales.cantidad ?? 0) },
        ].map((k) => (
          <Card key={k.t}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{k.t}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="tabular text-2xl font-semibold">{isLoading ? "—" : k.v}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ITBIS por tasa</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tasa</TableHead>
                  <TableHead className="text-right">Base gravada</TableHead>
                  <TableHead className="text-right">ITBIS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.porTasa ?? []).map((t) => (
                  <TableRow key={t.tasa}>
                    <TableCell>{t.tasa}%</TableCell>
                    <TableCell className="tabular text-right">{dop(t.base)}</TableCell>
                    <TableCell className="tabular text-right">{dop(t.itbis)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ventas por tipo de NCF</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Comprobantes</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.porTipo ?? []).map((t) => (
                  <TableRow key={t.tipo_ncf}>
                    <TableCell>{t.tipo_ncf}</TableCell>
                    <TableCell className="tabular text-right">{t.cantidad}</TableCell>
                    <TableCell className="tabular text-right">{dop(t.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Ventas por cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>RNC / Cédula</TableHead>
                <TableHead className="text-right">Comprobantes</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.porCliente ?? []).map((c) => (
                <TableRow key={c.rnc}>
                  <TableCell className="font-medium">{c.cliente}</TableCell>
                  <TableCell className="font-mono text-xs">{c.rnc}</TableCell>
                  <TableCell className="tabular text-right">{c.cantidad}</TableCell>
                  <TableCell className="tabular text-right">{dop(c.total)}</TableCell>
                </TableRow>
              ))}
              {!isLoading && (data?.porCliente ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Sin ventas en el período.
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
