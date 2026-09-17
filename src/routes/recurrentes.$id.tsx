import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { RecurrenteForm } from "@/components/RecurrenteForm";
import { obtenerRecurrente } from "@/lib/recurrentes.functions";

export const Route = createFileRoute("/recurrentes/$id")({
  head: () => ({
    meta: [
      { title: "Facturación recurrente — ERP Contable RD" },
      {
        name: "description",
        content:
          "Edita la plantilla de facturación recurrente: servicios, moneda, frecuencia y vigencia.",
      },
      { property: "og:title", content: "Facturación recurrente — ERP Contable RD" },
      {
        property: "og:description",
        content: "Plantilla de facturación periódica: servicios, moneda, frecuencia y vigencia.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EditarRecurrente,
});

function EditarRecurrente() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["recurrentes", "detalle", id],
    queryFn: () => obtenerRecurrente({ data: { id: Number(id) } }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (!data) return <p className="text-sm text-muted-foreground">No se encontró la plantilla.</p>;
  return <RecurrenteForm key={data.id} plantilla={data} />;
}
