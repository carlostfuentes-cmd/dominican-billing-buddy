import { createFileRoute } from "@tanstack/react-router";

import { DocumentoLista } from "@/components/documentos/DocumentoLista";

export const Route = createFileRoute("/cotizaciones/")({
  head: () => ({
    meta: [
      { title: "Cotizaciones — ERP Contable RD" },
      {
        name: "description",
        content: "Listado de cotizaciones por cliente y período, con totales y moneda del documento.",
      },
      { property: "og:title", content: "Cotizaciones — ERP Contable RD" },
      { property: "og:description", content: "Ofertas de precio a clientes con totales en su moneda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <DocumentoLista tipo="cotizacion" />,
});
