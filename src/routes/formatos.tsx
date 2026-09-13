import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Printer, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import {
  eliminarFormatoImpresion,
  guardarFormatoImpresion,
  obtenerEmpresas,
  obtenerFormatoImpresion,
  obtenerFormatosImpresion,
} from "@/lib/erp.functions";
import {
  FORMATO_IMPRESION_DEFECTO,
  PAPELES,
  type FormatoImpresion,
  type PapelImpresion,
} from "@/lib/erp-types";

export const Route = createFileRoute("/formatos")({
  head: () => ({
    meta: [
      { title: "Formatos de impresión — ERP Contable RD" },
      {
        name: "description",
        content:
          "Define el formato de impresión de la factura para cada empresa: tamaño de papel, papel preimpreso, márgenes, columnas y pie de página.",
      },
      { property: "og:title", content: "Formatos de impresión — ERP Contable RD" },
      {
        property: "og:description",
        content: "Tamaño de papel, papel preimpreso, márgenes y columnas por empresa.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Formatos,
});

function Formatos() {
  const qc = useQueryClient();
  const [empresaId, setEmpresaId] = useState("*");
  const [form, setForm] = useState<FormatoImpresion>(FORMATO_IMPRESION_DEFECTO);

  const { data: empresas } = useQuery({
    queryKey: ["empresas"],
    queryFn: () => obtenerEmpresas(),
  });
  const { data: guardados } = useQuery({
    queryKey: ["formatos"],
    queryFn: () => obtenerFormatosImpresion(),
  });
  const { data: formato } = useQuery({
    queryKey: ["formato", empresaId],
    queryFn: () => obtenerFormatoImpresion({ data: { empresaId } }),
  });

  useEffect(() => {
    if (formato) setForm({ ...formato, empresa_id: empresaId });
  }, [formato, empresaId]);

  const guardar = useMutation({
    mutationFn: (f: FormatoImpresion) => guardarFormatoImpresion({ data: f }),
    onSuccess: () => {
      toast.success("Formato guardado");
      void qc.invalidateQueries({ queryKey: ["formatos"] });
      void qc.invalidateQueries({ queryKey: ["formato"] });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar el formato"),
  });

  const borrar = useMutation({
    mutationFn: () => eliminarFormatoImpresion({ data: { empresaId } }),
    onSuccess: () => {
      toast.success("Formato eliminado; se usará el formato general");
      void qc.invalidateQueries({ queryKey: ["formatos"] });
      void qc.invalidateQueries({ queryKey: ["formato"] });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo eliminar"),
  });

  const set = <K extends keyof FormatoImpresion>(campo: K, valor: FormatoImpresion[K]) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  const tieneFormato = (guardados ?? []).some((f) => f.empresa_id === empresaId);
  const nombreEmpresa =
    empresaId === "*"
      ? "Formato general (todas las empresas)"
      : (empresas ?? []).find((e) => e.id === empresaId)?.nombre ?? empresaId;

  const casillas: { campo: keyof FormatoImpresion; etiqueta: string; ayuda: string }[] = [
    {
      campo: "preimpreso",
      etiqueta: "Papel preimpreso",
      ayuda: "No se imprime el encabezado ni el logo de la empresa.",
    },
    { campo: "mostrar_logo", etiqueta: "Mostrar logo y datos de la empresa", ayuda: "" },
    { campo: "mostrar_codigo", etiqueta: "Columna de código del producto", ayuda: "" },
    { campo: "mostrar_itbis_linea", etiqueta: "Columna de ITBIS por línea", ayuda: "" },
    { campo: "mostrar_descuento", etiqueta: "Columna de descuento", ayuda: "" },
    {
      campo: "mostrar_equivalente_dop",
      etiqueta: "Equivalente en pesos",
      ayuda: "Solo aplica cuando la factura está en otra moneda.",
    },
  ];

  return (
    <div>
      <PageHeader
        titulo="Formatos de impresión"
        descripcion="Cada empresa imprime su factura con su propio formato. El formato general se usa cuando la empresa no tiene uno propio."
      />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Empresa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-[420px] overflow-y-auto rounded-md border">
              <button
                type="button"
                onClick={() => setEmpresaId("*")}
                className={`flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm ${
                  empresaId === "*" ? "bg-accent font-medium" : "hover:bg-muted/60"
                }`}
              >
                <span>Formato general</span>
                <Printer className="size-4 opacity-60" />
              </button>
              {(empresas ?? []).map((c) => {
                const propio = (guardados ?? []).some((f) => f.empresa_id === c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setEmpresaId(c.id)}
                    className={`flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-0 ${
                      empresaId === c.id ? "bg-accent font-medium" : "hover:bg-muted/60"
                    }`}
                  >
                    <span className="min-w-0 truncate">{c.nombre}</span>
                    {propio ? (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        propio
                      </Badge>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">{nombreEmpresa}</CardTitle>
            <div className="flex gap-2">
              {empresaId !== "*" && tieneFormato ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => borrar.mutate()}
                  disabled={borrar.isPending}
                >
                  <Trash2 className="size-4" /> Usar el general
                </Button>
              ) : null}
              <Button
                size="sm"
                onClick={() => guardar.mutate({ ...form, empresa_id: empresaId })}
                disabled={guardar.isPending}
              >
                <Save className="size-4" /> Guardar formato
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nombre del formato</Label>
                <Input
                  value={form.nombre}
                  maxLength={60}
                  onChange={(e) => set("nombre", e.target.value)}
                  placeholder="Ej. Factura media hoja"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tamaño de papel</Label>
                <Select
                  value={form.papel}
                  onValueChange={(v) => set("papel", v as PapelImpresion)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAPELES.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Título impreso</Label>
                <Input
                  value={form.titulo}
                  maxLength={80}
                  onChange={(e) => set("titulo", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Copias</Label>
                <Input
                  type="number"
                  min={1}
                  max={4}
                  value={form.copias}
                  onChange={(e) => set("copias", Math.max(1, Math.min(4, Number(e.target.value))))}
                />
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Márgenes (mm)</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(
                  [
                    ["margen_superior", "Arriba"],
                    ["margen_inferior", "Abajo"],
                    ["margen_izquierdo", "Izquierda"],
                    ["margen_derecho", "Derecha"],
                  ] as const
                ).map(([campo, etiqueta]) => (
                  <div key={campo} className="space-y-1.5">
                    <Label className="text-xs">{etiqueta}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={80}
                      value={form[campo]}
                      onChange={(e) =>
                        set(campo, Math.max(0, Math.min(80, Number(e.target.value))))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {casillas.map(({ campo, etiqueta, ayuda }) => (
                <label
                  key={String(campo)}
                  className="flex items-start justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <span className="text-sm">
                    {etiqueta}
                    {ayuda ? (
                      <span className="block text-xs text-muted-foreground">{ayuda}</span>
                    ) : null}
                  </span>
                  <Switch
                    checked={Boolean(form[campo])}
                    onCheckedChange={(v) => set(campo, v as FormatoImpresion[typeof campo])}
                  />
                </label>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label>Pie de página</Label>
              <Textarea
                rows={3}
                maxLength={300}
                value={form.pie}
                onChange={(e) => set("pie", e.target.value)}
                placeholder="Texto legal, condiciones de pago, agradecimiento…"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
