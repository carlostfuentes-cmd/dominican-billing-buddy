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
import { guardarCliente, obtenerClientes } from "@/lib/erp.functions";
import { rncValido, TIPOS_NCF, type Cliente, type TipoNCF } from "@/lib/erp-types";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — ERP Contable RD" },
      {
        name: "description",
        content: "Registro de clientes con RNC o Cédula, tipo de comprobante y condición de pago.",
      },
      { property: "og:title", content: "Clientes — ERP Contable RD" },
      { property: "og:description", content: "Registro de clientes con RNC, NCF y crédito." },
    ],
  }),
  component: Clientes,
});

const vacio: Omit<Cliente, "id"> & { id?: string } = {
  nombre: "",
  rnc: "",
  tipo_ncf: "B02",
  telefono: "",
  email: "",
  direccion: "",
  dias_credito: 0,
  activo: true,
};

function Clientes() {
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(vacio);
  const qc = useQueryClient();

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["clientes", busqueda],
    queryFn: () => obtenerClientes({ data: { busqueda } }),
  });

  const mutar = useMutation({
    mutationFn: (c: typeof vacio) => guardarCliente({ data: c }),
    onSuccess: () => {
      toast.success("Cliente guardado");
      setAbierto(false);
      void qc.invalidateQueries({ queryKey: ["clientes"] });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar el cliente"),
  });

  const enviar = () => {
    if (form.nombre.trim().length < 2) { toast.error("Escribe el nombre o razón social"); return; }
    if (!rncValido(form.rnc)) { toast.error("RNC (9 dígitos) o Cédula (11 dígitos) inválido"); return; }
    mutar.mutate({ ...form, rnc: form.rnc.replace(/\D/g, "") });
  };

  return (
    <div>
      <PageHeader
        titulo="Clientes"
        descripcion="Datos fiscales usados al emitir comprobantes"
        acciones={
          <Button
            onClick={() => {
              setForm(vacio);
              setAbierto(true);
            }}
          >
            <Plus className="size-4" /> Nuevo cliente
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
              placeholder="Buscar por nombre o RNC"
              className="pl-9"
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre / Razón social</TableHead>
                <TableHead>RNC / Cédula</TableHead>
                <TableHead>NCF</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead className="text-right">Crédito</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientes.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nombre}</TableCell>
                  <TableCell className="font-mono text-xs">{c.rnc}</TableCell>
                  <TableCell>{c.tipo_ncf}</TableCell>
                  <TableCell>{c.telefono || "—"}</TableCell>
                  <TableCell className="tabular text-right">{c.dias_credito} días</TableCell>
                  <TableCell>
                    <Badge variant={c.activo ? "secondary" : "outline"}>
                      {c.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setForm(c);
                        setAbierto(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && clientes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Sin clientes que coincidan con la búsqueda.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="nombre">Nombre o razón social</Label>
              <Input
                id="nombre"
                value={form.nombre}
                maxLength={160}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="rnc">RNC / Cédula</Label>
              <Input
                id="rnc"
                value={form.rnc}
                maxLength={15}
                onChange={(e) => setForm({ ...form, rnc: e.target.value })}
              />
            </div>
            <div>
              <Label>Tipo de comprobante</Label>
              <Select
                value={form.tipo_ncf}
                onValueChange={(v) => setForm({ ...form, tipo_ncf: v as TipoNCF })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_NCF.map((t) => (
                    <SelectItem key={t.codigo} value={t.codigo}>
                      {t.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="tel">Teléfono</Label>
              <Input
                id="tel"
                value={form.telefono}
                maxLength={30}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="email">Correo</Label>
              <Input
                id="email"
                value={form.email}
                maxLength={160}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="dir">Dirección</Label>
              <Input
                id="dir"
                value={form.direccion}
                maxLength={240}
                onChange={(e) => setForm({ ...form, direccion: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="dias">Días de crédito</Label>
              <Input
                id="dias"
                type="number"
                min={0}
                max={365}
                value={form.dias_credito}
                onChange={(e) =>
                  setForm({ ...form, dias_credito: Math.max(0, Number(e.target.value) || 0) })
                }
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch
                id="activo"
                checked={form.activo}
                onCheckedChange={(v) => setForm({ ...form, activo: v })}
              />
              <Label htmlFor="activo">Cliente activo</Label>
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
