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
import { obtenerCompras, obtenerListasCompras } from "@/lib/compras.functions";
import {
  ETIQUETA_ESTADO_COMPRA,
  ETIQUETA_RECEPCION,
  fechaCorta,
  hoyISO,
  money,
  type EstadoOrdenCompra,
  type EstadoRecepcion,
} from "@/lib/erp-types";

export const Route = createFileRoute("/compras/")({
  head: () => ({
    meta: [
      { title: "Órdenes de compra — ERP Contable RD" },
      {
        name: "description",
        content:
          "Órdenes de compra a suplidores con control de recepción parcial o completa, moneda, tasa de cambio y factura del suplidor.",
      },
      { property: "og:title", content: "Órdenes de compra — ERP Contable RD" },
      {
        property: "og:description",
        content: "Crea órdenes de compra y controla la mercancía recibida de cada suplidor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ComprasPage,
});

const TODOS = "todos";

function ComprasPage() {
  const { puedeAgregar } = usePermisoPantalla();
  const inicioAno = `${hoyISO().slice(0, 4)}-01-01`;
  const [desde, setDesde] = useState(inicioAno);
  const [hasta, setHasta] = useState(hoyISO());
  const [suplidor, setSuplidor] = useState(TODOS);
  const [recepcion, setRecepcion] = useState(TODOS);

  const { data: listas } = useQuery({
    queryKey: ["listas-compras"],
    queryFn: () => obtenerListasCompras(),
    staleTime: 300_000,
  });

  const filtro = {
    desde,
    hasta,
    ...(suplidor !== TODOS ? { suplidorId: suplidor } : {}),
    ...(recepcion !== TODOS ? { recepcion: recepcion as EstadoRecepcion } : {}),
  };
  const { data: ordenes = [], isLoading } = useQuery({
    queryKey: ["compras", filtro],
    queryFn: () => obtenerCompras({ data: filtro }),
  });

  return (
    <div>
      <PageHeader
        titulo="Órdenes de compra"
        descripcion="Crea la orden, recibe la mercancía en almacén o en contabilidad y controla lo pendiente."
        acciones={
          puedeAgregar ? (
            <Button asChild>
              <Link to="/compras/nueva">
                <Plus className="size-4" /> Nueva orden
              </Link>
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-4 border-border/80 bg-muted/25">
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="desde">Desde</Label>
            <Input
              id="desde"
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="hasta">Hasta</Label>
            <Input
              id="hasta"
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </div>
          <div>
            <Label>Suplidor</Label>
            <SelectorBuscable
              opciones={[
                { valor: TODOS, etiqueta: "Todos" },
                ...(listas?.suplidores ?? []).map((s) => ({
                  valor: s.id,
                  etiqueta: `${s.id} — ${s.nombre}`,
                })),
              ]}
              valor={suplidor}
              placeholder="Todos"
              placeholderBusqueda="Escribe código o nombre…"
              vacio="Sin suplidores que coincidan"
              onSeleccionar={setSuplidor}
            />
          </div>
          <div>
            <Label>Recepción</Label>
            <Select value={recepcion} onValueChange={setRecepcion}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="parcial">Recibida parcial</SelectItem>
                <SelectItem value="completa">Recibida completa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="px-0 pb-0 pt-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Orden</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Suplidor</TableHead>
                  <TableHead>Almacén</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Recepción</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Factura</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={9}>Cargando…</TableCell>
                  </TableRow>
                )}
                {!isLoading && ordenes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9}>Sin órdenes de compra en el período.</TableCell>
                  </TableRow>
                )}
                {ordenes.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.id}</TableCell>
                    <TableCell>{fechaCorta(o.fecha)}</TableCell>
                    <TableCell>{o.suplidor || o.suplidor_id}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{o.almacen}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(o.total, o.moneda)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          o.recepcion === "completa"
                            ? "secondary"
                            : o.recepcion === "parcial"
                              ? "outline"
                              : "default"
                        }
                      >
                        {ETIQUETA_RECEPCION[o.recepcion]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {ETIQUETA_ESTADO_COMPRA[o.estado as EstadoOrdenCompra]}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {o.factura_suplidor || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link to="/compras/$id" params={{ id: String(o.id) }}>
                          Ver
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
