import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Search } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { guardarCliente, obtenerClientes, obtenerListasCliente } from "@/lib/erp.functions";
import { rncValido, TIPOS_NCF, type Cliente, type TipoNCF } from "@/lib/erp-types";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — ERP Contable RD" },
      {
        name: "description",
        content:
          "Maestra de clientes con datos generales, administración, crédito, retenciones y tipo de comprobante.",
      },
      { property: "og:title", content: "Clientes — ERP Contable RD" },
      { property: "og:description", content: "Maestra de clientes con RNC, NCF, crédito y retenciones." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Clientes,
});

type FormCliente = Omit<Cliente, "id"> & { id?: string };

const vacio: FormCliente = {
  nombre: "",
  rnc: "",
  tipo_ncf: "B02",
  telefono: "",
  email: "",
  direccion: "",
  dias_credito: 0,
  activo: true,
  nombre_corto: "",
  direccion2: "",
  ciudad: "",
  pais: "",
  codigo_postal: "",
  telefono2: "",
  telefono3: "",
  fax: "",
  email_alterno: "",
  fecha_apertura: "",
  localidad_id: "",
  sector: "",
  monto_credito: 0,
  lista_precios: 1,
  datacredito: "",
  cargar_itbis: true,
  backorder: false,
  retener_anticipos: false,
  validar_orden_compra: false,
  generico: false,
  bloquear_credito_vencido: false,
  dias_credito_vencido: 0,
  certificado_zf: "",
  certificado_zf_vence: "",
  retencion_itbis: 0,
  retencion_isr: 0,
  notas: "",
};

const DATACREDITO = ["NORMAL", "ATRASO", "LEGAL", "CASTIGADO", "SALDADO"] as const;
const SIN_VALOR = "__sin__";

