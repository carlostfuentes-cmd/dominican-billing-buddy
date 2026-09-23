import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PASOS_TOUR } from "@/data/helpDocs";

export function iniciarTour() {
  window.dispatchEvent(new Event("iniciar-tour"));
}

export function TourGuiado() {
  const [pasos, setPasos] = useState<typeof PASOS_TOUR>([]);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const abrir = () => {
      const visibles = PASOS_TOUR.filter((p) => {
        const el = document.querySelector(p.selector) as HTMLElement | null;
        return el && el.offsetParent !== null;
      });
      setPasos(visibles);
      setI(0);
    };
    window.addEventListener("iniciar-tour", abrir);
    return () => window.removeEventListener("iniciar-tour", abrir);
  }, []);

  const paso = pasos[i];
  useEffect(() => {
    if (!paso) return;
    const el = document.querySelector(paso.selector);
    el?.scrollIntoView({ block: "center" });
    const t = setTimeout(() => setRect(el?.getBoundingClientRect() ?? null), 150);
    return () => clearTimeout(t);
  }, [paso]);

  if (!paso || !rect) return null;
  const cerrar = () => setPasos([]);
  const abajo = rect.bottom + 180 < window.innerHeight;
  const top = abajo ? rect.bottom + 12 : Math.max(12, rect.top - 172);
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - 332);

  return (
    <div className="no-print fixed inset-0 z-[100]">
      <div
        className="pointer-events-none fixed rounded-md ring-4 ring-primary transition-all"
        style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8, boxShadow: "0 0 0 9999px color-mix(in oklab, var(--foreground) 55%, transparent)" }}
      />
      <div className="fixed w-80 rounded-lg border bg-card p-4 text-card-foreground shadow-lg" style={{ top, left }}>
        <p className="text-xs text-muted-foreground">Paso {i + 1} de {pasos.length}</p>
        <h3 className="mt-1 font-display font-semibold">{paso.titulo}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{paso.texto}</p>
        <div className="mt-4 flex justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={cerrar}>Salir</Button>
          <div className="flex gap-2">
            {i > 0 && <Button variant="outline" size="sm" onClick={() => setI(i - 1)}>Anterior</Button>}
            <Button size="sm" onClick={() => (i + 1 < pasos.length ? setI(i + 1) : cerrar())}>
              {i + 1 < pasos.length ? "Siguiente" : "Terminar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
