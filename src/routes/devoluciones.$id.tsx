import { createFileRoute, useParams } from "@tanstack/react-router";

import { DocumentoDetalle } from "@/components/documentos/DocumentoDetalle";

export const Route = createFileRoute("/devoluciones/$id")({
  head: () => ({
    meta: [
      { title: "Detalle de devolución — ERP Contable RD" },
      {
        name: "description",
        content: "Vista imprimible de la nota de crédito con NCF, motivo y desglose de ITBIS.",
      },
      { property: "og:title", content: "Detalle de devolución — ERP Contable RD" },
      { property: "og:description", content: "Nota de crédito imprimible con NCF y motivo." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DetalleDevolucion,
});

function DetalleDevolucion() {
  const { id } = useParams({ from: "/devoluciones/$id" });
  return <DocumentoDetalle tipo="devolucion" id={id} />;
}
