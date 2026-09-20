import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Printer } from "lucide-react";
import { toast } from "sonner";

import { CamposDocumento } from "@/components/CamposPersonalizados";
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
import { datosDeDocumento, tipoPlantillaDocumento } from "@/lib/plantillas-datos";
import { anularCotizacion, obtenerDocumento } from "@/lib/documentos.functions";
import { obtenerEmpresa, obtenerFormatoImpresion } from "@/lib/erp.functions";
import {
  DOCUMENTOS,
  dop,
  enDOP,
  fechaCorta,
  money,
  papelCss,
  round2,
  type TipoDocumento,
} from "@/lib/erp-types";

export function DocumentoDetalle({ tipo, id }: { tipo: TipoDocumento; id: string }) {
  const cfg = DOCUMENTOS[tipo];
  const idNum = Number(id);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: doc, isLoading } = useQuery({
    queryKey: ["documento", tipo, idNum],
    queryFn: () => obtenerDocumento({ data: { tipo, id: idNum } }),
    enabled: Number.isFinite(idNum) && idNum > 0,
  });
  const { data: empresa } = useQuery({ queryKey: ["empresa"], queryFn: () => obtenerEmpresa() });
  const { data: formato } = useQuery({
    queryKey: ["formato", "empresa"],
    queryFn: () => obtenerFormatoImpresion({ data: {} }),
  });

  const uso = usePlantillaDocumento(tipoPlantillaDocumento(tipo), empresa?.id);

  const anular = useMutation({
    mutationFn: () => anularCotizacion({ data: { id: idNum } }),
    onSuccess: () => {
      toast.success("Cotización anulada");
      void qc.invalidateQueries({ queryKey: ["documento", tipo, idNum] });
      void qc.invalidateQueries({ queryKey: ["documentos"] });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo anular la cotización"),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando documento…</p>;
  if (!doc)
    return (
      <div>
        <p className="text-sm text-muted-foreground">No encontramos ese documento.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to={cfg.ruta}>Volver a {cfg.plural.toLowerCase()}</Link>
        </Button>
      </div>
    );

  const porTasa = new Map<number, { base: number; itbis: number }>();
  for (const l of doc.lineas) {
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
  const cssPagina = uso.conDisenio
    ? uso.cssPagina
    : `@page { size: ${papelCss(f?.papel ?? "carta")}; margin: ${
        f?.margen_superior ?? 12
      }mm ${f?.margen_derecho ?? 12}mm ${f?.margen_inferior ?? 12}mm ${f?.margen_izquierdo ?? 12}mm; }`;

  const esDOP = doc.moneda === "DOP";

  return (
    <div>
      <style>{cssPagina}</style>

      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost">
          <Link to={cfg.ruta}>
            <ArrowLeft className="size-4" /> {cfg.plural}
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <BotonFormato uso={uso} />
          {tipo === "cotizacion" && !doc.anulado && (
            <Button variant="outline" onClick={() => anular.mutate()} disabled={anular.isPending}>
              <Ban className="size-4" /> Anular
            </Button>
          )}
          {tipo === "cotizacion" && (
            <Button variant="outline" onClick={() => void navigate({ to: "/facturas/nueva" })}>
              Convertir en pedido
            </Button>
          )}
          <Button onClick={() => window.print()}>
            <Printer className="size-4" /> Imprimir
          </Button>
        </div>
      </div>

      {uso.conDisenio && uso.plantilla ? (
        <HojaDisenada plantilla={uso.plantilla} datos={datosDeDocumento(doc, empresa)} />
      ) : (
      <Card className="print-area mx-auto max-w-3xl">
        <CardContent className="p-8">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
            {conEncabezado ? (
              <div>
                <p className="text-lg font-semibold">{empresa?.nombre || "Mi empresa"}</p>
                {empresa?.rnc ? (
                  <p className="text-xs text-muted-foreground">RNC {empresa.rnc}</p>
                ) : null}
                {empresa?.direccion ? (
                  <p className="text-xs text-muted-foreground">{empresa.direccion}</p>
                ) : null}
                {empresa?.telefono ? (
                  <p className="text-xs text-muted-foreground">Tel. {empresa.telefono}</p>
                ) : null}
              </div>
            ) : (
              <div />
            )}
            <div className="text-right">
              <p className="text-sm font-semibold uppercase tracking-wide">{cfg.titulo}</p>
              <p className="font-mono text-lg">No. {doc.id}</p>
              {doc.ncf ? <p className="font-mono text-xs">NCF {doc.ncf}</p> : null}
              <p className="text-xs text-muted-foreground">{fechaCorta(doc.fecha)}</p>
              {doc.anulado ? (
                <Badge variant="destructive" className="mt-1">
                  Anulada
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 border-b py-6 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Cliente</p>
              <p className="font-medium">{doc.cliente_nombre}</p>
              {doc.cliente_rnc ? <p className="text-xs">RNC / Cédula: {doc.cliente_rnc}</p> : null}
              {doc.cliente_direccion ? <p className="text-xs">{doc.cliente_direccion}</p> : null}
              {doc.cliente_telefono ? <p className="text-xs">Tel. {doc.cliente_telefono}</p> : null}
              {doc.contacto ? <p className="text-xs">Contacto: {doc.contacto}</p> : null}
            </div>
            <div className="text-xs">
              <p>
                <span className="text-muted-foreground">Moneda:</span> {doc.moneda}
                {!esDOP ? ` · tasa ${doc.tasa_cambio}` : ""}
              </p>
              {doc.vendedor ? (
                <p>
                  <span className="text-muted-foreground">Vendedor:</span> {doc.vendedor}
                </p>
              ) : null}
              {doc.almacen ? (
                <p>
                  <span className="text-muted-foreground">Almacén:</span> {doc.almacen}
                </p>
              ) : null}
              {doc.fecha_entrega ? (
                <p>
                  <span className="text-muted-foreground">Entrega:</span>{" "}
                  {fechaCorta(doc.fecha_entrega)}
                </p>
              ) : null}
              {doc.dias_credito ? (
                <p>
                  <span className="text-muted-foreground">Condición:</span> {doc.dias_credito} días
                </p>
              ) : null}
              {doc.pedido_id ? (
                <p>
                  <span className="text-muted-foreground">Pedido:</span> {doc.pedido_id}
                </p>
              ) : null}
              {doc.cotizacion_id ? (
                <p>
                  <span className="text-muted-foreground">Cotización:</span> {doc.cotizacion_id}
                </p>
              ) : null}
              {doc.factura_id ? (
                <p>
                  <span className="text-muted-foreground">Factura:</span> {doc.factura_id}
                </p>
              ) : null}
              {doc.motivo ? (
                <p>
                  <span className="text-muted-foreground">Motivo:</span> {doc.motivo}
                </p>
              ) : null}
              {doc.orden_cliente ? (
                <p>
                  <span className="text-muted-foreground">Orden del cliente:</span>{" "}
                  {doc.orden_cliente}
                </p>
              ) : null}
            </div>
          </div>

          <Table className="my-4">
            <TableHeader>
              <TableRow>
                {verCodigo && <TableHead>Código</TableHead>}
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Desc. %</TableHead>
                {verItbisLinea && <TableHead className="text-right">ITBIS</TableHead>}
                <TableHead className="text-right">Importe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {doc.lineas.map((l, i) => (
                <TableRow key={i}>
                  {verCodigo && <TableCell className="font-mono text-xs">{l.codigo}</TableCell>}
                  <TableCell>
                    {l.descripcion}
                    {l.observacion ? (
                      <div className="text-muted-foreground text-xs">{l.observacion}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="tabular text-right">{l.cantidad}</TableCell>
                  <TableCell className="tabular text-right">{money(l.precio, doc.moneda)}</TableCell>
                  <TableCell className="tabular text-right">{l.descuento_pct}%</TableCell>
                  {verItbisLinea && (
                    <TableCell className="tabular text-right">{money(l.itbis, doc.moneda)}</TableCell>
                  )}
                  <TableCell className="tabular text-right">{money(l.total, doc.moneda)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sub-total</span>
              <span className="tabular">{money(doc.subtotal, doc.moneda)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Descuentos</span>
              <span className="tabular">{money(doc.descuento, doc.moneda)}</span>
            </div>
            {[...porTasa.entries()].map(([tasa, v]) => (
              <div key={tasa} className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  ITBIS {tasa}% (base {money(v.base, doc.moneda)})
                </span>
                <span className="tabular">{money(v.itbis, doc.moneda)}</span>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="tabular">{money(doc.total, doc.moneda)}</span>
            </div>
            {!esDOP && verEquivalente && (
              <p className="text-right text-xs text-muted-foreground">
                Equivalente: {dop(enDOP(doc.total, doc.tasa_cambio))}
              </p>
            )}
          </div>

          <div className="mt-6 border-t pt-4">
            <CamposDocumento
              proceso={
                tipo === "cotizacion"
                  ? "COTIZACIONES"
                  : tipo === "conduce"
                    ? "CONDUCES"
                    : "DEVOLUCIONES"
              }
              referencia={String(doc.id)}
            />
          </div>
          {doc.notas ? (
            <p className="mt-4 text-xs text-muted-foreground">{doc.notas}</p>
          ) : null}
          {f?.pie ? <p className="mt-2 text-center text-xs text-muted-foreground">{f.pie}</p> : null}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
