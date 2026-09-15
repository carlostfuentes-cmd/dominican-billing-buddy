import { createFileRoute } from "@tanstack/react-router";

import { DocumentoForm } from "@/components/documentos/DocumentoForm";

export const Route = createFileRoute("/devoluciones/nueva")({
  head: () => ({
    meta: [
      { title: "Nueva devolución — ERP Contable RD" },
      {
        name: "description",
        content: "Registra una nota de crédito por devolución con NCF B04, factura de origen y motivo.",
      },
      { property: "og:title", content: "Nueva devolución — ERP Contable RD" },
      { property: "og:description", content: "Nota de crédito por devolución con NCF y motivo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <DocumentoForm tipo="devolucion" />,
});
