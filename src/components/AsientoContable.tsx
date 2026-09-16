import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";

import { SelectorBuscable } from "@/components/SelectorBuscable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { obtenerListasContabilidad } from "@/lib/contabilidad.functions";
import { round2, type LineaAsiento } from "@/lib/erp-types";

const SIN = "sin";

type Props = {
  lineas: LineaAsiento[];
  onCambiar: (lineas: LineaAsiento[]) => void;
  advertencias?: string[];
  cargando?: boolean;
  titulo?: string;
  nota?: string;
};

const nf = new Intl.NumberFormat("es-DO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Cuentas contables propuestas por la clasificación de inventario.
 * Se muestran al hacer la operación y el usuario puede cambiarlas.
 */
export function AsientoContable({
  lineas,
  onCambiar,
  advertencias = [],
  cargando,
  titulo = "Cuentas contables",
  nota = "Propuestas según la clasificación del producto. Puedes cambiarlas antes de guardar.",
}: Props) {
  const { data: listas } = useQuery({
    queryKey: ["listas-contabilidad"],
    queryFn: () => obtenerListasContabilidad(),
    staleTime: 300_000,
  });

  const opcionesCuentas = useMemo(
    () =>
      (listas?.cuentas ?? []).map((c) => ({
        valor: c.cuenta,
        etiqueta: `${c.cuenta} — ${c.nombre}`,
        detalle: c.clasificacion ?? "",
      })),
    [listas],
  );

  const debito = round2(lineas.reduce((s, l) => s + (l.debito || 0), 0));
  const credito = round2(lineas.reduce((s, l) => s + (l.credito || 0), 0));
  const diferencia = round2(debito - credito);

  const actualizar = (indice: number, cambios: Partial<LineaAsiento>) =>
    onCambiar(lineas.map((l, i) => (i === indice ? { ...l, ...cambios } : l)));

  const elegirCuenta = (indice: number, cuenta: string) => {
    const info = (listas?.cuentas ?? []).find((c) => c.cuenta === cuenta);
    actualizar(indice, { cuenta, cuenta_nombre: info?.nombre ?? "" });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>{titulo}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{nota}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            onCambiar([...lineas, { cuenta: "", descripcion: "", debito: 0, credito: 0 }])
          }
        >
          <Plus className="size-4" /> Agregar cuenta
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {advertencias.length ? (
          <ul className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
            {advertencias.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : null}

        {cargando ? (
          <p className="text-sm text-muted-foreground">Calculando cuentas…</p>
        ) : lineas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin cuentas para esta operación. Agrega las líneas del documento.
          </p>
        ) : (
          lineas.map((l, i) => (
            <div key={i} className="grid gap-3 rounded-md border p-3 lg:grid-cols-12">
              <div className="lg:col-span-4">
                <SelectorBuscable
                  opciones={opcionesCuentas}
                  valor={l.cuenta}
                  onSeleccionar={(v) => elegirCuenta(i, v)}
                  placeholder="Cuenta contable"
                  placeholderBusqueda="Escribe número o nombre…"
                />
              </div>
              <div className="lg:col-span-3">
                <Input
                  value={l.descripcion}
                  onChange={(e) => actualizar(i, { descripcion: e.target.value })}
                  placeholder="Concepto"
                  maxLength={200}
                />
              </div>
              <div className="lg:col-span-2">
                <Select
                  value={l.departamento_id || SIN}
                  onValueChange={(v) =>
                    actualizar(i, { departamento_id: v === SIN ? undefined : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Centro de costo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN}>Sin centro de costo</SelectItem>
                    {(listas?.departamentos ?? []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={l.debito}
                  onChange={(e) =>
                    actualizar(i, { debito: Number(e.target.value), credito: 0 })
                  }
                  className="tabular-nums"
                  aria-label="Débito"
                />
              </div>
              <div>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={l.credito}
                  onChange={(e) =>
                    actualizar(i, { credito: Number(e.target.value), debito: 0 })
                  }
                  className="tabular-nums"
                  aria-label="Crédito"
                />
              </div>
              <div className="flex items-center justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Quitar cuenta"
                  onClick={() => onCambiar(lineas.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))
        )}

        {lineas.length ? (
          <div className="flex flex-wrap justify-end gap-6 border-t pt-3 text-sm tabular-nums">
            <span className="text-muted-foreground">
              Débito <strong className="text-foreground">{nf.format(debito)}</strong>
            </span>
            <span className="text-muted-foreground">
              Crédito <strong className="text-foreground">{nf.format(credito)}</strong>
            </span>
            <span className={diferencia === 0 ? "text-muted-foreground" : "text-destructive"}>
              Diferencia <strong>{nf.format(diferencia)}</strong>
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
