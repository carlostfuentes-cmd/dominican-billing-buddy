import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { KeyRound, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  cambiarMiClave,
  guardarUsuarioSistema,
  obtenerPerfiles,
  obtenerUsuarios,
} from "@/lib/usuarios.functions";
import type { Usuario } from "@/lib/db/usuarios.server";

export const Route = createFileRoute("/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuarios del sistema — ERP Contable RD" },
      {
        name: "description",
        content:
          "Crea usuarios, asígnales un perfil y controla su acceso al ERP contable dominicano.",
      },
      { property: "og:title", content: "Usuarios del sistema — ERP Contable RD" },
      {
        property: "og:description",
        content: "Alta de usuarios, perfiles asignados y claves de acceso.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsuariosPage,
});

const vacio = {
  id: undefined as number | undefined,
  login: "",
  nombre: "",
  apellido: "",
  email: "",
  perfil_id: 0,
  activo: true,
  supervisor: false,
  descuento_maximo: 0,
  clave: "",
};

function UsuariosPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...vacio });
  const [claveActual, setClaveActual] = useState("");
  const [claveNueva, setClaveNueva] = useState("");

  const usuarios = useQuery({ queryKey: ["usuarios"], queryFn: () => obtenerUsuarios() });
  const perfiles = useQuery({ queryKey: ["perfiles"], queryFn: () => obtenerPerfiles() });

  const guardar = useMutation({
    mutationFn: () =>
      guardarUsuarioSistema({
        data: {
          id: form.id,
          login: form.login,
          nombre: form.nombre,
          apellido: form.apellido,
          email: form.email || undefined,
          perfil_id: form.perfil_id,
          activo: form.activo,
          supervisor: form.supervisor,
          descuento_maximo: form.descuento_maximo,
          clave: form.clave || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Usuario guardado");
      setForm({ ...vacio });
      qc.invalidateQueries({ queryKey: ["usuarios"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const miClave = useMutation({
    mutationFn: () => cambiarMiClave({ data: { actual: claveActual, nueva: claveNueva } }),
    onSuccess: () => {
      toast.success("Clave actualizada");
      setClaveActual("");
      setClaveNueva("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editar = (u: Usuario) =>
    setForm({
      id: u.id,
      login: u.login,
      nombre: u.nombre,
      apellido: u.apellido,
      email: u.email ?? "",
      perfil_id: u.perfil_id ?? 0,
      activo: u.activo,
      supervisor: u.supervisor,
      descuento_maximo: u.descuento_maximo,
      clave: "",
    });

  return (
    <div>
      <PageHeader
        titulo="Usuarios"
        descripcion="Cada usuario entra con su clave del sistema y trabaja con los permisos de su perfil."
        acciones={
          form.id ? (
            <Button variant="outline" onClick={() => setForm({ ...vacio })}>
              <Plus className="size-4" />
              Nuevo usuario
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Usuarios registrados</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Último acceso</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(usuarios.data ?? []).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.login}</TableCell>
                    <TableCell>{`${u.nombre} ${u.apellido}`.trim()}</TableCell>
                    <TableCell>{u.perfil_nombre ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={u.activo ? "default" : "secondary"}>
                        {u.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.ultimo_acceso ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => editar(u)}>
                        <Pencil className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {usuarios.data && usuarios.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No hay usuarios registrados.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>{form.id ? `Modificar ${form.login}` : "Nuevo usuario"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Usuario</Label>
                <Input
                  value={form.login}
                  onChange={(e) => setForm({ ...form, login: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Nombre</Label>
                  <Input
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Apellido</Label>
                  <Input
                    value={form.apellido}
                    onChange={(e) => setForm({ ...form, apellido: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Correo</Label>
                <Input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Perfil</Label>
                <Select
                  value={form.perfil_id ? String(form.perfil_id) : ""}
                  onValueChange={(v) => setForm({ ...form, perfil_id: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    {(perfiles.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Descuento máximo (%)</Label>
                  <Input
                    type="number"
                    value={form.descuento_maximo}
                    onChange={(e) =>
                      setForm({ ...form, descuento_maximo: Number(e.target.value) || 0 })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{form.id ? "Nueva clave (opcional)" : "Clave"}</Label>
                  <Input
                    type="password"
                    value={form.clave}
                    onChange={(e) => setForm({ ...form, clave: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label className="font-normal">Activo</Label>
                <Switch
                  checked={form.activo}
                  onCheckedChange={(v) => setForm({ ...form, activo: v })}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label className="font-normal">Supervisor</Label>
                <Switch
                  checked={form.supervisor}
                  onCheckedChange={(v) => setForm({ ...form, supervisor: v })}
                />
              </div>
              <Button
                className="w-full"
                disabled={guardar.isPending}
                onClick={() => {
                  if (!form.login.trim()) {
                    toast.error("Indica el usuario");
                    return;
                  }
                  if (!form.perfil_id) {
                    toast.error("Selecciona un perfil");
                    return;
                  }
                  if (!form.id && !form.clave) {
                    toast.error("Indica la clave del usuario");
                    return;
                  }
                  guardar.mutate();
                }}
              >
                Guardar usuario
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="size-4" />
                Cambiar mi clave
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Clave actual</Label>
                <Input
                  type="password"
                  value={claveActual}
                  onChange={(e) => setClaveActual(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Clave nueva</Label>
                <Input
                  type="password"
                  value={claveNueva}
                  onChange={(e) => setClaveNueva(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                className="w-full"
                disabled={miClave.isPending}
                onClick={() => {
                  if (!claveActual || claveNueva.length < 4) {
                    toast.error("Indica tu clave actual y una nueva de 4 caracteres o más");
                    return;
                  }
                  miClave.mutate();
                }}
              >
                Actualizar clave
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
