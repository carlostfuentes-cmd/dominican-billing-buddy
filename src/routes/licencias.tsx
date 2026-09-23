import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Download, KeyRound, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EstadoLicencia, Licencia } from "@/lib/db/licencias.server";
import {
  cambiarEstadoLicenciaCliente,
  guardarLicenciaCliente,
  obtenerEventosLicencia,
  obtenerLicencias,
  renovarLicenciaCliente,
} from "@/lib/licencias.functions";
import { fechaCorta, hoyISO } from "@/lib/erp-types";

export const Route = createFileRoute("/licencias")({
  head: () => ({
    meta: [
      { title: "Licenciamiento de clientes — BP Dominicana" },
      {
        name: "description",
        content:
          "Panel interno de BP Dominicana: altas, planes, vencimientos y suspensión de licencias.",
      },
      { property: "og:title", content: "Licenciamiento de clientes — BP Dominicana" },
      {
        property: "og:description",
        content: "Control central de licencias, planes y vencimientos de los clientes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PanelLicencias,
});

type Form = {
  id?: number;
  cliente: string;
  rnc: string;
  contacto: string;
  modalidad: "cloud" | "local";
  plan: string;
  usuarios: number;
  vence: string;
  estado: EstadoLicencia;
  notas: string;
};

const vacio = (): Form => ({
  cliente: "",
  rnc: "",
  contacto: "",
  modalidad: "cloud",
  plan: "BASICO",
  usuarios: 5,
  vence: hoyISO(),
  estado: "A",
  notas: "",
});

const ESTADOS: { id: EstadoLicencia; nombre: string }[] = [
  { id: "A", nombre: "Activa" },
  { id: "S", nombre: "Suspendida" },
  { id: "V", nombre: "Vencida" },
  { id: "C", nombre: "Cancelada" },
];

function PanelLicencias() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(vacio());
  const [abierto, setAbierto] = useState(false);
  const [detalle, setDetalle] = useState<number | null>(null);

  const { data: licencias = [], isPending } = useQuery({
    queryKey: ["licencias"],
    queryFn: () => obtenerLicencias(),
  });

  const { data: eventos = [] } = useQuery({
    queryKey: ["licencia-eventos", detalle],
    queryFn: () => obtenerEventosLicencia({ data: { id: detalle ?? 0 } }),
    enabled: !!detalle,
  });

  const refrescar = () => void qc.invalidateQueries({ queryKey: ["licencias"] });

  const guardar = useMutation({
    mutationFn: () => guardarLicenciaCliente({ data: form }),
    onSuccess: (r) => {
      toast.success(`Licencia guardada. Clave: ${r.clave}`);
      setAbierto(false);
      setForm(vacio());
      refrescar();
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar"),
  });

  const cambiar = useMutation({
    mutationFn: (d: { id: number; estado: EstadoLicencia }) =>
      cambiarEstadoLicenciaCliente({ data: { ...d, detalle: "Cambio desde el panel" } }),
    onSuccess: () => {
      toast.success("Estado actualizado");
      refrescar();
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo cambiar el estado"),
  });

  const renovar = useMutation({
    mutationFn: (d: { id: number; vence: string }) => renovarLicenciaCliente({ data: d }),
    onSuccess: () => {
      toast.success("Licencia renovada");
      refrescar();
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo renovar"),
  });

  const editar = (l: Licencia) => {
    setForm({
      id: l.id,
      cliente: l.cliente,
      rnc: l.rnc,
      contacto: l.contacto,
      modalidad: l.modalidad,
      plan: l.plan,
      usuarios: l.usuarios,
      vence: l.vence,
      estado: l.estado,
      notas: l.notas,
    });
    setAbierto(true);
  };

  return (
    <div>
      <PageHeader
        titulo="Licenciamiento de clientes"
        descripcion="Control central de BP Dominicana: planes, usuarios y vencimientos"
        acciones={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href="/descargas/instalacion-local-README.md" download>
                <Download className="size-4" />
                Guía de instalación local
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href="/descargas/instalacion-local.env.txt" download>
                <Download className="size-4" />
                Archivo de configuración
              </a>
            </Button>
            <Button
              onClick={() => {
                setForm(vacio());
                setAbierto((v) => !v);
              }}
            >
              <Plus className="size-4" />
              Nueva licencia
            </Button>
          </div>
        }

      />

      {abierto ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="font-display text-base">
              {form.id ? "Editar licencia" : "Nueva licencia"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Cliente</Label>
              <Input
                value={form.cliente}
                onChange={(e) => setForm({ ...form, cliente: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>RNC</Label>
              <Input value={form.rnc} onChange={(e) => setForm({ ...form, rnc: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Contacto</Label>
              <Input
                value={form.contacto}
                onChange={(e) => setForm({ ...form, contacto: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Modalidad</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.modalidad}
                onChange={(e) =>
                  setForm({ ...form, modalidad: e.target.value === "local" ? "local" : "cloud" })
                }
              >
                <option value="cloud">Nube BP Dominicana</option>
                <option value="local">Instalación local del cliente</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <Input
                value={form.plan}
                onChange={(e) => setForm({ ...form, plan: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Usuarios permitidos</Label>
              <Input
                type="number"
                min={1}
                value={form.usuarios}
                onChange={(e) => setForm({ ...form, usuarios: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Vence</Label>
              <Input
                type="date"
                value={form.vence}
                onChange={(e) => setForm({ ...form, vence: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: e.target.value as EstadoLicencia })}
              >
                {ESTADOS.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2 xl:col-span-3">
              <Label>Notas</Label>
              <Input
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>
                Guardar
              </Button>
              <Button variant="ghost" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isPending ? (
        <p className="text-sm text-muted-foreground">Cargando licencias…</p>
      ) : licencias.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay licencias registradas. Crea la primera con “Nueva licencia”.
        </p>
      ) : (
        <Table className="min-w-[1050px]">
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Clave</TableHead>
              <TableHead>Modalidad</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">Usuarios</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Último contacto</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {licencias.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.cliente}</TableCell>
                <TableCell className="font-mono text-xs">{l.clave}</TableCell>
                <TableCell>{l.modalidad === "local" ? "Local" : "Nube"}</TableCell>
                <TableCell>{l.plan}</TableCell>
                <TableCell className="text-right">
                  {l.usuarios_reportados ?? 0} / {l.usuarios}
                </TableCell>
                <TableCell>{l.vence ? fechaCorta(l.vence) : "—"}</TableCell>
                <TableCell>{l.estado_nombre}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {l.ultimo_contacto ? l.ultimo_contacto.slice(0, 16).replace("T", " ") : "Nunca"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => editar(l)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const fecha = window.prompt("Nuevo vencimiento (AAAA-MM-DD)", l.vence);
                        if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha))
                          renovar.mutate({ id: l.id, vence: fecha });
                      }}
                    >
                      Renovar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        cambiar.mutate({ id: l.id, estado: l.estado === "A" ? "S" : "A" })
                      }
                    >
                      {l.estado === "A" ? "Suspender" : "Activar"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDetalle(l.id)}>
                      Historial
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {detalle ? (
        <Card className="mt-6">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <KeyRound className="size-4" />
              Historial de la licencia
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setDetalle(null)}>
              Cerrar
            </Button>
          </CardHeader>
          <CardContent>
            {eventos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin movimientos registrados.</p>
            ) : (
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Acción</TableHead>
                    <TableHead>Detalle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eventos.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{e.fecha.slice(0, 16).replace("T", " ")}</TableCell>
                      <TableCell>{e.usuario}</TableCell>
                      <TableCell>{e.accion}</TableCell>
                      <TableCell className="text-muted-foreground">{e.detalle}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
