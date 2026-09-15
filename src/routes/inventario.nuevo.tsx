import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  guardarMovimientoInventario,
  obtenerExistenciaProducto,
  obtenerListasInventario,
} from "@/lib/inventario.functions";
import { obtenerItems } from "@/lib/erp.functions";
import { dop, hoyISO, round2 } from "@/lib/erp-types";

export const Route = createFileRoute("/inventario/nuevo")({
  head: () => ({
    meta: [
      { title: "Nuevo movimiento de inventario — ERP Contable RD" },
      {
        name: "description",
        content:
          "Registra entradas, salidas, ajustes y transferencias entre almacenes con costo, ubicación y seriales.",
      },
      { property: "og:title", content: "Nuevo movimiento de inventario — ERP Contable RD" },
      {
        property: "og:description",
        content: "Entradas, salidas, ajustes y transferencias de almacén con costo y seriales.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NuevoMovimientoInventarioPage,
});

const SIN = "sin";

function NuevoMovimientoInventarioPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [productoId, setProductoId] = useState("");
  const [operacionId, setOperacionId] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [almacenId, setAlmacenId] = useState("");
  const [almacenDestinoId, setAlmacenDestinoId] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [documento, setDocumento] = useState("");
  const [departamentoId, setDepartamentoId] = useState(SIN);
  const [cantidad, setCantidad] = useState(0);
  const [costoTotal, setCostoTotal] = useState(0);
  const [costoUnitario, setCostoUnitario] = useState(0);
  const [seriales, setSeriales] = useState("");
  const [notas, setNotas] = useState("");

  const { data: listas } = useQuery({
    queryKey: ["listas-inventario"],
    queryFn: () => obtenerListasInventario(),
    staleTime: 300_000,
  });
  const { data: items = [] } = useQuery({
    queryKey: ["items", ""],
    queryFn: () => obtenerItems({ data: { busqueda: "" } }),
  });

  // Primer almacén y primera transacción como valores iniciales.
  useEffect(() => {
    if (!listas) return;
    setAlmacenId((v) => v || (listas.almacenes[0]?.id ?? ""));
    setOperacionId((v) => v || String(listas.operaciones[0]?.id ?? ""));
  }, [listas]);

  const operacion = (listas?.operaciones ?? []).find((o) => String(o.id) === operacionId);
  const transferencia = (operacion?.adicional ?? "") !== "";

  const { data: existencia = 0 } = useQuery({
    queryKey: ["inventario-existencia", productoId, almacenId],
    queryFn: () => obtenerExistenciaProducto({ data: { productoId, almacenId } }),
    enabled: productoId.length > 0 && almacenId.length > 0,
  });

  const opcionesProductos = useMemo(
    () =>
      items.map((i) => ({
        valor: i.codigo,
        etiqueta: `${i.codigo} — ${i.descripcion}`,
        detalle: i.referencia ?? "",
      })),
    [items],
  );
  const item = items.find((i) => i.codigo === productoId);

  const listaSeriales = seriales
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const cambiarCantidad = (valor: number) => {
    setCantidad(valor);
    if (costoUnitario > 0) setCostoTotal(round2(valor * costoUnitario));
  };
  const cambiarCostoTotal = (valor: number) => {
    setCostoTotal(valor);
    if (cantidad > 0) setCostoUnitario(round2(valor / cantidad));
  };
  const cambiarCostoUnitario = (valor: number) => {
    setCostoUnitario(valor);
    if (cantidad > 0) setCostoTotal(round2(valor * cantidad));
  };

  const guardar = useMutation({
    mutationFn: () =>
      guardarMovimientoInventario({
        data: {
          producto_id: productoId,
          operacion_id: Number(operacionId),
          fecha,
          almacen_id: almacenId,
          ...(transferencia ? { almacen_destino_id: almacenDestinoId } : {}),
          ubicacion,
          documento,
          ...(departamentoId !== SIN ? { departamento_id: departamentoId } : {}),
          cantidad: listaSeriales.length ? listaSeriales.length : cantidad,
          costo_total: costoTotal,
          costo_unitario: costoUnitario,
          ...(listaSeriales.length ? { seriales: listaSeriales } : {}),
          notas,
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["inventario-movimientos"] });
      void qc.invalidateQueries({ queryKey: ["inventario-existencias"] });
      void qc.invalidateQueries({ queryKey: ["inventario-existencia"] });
      toast.success("Movimiento de inventario registrado");
      void navigate({ to: "/inventario" });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "No se pudo registrar el movimiento"),
  });

  const enviar = () => {
    if (!productoId) {
      toast.error("Selecciona el producto");
      return;
    }
    if (!operacionId) {
      toast.error("Selecciona la transacción");
      return;
    }
    if (transferencia && (!almacenDestinoId || almacenDestinoId === almacenId)) {
      toast.error("Selecciona un almacén de destino distinto al de origen");
      return;
    }
    const total = listaSeriales.length ? listaSeriales.length : cantidad;
    if (total <= 0) {
      toast.error("Indica la cantidad");
      return;
    }
    guardar.mutate();
  };

  return (
    <div>
      <PageHeader
        titulo="Nuevo movimiento de inventario"
        descripcion="Entradas, salidas, ajustes y transferencias entre almacenes."
        acciones={
          <Button onClick={enviar} disabled={guardar.isPending}>
            <Save className="size-4" /> Guardar movimiento
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Datos del movimiento</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Producto</Label>
              <SelectorBuscable
                opciones={opcionesProductos}
                valor={productoId}
                onSeleccionar={setProductoId}
                placeholder="Seleccionar producto"
                placeholderBusqueda="Escribe código o descripción…"
              />
              {item ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.descripcion} · {item.unidad}
                </p>
              ) : null}
            </div>

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
            ) : (
              <div>
                <Label htmlFor="ubicacion">Ubicación</Label>
                <Input
                  id="ubicacion"
                  value={ubicacion}
                  onChange={(e) => setUbicacion(e.target.value)}
                  placeholder="Pasillo, tramo, estante"
                />
              </div>
            )}

            <div>
              <Label htmlFor="documento">Documento</Label>
              <Input
                id="documento"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
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

            <div>
              <Label htmlFor="cantidad">Cantidad</Label>
              <Input
                id="cantidad"
                type="number"
                step="0.0001"
                min="0"
                value={listaSeriales.length ? listaSeriales.length : cantidad}
                readOnly={listaSeriales.length > 0}
                onChange={(e) => cambiarCantidad(Number(e.target.value))}
              />
              {listaSeriales.length > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  La cantidad la determinan los seriales digitados.
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="existencia">Existencia actual</Label>
              <Input
                id="existencia"
                readOnly
                value={existencia.toLocaleString("es-DO")}
                className="bg-muted/40 tabular-nums"
              />
            </div>

            <div>
              <Label htmlFor="costo-total">Costo total</Label>
              <Input
                id="costo-total"
                type="number"
                step="0.0001"
                min="0"
                value={costoTotal}
                onChange={(e) => cambiarCostoTotal(Number(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="costo-unitario">Costo unitario</Label>
              <Input
                id="costo-unitario"
                type="number"
                step="0.0001"
                min="0"
                value={costoUnitario}
                onChange={(e) => cambiarCostoUnitario(Number(e.target.value))}
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Seriales (uno por línea)</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={6}
                value={seriales}
                onChange={(e) => setSeriales(e.target.value)}
                placeholder="Opcional: un serial por línea"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {listaSeriales.length
                  ? `${listaSeriales.length} seriales · un movimiento por unidad`
                  : "Sin seriales: se registra un solo movimiento."}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Observaciones</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea rows={5} value={notas} onChange={(e) => setNotas(e.target.value)} />
              <p className="mt-3 text-sm text-muted-foreground">
                Costo total del movimiento:{" "}
                <span className="font-medium text-foreground">{dop(costoTotal)}</span>
              </p>
              {transferencia ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  La transferencia registra la salida en el almacén de origen y la entrada en el de
                  destino.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
