import { createFileRoute } from "@tanstack/react-router";
// colSpan ajustado a 9 columnas
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  activarRangoNCF,
  eliminarRangoNCF,
  guardarRangoNCF,
  obtenerListasNCF,
  obtenerRangosNCF,
} from "@/lib/erp.functions";
import { fechaCorta, hoyISO, TAMANO_SUFIJO_NCF, type RangoNCF } from "@/lib/erp-types";

export const Route = createFileRoute("/ncf")({
  head: () => ({
    meta: [
      { title: "Comprobantes fiscales (NCF) — ERP Contable RD" },
      {
        name: "description",
        content:
          "Rangos autorizados de comprobantes fiscales por sucursal y secuencia: inicio, fin, último emitido, disponible, alerta, autorización y vigencia.",
      },
      { property: "og:title", content: "Comprobantes fiscales (NCF) — ERP Contable RD" },
      {
        property: "og:description",
        content: "Control de rangos autorizados de NCF, su disponibilidad y vigencia.",
      },
    ],
  }),
  component: Comprobantes,
});

const TODOS = "__todos__";

function rangoVacio(ncfId: number, sucursalId: number, prefijo: string): RangoNCF {
  return {
    id: 0,
    prefijo,
    ncf_id: ncfId,
    sucursal_id: sucursalId,
    desde: 0,
    hasta: 0,
    ultimo: 0,
    alerta: 0,
    activa: false,
    autorizacion: "",
    vence: hoyISO(),
  };
}

