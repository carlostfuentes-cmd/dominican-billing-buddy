import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ListPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { obtenerCampos, obtenerValoresCampos } from "@/lib/campos.functions";
import type { CampoPersonalizado, ProcesoCampo } from "@/lib/db/campos.server";

export type ValoresCampos = Record<number, string>;

/** Botón + ventana con los campos personalizados asignados al proceso. */
export function CamposPersonalizados({
  proceso,
  valores,
  onCambiar,
}: {
  proceso: ProcesoCampo;
  valores: ValoresCampos;
  onCambiar: (valores: ValoresCampos) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState<ValoresCampos>(valores);

  const { data: campos = [] } = useQuery({
    queryKey: ["campos-personalizados", proceso],
    queryFn: () => obtenerCampos({ data: { proceso } }),
  });

  const llenos = campos.filter((c) => (valores[c.id] ?? "").trim() !== "").length;

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        if (v) setBorrador(valores);
        setAbierto(v);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <ListPlus className="size-4" /> Campos personalizados
          {llenos > 0 ? ` (${llenos})` : ""}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Campos personalizados</DialogTitle>
          <DialogDescription>
            Se guardan junto con el documento. Deja en blanco los que no apliquen.
          </DialogDescription>
        </DialogHeader>

        {campos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay campos asignados a este proceso. Puedes crearlos en Campos personalizados.
          </p>
        ) : (
          <div className="grid gap-3">
            {campos.map((c) => (
              <CampoEntrada
                key={c.id}
                campo={c}
                valor={borrador[c.id] ?? ""}
                onCambiar={(v) => setBorrador((prev) => ({ ...prev, [c.id]: v }))}
              />
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onCambiar(borrador);
              setAbierto(false);
            }}
            disabled={campos.length === 0}
          >
            Aceptar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampoEntrada({
  campo,
  valor,
  onCambiar,
}: {
  campo: CampoPersonalizado;
  valor: string;
  onCambiar: (valor: string) => void;
}) {
  const id = `campo-${campo.id}`;
  return (
    <div>
      <Label htmlFor={id}>{campo.nombre}</Label>
      {campo.tipo === "PARRAFO" ? (
        <Textarea id={id} rows={3} value={valor} onChange={(e) => onCambiar(e.target.value)} />
      ) : campo.tipo === "FECHA" ? (
        <Input id={id} type="date" value={valor} onChange={(e) => onCambiar(e.target.value)} />
      ) : campo.tipo === "ENTERO" || campo.tipo === "DECIMAL" ? (
        <Input
          id={id}
          type="number"
          step={campo.tipo === "ENTERO" ? 1 : 10 ** -(campo.decimales || 2)}
          value={valor}
          onChange={(e) => onCambiar(e.target.value)}
        />
      ) : (
        <Input
          id={id}
          value={valor}
          maxLength={campo.longitud || 60}
          onChange={(e) => onCambiar(e.target.value)}
        />
      )}
    </div>
  );
}

/** Muestra los campos personalizados guardados de un documento. */
export function CamposDocumento({
  proceso,
  referencia,
}: {
  proceso: ProcesoCampo;
  referencia: string;
}) {
  const { data: valores = [] } = useQuery({
    queryKey: ["valores-campos", proceso, referencia],
    queryFn: () => obtenerValoresCampos({ data: { proceso, referencia } }),
  });
  const llenos = valores.filter((v) => v.valor.trim() !== "");
  if (!llenos.length) return null;
  return (
    <div className="grid gap-1 text-sm sm:grid-cols-2">
      {llenos.map((v) => (
        <p key={v.campo_id}>
          <span className="text-muted-foreground">{v.nombre}: </span>
          {v.valor}
        </p>
      ))}
    </div>
  );
}
