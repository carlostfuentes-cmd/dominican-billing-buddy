import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Copy,
  Download,
  Image as ImageIcon,
  Minus,
  Plus,
  Printer,
  Save,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { RenderPlantilla, datosMuestra, estiloElemento } from "@/components/plantillas/RenderPlantilla";
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
import { obtenerEmpresas } from "@/lib/erp.functions";
import { PAPELES, type PapelImpresion } from "@/lib/erp-types";
import {
  eliminarPlantilla,
  guardarPlantilla,
  obtenerPlantilla,
  obtenerPlantillas,
} from "@/lib/plantillas.functions";
import {
  BANDAS,
  CAMPOS_SISTEMA,
  GRUPOS_CAMPOS,
  TIPOS_PLANTILLA,
  medidasPapel,
  nuevoElemento,
  plantillaBase,
  type BandaPlantilla,
  type ElementoPlantilla,
  type Plantilla,
  type TipoBanda,
  type TipoElemento,
  type TipoPlantilla,
} from "@/lib/plantillas-tipos";

export const Route = createFileRoute("/plantillas")({
  head: () => ({
    meta: [
      { title: "Diseñador de documentos — ERP Contable RD" },
      {
        name: "description",
        content:
          "Diseña la factura, cotización, conduce y nota de crédito de cada empresa: bandas, columnas, campos del sistema, logos y firmas, con vista previa e impresión.",
      },
      { property: "og:title", content: "Diseñador de documentos — ERP Contable RD" },
      {
        property: "og:description",
        content: "Plantillas de impresión por empresa y tipo de documento, campo por campo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DisenadorPlantillas,
});

const MM_PX = 96 / 25.4;
const redondear = (v: number) => Math.round(v * 2) / 2;

function DisenadorPlantillas() {
  const qc = useQueryClient();
  const [empresaId, setEmpresaId] = useState("*");
  const [docTipo, setDocTipo] = useState<TipoPlantilla>("factura");
  const [zoom, setZoom] = useState(1);
  const [plantilla, setPlantilla] = useState<Plantilla>(() => plantillaBase("*", "factura"));
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [bandaActiva, setBandaActiva] = useState<TipoBanda>("encabezado");
  const [verPrevia, setVerPrevia] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  const { data: empresas } = useQuery({ queryKey: ["empresas"], queryFn: () => obtenerEmpresas() });
  const { data: guardadas } = useQuery({
    queryKey: ["plantillas"],
    queryFn: () => obtenerPlantillas(),
  });
  const { data: cargada } = useQuery({
    queryKey: ["plantilla", empresaId, docTipo],
    queryFn: () => obtenerPlantilla({ data: { empresaId, docTipo } }),
  });

  useEffect(() => {
    if (cargada) {
      setPlantilla({ ...cargada, empresa_id: empresaId, doc_tipo: docTipo });
      setSeleccion(null);
    }
  }, [cargada, empresaId, docTipo]);

  const datos = useMemo(() => datosMuestra(3), []);
  const papel = medidasPapel(plantilla.papel);

  const guardar = useMutation({
    mutationFn: (p: Plantilla) => guardarPlantilla({ data: p }),
    onSuccess: () => {
      toast.success("Plantilla guardada");
      void qc.invalidateQueries({ queryKey: ["plantillas"] });
      void qc.invalidateQueries({ queryKey: ["plantilla"] });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar la plantilla"),
  });

  const borrar = useMutation({
    mutationFn: () => eliminarPlantilla({ data: { empresaId, docTipo } }),
    onSuccess: () => {
      toast.success("Plantilla eliminada; se usará la general");
      void qc.invalidateQueries({ queryKey: ["plantillas"] });
      void qc.invalidateQueries({ queryKey: ["plantilla"] });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo eliminar"),
  });

  /* -------------------------- Edición de la plantilla ---------------------- */

  const cambiarBanda = (tipo: TipoBanda, cambio: Partial<BandaPlantilla>) =>
    setPlantilla((p) => ({
      ...p,
      bandas: p.bandas.map((b) => (b.tipo === tipo ? { ...b, ...cambio } : b)),
    }));

  const cambiarElemento = (id: string, cambio: Partial<ElementoPlantilla>) =>
    setPlantilla((p) => ({
      ...p,
      bandas: p.bandas.map((b) => ({
        ...b,
        elementos: b.elementos.map((e) => (e.id === id ? { ...e, ...cambio } : e)),
      })),
    }));

  const agregar = (tipo: TipoElemento, campo?: string) => {
    const el = nuevoElemento(tipo, campo ? { campo, texto: "" } : {});
    setPlantilla((p) => ({
      ...p,
      bandas: p.bandas.map((b) =>
        b.tipo === bandaActiva ? { ...b, elementos: [...b.elementos, el] } : b,
      ),
    }));
    setSeleccion(el.id);
  };

  const duplicar = () => {
    const el = elementoSeleccionado;
    if (!el) return;
    const copia = { ...nuevoElemento(el.tipo), ...el, id: nuevoElemento("texto").id, y: el.y + 5 };
    setPlantilla((p) => ({
      ...p,
      bandas: p.bandas.map((b) =>
        b.elementos.some((e) => e.id === el.id) ? { ...b, elementos: [...b.elementos, copia] } : b,
      ),
    }));
    setSeleccion(copia.id);
  };

  const quitar = () => {
    if (!seleccion) return;
    setPlantilla((p) => ({
      ...p,
      bandas: p.bandas.map((b) => ({
        ...b,
        elementos: b.elementos.filter((e) => e.id !== seleccion),
      })),
    }));
    setSeleccion(null);
  };

  const elementoSeleccionado = useMemo(
    () => plantilla.bandas.flatMap((b) => b.elementos).find((e) => e.id === seleccion),
    [plantilla, seleccion],
  );

  const anchoUtil = papel.ancho - plantilla.margen_izquierdo - plantilla.margen_derecho;

  /* ------------------------------- Arrastrar ------------------------------ */

  const arrastrar = (
    ev: React.PointerEvent,
    el: ElementoPlantilla,
    modo: "mover" | "tamano",
  ) => {
    ev.preventDefault();
    ev.stopPropagation();
    setSeleccion(el.id);
    const inicioX = ev.clientX;
    const inicioY = ev.clientY;
    const base = { x: el.x, y: el.y, ancho: el.ancho, alto: el.alto };
    const mover = (e: PointerEvent) => {
      const dx = (e.clientX - inicioX) / (MM_PX * zoom);
      const dy = (e.clientY - inicioY) / (MM_PX * zoom);
      if (modo === "mover") {
        cambiarElemento(el.id, {
          x: Math.max(0, redondear(base.x + dx)),
          y: Math.max(0, redondear(base.y + dy)),
        });
      } else {
        cambiarElemento(el.id, {
          ancho: Math.max(2, redondear(base.ancho + dx)),
          alto: Math.max(el.tipo === "linea" ? 0.2 : 2, redondear(base.alto + dy)),
        });
      }
    };
    const fin = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", fin);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", fin);
  };

  /* -------------------------------- Archivos ------------------------------ */

  const exportar = () => {
    const blob = new Blob([JSON.stringify(plantilla, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plantilla-${docTipo}-${empresaId === "*" ? "general" : empresaId}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const importar = async (file: File) => {
    try {
      const texto = await file.text();
      const p = JSON.parse(texto) as Plantilla;
      if (!Array.isArray(p.bandas)) throw new Error("El archivo no tiene bandas");
      setPlantilla({ ...p, empresa_id: empresaId, doc_tipo: docTipo });
      toast.success("Plantilla importada; revísala y guárdala");
    } catch {
      toast.error("No se pudo leer el archivo de la plantilla");
    }
  };

  const nombreEmpresa =
    empresaId === "*"
      ? "Plantilla general (todas las empresas)"
      : ((empresas ?? []).find((e) => e.id === empresaId)?.nombre ?? empresaId);
  const tienePropia = (guardadas ?? []).some(
    (g) => g.empresa_id === empresaId && g.doc_tipo === docTipo,
  );

  return (
    <div>
      <style>{`@media print {
        body * { visibility: hidden; }
        .plantilla-impresion, .plantilla-impresion * { visibility: visible; }
        .plantilla-impresion { position: absolute; inset: 0; }
        @page { size: ${papel.ancho}mm ${papel.alto}mm; margin: 0; }
      }`}</style>

      <PageHeader
        titulo="Diseñador de documentos"
        descripcion="Coloca cada dato donde debe imprimirse. Cada empresa puede tener su propio diseño por tipo de documento."
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-56 space-y-1.5">
          <Label>Empresa</Label>
          <Select value={empresaId} onValueChange={setEmpresaId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="*">Plantilla general</SelectItem>
              {(empresas ?? []).map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-44 space-y-1.5">
          <Label>Documento</Label>
          <Select value={docTipo} onValueChange={(v) => setDocTipo(v as TipoPlantilla)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_PLANTILLA.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-44 space-y-1.5">
          <Label>Papel</Label>
          <Select
            value={plantilla.papel}
            onValueChange={(v) => setPlantilla((p) => ({ ...p, papel: v as PapelImpresion }))}
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
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => guardar.mutate(plantilla)} disabled={guardar.isPending}>
            <Save className="size-4" /> Guardar plantilla
          </Button>
          <Button size="sm" variant="outline" onClick={() => setVerPrevia((v) => !v)}>
            {verPrevia ? "Volver a diseñar" : "Vista previa"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> Imprimir prueba
          </Button>
          <Button size="sm" variant="ghost" onClick={exportar}>
            <Download className="size-4" /> Exportar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => archivo.current?.click()}>
            <Upload className="size-4" /> Importar
          </Button>
          <input
            ref={archivo}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importar(f);
              e.target.value = "";
            }}
          />
          {empresaId !== "*" && tienePropia ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => borrar.mutate()}
              disabled={borrar.isPending}
            >
              <Trash2 className="size-4" /> Usar la general
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPlantilla(plantillaBase(empresaId, docTipo))}
          >
            Restaurar diseño base
          </Button>
        </div>
      </div>

      {verPrevia ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{nombreEmpresa}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-auto">
            <div className="plantilla-impresion inline-block">
              <RenderPlantilla plantilla={plantilla} datos={datos} />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[260px_1fr_300px]">
          {/* ------------------------------ Bandas ----------------------------- */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Bandas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {BANDAS.map((b) => {
                  const banda = plantilla.bandas.find((x) => x.tipo === b.id);
                  if (!banda) return null;
                  return (
                    <div
                      key={b.id}
                      className={`rounded-md border p-2 text-sm ${
                        bandaActiva === b.id ? "border-primary bg-accent/60" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 text-left"
                        onClick={() => setBandaActiva(b.id)}
                      >
                        <span className="font-medium">{b.nombre}</span>
                        {b.repite ? (
                          <Badge variant="secondary" className="text-[10px]">
                            se repite
                          </Badge>
                        ) : null}
                      </button>
                      <p className="mt-1 text-xs text-muted-foreground">{b.ayuda}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <Label className="text-xs">Alto (mm)</Label>
                        <Input
                          className="h-7 w-20"
                          type="number"
                          min={0}
                          max={200}
                          step={0.5}
                          value={banda.alto}
                          onChange={(e) =>
                            cambiarBanda(b.id, { alto: Math.max(0, Number(e.target.value)) })
                          }
                        />
                        <Switch
                          checked={banda.visible}
                          onCheckedChange={(v) => cambiarBanda(b.id, { visible: v })}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Agregar a la banda</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => agregar("texto")}>
                    <Type className="size-4" /> Texto
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => agregar("linea")}>
                    <Minus className="size-4" /> Línea
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => agregar("caja")}>
                    <Box className="size-4" /> Recuadro
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => agregar("imagen")}>
                    <ImageIcon className="size-4" /> Imagen
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Campo del sistema</Label>
                  <Select value="" onValueChange={(v) => agregar("campo", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Elegir campo…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {GRUPOS_CAMPOS.map((g) => (
                        <div key={g}>
                          <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                            {g}
                          </p>
                          {CAMPOS_SISTEMA.filter((c) => c.grupo === g).map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nombre}
                            </SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Los campos de “Detalle” solo tienen valor en la banda que se repite.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ------------------------------ Lienzo ----------------------------- */}
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
              <CardTitle className="text-base">{nombreEmpresa}</CardTitle>
              <div className="flex items-center gap-2 text-sm">
                <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}>
                  <Minus className="size-4" />
                </Button>
                <span className="w-12 text-center">{Math.round(zoom * 100)}%</span>
                <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}>
                  <Plus className="size-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-auto bg-muted/40">
              <div
                style={{
                  width: `${papel.ancho * MM_PX * zoom}px`,
                  transform: `scale(${zoom})`,
                  transformOrigin: "top left",
                }}
              >
                <div
                  className="bg-white text-black shadow"
                  style={{
                    width: `${papel.ancho}mm`,
                    paddingTop: `${plantilla.margen_superior}mm`,
                    paddingBottom: `${plantilla.margen_inferior}mm`,
                    paddingLeft: `${plantilla.margen_izquierdo}mm`,
                    paddingRight: `${plantilla.margen_derecho}mm`,
                    fontFamily: "Helvetica, Arial, sans-serif",
                  }}
                >
                  {BANDAS.map((meta) => {
                    const banda = plantilla.bandas.find((b) => b.tipo === meta.id);
                    if (!banda || !banda.visible) return null;
                    return (
                      <div
                        key={meta.id}
                        onClick={() => setBandaActiva(meta.id)}
                        style={{
                          position: "relative",
                          height: `${banda.alto}mm`,
                          outline:
                            bandaActiva === meta.id
                              ? "1px solid rgba(37,99,235,.7)"
                              : "1px dashed rgba(148,163,184,.7)",
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            right: 2,
                            top: 1,
                            fontSize: 7,
                            color: "#94a3b8",
                          }}
                        >
                          {meta.nombre}
                        </span>
                        {banda.elementos.map((el) => (
                          <div
                            key={el.id}
                            onPointerDown={(ev) => arrastrar(ev, el, "mover")}
                            style={{
                              ...estiloElemento(el),
                              cursor: "move",
                              outline:
                                seleccion === el.id ? "1px solid #2563eb" : "1px dotted transparent",
                            }}
                          >
                            {el.tipo === "imagen" ? (
                              el.url ? (
                                <img src={el.url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                              ) : (
                                <span style={{ fontSize: 7, color: "#94a3b8" }}>imagen</span>
                              )
                            ) : el.tipo === "linea" || el.tipo === "caja" ? null : el.campo ? (
                              `${el.texto ? `${el.texto} ` : ""}${
                                datos.lineas[0]?.[el.campo] ?? datos.campos[el.campo] ?? el.campo
                              }`
                            ) : (
                              el.texto
                            )}
                            {seleccion === el.id ? (
                              <span
                                onPointerDown={(ev) => arrastrar(ev, el, "tamano")}
                                style={{
                                  position: "absolute",
                                  right: -3,
                                  bottom: -3,
                                  width: 6,
                                  height: 6,
                                  background: "#2563eb",
                                  cursor: "nwse-resize",
                                }}
                              />
                            ) : null}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* --------------------------- Propiedades --------------------------- */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Propiedades</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!elementoSeleccionado ? (
                  <p className="text-sm text-muted-foreground">
                    Haz clic en un elemento del documento para cambiar su posición, tamaño, fuente y
                    contenido.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ["x", "Izquierda (mm)"],
                          ["y", "Arriba (mm)"],
                          ["ancho", "Ancho (mm)"],
                          ["alto", "Alto (mm)"],
                        ] as const
                      ).map(([campo, etiqueta]) => (
                        <div key={campo} className="space-y-1">
                          <Label className="text-xs">{etiqueta}</Label>
                          <Input
                            className="h-8"
                            type="number"
                            step={0.5}
                            value={elementoSeleccionado[campo]}
                            onChange={(e) =>
                              cambiarElemento(elementoSeleccionado.id, {
                                [campo]: Number(e.target.value),
                              } as Partial<ElementoPlantilla>)
                            }
                          />
                        </div>
                      ))}
                    </div>

                    {elementoSeleccionado.tipo === "imagen" ? (
                      <div className="space-y-1">
                        <Label className="text-xs">Dirección de la imagen</Label>
                        <Input
                          className="h-8"
                          value={elementoSeleccionado.url ?? ""}
                          placeholder="https://…/logo.png"
                          onChange={(e) =>
                            cambiarElemento(elementoSeleccionado.id, { url: e.target.value })
                          }
                        />
                      </div>
                    ) : null}

                    {elementoSeleccionado.tipo === "texto" ||
                    elementoSeleccionado.tipo === "campo" ? (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs">
                            {elementoSeleccionado.tipo === "campo" ? "Etiqueta (opcional)" : "Texto"}
                          </Label>
                          <Textarea
                            rows={2}
                            value={elementoSeleccionado.texto}
                            onChange={(e) =>
                              cambiarElemento(elementoSeleccionado.id, { texto: e.target.value })
                            }
                            placeholder="Puedes incrustar campos así: {cliente.nombre}"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Campo del sistema</Label>
                          <Select
                            value={elementoSeleccionado.campo ?? "ninguno"}
                            onValueChange={(v) =>
                              cambiarElemento(elementoSeleccionado.id, {
                                campo: v === "ninguno" ? "" : v,
                                tipo: v === "ninguno" ? "texto" : "campo",
                              })
                            }
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                              <SelectItem value="ninguno">Sin campo (texto fijo)</SelectItem>
                              {CAMPOS_SISTEMA.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.grupo} · {c.nombre}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Tamaño (pt)</Label>
                            <Input
                              className="h-8"
                              type="number"
                              min={4}
                              max={48}
                              value={elementoSeleccionado.tamano}
                              onChange={(e) =>
                                cambiarElemento(elementoSeleccionado.id, {
                                  tamano: Number(e.target.value),
                                })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Alineación</Label>
                            <Select
                              value={elementoSeleccionado.alineacion}
                              onValueChange={(v) =>
                                cambiarElemento(elementoSeleccionado.id, {
                                  alineacion: v as ElementoPlantilla["alineacion"],
                                })
                              }
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="left">Izquierda</SelectItem>
                                <SelectItem value="center">Centro</SelectItem>
                                <SelectItem value="right">Derecha</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex gap-4">
                          <label className="flex items-center gap-2 text-sm">
                            <Switch
                              checked={elementoSeleccionado.negrita}
                              onCheckedChange={(v) =>
                                cambiarElemento(elementoSeleccionado.id, { negrita: v })
                              }
                            />
                            Negrita
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <Switch
                              checked={elementoSeleccionado.italica}
                              onCheckedChange={(v) =>
                                cambiarElemento(elementoSeleccionado.id, { italica: v })
                              }
                            />
                            Cursiva
                          </label>
                        </div>
                      </>
                    ) : null}

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Color</Label>
                        <Input
                          className="h-8"
                          type="color"
                          value={elementoSeleccionado.color}
                          onChange={(e) =>
                            cambiarElemento(elementoSeleccionado.id, { color: e.target.value })
                          }
                        />
                      </div>
                      {elementoSeleccionado.tipo === "caja" ||
                      elementoSeleccionado.tipo === "linea" ? (
                        <div className="space-y-1">
                          <Label className="text-xs">Grosor (mm)</Label>
                          <Input
                            className="h-8"
                            type="number"
                            step={0.1}
                            min={0}
                            max={5}
                            value={elementoSeleccionado.grosor ?? 0.3}
                            onChange={(e) =>
                              cambiarElemento(elementoSeleccionado.id, {
                                grosor: Number(e.target.value),
                              })
                            }
                          />
                        </div>
                      ) : null}
                      {elementoSeleccionado.tipo === "caja" ? (
                        <div className="space-y-1">
                          <Label className="text-xs">Relleno</Label>
                          <Input
                            className="h-8"
                            type="color"
                            value={elementoSeleccionado.fondo || "#ffffff"}
                            onChange={(e) =>
                              cambiarElemento(elementoSeleccionado.id, { fondo: e.target.value })
                            }
                          />
                        </div>
                      ) : null}
                    </div>

                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={duplicar}>
                        <Copy className="size-4" /> Duplicar
                      </Button>
                      <Button size="sm" variant="outline" onClick={quitar}>
                        <Trash2 className="size-4" /> Quitar
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Página</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nombre de la plantilla</Label>
                  <Input
                    className="h-8"
                    maxLength={80}
                    value={plantilla.nombre}
                    onChange={(e) => setPlantilla((p) => ({ ...p, nombre: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["margen_superior", "Margen arriba"],
                      ["margen_inferior", "Margen abajo"],
                      ["margen_izquierdo", "Margen izq."],
                      ["margen_derecho", "Margen der."],
                    ] as const
                  ).map(([campo, etiqueta]) => (
                    <div key={campo} className="space-y-1">
                      <Label className="text-xs">{etiqueta}</Label>
                      <Input
                        className="h-8"
                        type="number"
                        min={0}
                        max={80}
                        value={plantilla[campo]}
                        onChange={(e) =>
                          setPlantilla((p) => ({ ...p, [campo]: Number(e.target.value) }))
                        }
                      />
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Copias al imprimir</Label>
                  <Input
                    className="h-8"
                    type="number"
                    min={1}
                    max={4}
                    value={plantilla.copias}
                    onChange={(e) =>
                      setPlantilla((p) => ({
                        ...p,
                        copias: Math.max(1, Math.min(4, Number(e.target.value))),
                      }))
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Ancho útil del papel: {anchoUtil.toFixed(1)} mm.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