function Clientes() {
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<FormCliente>(vacio);
  const qc = useQueryClient();

  const set = (parcial: Partial<FormCliente>) => setForm((f) => ({ ...f, ...parcial }));

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["clientes", busqueda],
    queryFn: () => obtenerClientes({ data: { busqueda } }),
  });

  const { data: listas } = useQuery({
    queryKey: ["listas-cliente"],
    queryFn: () => obtenerListasCliente(),
  });

  const mutar = useMutation({
    mutationFn: (c: FormCliente) => guardarCliente({ data: c }),
    onSuccess: () => {
      toast.success("Cliente guardado");
      setAbierto(false);
      void qc.invalidateQueries({ queryKey: ["clientes"] });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar el cliente"),
  });

  const enviar = () => {
    if (form.nombre.trim().length < 2) {
      toast.error("Escribe el nombre o razón social");
      return;
    }
    if (!rncValido(form.rnc)) {
      toast.error("RNC (9 dígitos) o Cédula (11 dígitos) inválido");
      return;
    }
    mutar.mutate({ ...form, rnc: form.rnc.replace(/\D/g, "") });
  };

  return (
    <div>
      <PageHeader
        titulo="Clientes"
        descripcion="Datos generales, administración y condiciones comerciales"
        acciones={
          <Button
            onClick={() => {
              setForm(vacio);
              setAbierto(true);
            }}
          >
            <Plus className="size-4" /> Nuevo cliente
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <div className="relative mb-4 max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value.slice(0, 80))}
              placeholder="Buscar por código, nombre o RNC"
              className="pl-9"
            />
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre / Razón social</TableHead>
                  <TableHead>RNC / Cédula</TableHead>
                  <TableHead>NCF</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Ciudad</TableHead>
                  <TableHead className="text-right">Crédito</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.id}</TableCell>
                    <TableCell className="font-medium">{c.nombre}</TableCell>
                    <TableCell className="font-mono text-xs">{c.rnc || "—"}</TableCell>
                    <TableCell>{c.tipo_ncf}</TableCell>
                    <TableCell>{c.telefono || "—"}</TableCell>
                    <TableCell>{c.ciudad || "—"}</TableCell>
                    <TableCell className="tabular text-right">{c.dias_credito} días</TableCell>
                    <TableCell>
                      <Badge variant={c.activo ? "secondary" : "outline"}>
                        {c.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setForm({ ...vacio, ...c });
                          setAbierto(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoading && clientes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      Sin clientes que coincidan con la búsqueda.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {form.id ? `Editar cliente ${form.id}` : "Nuevo cliente"}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="generales">
            <TabsList>
              <TabsTrigger value="generales">Datos generales</TabsTrigger>
              <TabsTrigger value="admin">Administración</TabsTrigger>
              <TabsTrigger value="notas">Notas</TabsTrigger>
            </TabsList>

            <TabsContent value="generales" className="grid gap-4 pt-4 sm:grid-cols-2">
              <div>
                <Label>RNC / Cédula</Label>
                <Input
                  value={form.rnc}
                  maxLength={15}
                  onChange={(e) => set({ rnc: e.target.value })}
                />
              </div>
              <div>
                <Label>Código</Label>
                <Input value={form.id ?? "(automático)"} disabled />
              </div>
              <div>
                <Label>Nombre corto</Label>
                <Input
                  value={form.nombre_corto ?? ""}
                  maxLength={10}
                  onChange={(e) => set({ nombre_corto: e.target.value })}
                />
              </div>
              <div>
                <Label>Estatus</Label>
                <div className="flex h-9 items-center gap-3">
                  <Switch checked={form.activo} onCheckedChange={(v) => set({ activo: v })} />
                  <span className="text-sm">{form.activo ? "Activo" : "Inactivo"}</span>
                </div>
              </div>
              <div className="sm:col-span-2">
                <Label>Nombre completo / Razón social</Label>
                <Input
                  value={form.nombre}
                  maxLength={100}
                  onChange={(e) => set({ nombre: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Dirección</Label>
                <Input
                  value={form.direccion}
                  maxLength={100}
                  onChange={(e) => set({ direccion: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Dirección (línea 2)</Label>
                <Input
                  value={form.direccion2 ?? ""}
                  maxLength={100}
                  onChange={(e) => set({ direccion2: e.target.value })}
                />
              </div>
              <div>
                <Label>Ciudad</Label>
                <Input
                  value={form.ciudad ?? ""}
                  maxLength={100}
                  onChange={(e) => set({ ciudad: e.target.value })}
                />
              </div>
              <div>
                <Label>País</Label>
                <Input
                  value={form.pais ?? ""}
                  maxLength={40}
                  onChange={(e) => set({ pais: e.target.value })}
                />
              </div>
              <div>
                <Label>Código postal</Label>
                <Input
                  value={form.codigo_postal ?? ""}
                  maxLength={10}
                  onChange={(e) => set({ codigo_postal: e.target.value })}
                />
              </div>
              <div>
                <Label>Fecha de apertura</Label>
                <Input
                  type="date"
                  value={form.fecha_apertura ?? ""}
                  onChange={(e) => set({ fecha_apertura: e.target.value })}
                />
              </div>
              <div>
                <Label>Teléfono 1</Label>
                <Input
                  value={form.telefono}
                  maxLength={20}
                  onChange={(e) => set({ telefono: e.target.value })}
                />
              </div>
              <div>
                <Label>Teléfono 2</Label>
                <Input
                  value={form.telefono2 ?? ""}
                  maxLength={20}
                  onChange={(e) => set({ telefono2: e.target.value })}
                />
              </div>
              <div>
                <Label>Teléfono 3</Label>
                <Input
                  value={form.telefono3 ?? ""}
                  maxLength={20}
                  onChange={(e) => set({ telefono3: e.target.value })}
                />
              </div>
              <div>
                <Label>Fax</Label>
                <Input
                  value={form.fax ?? ""}
                  maxLength={20}
                  onChange={(e) => set({ fax: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Localidad</Label>
                <Select
                  value={form.localidad_id || SIN_VALOR}
                  onValueChange={(v) => set({ localidad_id: v === SIN_VALOR ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin localidad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_VALOR}>Sin localidad</SelectItem>
                    {(listas?.localidades ?? []).map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>E-mail principal</Label>
                <Input
                  value={form.email}
                  maxLength={160}
                  onChange={(e) => set({ email: e.target.value })}
                />
              </div>
              <div>
                <Label>E-mail alterno</Label>
                <Input
                  value={form.email_alterno ?? ""}
                  maxLength={160}
                  onChange={(e) => set({ email_alterno: e.target.value })}
                />
              </div>
              <div>
                <Label>Sector</Label>
                <Input
                  value={form.sector ?? ""}
                  maxLength={4}
                  onChange={(e) => set({ sector: e.target.value })}
                />
              </div>
            </TabsContent>

            <TabsContent value="admin" className="grid gap-4 pt-4 sm:grid-cols-2">
              <div>
                <Label>Límite de crédito (RD$)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.monto_credito ?? 0}
                  onChange={(e) => set({ monto_credito: Math.max(0, Number(e.target.value) || 0) })}
                />
              </div>
              <div>
                <Label>Días de crédito</Label>
                <Input
                  type="number"
                  min={0}
                  max={365}
                  value={form.dias_credito}
                  onChange={(e) => set({ dias_credito: Math.max(0, Number(e.target.value) || 0) })}
                />
              </div>
              <div>
                <Label>Tipo de comprobante (NCF)</Label>
                <Select
                  value={form.tipo_ncf}
                  onValueChange={(v) => set({ tipo_ncf: v as TipoNCF })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_NCF.map((t) => (
                      <SelectItem key={t.codigo} value={t.codigo}>
                        {t.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Vendedor</Label>
                <Select
                  value={form.vendedor_id ? String(form.vendedor_id) : SIN_VALOR}
                  onValueChange={(v) =>
                    set(v === SIN_VALOR ? { vendedor_id: 0 } : { vendedor_id: Number(v) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_VALOR}>Sin vendedor</SelectItem>
                    {(listas?.vendedores ?? []).map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de cliente</Label>
                <Select
                  value={form.clase_id ? String(form.clase_id) : SIN_VALOR}
                  onValueChange={(v) =>
                    set(v === SIN_VALOR ? { clase_id: 0 } : { clase_id: Number(v) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin clasificar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_VALOR}>Sin clasificar</SelectItem>
                    {(listas?.clases ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Lista de precios</Label>
                <Select
                  value={String(form.lista_precios ?? 1)}
                  onValueChange={(v) => set({ lista_precios: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        Lista {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Datacrédito</Label>
                <Select
                  value={form.datacredito || SIN_VALOR}
                  onValueChange={(v) =>
                    set({
                      datacredito: (v === SIN_VALOR ? "" : v) as Cliente["datacredito"],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin definir" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_VALOR}>Sin definir</SelectItem>
                    {DATACREDITO.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Retención ITBIS (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={form.retencion_itbis ?? 0}
                  onChange={(e) =>
                    set({ retencion_itbis: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
              </div>
              <div>
                <Label>Retención I.S.R. (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={form.retencion_isr ?? 0}
                  onChange={(e) => set({ retencion_isr: Math.max(0, Number(e.target.value) || 0) })}
                />
              </div>
              <div>
                <Label>Certificado Zona Franca</Label>
                <Input
                  value={form.certificado_zf ?? ""}
                  maxLength={10}
                  onChange={(e) => set({ certificado_zf: e.target.value })}
                />
              </div>
              <div>
                <Label>Vencimiento certificado ZF</Label>
                <Input
                  type="date"
                  value={form.certificado_zf_vence ?? ""}
                  onChange={(e) => set({ certificado_zf_vence: e.target.value })}
                />
              </div>
              <div>
                <Label>Días de crédito vencido permitidos</Label>
                <Input
                  type="number"
                  min={0}
                  max={999}
                  value={form.dias_credito_vencido ?? 0}
                  onChange={(e) =>
                    set({ dias_credito_vencido: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
              </div>

              <div className="space-y-3 sm:col-span-2">
                {(
                  [
                    ["cargar_itbis", "Cargar ITBIS en facturas"],
                    ["backorder", "Aceptar pedidos en backorder"],
                    ["retener_anticipos", "Aplicar retenciones en anticipos"],
                    ["validar_orden_compra", "Validar orden de compra"],
                    ["generico", "Cliente genérico"],
                    ["bloquear_credito_vencido", "No permitir pedidos con crédito vencido"],
                  ] as const
                ).map(([campo, etiqueta]) => (
                  <div key={campo} className="flex items-center gap-3">
                    <Checkbox
                      id={campo}
                      checked={Boolean(form[campo])}
                      onCheckedChange={(v) => set({ [campo]: Boolean(v) } as Partial<FormCliente>)}
                    />
                    <Label htmlFor={campo} className="font-normal">
                      {etiqueta}
                    </Label>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="notas" className="pt-4">
              <Label>Notas internas</Label>
              <Textarea
                rows={8}
                maxLength={2000}
                value={form.notas ?? ""}
                onChange={(e) => set({ notas: e.target.value })}
              />
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>
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
