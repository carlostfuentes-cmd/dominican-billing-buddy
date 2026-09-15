import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  FileText,
  FileSpreadsheet,
  Hash,
  LayoutDashboard,
  Package,
  Printer,
  RotateCcw,
  Settings,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";

import { obtenerEstadoConexion } from "@/lib/erp.functions";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Panel", icon: LayoutDashboard },
  { to: "/cotizaciones", label: "Cotizaciones", icon: FileSpreadsheet },
  { to: "/facturas", label: "Pedidos y facturas", icon: FileText },
  { to: "/conduces", label: "Conduces", icon: Truck },
  { to: "/devoluciones", label: "Devoluciones", icon: RotateCcw },
  { to: "/cxc", label: "Cuentas por cobrar", icon: Wallet },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/items", label: "Ítems", icon: Package },
  { to: "/ncf", label: "Secuencias NCF", icon: Hash },
  { to: "/formatos", label: "Formatos de impresión", icon: Printer },
  { to: "/reportes", label: "Reportes", icon: BarChart3 },
  { to: "/configuracion", label: "Configuración", icon: Settings },
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
        "rounded-md px-3 py-2 text-xs leading-snug",
        conectado
          ? "bg-emerald-500/15 text-emerald-100"
          : "bg-amber-400/15 text-amber-100",
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
        <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between bg-sidebar px-4 py-5 text-sidebar-foreground md:flex">
          <div>
            <Link to="/" className="block">
              <p className="text-sm font-semibold tracking-wide text-sidebar-foreground">
                ERP Contable RD
              </p>
              <p className="text-xs text-sidebar-foreground/60">Módulo de Facturación</p>
            </Link>
            <nav className="mt-6 space-y-1">
              {NAV.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  activeOptions={{ exact: to === "/" }}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  activeProps={{
                    className: "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                  }}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              ))}
            </nav>
          </div>
          <EstadoDatos />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print flex items-center gap-3 overflow-x-auto border-b bg-card px-4 py-2 md:hidden">
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
          <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
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
    <div className="no-print mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{titulo}</h1>
        {descripcion ? <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p> : null}
      </div>
      {acciones ? <div className="flex gap-2">{acciones}</div> : null}
    </div>
  );
}
