import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Plus, Printer, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { SelectorBuscable } from "@/components/SelectorBuscable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import {
  guardarDocumentoInventario,
  obtenerListasInventario,
  obtenerProximoDocumentoInventario,
} from "@/lib/inventario.functions";
import { obtenerItems } from "@/lib/erp.functions";
import { obtenerPropuestaInventario } from "@/lib/cuentas.functions";
import { AsientoContable } from "@/components/AsientoContable";
import { dop, fechaCorta, hoyISO, round2, type LineaAsiento } from "@/lib/erp-types";

export const Route = createFileRoute("/inventario/nuevo")({
  head: () => ({
    meta: [
      { title: "Nuevo movimiento de inventario — ERP Contable RD" },
      {
        name: "description",
        content:
          "Registra documentos de entrada, salida, ajuste o transferencia con varias líneas de producto, costo, ubicación y seriales.",
      },
      { property: "og:title", content: "Nuevo movimiento de inventario — ERP Contable RD" },
      {
        property: "og:description",
        content: "Documentos de inventario con varias líneas, costo y seriales.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NuevoMovimientoInventarioPage,
});

const SIN = "sin";

type Linea = {
  producto_id: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  costo_unitario: number;
  costo_total: number;
  ubicacion: string;
  seriales: string;
};

const lineaVacia = (): Linea => ({
  producto_id: "",
  descripcion: "",
  unidad: "",
  cantidad: 1,
  costo_unitario: 0,
  costo_total: 0,
  ubicacion: "",
  seriales: "",
});

const serialesDe = (texto: string) =>
  texto
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

const cantidadLinea = (l: Linea) => {
  const n = serialesDe(l.seriales).length;
  return n > 0 ? n : l.cantidad;
};

function NuevoMovimientoInventarioPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [operacionId, setOperacionId] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [almacenId, setAlmacenId] = useState("");
  const [almacenDestinoId, setAlmacenDestinoId] = useState("");
  const [referencia, setReferencia] = useState("");
  const [departamentoId, setDepartamentoId] = useState(SIN);
  const [notas, setNotas] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()]);
  const [documentoGuardado, setDocumentoGuardado] = useState("");
  const [asiento, setAsiento] = useState<LineaAsiento[]>([]);

  const { data: listas } = useQuery({
    queryKey: ["listas-inventario"],
    queryFn: () => obtenerListasInventario(),
    staleTime: 300_000,
  });
  const { data: items = [] } = useQuery({
    queryKey: ["items", ""],
    queryFn: () => obtenerItems({ data: { busqueda: "" } }),
  });

  useEffect(() => {
    if (!listas) return;
    setAlmacenId((v) => v || (listas.almacenes[0]?.id ?? ""));
    setOperacionId((v) => v || String(listas.operaciones[0]?.id ?? ""));
  }, [listas]);

  const operacion = (listas?.operaciones ?? []).find((o) => String(o.id) === operacionId);
  const transferencia = (operacion?.adicional ?? "") !== "";

  // Número que tomará el documento al guardar (consecutivo por tipo de transacción).
  const { data: proximoDocumento = "" } = useQuery({
    queryKey: ["inventario-proximo-doc", operacionId],
    queryFn: () => obtenerProximoDocumentoInventario({ data: { operacionId: Number(operacionId) } }),
    enabled: operacionId.length > 0,
  });

  // Cuentas propuestas por la clasificación de inventario del producto.
  const lineasCosto = useMemo(
    () =>
      lineas
        .filter((l) => l.producto_id && l.costo_total > 0)
        .map((l) => ({
          producto_id: l.producto_id,
          cantidad: cantidadLinea(l),
          costo_total: round2(l.costo_total),
        })),
    [lineas],
  );

  const { data: propuesta, isFetching: calculandoAsiento } = useQuery({
    queryKey: ["propuesta-inventario", operacionId, JSON.stringify(lineasCosto)],
    queryFn: () =>
      obtenerPropuestaInventario({
        data: { operacion_id: Number(operacionId), lineas: lineasCosto },
      }),
    enabled: operacionId.length > 0 && lineasCosto.length > 0,
  });

  useEffect(() => {
    setAsiento(propuesta?.lineas ?? []);
  }, [propuesta]);

  const opcionesProductos = useMemo(
    () =>
      items.map((i) => ({
        valor: i.codigo,
        etiqueta: `${i.codigo} — ${i.descripcion}`,
        detalle: i.referencia ?? "",
      })),
    [items],
  );

  const almacenNombre = (id: string) =>
    (listas?.almacenes ?? []).find((a) => a.id === id)?.nombre ?? "";

  const actualizar = (indice: number, cambios: Partial<Linea>) =>
    setLineas((prev) => prev.map((l, i) => (i === indice ? { ...l, ...cambios } : l)));

  const elegirProducto = (indice: number, codigo: string) => {
    const item = items.find((i) => i.codigo === codigo);
    actualizar(indice, {
      producto_id: codigo,
      descripcion: item?.descripcion ?? "",
      unidad: item?.unidad ?? "",
      ...(item && item.costo ? { costo_unitario: round2(item.costo) } : {}),
    });
  };

  const cambiarCantidad = (indice: number, valor: number) => {
    const l = lineas[indice];
    if (!l) return;
    actualizar(indice, {
      cantidad: valor,
      ...(l.costo_unitario > 0 ? { costo_total: round2(valor * l.costo_unitario) } : {}),
    });
  };
  const cambiarCostoUnitario = (indice: number, valor: number) => {
    const l = lineas[indice];
    if (!l) return;
    const c = cantidadLinea(l);
    actualizar(indice, { costo_unitario: valor, costo_total: round2(valor * c) });
  };
  const cambiarCostoTotal = (indice: number, valor: number) => {
    const l = lineas[indice];
    if (!l) return;
    const c = cantidadLinea(l);
    actualizar(indice, { costo_total: valor, costo_unitario: c > 0 ? round2(valor / c) : 0 });
  };

  const totalCosto = round2(lineas.reduce((s, l) => s + l.costo_total, 0));
  const totalUnidades = round2(lineas.reduce((s, l) => s + cantidadLinea(l), 0));

  const guardar = useMutation({
    mutationFn: (_imprimir: boolean) =>
      guardarDocumentoInventario({
        data: {
          operacion_id: Number(operacionId),
          fecha,
          almacen_id: almacenId,
          ...(transferencia ? { almacen_destino_id: almacenDestinoId } : {}),
          referencia,
          ...(departamentoId !== SIN ? { departamento_id: departamentoId } : {}),
          notas,
          ...(asiento.length ? { asiento } : {}),
          lineas: lineas
            .filter((l) => l.producto_id && cantidadLinea(l) > 0)
            .map((l) => ({
              producto_id: l.producto_id,
              descripcion: l.descripcion,
              cantidad: cantidadLinea(l),
              costo_total: l.costo_total,
              costo_unitario: l.costo_unitario,
              ubicacion: l.ubicacion,
              ...(serialesDe(l.seriales).length ? { seriales: serialesDe(l.seriales) } : {}),
            })),
        },
      }),
    onSuccess: (r, imprimir) => {
      void qc.invalidateQueries({ queryKey: ["inventario-movimientos"] });
      void qc.invalidateQueries({ queryKey: ["inventario-existencias"] });
      void qc.invalidateQueries({ queryKey: ["inventario-existencia"] });
      void qc.invalidateQueries({ queryKey: ["inventario-proximo-doc"] });
      toast.success(`Documento de inventario ${r.documento} registrado`);
      setDocumentoGuardado(r.documento);
      if (imprimir) {
        setTimeout(() => {
          window.print();
          void navigate({ to: "/inventario" });
        }, 250);
      } else {
        void navigate({ to: "/inventario" });
      }
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "No se pudo registrar el movimiento"),
  });

  const validar = () => {
    if (!operacionId) {
      toast.error("Selecciona la transacción");
      return false;
    }
    if (transferencia && (!almacenDestinoId || almacenDestinoId === almacenId)) {
      toast.error("Selecciona un almacén de destino distinto al de origen");
      return false;
    }
    const validas = lineas.filter((l) => l.producto_id && cantidadLinea(l) > 0);
    if (!validas.length) {
      toast.error("Agrega al menos una línea con producto y cantidad");
      return false;
    }
    return true;
  };

  const enviar = (imprimir: boolean) => {
    if (!validar()) return;
    guardar.mutate(imprimir);
  };

  const imprimirRevision = () => {
    if (!lineas.some((l) => l.producto_id)) {
      toast.error("Agrega al menos una línea para imprimir");
      return;
    }
    window.print();
  };

  const numeroMostrado = documentoGuardado || proximoDocumento;

  return (
    <div>
      <div className="no-print">
        <PageHeader
          titulo="Nuevo documento de inventario"
          descripcion="Entradas, salidas, ajustes y transferencias con varias líneas de producto."
          acciones={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={imprimirRevision}>
                <Printer className="size-4" /> Imprimir (revisión)
              </Button>
              <Button
                variant="outline"
                onClick={() => enviar(true)}
                disabled={guardar.isPending}
              >
                <Printer className="size-4" /> Imprimir y guardar
              </Button>
              <Button onClick={() => enviar(false)} disabled={guardar.isPending}>
                <Save className="size-4" /> Guardar
              </Button>
            </div>
          }
        />
      </div>

      <div className="no-print space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Datos del documento</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label>Transacción</Label>
              <Select value={operacionId} onValueChange={setOperacionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {(listas?.operaciones ?? []).map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="documento">Documento No.</Label>
              <Input
                id="documento"
                readOnly
                value={numeroMostrado}
                className="bg-muted/40 tabular-nums"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {documentoGuardado
                  ? "Número asignado al guardar."
                  : "Consecutivo que tomará al guardar."}
              </p>
            </div>
            <div>
              <Label htmlFor="fecha">Fecha</Label>
              <Input
                id="fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>

            <div>
              <Label>{transferencia ? "Almacén de origen" : "Almacén"}</Label>
              <Select value={almacenId} onValueChange={setAlmacenId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {(listas?.almacenes ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {transferencia ? (
              <div>
                <Label>Almacén de destino</Label>
                <Select value={almacenDestinoId} onValueChange={setAlmacenDestinoId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {(listas?.almacenes ?? [])
                      .filter((a) => a.id !== almacenId)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.nombre}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div>
              <Label htmlFor="referencia">Referencia</Label>
              <Input
                id="referencia"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                maxLength={10}
              />
            </div>
            <div>
              <Label>Departamento</Label>
              <Select value={departamentoId} onValueChange={setDepartamentoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin departamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN}>Sin departamento</SelectItem>
                  {(listas?.departamentos ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>Líneas del documento</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLineas((p) => [...p, lineaVacia()])}
            >
              <Plus className="size-4" /> Agregar línea
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {lineas.map((l, i) => (
              <div key={i} className="rounded-md border p-3">
                <div className="grid gap-3 lg:grid-cols-12">
                  <div className="lg:col-span-5">
                    <Label>Producto</Label>
                    <SelectorBuscable
                      opciones={opcionesProductos}
                      valor={l.producto_id}
                      onSeleccionar={(v) => elegirProducto(i, v)}
                      placeholder="Seleccionar producto"
                      placeholderBusqueda="Escribe código o descripción…"
                    />
                    {l.descripcion ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {l.descripcion}
                        {l.unidad ? ` · ${l.unidad}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="lg:col-span-2">
                    <Label>Cantidad</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={cantidadLinea(l)}
                      readOnly={serialesDe(l.seriales).length > 0}
                      onChange={(e) => cambiarCantidad(i, Number(e.target.value))}
                      className="tabular-nums"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <Label>Costo unitario</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={l.costo_unitario}
                      onChange={(e) => cambiarCostoUnitario(i, Number(e.target.value))}
                      className="tabular-nums"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <Label>Costo total</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={l.costo_total}
                      onChange={(e) => cambiarCostoTotal(i, Number(e.target.value))}
                      className="tabular-nums"
                    />
                  </div>
                  <div className="flex items-end lg:col-span-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Quitar línea"
                      onClick={() =>
                        setLineas((p) =>
                          p.length > 1 ? p.filter((_, idx) => idx !== i) : [lineaVacia()],
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="lg:col-span-4">
                    <Label>Ubicación</Label>
                    <Input
                      value={l.ubicacion}
                      onChange={(e) => actualizar(i, { ubicacion: e.target.value })}
                      placeholder="Pasillo, tramo, estante"
                      maxLength={20}
                    />
                  </div>
                  <div className="lg:col-span-8">
                    <Label>Seriales (uno por línea)</Label>
                    <Textarea
                      rows={2}
                      value={l.seriales}
                      onChange={(e) => actualizar(i, { seriales: e.target.value })}
                      placeholder="Opcional: un serial por línea"
                    />
                    {serialesDe(l.seriales).length ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {serialesDe(l.seriales).length} seriales · la cantidad la determinan los
                        seriales
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap justify-end gap-6 border-t pt-3 text-sm">
              <span className="text-muted-foreground">
                Unidades: <span className="font-medium text-foreground tabular-nums">
                  {totalUnidades.toLocaleString("es-DO")}
                </span>
              </span>
              <span className="text-muted-foreground">
                Costo total:{" "}
                <span className="font-medium text-foreground tabular-nums">{dop(totalCosto)}</span>
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Observaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea rows={4} value={notas} onChange={(e) => setNotas(e.target.value)} />
            {transferencia ? (
              <p className="mt-2 text-xs text-muted-foreground">
                La transferencia registra la salida en el almacén de origen y la entrada en el de
                destino con el mismo número de documento.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Impresión: solo se ve al imprimir */}
      <div className="print-area hidden print:block">
        <h1 className="text-xl font-semibold">
          {operacion?.nombre ?? "Movimiento de inventario"}
        </h1>
        <p className="mt-1 text-sm">
          Documento No. {numeroMostrado || "—"} · Fecha {fechaCorta(fecha)}
          {documentoGuardado ? "" : " · BORRADOR PARA REVISIÓN"}
        </p>
        <p className="text-sm">
          {transferencia
            ? `Origen: ${almacenNombre(almacenId)} → Destino: ${almacenNombre(almacenDestinoId)}`
            : `Almacén: ${almacenNombre(almacenId)}`}
          {referencia ? ` · Referencia: ${referencia}` : ""}
        </p>
        <Table className="mt-4">
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">Costo unit.</TableHead>
              <TableHead className="text-right">Costo total</TableHead>
              <TableHead>Seriales</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineas
              .filter((l) => l.producto_id)
              .map((l, i) => (
                <TableRow key={i}>
                  <TableCell>{l.producto_id}</TableCell>
                  <TableCell>{l.descripcion}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {cantidadLinea(l).toLocaleString("es-DO")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{dop(l.costo_unitario)}</TableCell>
                  <TableCell className="text-right tabular-nums">{dop(l.costo_total)}</TableCell>
                  <TableCell className="text-xs">{serialesDe(l.seriales).join(", ")}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        <p className="mt-3 text-right text-sm font-medium">
          Unidades: {totalUnidades.toLocaleString("es-DO")} · Costo total: {dop(totalCosto)}
        </p>
        {notas ? <p className="mt-3 text-sm">Observaciones: {notas}</p> : null}
      </div>
    </div>
  );
}
