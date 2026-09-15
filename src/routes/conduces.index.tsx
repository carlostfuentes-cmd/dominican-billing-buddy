import { createFileRoute } from "@tanstack/react-router";

import { DocumentoLista } from "@/components/documentos/DocumentoLista";

export const Route = createFileRoute("/conduces/")({
  head: () => ({
    meta: [
      { title: "Conduces — ERP Contable RD" },
      {
        name: "description",
        content: "Órdenes de entrega al cliente con referencia al pedido y totales por período.",
      },
      { property: "og:title", content: "Conduces — ERP Contable RD" },
      { property: "og:description", content: "Entregas de mercancía con referencia al pedido." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <DocumentoLista tipo="conduce" />,
});
