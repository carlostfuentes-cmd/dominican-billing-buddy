import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { SelectorBuscable } from "@/components/SelectorBuscable";
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
import { Textarea } from "@/components/ui/textarea";
import { guardarAsiento, obtenerListasContabilidad } from "@/lib/contabilidad.functions";
import { hoyISO, money, round2 } from "@/lib/erp-types";

export const Route = createFileRoute("/contabilidad/nuevo")({
  head: () => ({
    meta: [
      { title: "Nuevo asiento contable — ERP Contable RD" },
      {
        name: "description",
        content:
          "Registra un asiento en el diario general: cuentas del catálogo, departamento, débito y crédito, con moneda y tasa de cambio.",
      },
      { property: "og:title", content: "Nuevo asiento contable — ERP Contable RD" },
      {
        property: "og:description",
        content: "Asiento manual del diario general con validación de cuadre.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NuevoAsientoPage,
});

interface Fila {
  cuenta: string;
  departamento_id: string;
  descripcion: string;
  referencia: string;
  debito: string;
  credito: string;
}

const filaVacia = (): Fila => ({
  cuenta: "",
  departamento_id: "",
  descripcion: "",
  referencia: "",
  debito: "",
  credito: "",
});

const numero = (v: string): number => {
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? round2(n) : 0;
};

function NuevoAsientoPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: listas } = useQuery({
    queryKey: ["contabilidad", "listas"],
    queryFn: () => obtenerListasContabilidad(),
  });

  const [fecha, setFecha] = useState(hoyISO());
  const [descripcion, setDescripcion] = useState("ENTRADA DE DIARIO");
  const [tipo, setTipo] = useState("901");
  const [clase, setClase] = useState("N");
  const [moneda, setMoneda] = useState("DOP");
  const [tasa, setTasa] = useState("1");
  const [documento, setDocumento] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [filas, setFilas] = useState<Fila[]>([filaVacia(), filaVacia()]);

  const opcionesCuentas = useMemo(
    () =>
      (listas?.cuentas ?? []).map((c) => ({
        valor: c.cuenta,
        etiqueta: `${c.cuenta} — ${c.nombre}`,
        detalle: c.clasificacion ?? "",
      })),
    [listas],
  );

  const totales = useMemo(() => {
    const debito = round2(filas.reduce((a, f) => a + numero(f.debito), 0));
    const credito = round2(filas.reduce((a, f) => a + numero(f.credito), 0));
    return { debito, credito, diferencia: round2(debito - credito) };
  }, [filas]);

  const actualizar = (i: number, cambios: Partial<Fila>) =>
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...cambios } : f)));

  const mutation = useMutation({
    mutationFn: () =>
      guardarAsiento({
        data: {
          fecha,
          descripcion,
          tipo_id: tipo,
          estado_id: "C",
          clase,
          moneda,
          tasa_cambio: numero(tasa) || 1,
          documento,
          lineas: filas
            .filter((f) => f.cuenta && (numero(f.debito) > 0 || numero(f.credito) > 0))
            .map((f) => ({
              cuenta: f.cuenta,
              departamento_id: f.departamento_id || departamento,
              descripcion: f.descripcion || descripcion,
              referencia: f.referencia,
              debito: numero(f.debito),
              credito: numero(f.credito),
            })),
        },
      }),
    onSuccess: (r) => {
      toast.success(`Asiento ${r.numero} contabilizado`);
      void queryClient.invalidateQueries({ queryKey: ["contabilidad"] });
      void navigate({ to: "/contabilidad" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo guardar el asiento"),
  });

  const cuadrado = Math.abs(totales.diferencia) < 0.01 && totales.debito > 0;

  return (
    <div>
      <PageHeader
        titulo="Nuevo asiento contable"
        descripcion="Se registra en el diario general con el tipo de entrada, la moneda y la tasa que indiques."
        acciones={
          <Button onClick={() => mutation.mutate()} disabled={!cuadrado || mutation.isPending}>
            <Save className="size-4" /> Guardar asiento
          </Button>
        }
      />

      <div className="grid gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Datos del asiento</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="fecha">Fecha</Label>
              <Input
                id="fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
            <div>
              <Label>Tipo de entrada</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger>
                  <SelectValue />
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
              <Label>Clase</Label>
              <Select value={clase} onValueChange={setClase}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="N">Normal</SelectItem>
                  <SelectItem value="A">Ajuste</SelectItem>
                  <SelectItem value="C">Cierre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="documento">Documento</Label>
              <Input
                id="documento"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                placeholder="Referencia externa"
              />
            </div>
            <div>
              <Label>Moneda</Label>
              <Select value={moneda} onValueChange={setMoneda}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(listas?.monedas ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.id} — {m.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="tasa">Tasa de cambio</Label>
              <Input
                id="tasa"
                inputMode="decimal"
                value={tasa}
                onChange={(e) => setTasa(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Los importes se contabilizan en pesos usando esta tasa.
              </p>
            </div>
            <div>
              <Label>Centro de costo</Label>
              <Select value={departamento} onValueChange={setDepartamento}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin centro de costo" />
                </SelectTrigger>
                <SelectContent>
                  {(listas?.departamentos ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Label htmlFor="descripcion">Descripción</Label>
              <Textarea
                id="descripcion"
                rows={2}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Líneas del asiento</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilas((p) => [...p, filaVacia()])}
            >
              <Plus className="size-4" /> Agregar línea
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4">
            {filas.map((f, i) => (
              <div
                key={i}
                className="grid gap-3 rounded-lg border p-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_130px_130px_40px]"
              >
                <div>
                  <Label>Cuenta</Label>
                  <SelectorBuscable
                    opciones={opcionesCuentas}
                    valor={f.cuenta}
                    onSeleccionar={(v) => actualizar(i, { cuenta: v })}
                    placeholder="Selecciona la cuenta"
                    placeholderBusqueda="Número o nombre de la cuenta…"
                  />
                </div>
                <div>
                  <Label>Concepto de la línea</Label>
                  <Input
                    value={f.descripcion}
                    onChange={(e) => actualizar(i, { descripcion: e.target.value })}
                    placeholder="Opcional"
                  />
                </div>
                <div>
                  <Label>Débito</Label>
                  <Input
                    inputMode="decimal"
                    className="text-right tabular-nums"
                    value={f.debito}
                    onChange={(e) => actualizar(i, { debito: e.target.value, credito: "" })}
                  />
                </div>
                <div>
                  <Label>Crédito</Label>
                  <Input
                    inputMode="decimal"
                    className="text-right tabular-nums"
                    value={f.credito}
                    onChange={(e) => actualizar(i, { credito: e.target.value, debito: "" })}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Quitar línea"
                    disabled={filas.length <= 2}
                    onClick={() => setFilas((p) => p.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap justify-end gap-6 border-t pt-4 text-sm">
              <span>
                Débito:{" "}
                <span className="font-medium tabular-nums">
                  {money(totales.debito, moneda)}
                </span>
              </span>
              <span>
                Crédito:{" "}
                <span className="font-medium tabular-nums">
                  {money(totales.credito, moneda)}
                </span>
              </span>
              <span className={cuadrado ? "text-muted-foreground" : "text-destructive"}>
                Diferencia:{" "}
                <span className="font-medium tabular-nums">
                  {money(totales.diferencia, moneda)}
                </span>
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
