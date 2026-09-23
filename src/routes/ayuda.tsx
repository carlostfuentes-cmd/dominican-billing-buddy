import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { PanelAyuda } from "@/components/CentroAyuda";

export const Route = createFileRoute("/ayuda")({
  head: () => ({
    meta: [
      { title: "Centro de ayuda — ERP Contable RD" },
      { name: "description", content: "Guías paso a paso y recorrido guiado de cada módulo del ERP." },
      { property: "og:title", content: "Centro de ayuda — ERP Contable RD" },
      { property: "og:description", content: "Guías paso a paso y recorrido guiado de cada módulo del ERP." },
    ],
  }),
  component: () => (
    <div className="mx-auto max-w-4xl">
      <PageHeader titulo="Centro de ayuda" descripcion="Busque una guía o recorra los módulos del sistema." />
      <PanelAyuda />
    </div>
  ),
});
