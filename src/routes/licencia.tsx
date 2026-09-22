import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, RefreshCw, ShieldAlert, Users } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { obtenerEstadoLicencia, revalidarLicencia } from "@/lib/licencias.functions";
import { fechaCorta } from "@/lib/erp-types";

export const Route = createFileRoute("/licencia")({
  head: () => ({
    meta: [
      { title: "Licencia del sistema — Suite Empresarial BP Dominicana" },
      {
        name: "description",
        content:
          "Estado, plan, vencimiento y usuarios permitidos de la licencia de tu Suite Empresarial.",
      },
      { property: "og:title", content: "Licencia del sistema — BP Dominicana" },
      {
        property: "og:description",
        content: "Consulta el estado y el vencimiento de la licencia de tu sistema.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LicenciaCliente,
});

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <p className="text-xs uppercase text-muted-foreground">{etiqueta}</p>
      <p className="mt-1 font-display text-lg font-semibold">{valor}</p>
    </div>
  );
}

function LicenciaCliente() {
  const qc = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["licencia"],
    queryFn: () => obtenerEstadoLicencia(),
    staleTime: 5 * 60_000,
  });

  const revalidar = useMutation({
    mutationFn: () => revalidarLicencia(),
    onSuccess: (estado) => {
      qc.setQueryData(["licencia"], estado);
      toast.success("Licencia revalidada");
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo revalidar la licencia"),
  });

  const alerta =
    data && (data.solo_lectura || (data.dias_restantes !== null && data.dias_restantes <= 30));

  return (
    <div>
      <PageHeader
        titulo="Licencia del sistema"
        descripcion="Plan contratado, vencimiento y usuarios permitidos"
        acciones={
          <Button
            variant="outline"
            onClick={() => revalidar.mutate()}
            disabled={revalidar.isPending}
          >
            <RefreshCw className="size-4" />
            Revalidar ahora
          </Button>
        }
      />

      {isPending ? (
        <p className="text-sm text-muted-foreground">Consultando la licencia…</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">No se pudo consultar la licencia.</p>
      ) : (
        <div className="space-y-5">
          {alerta ? (
            <div
              className={`flex gap-3 rounded-md border p-4 text-sm ${
                data.solo_lectura
                  ? "border-destructive/30 bg-destructive/10"
                  : "border-warning/30 bg-warning/10"
              }`}
            >
              <ShieldAlert className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-semibold">
                  {data.solo_lectura ? "Sistema en solo lectura" : "La licencia está por vencer"}
                </p>
                <p className="mt-1 text-muted-foreground">{data.mensaje}</p>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 rounded-md border border-success/25 bg-success/10 p-4 text-sm">
              <BadgeCheck className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-semibold">{data.estado_nombre}</p>
                <p className="mt-1 text-muted-foreground">{data.mensaje}</p>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Dato etiqueta="Estado" valor={data.estado_nombre} />
            <Dato etiqueta="Plan" valor={data.plan || "—"} />
            <Dato etiqueta="Vence" valor={data.vence ? fechaCorta(data.vence) : "—"} />
            <Dato
              etiqueta="Usuarios"
              valor={
                data.usuarios_permitidos > 0
                  ? `${data.usuarios_en_uso} de ${data.usuarios_permitidos}`
                  : String(data.usuarios_en_uso)
              }
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="font-display text-base">Detalles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Cliente: </span>
                {data.cliente || "—"}
              </p>
              <p>
                <span className="font-medium text-foreground">Modalidad: </span>
                {data.modalidad === "local" ? "Instalación local del cliente" : "Nube BP Dominicana"}
              </p>
              {data.dias_restantes !== null ? (
                <p>
                  <span className="font-medium text-foreground">Días restantes: </span>
                  {data.dias_restantes}
                </p>
              ) : null}
              {data.en_gracia ? (
                <p>
                  <span className="font-medium text-foreground">Período de gracia: </span>
                  {data.gracia_restante} día(s) restantes sin validación
                </p>
              ) : null}
              <p className="flex items-center gap-2 pt-2">
                <Users className="size-4" />
                Para renovar, ampliar usuarios o cambiar de plan, comunícate con BP Dominicana.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
