import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { guardarSecuencia, obtenerSecuencias } from "@/lib/erp.functions";
import { fechaCorta, formatearNCF, hoyISO, TIPOS_NCF, type SecuenciaNCF } from "@/lib/erp-types";

export const Route = createFileRoute("/ncf")({
  head: () => ({
    meta: [
      { title: "Secuencias NCF — ERP Contable RD" },
      {
        name: "description",
        content:
          "Control de rangos autorizados de comprobantes fiscales B01, B02, B14 y B15 con su vencimiento.",
      },
      { property: "og:title", content: "Secuencias NCF — ERP Contable RD" },
      { property: "og:description", content: "Rangos autorizados de NCF y su disponibilidad." },
    ],
  }),
  component: Secuencias,
});

function Secuencias() {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<SecuenciaNCF | null>(null);

  const { data: secuencias = [], isLoading } = useQuery({
    queryKey: ["secuencias"],
    queryFn: () => obtenerSecuencias(),
  });

  const mutar = useMutation({
    mutationFn: (s: SecuenciaNCF) => guardarSecuencia({ data: s }),
    onSuccess: () => {
      toast.success("Secuencia actualizada");
      setEditando(null);
      void qc.invalidateQueries({ queryKey: ["secuencias"] });
      void qc.invalidateQueries({ queryKey: ["resumen"] });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar la secuencia"),
  });

  const enviar = () => {
    if (!editando) return;
    if (editando.hasta < editando.desde) return toast.error("El rango final debe ser mayor");
    if (editando.proximo < editando.desde || editando.proximo > editando.hasta + 1)
      return toast.error("El próximo número debe estar dentro del rango");
    mutar.mutate(editando);
  };

  return (
    <div>
      <PageHeader
        titulo="Secuencias NCF"
        descripcion="Rangos autorizados por la DGII para cada tipo de comprobante"
      />

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Rango autorizado</TableHead>
                <TableHead>Próximo comprobante</TableHead>
                <TableHead className="text-right">Disponibles</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {secuencias.map((s) => {
                const restantes = Math.max(0, s.hasta - s.proximo + 1);
                const vencida = s.vence < hoyISO();
                return (
                  <TableRow key={s.tipo_ncf}>
                    <TableCell className="font-medium">
                      {TIPOS_NCF.find((t) => t.codigo === s.tipo_ncf)?.nombre ?? s.tipo_ncf}
                    </TableCell>
                    <TableCell className="tabular">
                      {s.desde} – {s.hasta}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatearNCF(s.tipo_ncf, s.proximo)}
                    </TableCell>
                    <TableCell className="tabular text-right">{restantes}</TableCell>
                    <TableCell>{fechaCorta(s.vence)}</TableCell>
                    <TableCell>
                      {!s.activa ? (
                        <Badge variant="outline">Inactiva</Badge>
                      ) : vencida ? (
                        <Badge variant="destructive">Vencida</Badge>
                      ) : restantes === 0 ? (
                        <Badge variant="destructive">Agotada</Badge>
                      ) : restantes <= 20 ? (
                        <Badge className="bg-amber-500 text-white">Por agotarse</Badge>
                      ) : (
                        <Badge variant="secondary">Disponible</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setEditando(s)}>
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!isLoading && secuencias.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Sin secuencias configuradas.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={editando !== null} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Secuencia {editando?.tipo_ncf}</DialogTitle>
          </DialogHeader>
          {editando && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="desde">Desde</Label>
                <Input
                  id="desde"
                  type="number"
                  min={1}
                  value={editando.desde}
                  onChange={(e) =>
                    setEditando({ ...editando, desde: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
              </div>
              <div>
                <Label htmlFor="hasta">Hasta</Label>
                <Input
                  id="hasta"
                  type="number"
                  min={1}
                  value={editando.hasta}
                  onChange={(e) =>
                    setEditando({ ...editando, hasta: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
              </div>
              <div>
                <Label htmlFor="proximo">Próximo número</Label>
                <Input
                  id="proximo"
                  type="number"
                  min={1}
                  value={editando.proximo}
                  onChange={(e) =>
                    setEditando({ ...editando, proximo: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
              </div>
              <div>
                <Label htmlFor="vence">Vence</Label>
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
            <Button onClick={enviar} disabled={mutar.isPending}>
              {mutar.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
