import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Search } from "lucide-react";

import { PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RegistroAuditoria } from "@/lib/db/auditoria.server";
import { obtenerAuditoria, obtenerListasAuditoria } from "@/lib/auditoria.functions";
import { hoyISO } from "@/lib/erp-types";

export const Route = createFileRoute("/auditoria")({
  head: () => ({
    meta: [
      { title: "Auditoría de operaciones — ERP Contable RD" },
      {
        name: "description",
        content:
          "Consulta quién agregó, modificó o eliminó cada documento del sistema, con fecha, pantalla y detalle de los cambios.",
      },
      { property: "og:title", content: "Auditoría de operaciones — ERP Contable RD" },
      {
        property: "og:description",
        content: "Bitácora de operaciones por usuario, pantalla, tipo y documento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Auditoria,
});

const TODOS = "__todos__";

function fechaLegible(valor: string) {
  const limpio = valor.replace("T", " ").slice(0, 19);
  const [f = "", h = ""] = limpio.split(" ");
  const [a, m, d] = f.split("-");
  return a ? `${d}/${m}/${a} ${h.slice(0, 5)}` : valor;
}

const COLOR: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  A: "default",
  E: "secondary",
  B: "destructive",
  X: "destructive",
};

function Auditoria() {
  const [desde, setDesde] = useState(`${hoyISO().slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(hoyISO());
  const [usuario, setUsuario] = useState(TODOS);
  const [pantalla, setPantalla] = useState(TODOS);
  const [tipo, setTipo] = useState(TODOS);
  const [referencia, setReferencia] = useState("");
  const [detalle, setDetalle] = useState<RegistroAuditoria | null>(null);

  const { data: listas } = useQuery({
    queryKey: ["auditoria", "listas"],
    queryFn: () => obtenerListasAuditoria(),
    staleTime: 5 * 60_000,
  });

  const filtro = {
    desde,
    hasta,
    ...(usuario !== TODOS ? { usuarioId: Number(usuario) } : {}),
    ...(pantalla !== TODOS ? { menuId: pantalla } : {}),
    ...(tipo !== TODOS ? { tipo } : {}),
    ...(referencia.trim() ? { referencia: referencia.trim() } : {}),
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["auditoria", filtro],
    queryFn: () => obtenerAuditoria({ data: filtro }),
  });

  const exportar = () => {
    const filas = data ?? [];
    const csv = [
      "Fecha,Usuario,Pantalla,Tipo,Operacion,Documento,Origen,IP,Equipo",
      ...filas.map((r) =>
        [
          r.fecha,
          r.usuario,
          r.pantalla,
          r.tipo_nombre,
          `"${r.accion.replace(/"/g, "'")}"`,
          r.referencia ?? "",
          r.origen ?? "",
          r.ip ?? "",
          r.equipo ?? "",
        ].join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `auditoria-${desde}-a-${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        titulo="Auditoría"
        descripcion="Operaciones realizadas por los usuarios: qué se agregó, modificó o eliminó, cuándo y desde dónde"
        acciones={
          <Button variant="outline" onClick={exportar} disabled={!data?.length}>
            <Download className="size-4" /> Exportar (CSV)
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="grid gap-3 pt-6 md:grid-cols-3 xl:grid-cols-6">
          <div>
            <Label htmlFor="desde">Desde</Label>
            <Input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="hasta">Hasta</Label>
            <Input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div>
            <Label>Usuario</Label>
            <Select value={usuario} onValueChange={setUsuario}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos los usuarios</SelectItem>
                {(listas?.usuarios ?? []).map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Pantalla</Label>
            <Select value={pantalla} onValueChange={setPantalla}>
              <SelectTrigger>
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas las pantallas</SelectItem>
                {(listas?.pantallas ?? []).map((p) => (
                  <SelectItem key={p.menu_id} value={p.menu_id}>
                    {p.titulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos los tipos</SelectItem>
                {(listas?.tipos ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="ref">Documento</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
              <Input
                id="ref"
                className="pl-8"
                placeholder="No. o texto"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Fecha</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Pantalla</TableHead>
                <TableHead className="w-[90px]">Tipo</TableHead>
                <TableHead>Operación</TableHead>
                <TableHead className="w-[110px]">Documento</TableHead>
                <TableHead className="w-[90px]">Origen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => setDetalle(r)}
                  title="Ver detalle"
                >
                  <TableCell className="tabular whitespace-nowrap text-xs">
                    {fechaLegible(r.fecha)}
                  </TableCell>
                  <TableCell className="font-medium">{r.usuario}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.pantalla}</TableCell>
                  <TableCell>
                    <Badge variant={COLOR[r.tipo] ?? "outline"}>{r.tipo_nombre}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[420px] truncate text-sm">{r.accion}</TableCell>
                  <TableCell className="tabular text-sm">{r.referencia ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.origen}</TableCell>
                </TableRow>
              ))}
              {!isLoading && (data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    {error ? (error as Error).message : "Sin operaciones en el período."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {(data?.length ?? 0) >= 500 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Se muestran las 500 operaciones más recientes del período. Ajusta los filtros para ver
              más.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detalle} onOpenChange={(v) => !v && setDetalle(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-auto">
          <DialogHeader>
            <DialogTitle>Detalle de la operación</DialogTitle>
          </DialogHeader>
          {detalle && (
            <div className="space-y-3 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Fecha: </span>
                  {fechaLegible(detalle.fecha)}
                </p>
                <p>
                  <span className="text-muted-foreground">Usuario: </span>
                  {detalle.usuario}
                </p>
                <p>
                  <span className="text-muted-foreground">Pantalla: </span>
                  {detalle.pantalla}
                </p>
                <p>
                  <span className="text-muted-foreground">Tipo: </span>
                  {detalle.tipo_nombre}
                </p>
                <p>
                  <span className="text-muted-foreground">Documento: </span>
                  {detalle.referencia ?? "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Equipo / IP: </span>
                  {detalle.equipo ?? "—"} {detalle.ip ? `(${detalle.ip})` : ""}
                </p>
              </div>
              <p className="font-medium">{detalle.accion}</p>
              <div>
                <p className="mb-1 text-muted-foreground">Cambios registrados</p>
                <pre className="max-h-[45vh] overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
                  {detalle.cambios ?? "Sin detalle de cambios para esta operación."}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
