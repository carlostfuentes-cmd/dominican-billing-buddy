import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Plus, Split, Trash2 } from "lucide-react";

import { SelectorBuscable } from "@/components/SelectorBuscable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  /** Permite repartir una línea entre varios centros de costo. */
  distribuir?: boolean;
  /** Cuentas fijas: no se pueden cambiar, borrar ni distribuir (p. ej. la caja chica). */
  cuentasBloqueadas?: string[];
};

type Reparto = { departamento_id: string; monto: number };

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
  distribuir = false,
  cuentasBloqueadas = [],
}: Props) {
  const [repartiendo, setRepartiendo] = useState<number | null>(null);
  const [reparto, setReparto] = useState<Reparto[]>([]);
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

  const lineaReparto = repartiendo !== null ? lineas[repartiendo] : undefined;
  const montoLinea = lineaReparto ? round2(lineaReparto.debito || lineaReparto.credito) : 0;
  const sumaReparto = round2(reparto.reduce((s, r) => s + (r.monto || 0), 0));
  const faltaReparto = round2(montoLinea - sumaReparto);

  const abrirReparto = (indice: number) => {
    const l = lineas[indice];
    if (!l) return;
    const m = round2(l.debito || l.credito);
    const deps = listas?.departamentos ?? [];
    setReparto([
      { departamento_id: l.departamento_id || deps[0]?.id || "", monto: m },
      { departamento_id: "", monto: 0 },
    ]);
    setRepartiendo(indice);
  };

  const aplicarReparto = () => {
    if (repartiendo === null || !lineaReparto) return;
    const esDebito = (lineaReparto.debito || 0) > 0;
    const partes = reparto.filter((r) => r.monto > 0);
    const nuevas = partes.map((r) => ({
      ...lineaReparto,
      departamento_id: r.departamento_id || undefined,
      debito: esDebito ? round2(r.monto) : 0,
      credito: esDebito ? 0 : round2(r.monto),
    }));
    onCambiar([
      ...lineas.slice(0, repartiendo),
      ...nuevas,
      ...lineas.slice(repartiendo + 1),
    ]);
    setRepartiendo(null);
  };

  const errorReparto =
    reparto.filter((r) => r.monto > 0).length < 2
      ? "Indica al menos dos centros de costo con monto."
      : reparto.some((r) => r.monto > 0 && !r.departamento_id)
        ? "Elige el centro de costo de cada parte."
        : new Set(reparto.filter((r) => r.monto > 0).map((r) => r.departamento_id)).size !==
            reparto.filter((r) => r.monto > 0).length
          ? "No repitas el mismo centro de costo."
          : Math.abs(faltaReparto) > 0.009
            ? `La suma debe ser igual a ${nf.format(montoLinea)}.`
            : "";

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
          lineas.map((l, i) => {
            const bloqueada = cuentasBloqueadas.includes(l.cuenta);
            return (
            <div
              key={i}
              className={`grid gap-3 rounded-md border p-3 ${distribuir ? "lg:grid-cols-[minmax(220px,3fr)_minmax(170px,2fr)_minmax(150px,1.5fr)_minmax(150px,1.5fr)_minmax(150px,1.5fr)_88px]" : "lg:grid-cols-[minmax(220px,3fr)_minmax(170px,2fr)_minmax(150px,1.5fr)_minmax(150px,1.5fr)_minmax(150px,1.5fr)_44px]"}`}
            >
              <div className="min-w-0">
                {bloqueada ? (
                  <div className="flex h-9 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm">
                    <Lock className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                      {l.cuenta} — {l.cuenta_nombre}
                    </span>
                  </div>
                ) : (
                  <SelectorBuscable
                    opciones={opcionesCuentas}
                    valor={l.cuenta}
                    onSeleccionar={(v) => elegirCuenta(i, v)}
                    placeholder="Cuenta contable"
                    placeholderBusqueda="Escribe número o nombre…"
                  />
                )}
              </div>
              <div className="min-w-0">
                <Input
                  value={l.descripcion}
                  onChange={(e) => actualizar(i, { descripcion: e.target.value })}
                  placeholder="Concepto"
                  maxLength={200}
                />
              </div>
              <div className="min-w-0">
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
              <div className="min-w-0">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={l.debito}
                  onChange={(e) =>
                    actualizar(i, { debito: Number(e.target.value), credito: 0 })
                  }
                  className="text-right tabular-nums"
                  aria-label="Débito"
                />
              </div>
              <div className="min-w-0">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={l.credito}
                  onChange={(e) =>
                    actualizar(i, { credito: Number(e.target.value), debito: 0 })
                  }
                  className="text-right tabular-nums"
                  aria-label="Crédito"
                />
              </div>
              <div className="flex items-center justify-end">
                {bloqueada ? (
                  <Lock
                    className="size-4 text-muted-foreground"
                    aria-label="Cuenta fija de la caja chica"
                  />
                ) : (
                  <>
                    {distribuir ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Distribuir en centros de costo"
                        title="Distribuir en varios centros de costo"
                        disabled={!(l.debito || l.credito)}
                        onClick={() => abrirReparto(i)}
                      >
                        <Split className="size-4" />
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Quitar cuenta"
                      onClick={() => onCambiar(lineas.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
            );
          })
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

      <Dialog open={repartiendo !== null} onOpenChange={(o) => !o && setRepartiendo(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Distribuir en centros de costo</DialogTitle>
            <DialogDescription>
              {lineaReparto?.cuenta} {lineaReparto?.cuenta_nombre} · Monto a repartir{" "}
              <strong>{nf.format(montoLinea)}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {reparto.map((r, k) => (
              <div key={k} className="grid grid-cols-[1fr_130px_40px] gap-2">
                <Select
                  value={r.departamento_id || SIN}
                  onValueChange={(v) =>
                    setReparto((rs) =>
                      rs.map((x, j) => (j === k ? { ...x, departamento_id: v === SIN ? "" : v } : x)),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Centro de costo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN}>Elige el centro de costo</SelectItem>
                    {(listas?.departamentos ?? []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={r.monto}
                  onChange={(e) =>
                    setReparto((rs) =>
                      rs.map((x, j) =>
                        j === k ? { ...x, monto: Math.abs(Number(e.target.value) || 0) } : x,
                      ),
                    )
                  }
                  className="text-right tabular-nums"
                  aria-label="Monto"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Quitar"
                  onClick={() => setReparto((rs) => rs.filter((_, j) => j !== k))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setReparto((rs) => [
                    ...rs,
                    { departamento_id: "", monto: Math.max(0, faltaReparto) },
                  ])
                }
              >
                <Plus className="size-4" /> Agregar centro de costo
              </Button>
              <span
                className={`text-sm tabular-nums ${Math.abs(faltaReparto) > 0.009 ? "text-destructive" : "text-muted-foreground"}`}
              >
                Asignado {nf.format(sumaReparto)} · Falta {nf.format(faltaReparto)}
              </span>
            </div>
            {errorReparto ? <p className="text-xs text-destructive">{errorReparto}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRepartiendo(null)}>
              Cancelar
            </Button>
            <Button onClick={aplicarReparto} disabled={Boolean(errorReparto)}>
              Aplicar distribución
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
