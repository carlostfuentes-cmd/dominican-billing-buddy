import { createFileRoute, useParams } from "@tanstack/react-router";

import { DocumentoDetalle } from "@/components/documentos/DocumentoDetalle";

export const Route = createFileRoute("/conduces/$id")({
  head: () => ({
    meta: [
      { title: "Detalle de conduce — ERP Contable RD" },
      {
        name: "description",
        content: "Vista imprimible del conduce con líneas entregadas y referencias del pedido.",
      },
      { property: "og:title", content: "Detalle de conduce — ERP Contable RD" },
      { property: "og:description", content: "Conduce imprimible con líneas entregadas." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DetalleConduce,
});

function DetalleConduce() {
  const { id } = useParams({ from: "/conduces/$id" });
  return <DocumentoDetalle tipo="conduce" id={id} />;
}
