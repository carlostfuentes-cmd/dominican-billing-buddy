import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Servidor de datos remoto (IONOS): caché de 5 min, sin recargar al volver a
  // la ventana y reintentos suaves con espera creciente (1s, 2s… máx. 8s).
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        gcTime: 15 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: (fallos, error) => {
          const msg = error instanceof Error ? error.message : "";
          if (/inválid|no encontrad|permiso|Unauthorized/i.test(msg)) return false;
          return fallos < 2;
        },
        retryDelay: (intento) => Math.min(1000 * 2 ** intento, 8000),
        placeholderData: (anterior: unknown) => anterior,
      },
      mutations: { retry: 0 },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
