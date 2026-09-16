import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { usePermisoPantalla } from "@/components/Sesion";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { guardarItem, obtenerItems, obtenerListasItem } from "@/lib/erp.functions";
import { money, type Item, type OpcionLista } from "@/lib/erp-types";

export const Route = createFileRoute("/items")({
  head: () => ({
    meta: [
      { title: "Maestra de productos — ERP Contable RD" },
      {
        name: "description",
        content:
          "Maestra de productos y servicios: datos generales, presentación, disponibilidad, precios, notas y garantía.",
      },
      { property: "og:title", content: "Maestra de productos — ERP Contable RD" },
      {
        property: "og:description",
        content: "Productos y servicios con precios, impuestos, empaque y ubicación en almacén.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Items,
});

type Formulario = Omit<Item, "id"> & { id?: string | undefined };

const vacio: Formulario = {
  codigo: "",
  descripcion: "",
  unidad: "UND",
  precio: 0,
  tasa_itbis: 18,
  activo: true,
  referencia: "",
  nombre_corto: "",
  codigo_barras: "",
  moneda: "DOP",
  comision: 0,
  costo: 0,
  precio2: 0,
  precio3: 0,
  precio4: 0,
  precio5: 0,
  aplica_impuesto: true,
  es_servicio: false,
  requiere_serial: false,
  compuesto: false,
  validar_existencia: false,
  venta_controlada: false,
  no_comisionable: false,
  cantidad_empaque: 0,
  venta_minima: 0,
  venta_maxima: 0,
  existencia_maxima: 0,
  existencia_minima: 0,
  rotacion: 0,
  alto: 0,
  ancho: 0,
  profundidad: 0,
  peso: 0,
  ficha: "",
  dias_antes_vencimiento: 0,
  permitir_edicion_precio: false,
  arancel: 0,
  disparador: "",
  pasillo: "",
  tramo: "",
  estante: "",
  notas: "",
  garantia: "",
};

const ETIQUETA_TASA: Record<number, string> = {
  18: "18% (general)",
  16: "16% (reducida)",
  0: "0% (exento)",
};

const SIN = "__sin__";

function Items() {
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<Formulario>(vacio);
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["items", busqueda],
    queryFn: () => obtenerItems({ data: { busqueda } }),
  });

  const { data: listas } = useQuery({
    queryKey: ["listas-item"],
    queryFn: () => obtenerListasItem(),
    staleTime: 300_000,
  });

  const mutar = useMutation({
    mutationFn: (i: Formulario) => guardarItem({ data: i }),
    onSuccess: () => {
      toast.success("Producto guardado");
      setAbierto(false);
      void qc.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar el producto"),
  });

  const set = <K extends keyof Formulario>(campo: K, valor: Formulario[K]) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  const enviar = () => {
    if (!form.codigo.trim()) { toast.error("Escribe un código"); return; }
    if (form.descripcion.trim().length < 2) { toast.error("Escribe el nombre del producto"); return; }
    if (form.precio < 0) { toast.error("El precio no puede ser negativo"); return; }
    mutar.mutate(form);
  };

  const NumeroCampo = ({
    etiqueta,
    campo,
    paso = "0.01",
  }: {
    etiqueta: string;
    campo: keyof Formulario;
    paso?: string;
  }) => (
    <div>
      <Label>{etiqueta}</Label>
      <Input
        type="number"
        min={0}
        step={paso}
        value={String(form[campo] ?? 0)}
        onChange={(e) => set(campo, (Number(e.target.value) || 0) as never)}
      />
    </div>
  );

  const SelectCampo = ({
    etiqueta,
    campo,
    opciones,
    numerico = false,
  }: {
    etiqueta: string;
    campo: keyof Formulario;
    opciones: OpcionLista[] | undefined;
    numerico?: boolean;
  }) => (
    <div>
      <Label>{etiqueta}</Label>
      <Select
        value={form[campo] === undefined || form[campo] === "" ? SIN : String(form[campo])}
        onValueChange={(v) =>
          set(campo, (v === SIN ? undefined : numerico ? Number(v) : v) as never)
        }
      >
        <SelectTrigger>
          <SelectValue placeholder="No codificado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SIN}>No codificado</SelectItem>
          {(opciones ?? []).map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const Casilla = ({ etiqueta, campo }: { etiqueta: string; campo: keyof Formulario }) => (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox
        checked={Boolean(form[campo])}
        onCheckedChange={(v) => set(campo, Boolean(v) as never)}
      />
      {etiqueta}
    </label>
  );

  return (
    <div>
      <PageHeader
        titulo="Productos"
        descripcion="Maestra de productos y servicios"
        acciones={
          puedeAgregar ? (
            <Button
              onClick={() => {
                setForm(vacio);
                setAbierto(true);
              }}
            >
              <Plus className="size-4" /> Nuevo producto
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardContent className="pt-6">
          <div className="relative mb-4 max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value.slice(0, 80))}
              placeholder="Buscar por código, referencia o nombre"
              className="pl-9"
            />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead>ITBIS</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-xs">{i.codigo}</TableCell>
                    <TableCell className="font-medium">{i.descripcion}</TableCell>
                    <TableCell>{i.unidad}</TableCell>
                    <TableCell className="tabular text-right">
                      {money(i.precio, i.moneda)}
                    </TableCell>
                    <TableCell>{ETIQUETA_TASA[i.tasa_itbis] ?? `${i.tasa_itbis}%`}</TableCell>
                    <TableCell>{i.es_servicio ? "Servicio" : "Producto"}</TableCell>
                    <TableCell>
                      <Badge variant={i.activo ? "secondary" : "outline"}>
                        {i.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setForm({ ...vacio, ...i });
                          setAbierto(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      Sin productos que coincidan con la búsqueda.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar producto" : "Nuevo producto"}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="generales">
            <TabsList className="flex-wrap">
              <TabsTrigger value="generales">Datos generales</TabsTrigger>
              <TabsTrigger value="presentacion">Presentación y disponibilidad</TabsTrigger>
              <TabsTrigger value="notas">Notas del producto</TabsTrigger>
              <TabsTrigger value="garantia">Garantía</TabsTrigger>
            </TabsList>

            <TabsContent value="generales" className="grid gap-4 pt-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="codigo">Código</Label>
                <Input
                  id="codigo"
                  value={form.codigo}
                  maxLength={30}
                  disabled={Boolean(form.id)}
                  onChange={(e) => set("codigo", e.target.value.toUpperCase())}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="referencia">Referencia</Label>
                <Input
                  id="referencia"
                  value={form.referencia ?? ""}
                  maxLength={200}
                  onChange={(e) => set("referencia", e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="nombre">Nombre</Label>
                <Input
                  id="nombre"
                  value={form.descripcion}
                  maxLength={200}
                  onChange={(e) => set("descripcion", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="abrev">Abreviatura</Label>
                <Input
                  id="abrev"
                  value={form.nombre_corto ?? ""}
                  maxLength={20}
                  onChange={(e) => set("nombre_corto", e.target.value.toUpperCase())}
                />
              </div>

              <SelectCampo
                etiqueta="Suplidor"
                campo="suplidor_id"
                opciones={listas?.suplidores}
                numerico
              />
              <SelectCampo etiqueta="Grupo" campo="grupo_id" opciones={listas?.grupos} />
              <SelectCampo etiqueta="Tipo" campo="tipo_id" opciones={listas?.tipos} />
              <SelectCampo
                etiqueta="Familia"
                campo="familia_id"
                opciones={listas?.familias}
                numerico
              />
              <div>
                <Label htmlFor="barras">Código de barras</Label>
                <Input
                  id="barras"
                  value={form.codigo_barras ?? ""}
                  maxLength={40}
                  onChange={(e) => set("codigo_barras", e.target.value)}
                />
              </div>
              <SelectCampo etiqueta="Moneda" campo="moneda" opciones={listas?.monedas} />

              <div>
                <Label>Estado</Label>
                <Select
                  value={form.activo ? "A" : "I"}
                  onValueChange={(v) => set("activo", v === "A")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">Activo</SelectItem>
                    <SelectItem value="I">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tasa de ITBIS</Label>
                <Select
                  value={String(form.tasa_itbis)}
                  onValueChange={(v) => set("tasa_itbis", Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[18, 16, 0].map((t) => (
                      <SelectItem key={t} value={String(t)}>
                        {ETIQUETA_TASA[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <NumeroCampo etiqueta="% Comisión" campo="comision" />
              <NumeroCampo etiqueta="Costo promedio" campo="costo" paso="0.0001" />

              <div className="grid gap-2 rounded-md border p-3 sm:col-span-2 sm:grid-cols-3">
                <Casilla etiqueta="Aplica impuesto" campo="aplica_impuesto" />
                <Casilla etiqueta="Es servicio" campo="es_servicio" />
                <Casilla etiqueta="Requiere serial" campo="requiere_serial" />
                <Casilla etiqueta="Compuesto" campo="compuesto" />
                <Casilla etiqueta="Validar existencia" campo="validar_existencia" />
                <Casilla etiqueta="Venta controlada" campo="venta_controlada" />
                <Casilla etiqueta="No comisionable" campo="no_comisionable" />
              </div>

              <div className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">Lista de precios</p>
                <div className="grid gap-2">
                  {(["precio", "precio2", "precio3", "precio4", "precio5"] as const).map(
                    (campo, indice) => (
                      <div key={campo} className="flex items-center gap-2">
                        <span className="w-4 text-sm text-muted-foreground">{indice + 1}.</span>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={String(form[campo] ?? 0)}
                          onChange={(e) => set(campo, (Number(e.target.value) || 0) as never)}
                        />
                      </div>
                    ),
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="presentacion" className="grid gap-4 pt-4 sm:grid-cols-3">
              <SelectCampo etiqueta="Empaque" campo="empaque_id" opciones={listas?.empaques} />
              <NumeroCampo etiqueta="Cantidad x empaque" campo="cantidad_empaque" />
              <div>
                <Label>Unidad de medida</Label>
                <Input
                  value={form.unidad}
                  maxLength={10}
                  onChange={(e) => set("unidad", e.target.value.toUpperCase())}
                />
              </div>

              <NumeroCampo etiqueta="Venta mínima" campo="venta_minima" />
              <NumeroCampo etiqueta="Venta máxima" campo="venta_maxima" />
              <NumeroCampo etiqueta="Rotación (días)" campo="rotacion" paso="1" />

              <NumeroCampo etiqueta="Existencia máxima" campo="existencia_maxima" />
              <NumeroCampo etiqueta="Existencia mínima" campo="existencia_minima" />
              <NumeroCampo
                etiqueta="Venta X días antes del vencimiento"
                campo="dias_antes_vencimiento"
                paso="1"
              />

              <NumeroCampo etiqueta="Alto" campo="alto" />
              <NumeroCampo etiqueta="Ancho" campo="ancho" />
              <NumeroCampo etiqueta="Profundidad" campo="profundidad" />
              <SelectCampo
                etiqueta="Medida de volumen"
                campo="medida_volumen_id"
                opciones={listas?.unidades}
              />
              <NumeroCampo etiqueta="Peso" campo="peso" />
              <SelectCampo
                etiqueta="Medida de peso"
                campo="medida_peso_id"
                opciones={listas?.unidades}
              />

              <NumeroCampo etiqueta="Arancel (%)" campo="arancel" />
              <SelectCampo etiqueta="Marca" campo="marca_id" opciones={listas?.marcas} />
              <SelectCampo etiqueta="Color" campo="color_id" opciones={listas?.colores} />
              <SelectCampo
                etiqueta="Origen"
                campo="origen_id"
                opciones={listas?.origenes}
                numerico
              />
              <div>
                <Label>Disparador</Label>
                <Select
                  value={form.disparador === "FST" ? "FST" : SIN}
                  onValueChange={(v) => set("disparador", v === "FST" ? "FST" : "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Ninguno" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN}>Ninguno</SelectItem>
                    <SelectItem value="FST">FST</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={Boolean(form.permitir_edicion_precio)}
                    onCheckedChange={(v) => set("permitir_edicion_precio", v)}
                  />
                  Permitir edición del precio en facturas
                </label>
              </div>

              <div>
                <Label>Pasillo</Label>
                <Input
                  value={form.pasillo ?? ""}
                  maxLength={30}
                  onChange={(e) => set("pasillo", e.target.value)}
                />
              </div>
              <div>
                <Label>Tramo</Label>
                <Input
                  value={form.tramo ?? ""}
                  maxLength={30}
                  onChange={(e) => set("tramo", e.target.value)}
                />
              </div>
              <div>
                <Label>Estante</Label>
                <Input
                  value={form.estante ?? ""}
                  maxLength={30}
                  onChange={(e) => set("estante", e.target.value)}
                />
              </div>
              <div className="sm:col-span-3">
                <Label>Ficha técnica</Label>
                <Input
                  value={form.ficha ?? ""}
                  maxLength={200}
                  onChange={(e) => set("ficha", e.target.value)}
                />
              </div>
            </TabsContent>

            <TabsContent value="notas" className="pt-4">
              <Label htmlFor="notas">Notas del producto</Label>
              <Textarea
                id="notas"
                rows={12}
                maxLength={4000}
                value={form.notas ?? ""}
                onChange={(e) => set("notas", e.target.value)}
              />
            </TabsContent>

            <TabsContent value="garantia" className="pt-4">
              <Label htmlFor="garantia">Garantía</Label>
              <Textarea
                id="garantia"
                rows={12}
                maxLength={4000}
                value={form.garantia ?? ""}
                onChange={(e) => set("garantia", e.target.value)}
              />
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={enviar} disabled={mutar.isPending}>
              {mutar.isPending ? "Guardando…" : "Aplicar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
