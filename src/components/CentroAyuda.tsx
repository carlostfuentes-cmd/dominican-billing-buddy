import { Link, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, CircleHelp, Lightbulb, Map, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { iniciarTour } from "@/components/TourGuiado";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SECCIONES_AYUDA, type GuiaAyuda, type TipoNota } from "@/data/helpDocs";
import { cn } from "@/lib/utils";

const ESTILO_NOTA: Record<TipoNota, { icono: typeof Lightbulb; clase: string; titulo: string }> = {
  tip: { icono: Lightbulb, clase: "border-primary/25 bg-primary/5", titulo: "Consejo" },
  aviso: { icono: AlertTriangle, clase: "border-warning/30 bg-warning/10", titulo: "Atención" },
  requisito: { icono: CheckCircle2, clase: "border-success/25 bg-success/10", titulo: "Requisito" },
};

const normal = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function coincide(g: GuiaAyuda, q: string) {
  if (!q) return true;
  const texto = [g.titulo, g.proposito, ...g.pasos, ...(g.notas ?? []).map((n) => n.texto), ...(g.palabras ?? [])].join(" ");
  return normal(texto).includes(normal(q));
}

function Guia({ g, alNavegar }: { g: GuiaAyuda; alNavegar?: () => void }) {
  return (
    <AccordionItem value={g.id}>
      <AccordionTrigger className="text-left">{g.titulo}</AccordionTrigger>
      <AccordionContent className="space-y-3">
        <p className="text-sm"><span className="font-semibold">Propósito: </span>{g.proposito}</p>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {g.pasos.map((p) => <li key={p}>{p}</li>)}
        </ol>
        {g.notas?.map((n) => {
          const e = ESTILO_NOTA[n.tipo];
          return (
            <div key={n.texto} className={cn("flex gap-2 rounded-md border p-3 text-sm", e.clase)}>
              <e.icono className="mt-0.5 size-4 shrink-0" />
              <p><span className="font-semibold">{e.titulo}: </span>{n.texto}</p>
            </div>
          );
        })}
        {g.ruta && (
          <Button asChild variant="outline" size="sm">
            <Link to={g.ruta} onClick={alNavegar}>Ir a la pantalla</Link>
          </Button>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

export function PanelAyuda({ alNavegar }: { alNavegar?: () => void }) {
  const [q, setQ] = useState("");
  const ruta = useRouterState({ select: (s) => s.location.pathname });
  const actual = useMemo(
    () => SECCIONES_AYUDA.flatMap((s) => s.guias).find((g) => g.ruta && (g.ruta === "/" ? ruta === "/" : ruta.startsWith(g.ruta))),
    [ruta],
  );
  const resultados = SECCIONES_AYUDA.map((s) => ({ ...s, guias: s.guias.filter((g) => coincide(g, q)) }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar guías por palabra clave…" className="pl-9" />
        </div>
        <Button variant="secondary" onClick={() => { alNavegar?.(); setTimeout(iniciarTour, 250); }}>
          <Map className="size-4" /> Iniciar tour guiado
        </Button>
      </div>

      {q ? (
        <Accordion type="multiple">
          {resultados.flatMap((s) => s.guias).map((g) => <Guia key={g.id} g={g} alNavegar={alNavegar} />)}
          {resultados.every((s) => s.guias.length === 0) && (
            <p className="py-6 text-center text-sm text-muted-foreground">No hay guías que coincidan con “{q}”.</p>
          )}
        </Accordion>
      ) : (
        <>
          {actual && (
            <div className="rounded-md border border-primary/25 bg-primary/5 p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Esta pantalla</p>
              <Accordion type="single" collapsible defaultValue={actual.id}><Guia g={actual} alNavegar={alNavegar} /></Accordion>
            </div>
          )}
          <Tabs defaultValue={SECCIONES_AYUDA[0]!.id}>
            <TabsList className="h-auto flex-wrap justify-start">
              {SECCIONES_AYUDA.map((s) => <TabsTrigger key={s.id} value={s.id}>{s.titulo}</TabsTrigger>)}
            </TabsList>
            {SECCIONES_AYUDA.map((s) => (
              <TabsContent key={s.id} value={s.id}>
                <Accordion type="multiple">
                  {s.guias.map((g) => <Guia key={g.id} g={g} alNavegar={alNavegar} />)}
                </Accordion>
              </TabsContent>
            ))}
          </Tabs>
        </>
      )}
    </div>
  );
}

export function BotonAyuda({ className }: { className?: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        data-tour="ayuda"
        onClick={() => setAbierto(true)}
        aria-label="Centro de ayuda"
        className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors", className)}
      >
        <CircleHelp className="size-4" /> <span>Ayuda</span>
      </button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Centro de ayuda</DialogTitle>
            <DialogDescription>Guías paso a paso de cada módulo del sistema.</DialogDescription>
          </DialogHeader>
          <PanelAyuda alNavegar={() => setAbierto(false)} />
          <Link to="/ayuda" onClick={() => setAbierto(false)} className="text-sm text-primary underline">
            Abrir el centro de ayuda en pantalla completa
          </Link>
        </DialogContent>
      </Dialog>
    </>
  );
}
