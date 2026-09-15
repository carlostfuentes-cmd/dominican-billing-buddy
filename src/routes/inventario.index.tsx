import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/AppShell";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  obtenerExistencias,
  obtenerListasInventario,
  obtenerMovimientosInventario,
} from "@/lib/inventario.functions";
import { obtenerItems } from "@/lib/erp.functions";
import { dop, fechaCorta, hoyISO } from "@/lib/erp-types";

export const Route = createFileRoute("/inventario/")({
  head: () => ({
    meta: [
      { title: "Inventario — ERP Contable RD" },
      {
        name: "description",
        content:
          "Existencias por almacén y movimientos de inventario: entradas, salidas, ajustes y transferencias entre almacenes.",
      },
      { property: "og:title", content: "Inventario — ERP Contable RD" },
      {
        property: "og:description",
        content: "Existencias por almacén y movimientos de entrada, salida y transferencia.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InventarioPage,
});

const TODOS = "todos";

function InventarioPage() {
  const inicioAno = `${hoyISO().slice(0, 4)}-01-01`;
  const [desde, setDesde] = useState(inicioAno);
  const [hasta, setHasta] = useState(hoyISO());
  const [producto, setProducto] = useState("");
  const [almacen, setAlmacen] = useState(TODOS);
  const [operacion, setOperacion] = useState(TODOS);

  const { data: listas } = useQuery({
    queryKey: ["listas-inventario"],
    queryFn: () => obtenerListasInventario(),
    staleTime: 300_000,
  });
  const { data: items = [] } = useQuery({
    queryKey: ["items", ""],
    queryFn: () => obtenerItems({ data: { busqueda: "" } }),
  });

  const opcionesProductos = useMemo(
    () => [
      { valor: "", etiqueta: "Todos los productos" },
      ...items.map((i) => ({
        valor: i.codigo,
        etiqueta: `${i.codigo} — ${i.descripcion}`,
        detalle: i.referencia ?? "",
      })),
    ],
    [items],
  );

  const filtro = {
    desde,
    hasta,
    ...(producto ? { productoId: producto } : {}),
    ...(almacen !== TODOS ? { almacenId: almacen } : {}),
    ...(operacion !== TODOS ? { operacionId: Number(operacion) } : {}),
  };

  const { data: movimientos = [], isLoading } = useQuery({
    queryKey: ["inventario-movimientos", filtro],
    queryFn: () => obtenerMovimientosInventario({ data: filtro }),
  });

  const filtroExistencias = {
    ...(producto ? { productoId: producto } : {}),
    ...(almacen !== TODOS ? { almacenId: almacen } : {}),
  };
  const { data: existencias = [], isLoading: cargandoExistencias } = useQuery({
    queryKey: ["inventario-existencias", filtroExistencias],
    queryFn: () => obtenerExistencias({ data: filtroExistencias }),
  });

  const valorTotal = existencias.reduce((a, e) => a + e.valor, 0);

  const filtros = (
    <div className="grid gap-3 border-b border-border/80 bg-muted/25 p-4 sm:grid-cols-2 lg:grid-cols-5">
      <div>
        <Label htmlFor="desde">Desde</Label>
        <Input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="hasta">Hasta</Label>
        <Input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
      </div>
      <div>
        <Label>Producto</Label>
        <SelectorBuscable
          opciones={opcionesProductos}
          valor={producto}
          onSeleccionar={setProducto}
          placeholder="Todos los productos"
          placeholderBusqueda="Escribe código o descripción…"
        />
      </div>
      <div>
        <Label>Almacén</Label>
        <Select value={almacen} onValueChange={setAlmacen}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos</SelectItem>
            {(listas?.almacenes ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Transacción</Label>
        <Select value={operacion} onValueChange={setOperacion}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas</SelectItem>
            {(listas?.operaciones ?? []).map((o) => (
              <SelectItem key={o.id} value={String(o.id)}>
                {o.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader
        titulo="Inventario"
        descripcion="Existencias por almacén y movimientos de entrada, salida y transferencia."
        acciones={
          <Button asChild>
            <Link to="/inventario/nuevo">
              <Plus className="size-4" /> Nuevo movimiento
            </Link>
          </Button>
        }
      />

      <Tabs defaultValue="existencias">
        <TabsList className="mb-4">
          <TabsTrigger value="existencias">Existencias</TabsTrigger>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
        </TabsList>

        <TabsContent value="existencias">
          <Card className="overflow-hidden">
            <CardContent className="px-0 pb-0 pt-0">
              {filtros}
              <p className="border-b bg-muted/30 px-5 py-3 text-sm text-muted-foreground">
                {existencias.length} líneas con existencia · Valor estimado{" "}
                <span className="font-medium text-foreground">{dop(valorTotal)}</span>
              </p>
              <div className="overflow-x-auto">
                <Table className="min-w-[860px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Almacén</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead className="text-right">Existencia</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cargandoExistencias ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                          Cargando…
                        </TableCell>
                      </TableRow>
                    ) : existencias.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                          Sin existencias para el filtro seleccionado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      existencias.map((e) => (
                        <TableRow key={`${e.producto_id}-${e.almacen_id}`}>
                          <TableCell className="font-mono text-xs">{e.producto_id}</TableCell>
                          <TableCell>{e.producto}</TableCell>
                          <TableCell>{e.almacen}</TableCell>
                          <TableCell>{e.unidad}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {e.existencia.toLocaleString("es-DO")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{dop(e.costo)}</TableCell>
                          <TableCell className="text-right tabular-nums">{dop(e.valor)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movimientos">
          <Card className="overflow-hidden">
            <CardContent className="px-0 pb-0 pt-0">
              {filtros}
              <p className="border-b bg-muted/30 px-5 py-3 text-sm text-muted-foreground">
                {movimientos.length} movimientos en el período
              </p>
              <div className="overflow-x-auto">
                <Table className="min-w-[980px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Transacción</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Almacén</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead>Serial</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Costo total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                          Cargando…
                        </TableCell>
                      </TableRow>
                    ) : movimientos.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                          Sin movimientos en el período seleccionado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      movimientos.map((m) => (
                        <TableRow key={m.id} className={m.anulado ? "opacity-50" : undefined}>
                          <TableCell>{fechaCorta(m.fecha)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge variant={m.tipo === "E" ? "success" : "secondary"}>
                                {m.tipo === "E" ? "Entrada" : "Salida"}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{m.operacion}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{m.producto_id}</TableCell>
                          <TableCell>{m.producto}</TableCell>
                          <TableCell>{m.almacen}</TableCell>
                          <TableCell>{m.documento || "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{m.serial || "—"}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {m.cantidad.toLocaleString("es-DO")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {dop(m.costo_total)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
