import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  FileText,
  FileSpreadsheet,
  Hash,
  LayoutDashboard,
  ListPlus,
  LogOut,
  Package,
  Printer,
  RotateCcw,
  Settings,
  ShieldCheck,
  Truck,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";

import { SesionProvider, useSesion } from "@/components/Sesion";
import { Button } from "@/components/ui/button";
import { obtenerEstadoConexion } from "@/lib/erp.functions";
import { pantallaDeRuta } from "@/lib/pantallas";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Panel", icon: LayoutDashboard, grupo: "principal" },
  { to: "/facturas", label: "Pedidos y facturas", icon: FileText, grupo: "principal" },
  { to: "/cxc", label: "Cuentas por cobrar", icon: Wallet, grupo: "principal" },
  { to: "/cotizaciones", label: "Cotizaciones", icon: FileSpreadsheet, grupo: "operaciones" },
  { to: "/conduces", label: "Conduces", icon: Truck, grupo: "operaciones" },
  { to: "/devoluciones", label: "Devoluciones", icon: RotateCcw, grupo: "operaciones" },
  { to: "/inventario", label: "Inventario", icon: Boxes, grupo: "operaciones" },
  { to: "/clientes", label: "Clientes", icon: Users, grupo: "maestros" },
  { to: "/items", label: "Ítems", icon: Package, grupo: "maestros" },
  { to: "/contabilidad", label: "Diario general", icon: BookOpen, grupo: "fiscal" },
  { to: "/ncf", label: "Comprobantes fiscales", icon: Hash, grupo: "fiscal" },
  { to: "/reportes", label: "Reportes", icon: BarChart3, grupo: "fiscal" },
  { to: "/formatos", label: "Formatos de impresión", icon: Printer, grupo: "sistema" },
  { to: "/campos", label: "Campos personalizados", icon: ListPlus, grupo: "sistema" },
  { to: "/usuarios", label: "Usuarios", icon: UserCog, grupo: "sistema" },
  { to: "/perfiles", label: "Perfiles y permisos", icon: ShieldCheck, grupo: "sistema" },
  { to: "/configuracion", label: "Configuración", icon: Settings, grupo: "sistema" },
] as const;

const GRUPOS = [
  { id: "principal", titulo: "Gestión" },
  { id: "operaciones", titulo: "Operaciones" },
  { id: "maestros", titulo: "Maestros" },
  { id: "fiscal", titulo: "Fiscal y análisis" },
  { id: "sistema", titulo: "Sistema" },
] as const;


function EstadoDatos() {
  const { data } = useQuery({
    queryKey: ["estado-conexion"],
    queryFn: () => obtenerEstadoConexion(),
    staleTime: 60_000,
  });
  if (!data) return null;
  const conectado = data.modo === "mysql";
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2.5 text-xs leading-snug",
        conectado
          ? "border-success/20 bg-success/10 text-sidebar-foreground"
          : "border-warning/25 bg-warning/10 text-sidebar-foreground",
      )}
    >
      <span className="font-semibold">
        {conectado ? "Base de datos conectada" : "Modo demostración"}
      </span>
      <p className="mt-1 opacity-80">
        {conectado
          ? "Los datos se guardan en tu servidor."
          : "Datos de ejemplo. Configura las credenciales de tu servidor para guardar de forma permanente."}
      </p>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen">
        <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between border-r border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground md:flex">
          <div>
            <Link to="/" className="flex items-center gap-3 px-2">
              <span className="flex size-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
                <Building2 className="size-5" />
              </span>
              <span>
                <span className="block font-display text-base font-semibold text-sidebar-foreground">ERP Contable</span>
                <span className="block text-[11px] font-medium text-sidebar-foreground/50">República Dominicana</span>
              </span>
            </Link>
            <nav className="mt-7 space-y-5">
              {GRUPOS.map((grupo) => (
                <div key={grupo.id}>
                  <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase text-sidebar-foreground/35">
                    {grupo.titulo}
                  </p>
                  <div className="space-y-0.5">
                    {NAV.filter((item) => item.grupo === grupo.id).map(({ to, label, icon: Icon }) => (
                      <Link
                        key={to}
                        to={to}
                        activeOptions={{ exact: to === "/" }}
                        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/66 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        activeProps={{
                          className: "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-sm",
                        }}
                      >
                        <Icon className="size-4" />
                        {label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </div>
          <EstadoDatos />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print sticky top-0 z-40 flex items-center gap-3 overflow-x-auto border-b bg-card px-4 py-3 shadow-sm md:hidden">
            <Link to="/" className="mr-2 flex shrink-0 items-center gap-2 font-display font-semibold">
              <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground"><Building2 className="size-4" /></span>
              ERP
            </Link>
            {NAV.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === "/" }}
                className="whitespace-nowrap text-sm text-muted-foreground"
                activeProps={{ className: "text-foreground font-medium" }}
              >
                {label}
              </Link>
            ))}
          </header>
           <main className="flex-1 px-4 py-6 sm:px-6 md:px-8 md:py-7 xl:px-10">{children}</main>
        </div>
      </div>
    </div>
  );
}

export function PageHeader({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
}) {
  return (
    <div className="no-print mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border/70 pb-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground md:text-3xl">{titulo}</h1>
        {descripcion ? <p className="mt-1.5 text-sm text-muted-foreground">{descripcion}</p> : null}
      </div>
      {acciones ? <div className="flex gap-2">{acciones}</div> : null}
    </div>
  );
}
