import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { guardarItem, obtenerItems } from "@/lib/erp.functions";
import { dop, type Item } from "@/lib/erp-types";

export const Route = createFileRoute("/items")({
  head: () => ({
    meta: [
      { title: "Ítems y servicios — ERP Contable RD" },
      {
        name: "description",
        content: "Catálogo de productos y servicios con precio y tasa de ITBIS aplicable.",
      },
      { property: "og:title", content: "Ítems y servicios — ERP Contable RD" },
      { property: "og:description", content: "Catálogo con precios y tasas de ITBIS." },
    ],
  }),
  component: Items,
});

const vacio: Omit<Item, "id"> & { id?: number } = {
  codigo: "",
  descripcion: "",
  unidad: "UND",
  precio: 0,
  tasa_itbis: 18,
  activo: true,
};

const ETIQUETA_TASA: Record<number, string> = {
  18: "18% (general)",
  16: "16% (reducida)",
  0: "0% (exento)",
};

function Items() {
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(vacio);
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["items", busqueda],
    queryFn: () => obtenerItems({ data: { busqueda } }),
  });

  const mutar = useMutation({
    mutationFn: (i: typeof vacio) => guardarItem({ data: i }),
    onSuccess: () => {
      toast.success("Ítem guardado");
      setAbierto(false);
      void qc.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar el ítem"),
  });

  const enviar = () => {
    if (!form.codigo.trim()) return toast.error("Escribe un código");
    if (form.descripcion.trim().length < 2) return toast.error("Escribe la descripción");
    if (form.precio < 0) return toast.error("El precio no puede ser negativo");
    mutar.mutate(form);
  };

  return (
    <div>
      <PageHeader
        titulo="Ítems"
        descripcion="Productos y servicios que se facturan"
        acciones={
          <Button
            onClick={() => {
              setForm(vacio);
              setAbierto(true);
            }}
          >
            <Plus className="size-4" /> Nuevo ítem
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <div className="relative mb-4 max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value.slice(0, 80))}
              placeholder="Buscar por código o descripción"
              className="pl-9"
            />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead>ITBIS</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.codigo}</TableCell>
                  <TableCell className="font-medium">{i.descripcion}</TableCell>
                  <TableCell>{i.unidad}</TableCell>
                  <TableCell className="tabular text-right">{dop(i.precio)}</TableCell>
                  <TableCell>{ETIQUETA_TASA[i.tasa_itbis] ?? `${i.tasa_itbis}%`}</TableCell>
                  <TableCell>
                    <Badge variant={i.activo ? "secondary" : "outline"}>
                      {i.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setForm(i);
                        setAbierto(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Sin ítems que coincidan con la búsqueda.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar ítem" : "Nuevo ítem"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="codigo">Código</Label>
              <Input
                id="codigo"
                value={form.codigo}
                maxLength={30}
                onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <Label htmlFor="unidad">Unidad</Label>
              <Input
                id="unidad"
                value={form.unidad}
                maxLength={10}
                onChange={(e) => setForm({ ...form, unidad: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="desc">Descripción</Label>
              <Input
                id="desc"
                value={form.descripcion}
                maxLength={200}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="precio">Precio (DOP)</Label>
              <Input
                id="precio"
                type="number"
                min={0}
                step="0.01"
                value={form.precio}
                onChange={(e) => setForm({ ...form, precio: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Tasa de ITBIS</Label>
              <Select
                value={String(form.tasa_itbis)}
                onValueChange={(v) => setForm({ ...form, tasa_itbis: Number(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[18, 16, 0].map((t) => (
                    <SelectItem key={t} value={String(t)}>
                      {ETIQUETA_TASA[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 pt-2 sm:col-span-2">
              <Switch
                id="item-activo"
                checked={form.activo}
                onCheckedChange={(v) => setForm({ ...form, activo: v })}
              />
              <Label htmlFor="item-activo">Ítem activo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={enviar} disabled={mutar.isPending}>
              {mutar.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
