import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type OpcionBuscable = {
  valor: string;
  etiqueta: string;
  detalle?: string;
};

type Props = {
  opciones: OpcionBuscable[];
  valor: string;
  onSeleccionar: (valor: string) => void;
  placeholder?: string;
  placeholderBusqueda?: string;
  vacio?: string;
  className?: string;
  disabled?: boolean;
};

/** Selector con filtro por texto: al escribir muestra solo las coincidencias. */
export function SelectorBuscable({
  opciones,
  valor,
  onSeleccionar,
  placeholder = "Seleccionar",
  placeholderBusqueda = "Escribe para filtrar…",
  vacio = "Sin resultados",
  className,
  disabled,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");

  const seleccionada = valor ? opciones.find((o) => o.valor === valor) : undefined;

  const filtradas = useMemo(() => {
    const q = texto.trim().toLowerCase();
    const base = q
      ? opciones.filter((o) =>
          `${o.valor} ${o.etiqueta} ${o.detalle ?? ""}`.toLowerCase().includes(q),
        )
      : opciones;
    return base.slice(0, 100);
  }, [opciones, texto]);

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={abierto}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className={cn("truncate", !seleccionada && "text-muted-foreground")}>
            {seleccionada ? seleccionada.etiqueta : placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(28rem,calc(100vw-2rem))] p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={texto}
            onValueChange={setTexto}
            placeholder={placeholderBusqueda}
          />
          <CommandList>
            <CommandEmpty>{vacio}</CommandEmpty>
            <CommandGroup>
              {filtradas.map((o) => (
                <CommandItem
                  key={o.valor}
                  value={o.valor}
                  onSelect={() => {
                    onSeleccionar(o.valor);
                    setAbierto(false);
                    setTexto("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 size-4",
                      o.valor === valor ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{o.etiqueta}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
