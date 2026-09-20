import { useState } from "react";
import { Percent } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Botón para aplicar un mismo porcentaje de descuento a todas las líneas del documento. */
export function DescuentoGlobal({
  onAplicar,
  cantidadLineas,
}: {
  onAplicar: (porcentaje: number) => void;
  cantidadLineas: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState("");

  const aplicar = () => {
    const pct = Math.min(100, Math.max(0, Number(valor) || 0));
    onAplicar(pct);
    setAbierto(false);
    toast.success(
      pct > 0
        ? `Descuento de ${pct}% aplicado a ${cantidadLineas} línea(s)`
        : `Descuento eliminado en ${cantidadLineas} línea(s)`,
    );
  };

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" type="button">
          <Percent className="size-4" /> Descuento global
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <div className="space-y-1">
          <Label htmlFor="descuento-global">Descuento a todas las líneas (%)</Label>
          <Input
            id="descuento-global"
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={valor}
            placeholder="0"
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                aplicar();
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            Reemplaza el descuento de cada artículo. Usa 0 para quitarlo.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" type="button" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button size="sm" type="button" onClick={aplicar}>
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
