import { createFileRoute } from "@tanstack/react-router";

import { DocumentoLista } from "@/components/documentos/DocumentoLista";

export const Route = createFileRoute("/devoluciones/")({
  head: () => ({
    meta: [
      { title: "Devoluciones — ERP Contable RD" },
      {
        name: "description",
        content: "Notas de crédito por devolución con NCF, factura de origen y motivo.",
      },
      { property: "og:title", content: "Devoluciones — ERP Contable RD" },
      { property: "og:description", content: "Notas de crédito por devolución con NCF y motivo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <DocumentoLista tipo="devolucion" />,
});
