import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Building2, Loader2, LockKeyhole } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Sesion } from "@/lib/db/usuarios.server";
import { cerrarSesion, iniciarSesion, obtenerSesion } from "@/lib/usuarios.functions";
import { pantallaDeRuta, type AccionPantalla } from "@/lib/pantallas";

type Contexto = {
  sesion: Sesion;
  permite: (menu_id: string, accion?: AccionPantalla) => boolean;
  salir: () => void;
};

const SesionContext = createContext<Contexto | null>(null);

export function useSesion(): Contexto {
  const ctx = useContext(SesionContext);
  if (!ctx) throw new Error("useSesion debe usarse dentro de la sesión");
  return ctx;
}

function PantallaLogin() {
  const queryClient = useQueryClient();
  const [login, setLogin] = useState("");
  const [clave, setClave] = useState("");

  const entrar = useMutation({
    mutationFn: () => iniciarSesion({ data: { login, clave } }),
    onSuccess: (sesion) => {
      toast.success(`Bienvenido, ${sesion.nombre}`);
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <span className="mx-auto mb-2 flex size-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Building2 className="size-6" />
          </span>
          <CardTitle className="font-display text-xl">ERP Contable</CardTitle>
          <p className="text-sm text-muted-foreground">Inicia sesión con tu usuario del sistema</p>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!login.trim() || !clave) {
                toast.error("Indica tu usuario y tu clave");
                return;
              }
              entrar.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="login">Usuario</Label>
              <Input
                id="login"
                autoFocus
                autoComplete="username"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clave">Clave</Label>
              <Input
                id="clave"
                type="password"
                autoComplete="current-password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={entrar.isPending}>
              {entrar.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LockKeyhole className="size-4" />
              )}
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function SesionProvider({ children }: { children: (ctx: Contexto) => ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["sesion"],
    queryFn: () => obtenerSesion(),
    staleTime: 5 * 60_000,
  });

  const salir = useMutation({
    mutationFn: () => cerrarSesion(),
    onSuccess: () => {
      queryClient.clear();
      queryClient.invalidateQueries();
    },
  });

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return <PantallaLogin />;

  const ctx: Contexto = {
    sesion: data,
    permite: (menu_id, accion) => {
      if (data.administrador) return true;
      const permiso = data.permisos.find((p) => p.menu_id === menu_id);
      if (!permiso) return false;
      return accion ? permiso[accion] : true;
    },
    salir: () => salir.mutate(),
  };

  return <SesionContext.Provider value={ctx}>{children(ctx)}</SesionContext.Provider>;
}

/** Permisos de la pantalla actual, según el perfil del usuario. */
export function usePermisoPantalla() {
  const { sesion, permite } = useSesion();
  const ruta = useRouterState({ select: (s) => s.location.pathname });
  const pantalla = pantallaDeRuta(ruta);
  const puede = (accion: AccionPantalla) => {
    if (sesion.administrador) return true;
    if (!pantalla) return true;
    return permite(pantalla.menu_id, accion);
  };
  return {
    puedeAgregar: puede("agregar"),
    puedeEditar: puede("editar"),
    puedeEliminar: puede("eliminar"),
    puedeImprimir: puede("imprimir"),
    puedeExportar: puede("exportar"),
  };
}
