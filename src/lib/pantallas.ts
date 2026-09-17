// Cada pantalla de la aplicación web queda enlazada al menú equivalente que ya
// existe en el sistema (tabla menues), de modo que los perfiles actuales
// (profiles + profiles_menues) controlan el acceso sin duplicar permisos.

export type AccionPantalla = "agregar" | "editar" | "eliminar" | "buscar" | "imprimir" | "exportar";

export type Pantalla = {
  ruta: string;
  menu_id: string;
  titulo: string;
  /** Solo administradores (perfil con administrator = 1). */
  soloAdmin?: boolean;
};

export const PANTALLAS: Pantalla[] = [
  { ruta: "/facturas", menu_id: "2.01.02", titulo: "Pedidos y facturas" },
  { ruta: "/cotizaciones", menu_id: "2.01.01", titulo: "Cotizaciones" },
  { ruta: "/conduces", menu_id: "2.01.01.5", titulo: "Conduces" },
  { ruta: "/devoluciones", menu_id: "2.01.04", titulo: "Devoluciones" },
  { ruta: "/notas-credito", menu_id: "2.01.04", titulo: "Notas de crédito" },
  { ruta: "/recurrentes", menu_id: "2.01.03.3", titulo: "Facturas recurrentes" },
  { ruta: "/inventario", menu_id: "2.02.01", titulo: "Inventario" },
  { ruta: "/cxc", menu_id: "2.03.01", titulo: "Cuentas por cobrar" },
  { ruta: "/clientes", menu_id: "1.03.11", titulo: "Clientes" },
  { ruta: "/items", menu_id: "1.02.05", titulo: "Ítems" },
  { ruta: "/contabilidad", menu_id: "2.09.01", titulo: "Diario general" },
  { ruta: "/reportes", menu_id: "3.01.53", titulo: "Reportes" },
  { ruta: "/ncf", menu_id: "4.55.03", titulo: "Comprobantes fiscales" },
  { ruta: "/campos", menu_id: "4.81", titulo: "Campos personalizados" },
  { ruta: "/formatos", menu_id: "4.51", titulo: "Formatos de impresión" },
  { ruta: "/configuracion", menu_id: "4.51", titulo: "Configuración", soloAdmin: true },
  { ruta: "/perfiles", menu_id: "4.01.03", titulo: "Perfiles", soloAdmin: true },
  { ruta: "/usuarios", menu_id: "4.01.05", titulo: "Usuarios", soloAdmin: true },
  { ruta: "/auditoria", menu_id: "4.57", titulo: "Auditoría", soloAdmin: true },
];

/** Rutas visibles siempre para cualquier usuario con sesión iniciada. */
export const RUTAS_LIBRES = ["/", "/login"];

export function pantallaDeRuta(ruta: string): Pantalla | undefined {
  const limpia = ruta.split("?")[0] ?? ruta;
  return PANTALLAS.filter((p) => limpia === p.ruta || limpia.startsWith(`${p.ruta}/`)).sort(
    (a, b) => b.ruta.length - a.ruta.length,
  )[0];
}
