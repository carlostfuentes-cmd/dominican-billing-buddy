import { createFileRoute } from "@tanstack/react-router";

import { DocumentoForm } from "@/components/documentos/DocumentoForm";

export const Route = createFileRoute("/conduces/nueva")({
  head: () => ({
    meta: [
      { title: "Nuevo conduce — ERP Contable RD" },
      {
        name: "description",
        content: "Registra una orden de entrega tomando las líneas de un pedido existente.",
      },
      { property: "og:title", content: "Nuevo conduce — ERP Contable RD" },
      { property: "og:description", content: "Orden de entrega con líneas tomadas del pedido." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <DocumentoForm tipo="conduce" />,
});
