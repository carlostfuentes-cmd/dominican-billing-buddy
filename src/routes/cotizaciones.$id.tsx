import { createFileRoute, useParams } from "@tanstack/react-router";

import { DocumentoDetalle } from "@/components/documentos/DocumentoDetalle";

export const Route = createFileRoute("/cotizaciones/$id")({
  head: () => ({
    meta: [
      { title: "Detalle de cotización — ERP Contable RD" },
      {
        name: "description",
        content: "Vista imprimible de la cotización con líneas, ITBIS y totales.",
      },
      { property: "og:title", content: "Detalle de cotización — ERP Contable RD" },
      { property: "og:description", content: "Cotización imprimible con desglose de ITBIS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DetalleCotizacion,
});

function DetalleCotizacion() {
  const { id } = useParams({ from: "/cotizaciones/$id" });
  return <DocumentoDetalle tipo="cotizacion" id={id} />;
}
