// Enlaza el diseñador de documentos con la impresión real de cualquier
// documento (cotización, conduce, nota de crédito, orden de compra).

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LayoutTemplate } from "lucide-react";

import { RenderPlantilla } from "@/components/plantillas/RenderPlantilla";
import { Button } from "@/components/ui/button";
import { papelCss } from "@/lib/erp-types";
import { obtenerPlantilla } from "@/lib/plantillas.functions";
import type { DatosDocumento, Plantilla, TipoPlantilla } from "@/lib/plantillas-tipos";

export interface UsoPlantilla {
  plantilla: Plantilla | null;
  /** true cuando se debe imprimir con el formato diseñado. */
  conDisenio: boolean;
  usarDisenio: boolean;
  alternar: () => void;
  /** Regla @page del papel y márgenes del diseño. */
  cssPagina: string;
}

/** Carga la plantilla de la empresa para este tipo de documento. */
export function usePlantillaDocumento(
  docTipo: TipoPlantilla,
  empresaId: string | undefined,
): UsoPlantilla {
  const id = empresaId ?? "*";
  const { data } = useQuery({
    queryKey: ["plantilla", id, docTipo],
    queryFn: () => obtenerPlantilla({ data: { empresaId: id, docTipo } }),
  });
  const [usarDisenio, setUsarDisenio] = useState(true);
  const plantilla = data ?? null;
  const conDisenio = Boolean(plantilla) && usarDisenio;
  return {
    plantilla,
    conDisenio,
    usarDisenio,
    alternar: () => setUsarDisenio((v) => !v),
    cssPagina: plantilla
      ? `@page { size: ${papelCss(plantilla.papel)}; margin: 0; }`
      : "",
  };
}

/** Botón para alternar entre el formato diseñado y el estándar. */
export function BotonFormato({ uso }: { uso: UsoPlantilla }) {
  if (!uso.plantilla) return null;
  return (
    <Button variant="ghost" size="sm" onClick={uso.alternar}>
      <LayoutTemplate className="size-4" />{" "}
      {uso.usarDisenio ? "Ver formato estándar" : "Ver formato diseñado"}
    </Button>
  );
}

/** Dibuja el documento con el formato diseñado, con sus copias adicionales. */
export function HojaDisenada({
  plantilla,
  datos,
}: {
  plantilla: Plantilla;
  datos: DatosDocumento;
}) {
  const copias = Math.max(1, Math.min(4, plantilla.copias ?? 1));
  const hoja = (
    <div className="print-area mx-auto w-fit overflow-x-auto">
      <RenderPlantilla plantilla={plantilla} datos={datos} />
    </div>
  );
  return (
    <>
      {hoja}
      {Array.from({ length: copias - 1 }).map((_, i) => (
        <div key={i} className="hidden print:block" style={{ breakBefore: "page" }}>
          {hoja}
        </div>
      ))}
    </>
  );
}
