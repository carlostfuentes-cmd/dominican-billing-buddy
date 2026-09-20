import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Printer } from "lucide-react";
import { toast } from "sonner";

import { usePermisoPantalla } from "@/components/Sesion";
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
import {
  BotonFormato,
  HojaDisenada,
  usePlantillaDocumento,
} from "@/components/plantillas/HojaDocumento";
import { datosDeNotaCredito } from "@/lib/plantillas-datos";
import { obtenerEmpresa } from "@/lib/erp.functions";
import { anularNotaCredito, obtenerNotaCredito } from "@/lib/notascredito.functions";
import { dop, enDOP, fechaCorta, money, round2 } from "@/lib/erp-types";

export const Route = createFileRoute("/notas-credito/$id")({
  head: () => ({
    meta: [
      { title: "Nota de crédito — ERP Contable RD" },
      {
        name: "description",
        content: "Vista imprimible de la nota de crédito con NCF, factura de origen y desglose de ITBIS.",
      },
      { property: "og:title", content: "Nota de crédito — ERP Contable RD" },
      {
        property: "og:description",
        content: "Nota de crédito imprimible con NCF, factura afectada y desglose de ITBIS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DetalleNota,
});

function DetalleNota() {
  const { id } = useParams({ from: "/notas-credito/$id" });
  const idNum = Number(id);
  const qc = useQueryClient();
  const { puedeEliminar, puedeImprimir } = usePermisoPantalla();

  const { data: nota, isLoading } = useQuery({
    queryKey: ["nota-credito", idNum],
    queryFn: () => obtenerNotaCredito({ data: { id: idNum } }),
    enabled: Number.isFinite(idNum) && idNum > 0,
  });
  const { data: empresa } = useQuery({ queryKey: ["empresa"], queryFn: () => obtenerEmpresa() });

  const uso = usePlantillaDocumento("nota-credito", empresa?.id);

  const anular = useMutation({
    mutationFn: (motivo: string) => anularNotaCredito({ data: { id: idNum, motivo } }),
    onSuccess: () => {
      toast.success("Nota de crédito anulada");
      void qc.invalidateQueries({ queryKey: ["nota-credito", idNum] });
      void qc.invalidateQueries({ queryKey: ["notas-credito"] });
      void qc.invalidateQueries({ queryKey: ["factura-acreditable"] });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo anular la nota de crédito"),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando nota de crédito…</p>;
  if (!nota)
    return (
      <div>
        <p className="text-sm text-muted-foreground">No encontramos esa nota de crédito.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/notas-credito">Volver a notas de crédito</Link>
        </Button>
      </div>
    );

  const porTasa = new Map<number, { base: number; itbis: number }>();
  for (const l of nota.lineas) {
    const a = porTasa.get(l.tasa_itbis) ?? { base: 0, itbis: 0 };
    porTasa.set(l.tasa_itbis, {
      base: round2(a.base + l.subtotal),
      itbis: round2(a.itbis + l.itbis),
    });
  }

  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost">
          <Link to="/notas-credito">
            <ArrowLeft className="size-4" /> Notas de crédito
          </Link>
        </Button>
        <div className="flex gap-2">
          <BotonFormato uso={uso} />
          {puedeImprimir ? (
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" /> Imprimir
            </Button>
          ) : null}
          {puedeEliminar && !nota.anulada ? (
            <Button
              variant="destructive"
              disabled={anular.isPending}
              onClick={() => {
                const motivo = window.prompt(
                  "Motivo de la anulación (se registra un asiento reverso):",
                  "",
                );
                if (motivo === null) return;
                anular.mutate(motivo);
              }}
            >
              <Ban className="size-4" /> Anular
            </Button>
          ) : null}
        </div>
      </div>

      {uso.conDisenio && uso.plantilla ? (
        <>
          <style>{uso.cssPagina}</style>
          <HojaDisenada plantilla={uso.plantilla} datos={datosDeNotaCredito(nota, empresa)} />
        </>
      ) : (
      <Card className="print-area mx-auto max-w-3xl">
        <CardContent className="p-8">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
            <div>
              <h1 className="text-lg font-semibold">{empresa?.nombre ?? "Mi Empresa"}</h1>
              <p className="text-sm text-muted-foreground">RNC {empresa?.rnc}</p>
              <p className="max-w-xs text-sm text-muted-foreground">{empresa?.direccion}</p>
              <p className="text-sm text-muted-foreground">{empresa?.telefono}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Nota de crédito
              </p>
              <p className="font-mono text-xl font-semibold">{nota.ncf || nota.id}</p>
              <p className="text-sm text-muted-foreground">No. {nota.id}</p>
              {nota.anulada ? (
                <Badge className="mt-2" variant="destructive">
                  Anulada
                </Badge>
              ) : (
                <Badge className="mt-2">Aplicada</Badge>
              )}
            </div>
          </div>

          <div className="grid gap-4 py-6 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Cliente</p>
              <p className="font-medium">{nota.cliente_nombre}</p>
              <p className="text-sm text-muted-foreground">RNC/Cédula {nota.cliente_rnc}</p>
              {nota.cliente_direccion ? (
                <p className="max-w-xs text-sm text-muted-foreground">{nota.cliente_direccion}</p>
              ) : null}
            </div>
            <div className="sm:text-right">
              <p className="text-sm">
                <span className="text-muted-foreground">Fecha: </span>
                {fechaCorta(nota.fecha)}
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Factura afectada: </span>
                {nota.pedido_id ? (
                  <Link
                    to="/facturas/$id"
                    params={{ id: String(nota.pedido_id) }}
                    className="font-mono text-primary hover:underline"
                  >
                    {nota.factura_ncf || nota.factura_id}
                  </Link>
                ) : (
                  <span className="font-mono">{nota.factura_ncf || nota.factura_id || "—"}</span>
                )}
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Moneda: </span>
                {nota.moneda}
                {nota.moneda !== "DOP" ? ` · tasa ${nota.tasa_cambio}` : ""}
              </p>
              {nota.motivo ? (
                <p className="text-sm">
                  <span className="text-muted-foreground">Motivo: </span>
                  {nota.motivo}
                </p>
              ) : null}
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
              {nota.lineas.map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{l.codigo || "—"}</TableCell>
                  <TableCell>{l.descripcion}</TableCell>
                  <TableCell className="tabular text-right">{l.cantidad}</TableCell>
                  <TableCell className="tabular text-right">{money(l.precio, nota.moneda)}</TableCell>
                  <TableCell className="tabular text-right">{l.tasa_itbis}%</TableCell>
                  <TableCell className="tabular text-right">
                    {money(l.subtotal, nota.moneda)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-6 ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular">{money(nota.subtotal, nota.moneda)}</span>
            </div>
            {[...porTasa.entries()]
              .sort((a, b) => b[0] - a[0])
              .map(([tasa, v]) => (
                <div key={tasa} className="flex justify-between">
                  <span className="text-muted-foreground">
                    ITBIS {tasa}% sobre {money(v.base, nota.moneda)}
                  </span>
                  <span className="tabular">{money(v.itbis, nota.moneda)}</span>
                </div>
              ))}
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total acreditado</span>
              <span className="tabular">{money(nota.total, nota.moneda)}</span>
            </div>
            {nota.moneda !== "DOP" ? (
              <p className="text-xs text-muted-foreground">
                Equivale a {dop(enDOP(nota.total, nota.tasa_cambio))} a la tasa {nota.tasa_cambio}
              </p>
            ) : null}
          </div>

          {nota.notas ? (
            <p className="mt-6 border-t pt-4 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Notas: </span>
              {nota.notas}
            </p>
          ) : null}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
