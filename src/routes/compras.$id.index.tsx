import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Printer, Truck } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { usePermisoPantalla } from "@/components/Sesion";
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
import {
  BotonFormato,
  HojaDisenada,
  usePlantillaDocumento,
} from "@/components/plantillas/HojaDocumento";
import { datosDeOrdenCompra } from "@/lib/plantillas-datos";
import { obtenerEmpresa } from "@/lib/erp.functions";
import { anularCompra, obtenerCompra } from "@/lib/compras.functions";
import { ETIQUETA_ESTADO_COMPRA, ETIQUETA_RECEPCION, fechaCorta, money } from "@/lib/erp-types";

export const Route = createFileRoute("/compras/$id/")({
  head: () => ({
    meta: [
      { title: "Orden de compra — ERP Contable RD" },
      {
        name: "description",
        content:
          "Detalle de la orden de compra: suplidor, productos, costos, cantidades recibidas y factura del suplidor.",
      },
      { property: "og:title", content: "Orden de compra — ERP Contable RD" },
      {
        property: "og:description",
        content: "Detalle de la orden de compra con lo solicitado y lo recibido.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DetalleCompraPage,
});

function DetalleCompraPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { puedeEliminar } = usePermisoPantalla();

  const { data: orden, isLoading } = useQuery({
    queryKey: ["compra", id],
    queryFn: () => obtenerCompra({ data: { id: Number(id) } }),
  });

  const { data: empresa } = useQuery({ queryKey: ["empresa"], queryFn: () => obtenerEmpresa() });
  const uso = usePlantillaDocumento("orden-compra", empresa?.id);

  const anular = useMutation({
    mutationFn: () => anularCompra({ data: { id: Number(id) } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["compra", id] });
      await qc.invalidateQueries({ queryKey: ["compras"] });
      toast.success("Orden de compra anulada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (!orden) return <p className="text-sm text-muted-foreground">Orden de compra no encontrada.</p>;

  return (
    <div>
      <PageHeader
        titulo={`Orden de compra ${orden.id}`}
        descripcion={`${orden.suplidor} · ${fechaCorta(orden.fecha)} · ${orden.moneda}`}
        acciones={
          <div className="flex flex-wrap gap-2">
            <BotonFormato uso={uso} />
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" /> Imprimir
            </Button>
            {orden.estado !== "N" && orden.recepcion !== "completa" && (
              <Button asChild>
                <Link to="/compras/$id/recepcion" params={{ id: String(orden.id) }}>
                  <Truck className="size-4" /> Recibir mercancía
                </Link>
              </Button>
            )}
            {puedeEliminar && orden.estado !== "N" && orden.recepcion === "pendiente" && (
              <Button variant="outline" onClick={() => anular.mutate()} disabled={anular.isPending}>
                <Ban className="size-4" /> Anular
              </Button>
            )}
          </div>
        }
      />

      {uso.conDisenio && uso.plantilla ? (
        <>
          <style>{uso.cssPagina}</style>
          <HojaDisenada plantilla={uso.plantilla} datos={datosDeOrdenCompra(orden, empresa)} />
        </>
      ) : (
      <>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Datos de la orden</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Dato titulo="Suplidor" valor={`${orden.suplidor_id} — ${orden.suplidor}`} />
          <Dato titulo="RNC" valor={orden.suplidor_rnc || "—"} />
          <Dato titulo="Almacén" valor={orden.almacen || "—"} />
          <Dato titulo="Tasa de cambio" valor={String(orden.tasa_cambio)} />
          <Dato titulo="Días de crédito" valor={String(orden.dias_credito)} />
          <Dato titulo="Cotización" valor={orden.cotizacion || "—"} />
          <Dato titulo="Destino" valor={orden.destino || "—"} />
          <Dato titulo="Lugar de entrega" valor={orden.lugar || "—"} />
          <Dato titulo="Factura del suplidor" valor={orden.factura_suplidor || "—"} />
          <div>
            <p className="text-xs uppercase text-muted-foreground">Estado</p>
            <div className="mt-1 flex gap-2">
              <Badge variant="outline">{ETIQUETA_ESTADO_COMPRA[orden.estado]}</Badge>
              <Badge variant="secondary">{ETIQUETA_RECEPCION[orden.recepcion]}</Badge>
            </div>
          </div>
          {orden.uso ? (
            <div className="lg:col-span-2">
              <p className="text-xs uppercase text-muted-foreground">Uso</p>
              <p className="mt-1">{orden.uso}</p>
            </div>
          ) : null}
          {orden.notas ? (
            <div className="lg:col-span-4">
              <p className="text-xs uppercase text-muted-foreground">Observaciones</p>
              <p className="mt-1 whitespace-pre-wrap">{orden.notas}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Productos</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Solicitado</TableHead>
                  <TableHead className="text-right">Recibido</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Desc. %</TableHead>
                  <TableHead className="text-right">ITBIS</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orden.lineas.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{l.codigo}</TableCell>
                    <TableCell>{l.descripcion}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.cantidad}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.recibida}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(l.precio, orden.moneda)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{l.descuento_pct}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(l.itbis, orden.moneda)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(l.total, orden.moneda)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap justify-end gap-6 border-t px-5 py-4 text-sm tabular-nums">
            <span className="text-muted-foreground">
              Subtotal{" "}
              <strong className="text-foreground">{money(orden.subtotal, orden.moneda)}</strong>
            </span>
            <span className="text-muted-foreground">
              ITBIS <strong className="text-foreground">{money(orden.itbis, orden.moneda)}</strong>
            </span>
            <span className="text-muted-foreground">
              Total <strong className="text-foreground">{money(orden.total, orden.moneda)}</strong>
            </span>
          </div>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-muted-foreground">{titulo}</p>
      <p className="mt-1">{valor}</p>
    </div>
  );
}