function Comprobantes() {
  const qc = useQueryClient();
  const [sucursal, setSucursal] = useState("1");
  const [secuencia, setSecuencia] = useState(TODOS);
  const [editando, setEditando] = useState<RangoNCF | null>(null);
  const [seleccionado, setSeleccionado] = useState<number | null>(null);

  const { data: listas } = useQuery({ queryKey: ["listas-ncf"], queryFn: () => obtenerListasNCF() });
  const { data: rangos = [], isLoading } = useQuery({
    queryKey: ["rangos-ncf"],
    queryFn: () => obtenerRangosNCF(),
  });

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ["rangos-ncf"] });
    void qc.invalidateQueries({ queryKey: ["secuencias"] });
    void qc.invalidateQueries({ queryKey: ["resumen"] });
  };

  const guardar = useMutation({
    mutationFn: (r: RangoNCF) => guardarRangoNCF({ data: r }),
    onSuccess: () => {
      toast.success("Comprobante guardado");
      setEditando(null);
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar"),
  });

  const eliminar = useMutation({
    mutationFn: (id: number) => eliminarRangoNCF({ data: { id } }),
    onSuccess: () => {
      toast.success("Comprobante eliminado");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo eliminar"),
  });

  const activar = useMutation({
    mutationFn: (id: number) => activarRangoNCF({ data: { id } }),
    onSuccess: () => {
      toast.success("Secuencia activada");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo activar"),
  });

  const visibles = useMemo(
    () =>
      rangos.filter(
        (r) =>
          String(r.sucursal_id) === sucursal &&
          (secuencia === TODOS || String(r.ncf_id) === secuencia),
      ),
    [rangos, sucursal, secuencia],
  );

  const prefijoSugerido = useMemo(() => {
    const igual = rangos.find((r) => String(r.ncf_id) === secuencia);
    return igual?.prefijo ?? "";
  }, [rangos, secuencia]);

  const nueva = () => {
    const ncfId = secuencia === TODOS ? 1 : Number(secuencia);
    setEditando(rangoVacio(ncfId, Number(sucursal), prefijoSugerido));
  };

  const enviar = () => {
    if (!editando) return;
    if (!editando.prefijo.trim()) {
      toast.error("Indica el prefijo");
      return;
    }
    if (editando.hasta < editando.desde) {
      toast.error("Fin de secuencia debe ser mayor");
      return;
    }
    if (editando.ultimo < editando.desde - 1 || editando.ultimo > editando.hasta) {
      toast.error("El último emitido debe estar dentro del rango");
      return;
    }
    guardar.mutate(editando);
  };

  return (
    <div>
      <PageHeader
        titulo="Comprobantes fiscales"
        descripcion="Rangos autorizados por la DGII, por sucursal y tipo de secuencia"
      />

      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Sucursal</Label>
              <Select value={sucursal} onValueChange={setSucursal}>
                <SelectTrigger>
                  <SelectValue placeholder="Sucursal" />
                </SelectTrigger>
                <SelectContent>
                  {(listas?.sucursales ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Secuencia</Label>
              <Select value={secuencia} onValueChange={setSecuencia}>
                <SelectTrigger>
                  <SelectValue placeholder="Secuencia" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todas las secuencias</SelectItem>
                  {(listas?.tipos ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="sufijo">Tamaño sufijo</Label>
              <Input id="sufijo" value={TAMANO_SUFIJO_NCF} readOnly className="w-24" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table className="min-w-[1000px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Prefijo</TableHead>
                  <TableHead className="text-right">Inicio Sec.</TableHead>
                  <TableHead className="text-right">Fin Sec.</TableHead>
                  <TableHead className="text-right">Último Emitido</TableHead>
                  <TableHead className="text-right">Disponible</TableHead>
                  <TableHead className="text-right">Alerta</TableHead>
                  <TableHead className="text-center">Activo?</TableHead>
                  <TableHead>Autorización No.</TableHead>
                  <TableHead>F/Vigencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((r) => {
                  const disponible = Math.max(0, r.hasta - r.ultimo);
                  const vencida = r.vence !== "" && r.vence < hoyISO();
                  return (
                    <TableRow
                      key={r.id}
                      onClick={() => setSeleccionado(r.id)}
                      className={`cursor-pointer ${seleccionado === r.id ? "bg-primary/10" : r.activa ? "bg-primary/5" : ""}`}
                    >
                      <TableCell className="font-mono font-medium">{r.prefijo}</TableCell>
                      <TableCell className="tabular text-right">{r.desde}</TableCell>
                      <TableCell className="tabular text-right">{r.hasta}</TableCell>
                      <TableCell className="tabular text-right">{r.ultimo}</TableCell>
                      <TableCell className="tabular text-right">
                        {disponible === 0 ? (
                          <span className="text-muted-foreground">0</span>
                        ) : disponible <= r.alerta ? (
                          <span className="font-semibold text-amber-600">{disponible}</span>
                        ) : (
                          disponible
                        )}
                      </TableCell>
                      <TableCell className="tabular text-right">{r.alerta}</TableCell>
                      <TableCell className="text-center">
                        <Checkbox checked={r.activa} disabled aria-label="Activo" />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.autorizacion || "—"}</TableCell>
                      <TableCell>
                        {r.vence ? (
                          vencida ? (
                            <Badge variant="destructive">{fechaCorta(r.vence)}</Badge>
                          ) : (
                            fechaCorta(r.vence)
                          )
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!isLoading && visibles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground">
                      Sin comprobantes registrados para esta selección.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={nueva}>Nueva</Button>
            <Button
              variant="outline"
              disabled={seleccionado === null}
              onClick={() => {
                const r = visibles.find((x) => x.id === seleccionado);
                if (r) setEditando(r);
              }}
            >
              Cambiar
            </Button>
            <Button
              variant="outline"
              disabled={
                seleccionado === null ||
                activar.isPending ||
                (visibles.find((x) => x.id === seleccionado)?.activa ?? true)
              }
              onClick={() => {
                if (seleccionado !== null) activar.mutate(seleccionado);
              }}
            >
              Activar
            </Button>
            <Button
              variant="outline"
              className="text-destructive"
              disabled={seleccionado === null || eliminar.isPending}
              onClick={() => {
                const r = visibles.find((x) => x.id === seleccionado);
                if (r && confirm(`¿Eliminar el rango ${r.prefijo} ${r.desde}-${r.hasta}?`)) {
                  eliminar.mutate(r.id);
                }
              }}
            >
              Eliminar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editando !== null} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editando && editando.id > 0 ? "Cambiar comprobante" : "Nuevo comprobante"}
            </DialogTitle>
          </DialogHeader>
          {editando && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Secuencia</Label>
                <Select
                  value={String(editando.ncf_id)}
                  onValueChange={(v) => setEditando({ ...editando, ncf_id: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Secuencia" />
                  </SelectTrigger>
                  <SelectContent>
                    {(listas?.tipos ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="prefijo">Prefijo</Label>
                <Input
                  id="prefijo"
                  maxLength={11}
                  value={editando.prefijo}
                  onChange={(e) =>
                    setEditando({ ...editando, prefijo: e.target.value.toUpperCase() })
                  }
                />
              </div>
              <div>
                <Label>Sucursal</Label>
                <Select
                  value={String(editando.sucursal_id)}
                  onValueChange={(v) => setEditando({ ...editando, sucursal_id: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    {(listas?.sucursales ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="desde">Inicio Sec.</Label>
                <Input
                  id="desde"
                  type="number"
                  min={0}
                  value={editando.desde}
                  onChange={(e) =>
                    setEditando({ ...editando, desde: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
              </div>
              <div>
                <Label htmlFor="hasta">Fin Sec.</Label>
                <Input
                  id="hasta"
                  type="number"
                  min={0}
                  value={editando.hasta}
                  onChange={(e) =>
                    setEditando({ ...editando, hasta: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
              </div>
              <div>
                <Label htmlFor="ultimo">Último emitido</Label>
                <Input
                  id="ultimo"
                  type="number"
                  min={0}
                  value={editando.ultimo}
                  onChange={(e) =>
                    setEditando({ ...editando, ultimo: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
              </div>
              <div>
                <Label htmlFor="alerta">Alerta</Label>
                <Input
                  id="alerta"
                  type="number"
                  min={0}
                  value={editando.alerta}
                  onChange={(e) =>
                    setEditando({ ...editando, alerta: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
              </div>
              <div>
                <Label htmlFor="autorizacion">Autorización No.</Label>
                <Input
                  id="autorizacion"
                  maxLength={15}
                  value={editando.autorizacion}
                  onChange={(e) => setEditando({ ...editando, autorizacion: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="vence">F/Vigencia</Label>
                <Input
                  id="vence"
                  type="date"
                  value={editando.vence}
                  onChange={(e) => setEditando({ ...editando, vence: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-3 sm:col-span-2">
                <Switch
                  id="activa"
                  checked={editando.activa}
                  onCheckedChange={(v) => setEditando({ ...editando, activa: v })}
                />
                <Label htmlFor="activa">Secuencia activa</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button onClick={enviar} disabled={guardar.isPending}>
              {guardar.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
