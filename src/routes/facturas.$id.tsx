import { createFileRoute, Link, useParams, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { ArrowLeft, Ban, CheckCircle2, FileText, Printer } from "lucide-react";
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
import {
  cambiarEstadoFactura,
  facturarPedido,
  obtenerEmpresa,
  obtenerFactura,
  obtenerFormatoImpresion,
} from "@/lib/erp.functions";
import {
  dop,
  enDOP,
  fechaCorta,
  money,
  papelCss,
  round2,
} from "@/lib/erp-types";

export const Route = createFileRoute("/facturas/$id")({
  validateSearch: (search: Record<string, unknown>): { imprimir?: boolean } =>
    search["imprimir"] === true || search["imprimir"] === "true" ? { imprimir: true } : {},
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
  const { imprimir } = useSearch({ from: "/facturas/$id" });
  const qc = useQueryClient();
  const idNum = Number(id);

  const { data: factura, isLoading } = useQuery({
    queryKey: ["factura", idNum],
    queryFn: () => obtenerFactura({ data: { id: idNum } }),
    enabled: Number.isFinite(idNum) && idNum > 0,
  });
  const { data: empresa } = useQuery({ queryKey: ["empresa"], queryFn: () => obtenerEmpresa() });
  // Formato de impresión del cliente (o el general si no tiene uno propio).
  const { data: formato } = useQuery({
    queryKey: ["formato", factura?.cliente_id ?? "*"],
    queryFn: () => obtenerFormatoImpresion({ data: { clienteId: factura?.cliente_id ?? "*" } }),
    enabled: Boolean(factura),
  });

  // Impresión automática cuando se llega desde "Imprimir y guardar factura".
  const yaImprimio = useRef(false);
  useEffect(() => {
    if (imprimir && factura && !yaImprimio.current) {
      yaImprimio.current = true;
      setTimeout(() => window.print(), 400);
    }
  }, [imprimir, factura]);

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

  // Convierte el pedido en factura: asigna NCF y número de factura.
  const facturar = useMutation({
    mutationFn: (opciones: { imprimir: boolean }) =>
      facturarPedido({ data: { id: idNum } }).then((f) => ({ f, ...opciones })),
    onSuccess: async ({ f, imprimir }) => {
      toast.success(`Factura ${f.ncf} guardada`);
      await qc.invalidateQueries({ queryKey: ["factura", idNum] });
      void qc.invalidateQueries({ queryKey: ["facturas"] });
      void qc.invalidateQueries({ queryKey: ["secuencias"] });
      void qc.invalidateQueries({ queryKey: ["resumen"] });
      if (imprimir) setTimeout(() => window.print(), 300);
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar la factura"),
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

  const f = formato;
  const conEncabezado = !(f?.preimpreso ?? false) && (f?.mostrar_logo ?? true);
  const verCodigo = f?.mostrar_codigo ?? true;
  const verItbisLinea = f?.mostrar_itbis_linea ?? true;
  const verEquivalente = f?.mostrar_equivalente_dop ?? true;
  const copias = Math.max(1, Math.min(4, f?.copias ?? 1));
  const cssPagina = `@page { size: ${papelCss(f?.papel ?? "carta")}; margin: ${
    f?.margen_superior ?? 12
  }mm ${f?.margen_derecho ?? 12}mm ${f?.margen_inferior ?? 12}mm ${f?.margen_izquierdo ?? 12}mm; }`;

  return (
    <div>
      <style>{cssPagina}</style>
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
          {factura.estado === "pedido" && (
            <>
              <Button
                size="sm"
                onClick={() => facturar.mutate({ imprimir: false })}
                disabled={facturar.isPending}
              >
                <FileText className="size-4" /> Guardar factura
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => facturar.mutate({ imprimir: true })}
                disabled={facturar.isPending}
              >
                <Printer className="size-4" /> Imprimir y guardar factura
              </Button>
            </>
          )}
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
            {conEncabezado ? (
              <div>
                <h1 className="text-lg font-semibold">{empresa?.nombre ?? "Mi Empresa"}</h1>
                <p className="text-sm text-muted-foreground">RNC {empresa?.rnc}</p>
                <p className="max-w-xs text-sm text-muted-foreground">{empresa?.direccion}</p>
                <p className="text-sm text-muted-foreground">
                  {empresa?.telefono} {empresa?.email ? `· ${empresa.email}` : ""}
                </p>
              </div>
            ) : (
              <div />
            )}
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {f?.titulo || "Factura de crédito fiscal / consumo"}
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
              {factura.cliente_direccion ? (
                <p className="max-w-xs text-sm text-muted-foreground">{factura.cliente_direccion}</p>
              ) : null}
              {factura.cliente_telefono ? (
                <p className="text-sm text-muted-foreground">Tel. {factura.cliente_telefono}</p>
              ) : null}
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
              <p className="text-sm">
                <span className="text-muted-foreground">Moneda: </span>
                {(factura.moneda || "DOP").toUpperCase()}
                {factura.moneda && factura.moneda.toUpperCase() !== "DOP"
                  ? ` · tasa ${factura.tasa_cambio ?? 1}`
                  : ""}
              </p>
              {factura.vendedor ? (
                <p className="text-sm">
                  <span className="text-muted-foreground">Vendedor: </span>
                  {factura.vendedor}
                </p>
              ) : null}
              {factura.almacen ? (
                <p className="text-sm">
                  <span className="text-muted-foreground">Almacén: </span>
                  {factura.almacen}
                </p>
              ) : null}
              {factura.orden_cliente ? (
                <p className="text-sm">
                  <span className="text-muted-foreground">Orden cliente: </span>
                  {factura.orden_cliente}
                </p>
              ) : null}
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                {verCodigo ? <TableHead>Código</TableHead> : null}
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                {verItbisLinea ? <TableHead className="text-right">ITBIS</TableHead> : null}
                <TableHead className="text-right">Importe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {factura.lineas.map((l, i) => (
                <TableRow key={i}>
                  {verCodigo ? (
                    <TableCell className="font-mono text-xs">{l.codigo || "—"}</TableCell>
                  ) : null}
                  <TableCell>{l.descripcion}</TableCell>
                  <TableCell className="tabular text-right">{l.cantidad}</TableCell>
                  <TableCell className="tabular text-right">{money(l.precio, factura.moneda)}</TableCell>
                  {verItbisLinea ? (
                    <TableCell className="tabular text-right">{l.tasa_itbis}%</TableCell>
                  ) : null}
                  <TableCell className="tabular text-right">{money(l.subtotal, factura.moneda)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-6 ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular">{money(factura.subtotal, factura.moneda)}</span>
            </div>
            {[...porTasa.entries()]
              .sort((a, b) => b[0] - a[0])
              .map(([tasa, v]) => (
                <div key={tasa} className="flex justify-between">
                  <span className="text-muted-foreground">
                    ITBIS {tasa}% sobre {money(v.base, factura.moneda)}
                  </span>
                  <span className="tabular">{money(v.itbis, factura.moneda)}</span>
                </div>
              ))}
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="tabular">{money(factura.total, factura.moneda)}</span>
            </div>
            {verEquivalente && factura.moneda && factura.moneda.toUpperCase() !== "DOP" ? (
              <p className="text-xs text-muted-foreground">
                Equivale a {dop(enDOP(factura.total, factura.tasa_cambio))} a la tasa{" "}
                {factura.tasa_cambio ?? 1}
              </p>
            ) : null}
            {factura.pagos &&
            factura.pagos.efectivo +
              factura.pagos.tarjeta +
              factura.pagos.cheque +
              factura.pagos.transferencia +
              factura.pagos.cardnet >
              0 ? (
              <div className="border-t pt-2 text-xs text-muted-foreground">
                {factura.pagos.efectivo > 0 && (
                  <div className="flex justify-between">
                    <span>Efectivo</span>
                    <span>{money(factura.pagos.efectivo, factura.moneda)}</span>
                  </div>
                )}
                {factura.pagos.tarjeta > 0 && (
                  <div className="flex justify-between">
                    <span>Tarjeta</span>
                    <span>{money(factura.pagos.tarjeta, factura.moneda)}</span>
                  </div>
                )}
                {factura.pagos.cheque > 0 && (
                  <div className="flex justify-between">
                    <span>Cheque</span>
                    <span>{money(factura.pagos.cheque, factura.moneda)}</span>
                  </div>
                )}
                {factura.pagos.transferencia > 0 && (
                  <div className="flex justify-between">
                    <span>Transferencia</span>
                    <span>{money(factura.pagos.transferencia, factura.moneda)}</span>
                  </div>
                )}
                {factura.pagos.cardnet > 0 && (
                  <div className="flex justify-between">
                    <span>Cardnet</span>
                    <span>{money(factura.pagos.cardnet, factura.moneda)}</span>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {factura.notas ? (
            <p className="mt-6 border-t pt-4 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Notas: </span>
              {factura.notas}
            </p>
          ) : null}
          {f?.pie ? (
            <p className="mt-6 border-t pt-4 text-center text-xs text-muted-foreground">{f.pie}</p>
          ) : null}
        </CardContent>
      </Card>

      {/* Copias adicionales: solo se ven al imprimir. */}
      {Array.from({ length: copias - 1 }).map((_, i) => (
        <div key={i} className="hidden print:block" style={{ breakBefore: "page" }}>
          <Card className="print-area mx-auto max-w-3xl">
            <CardContent className="p-8">
              <p className="mb-4 text-center text-xs uppercase tracking-wide text-muted-foreground">
                Copia {i + 2}
              </p>
              <p className="text-sm">
                {factura.cliente_nombre} · {factura.ncf} · {fechaCorta(factura.fecha)}
              </p>
              <p className="mt-2 text-base font-semibold">
                Total {money(factura.total, factura.moneda)}
              </p>
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}
