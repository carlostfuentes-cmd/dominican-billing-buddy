import { createFileRoute } from "@tanstack/react-router";

import { RecurrenteForm } from "@/components/RecurrenteForm";

export const Route = createFileRoute("/recurrentes/nueva")({
  head: () => ({
    meta: [
      { title: "Nueva facturación recurrente — ERP Contable RD" },
      {
        name: "description",
        content:
          "Crea una plantilla de facturación recurrente: cliente, servicios, moneda y frecuencia de emisión.",
      },
      { property: "og:title", content: "Nueva facturación recurrente — ERP Contable RD" },
      {
        property: "og:description",
        content: "Plantilla de facturación periódica con servicios, moneda y frecuencia.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RecurrenteForm />,
});
