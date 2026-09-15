import { createFileRoute } from "@tanstack/react-router";

import { DocumentoForm } from "@/components/documentos/DocumentoForm";

export const Route = createFileRoute("/cotizaciones/nueva")({
  head: () => ({
    meta: [
      { title: "Nueva cotización — ERP Contable RD" },
      {
        name: "description",
        content: "Registra una cotización con líneas, descuentos, ITBIS y moneda del documento.",
      },
      { property: "og:title", content: "Nueva cotización — ERP Contable RD" },
      { property: "og:description", content: "Cotización con líneas, ITBIS y multimoneda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <DocumentoForm tipo="cotizacion" />,
});
