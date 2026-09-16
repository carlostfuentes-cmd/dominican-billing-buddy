import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { PANTALLAS, type AccionPantalla } from "@/lib/pantallas";
import {
  eliminarPerfilSistema,
  guardarPerfilSistema,
  guardarPermisos,
  obtenerPerfiles,
  obtenerPermisosPerfil,
} from "@/lib/usuarios.functions";

export const Route = createFileRoute("/perfiles")({
  head: () => ({
    meta: [
      { title: "Perfiles y permisos — ERP Contable RD" },
      {
        name: "description",
        content:
          "Define perfiles y qué puede hacer cada uno en cada pantalla: agregar, modificar, eliminar, imprimir y exportar.",
      },
      { property: "og:title", content: "Perfiles y permisos — ERP Contable RD" },
      {
        property: "og:description",
        content: "Control de acceso por pantalla y por acción para cada perfil de usuario.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PerfilesPage,
});

const ACCIONES: { id: AccionPantalla; titulo: string }[] = [
  { id: "buscar", titulo: "Consultar" },
  { id: "agregar", titulo: "Agregar" },
  { id: "editar", titulo: "Modificar" },
  { id: "eliminar", titulo: "Eliminar" },
  { id: "imprimir", titulo: "Imprimir" },
  { id: "exportar", titulo: "Exportar" },
];

type Fila = Record<AccionPantalla, boolean>;

const filaVacia = (): Fila => ({
  buscar: false,
  agregar: false,
  editar: false,
  eliminar: false,
  imprimir: false,
  exportar: false,
});

const MENUS = [...new Set(PANTALLAS.map((p) => p.menu_id))].map((menu_id) => ({
  menu_id,
  titulo: PANTALLAS.filter((p) => p.menu_id === menu_id)
    .map((p) => p.titulo)
    .join(" · "),
}));

function PerfilesPage() {
  const qc = useQueryClient();
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const [nombre, setNombre] = useState("");
  const [activo, setActivo] = useState(true);
  const [administrador, setAdministrador] = useState(false);
  const [padre, setPadre] = useState<string>("0");
  const [tabla, setTabla] = useState<Record<string, Fila>>({});

  const perfiles = useQuery({ queryKey: ["perfiles"], queryFn: () => obtenerPerfiles() });
  const permisos = useQuery({
    queryKey: ["permisos-perfil", seleccion],
    queryFn: () => obtenerPermisosPerfil({ data: { perfil_id: seleccion! } }),
    enabled: seleccion !== null,
  });

  useEffect(() => {
    const base: Record<string, Fila> = {};
    for (const m of MENUS) base[m.menu_id] = filaVacia();
    for (const p of permisos.data ?? []) {
      if (!base[p.menu_id]) continue;
      base[p.menu_id] = {
        buscar: p.buscar,
        agregar: p.agregar,
        editar: p.editar,
        eliminar: p.eliminar,
        imprimir: p.imprimir,
        exportar: p.exportar,
      };
    }
    setTabla(base);
  }, [permisos.data, seleccion]);

  const elegir = (id: number) => {
    const perfil = (perfiles.data ?? []).find((p) => p.id === id);
    setSeleccion(id);
    setNombre(perfil?.nombre ?? "");
    setActivo(perfil?.activo ?? true);
    setAdministrador(perfil?.administrador ?? false);
    setPadre(perfil?.padre ? String(perfil.padre) : "0");
  };

  const nuevo = () => {
    setSeleccion(null);
    setNombre("");
    setActivo(true);
    setAdministrador(false);
    setPadre("0");
    const base: Record<string, Fila> = {};
    for (const m of MENUS) base[m.menu_id] = filaVacia();
    setTabla(base);
  };

  const guardarDatos = useMutation({
    mutationFn: () =>
      guardarPerfilSistema({
        data: {
          id: seleccion ?? undefined,
          nombre,
          activo,
          administrador,
          padre: padre === "0" ? null : Number(padre),
        },
      }),
    onSuccess: ({ id }) => {
      toast.success("Perfil guardado");
      setSeleccion(id);
      qc.invalidateQueries({ queryKey: ["perfiles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const guardarAccesos = useMutation({
    mutationFn: () =>
      guardarPermisos({
        data: {
          perfil_id: seleccion!,
          permisos: MENUS.map((m) => ({ menu_id: m.menu_id, ...(tabla[m.menu_id] ?? filaVacia()) })),
        },
      }),
    onSuccess: () => {
      toast.success("Permisos guardados");
      qc.invalidateQueries({ queryKey: ["permisos-perfil", seleccion] });
      qc.invalidateQueries({ queryKey: ["sesion"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const borrar = useMutation({
    mutationFn: () => eliminarPerfilSistema({ data: { perfil_id: seleccion! } }),
    onSuccess: () => {
      toast.success("Perfil eliminado");
      nuevo();
      qc.invalidateQueries({ queryKey: ["perfiles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const marcarFila = (menu_id: string, accion: AccionPantalla, valor: boolean) =>
    setTabla((prev) => ({
      ...prev,
      [menu_id]: { ...(prev[menu_id] ?? filaVacia()), [accion]: valor },
    }));

  const marcarTodo = (valor: boolean) => {
    const base: Record<string, Fila> = {};
    for (const m of MENUS)
      base[m.menu_id] = {
        buscar: valor,
        agregar: valor,
        editar: valor,
        eliminar: valor,
        imprimir: valor,
        exportar: valor,
      };
    setTabla(base);
  };

  return (
    <div>
      <PageHeader
        titulo="Perfiles y permisos"
        descripcion="Elige un perfil y marca lo que puede hacer en cada pantalla del sistema."
        acciones={
          <Button variant="outline" onClick={nuevo}>
            <Plus className="size-4" />
            Nuevo perfil
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Perfiles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {(perfiles.data ?? []).map((p) => (
                <button
                  key={p.id}
                  onClick={() => elegir(p.id)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                    seleccion === p.id ? "bg-primary/10 font-medium" : ""
                  }`}
                >
                  <span>{p.nombre}</span>
                  {p.administrador ? <Badge variant="outline">Admin</Badge> : null}
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{seleccion ? "Datos del perfil" : "Nuevo perfil"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nombre</Label>
                <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Hereda permisos de</Label>
                <Select value={padre} onValueChange={setPadre}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">No hereda</SelectItem>
                    {(perfiles.data ?? [])
                      .filter((p) => p.id !== seleccion)
                      .map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.nombre}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label className="font-normal">Activo</Label>
                <Switch checked={activo} onCheckedChange={setActivo} />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label className="font-normal">Acceso total (administrador)</Label>
                <Switch checked={administrador} onCheckedChange={setAdministrador} />
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  disabled={guardarDatos.isPending}
                  onClick={() => {
                    if (!nombre.trim()) return toast.error("Indica el nombre del perfil");
                    guardarDatos.mutate();
                  }}
                >
                  Guardar perfil
                </Button>
                {seleccion ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (confirm("¿Eliminar este perfil?")) borrar.mutate();
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>Permisos por pantalla</CardTitle>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => marcarTodo(true)}>
                Marcar todo
              </Button>
              <Button variant="ghost" size="sm" onClick={() => marcarTodo(false)}>
                Quitar todo
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {seleccion === null ? (
              <p className="px-6 text-sm text-muted-foreground">
                Elige un perfil de la lista o guarda uno nuevo para asignarle permisos.
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pantalla</TableHead>
                      {ACCIONES.map((a) => (
                        <TableHead key={a.id} className="text-center">
                          {a.titulo}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MENUS.map((m) => (
                      <TableRow key={m.menu_id}>
                        <TableCell className="font-medium">{m.titulo}</TableCell>
                        {ACCIONES.map((a) => (
                          <TableCell key={a.id} className="text-center">
                            <Checkbox
                              checked={tabla[m.menu_id]?.[a.id] ?? false}
                              onCheckedChange={(v) => marcarFila(m.menu_id, a.id, v === true)}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="px-6 pt-4">
                  <Button disabled={guardarAccesos.isPending} onClick={() => guardarAccesos.mutate()}>
                    Guardar permisos
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Los perfiles con acceso total ven todas las pantallas sin importar estas marcas.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
