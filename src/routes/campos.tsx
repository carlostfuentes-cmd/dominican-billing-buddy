import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
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
import {
  eliminarCampoPersonalizado,
  guardarCampoPersonalizado,
  obtenerCampos,
} from "@/lib/campos.functions";
import type { ProcesoCampo, TipoCampo } from "@/lib/db/campos.server";

const PROCESOS: { id: ProcesoCampo; nombre: string }[] = [
  { id: "PEDIDOS", nombre: "Pedidos" },
  { id: "COTIZACIONES", nombre: "Cotizaciones" },
  { id: "CONDUCES", nombre: "Conduces" },
  { id: "DEVOLUCIONES", nombre: "Devoluciones" },
];

const TIPOS: TipoCampo[] = ["CARACTER", "PARRAFO", "ENTERO", "DECIMAL", "FECHA"];

export const Route = createFileRoute("/campos")({
  head: () => ({
    meta: [
      { title: "Campos personalizados — ERP Contable RD" },
      {
        name: "description",
        content:
          "Crea y asigna campos personalizados a pedidos, cotizaciones, conduces y devoluciones.",
      },
      { property: "og:title", content: "Campos personalizados — ERP Contable RD" },
      {
        property: "og:description",
        content: "Campos adicionales por proceso para tus documentos comerciales.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CamposPage,
});

function CamposPage() {
  const qc = useQueryClient();
  const [proceso, setProceso] = useState<ProcesoCampo>("PEDIDOS");
  const [editando, setEditando] = useState<number | null>(null);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoCampo>("CARACTER");
  const [longitud, setLongitud] = useState(60);
  const [decimales, setDecimales] = useState(0);

  const { data: campos = [], isLoading } = useQuery({
    queryKey: ["campos-personalizados", proceso],
    queryFn: () => obtenerCampos({ data: { proceso } }),
  });

  const limpiar = () => {
    setEditando(null);
    setNombre("");
    setTipo("CARACTER");
    setLongitud(60);
    setDecimales(0);
  };

  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ["campos-personalizados"] });
    void qc.invalidateQueries({ queryKey: ["valores-campos"] });
  };

  const guardar = useMutation({
    mutationFn: () =>
      guardarCampoPersonalizado({
        data: {
          ...(editando ? { id: editando } : {}),
          nombre,
          tipo,
          longitud,
          decimales,
          proceso,
        },
      }),
    onSuccess: () => {
      toast.success(editando ? "Campo actualizado" : "Campo creado");
      limpiar();
      refrescar();
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar el campo"),
  });

  const eliminar = useMutation({
    mutationFn: (id: number) => eliminarCampoPersonalizado({ data: { id } }),
    onSuccess: () => {
      toast.success("Campo eliminado");
      limpiar();
      refrescar();
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo eliminar el campo"),
  });

  return (
    <div>
      <PageHeader
        titulo="Campos personalizados"
        descripcion="Define campos adicionales por proceso; se llenan al trabajar cada documento."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editando ? "Cambiar campo" : "Nuevo campo"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div>
              <Label>Proceso</Label>
              <Select
                value={proceso}
                onValueChange={(v) => {
                  setProceso(v as ProcesoCampo);
                  limpiar();
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROCESOS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="nombre">Campo</Label>
              <Input
                id="nombre"
                value={nombre}
                maxLength={50}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoCampo)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="longitud">Tamaño</Label>
                <Input
                  id="longitud"
                  type="number"
                  min={0}
                  max={999}
                  value={longitud}
                  onChange={(e) => setLongitud(Number(e.target.value) || 0)}
                />
              </div>
              <div>
                <Label htmlFor="decimales">Decimales</Label>
                <Input
                  id="decimales"
                  type="number"
                  min={0}
                  max={9}
                  value={decimales}
                  onChange={(e) => setDecimales(Number(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  if (!nombre.trim()) {
                    toast.error("Indica el nombre del campo");
                    return;
                  }
                  guardar.mutate();
                }}
                disabled={guardar.isPending}
              >
                <Plus className="size-4" /> {editando ? "Guardar cambios" : "Agregar"}
              </Button>
              {editando ? (
                <Button variant="outline" onClick={limpiar}>
                  Cancelar
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Precaución: eliminar un campo personalizado o cambiar sus características puede
              afectar la información ya registrada.
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              Campos de {PROCESOS.find((p) => p.id === proceso)?.nombre}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Tamaño</TableHead>
                  <TableHead className="text-right">Dec.</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Cargando…
                    </TableCell>
                  </TableRow>
                ) : campos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Todavía no hay campos para este proceso.
                    </TableCell>
                  </TableRow>
                ) : (
                  campos.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.nombre}</TableCell>
                      <TableCell>{c.tipo}</TableCell>
                      <TableCell className="text-right tabular">{c.longitud}</TableCell>
                      <TableCell className="text-right tabular">{c.decimales}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Cambiar ${c.nombre}`}
                            onClick={() => {
                              setEditando(c.id);
                              setNombre(c.nombre);
                              setTipo(c.tipo);
                              setLongitud(c.longitud);
                              setDecimales(c.decimales);
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Eliminar ${c.nombre}`}
                            onClick={() => {
                              if (
                                confirm(
                                  `¿Eliminar el campo "${c.nombre}" y los valores registrados?`,
                                )
                              )
                                eliminar.mutate(c.id);
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
