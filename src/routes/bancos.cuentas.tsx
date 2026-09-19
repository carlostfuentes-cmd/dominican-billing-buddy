import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Save } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { usePermisoPantalla } from "@/components/Sesion";
import { SelectorBuscable } from "@/components/SelectorBuscable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  guardarConceptoBancario,
  guardarCuentaBancaria,
  obtenerConceptosBancarios,
  obtenerCuentasBancarias,
  obtenerListasBancos,
} from "@/lib/bancos.functions";
import { obtenerListasContabilidad } from "@/lib/contabilidad.functions";
import type { ConceptoBancario, CuentaBancaria } from "@/lib/erp-types";

export const Route = createFileRoute("/bancos/cuentas")({
  head: () => ({
    meta: [
      { title: "Maestra de caja y bancos — ERP Contable RD" },
      {
        name: "description",
        content:
          "Cuentas bancarias, tipos de cuenta, cuenta del catálogo contable, límites de depósitos y conceptos bancarios.",
      },
      { property: "og:title", content: "Maestra de caja y bancos — ERP Contable RD" },
      {
        property: "og:description",
        content: "Administración de cuentas bancarias y conceptos del libro de bancos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MaestraBancos,
});

const VACIA: CuentaBancaria = {
  id: "",
  nombre: "",
  numero_cuenta: "",
  nombre_corto: "",
  tipo_id: "C",
  oficial: "",
  telefono: "",
  direccion: "",
  cuenta_contable: "",
  moneda: "DOP",
  sucursal_id: "1",
  rnc: "",
  numero_empresa: "",
  activa: true,
  ultimo_deposito: 0,
  ultimo_cheque: 0,
  ultima_nota_credito: 0,
  ultima_nota_debito: 0,
  limite_cheques: 0,
  limite_monto: 0,
  cargo_tc: 0,
  itbis_tc: 0,
};

function MaestraBancos() {
  const qc = useQueryClient();
  const { puedeAgregar, puedeEditar } = usePermisoPantalla();
  const [cuenta, setCuenta] = useState<CuentaBancaria>(VACIA);
  const [concepto, setConcepto] = useState<ConceptoBancario>({ id: "", nombre: "", cuenta: "" });

  const { data: cuentas = [] } = useQuery({
    queryKey: ["cuentas-bancarias"],
    queryFn: () => obtenerCuentasBancarias(),
  });
  const { data: conceptos = [] } = useQuery({
    queryKey: ["conceptos-bancarios"],
    queryFn: () => obtenerConceptosBancarios(),
  });
  const { data: listas } = useQuery({
    queryKey: ["listas-bancos"],
    queryFn: () => obtenerListasBancos(),
    staleTime: 300_000,
  });
  const { data: contab } = useQuery({
    queryKey: ["listas-contabilidad"],
    queryFn: () => obtenerListasContabilidad(),
    staleTime: 300_000,
  });

  const opcionesCuentas = (contab?.cuentas ?? []).map((c) => ({
    valor: c.cuenta,
    etiqueta: `${c.cuenta} — ${c.nombre}`,
  }));

  const guardarCuenta = useMutation({
    mutationFn: () => guardarCuentaBancaria({ data: cuenta }),
    onSuccess: () => {
      toast.success("Cuenta bancaria guardada");
      setCuenta(VACIA);
      void qc.invalidateQueries({ queryKey: ["cuentas-bancarias"] });
      void qc.invalidateQueries({ queryKey: ["listas-bancos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const guardarConcepto = useMutation({
    mutationFn: () => guardarConceptoBancario({ data: concepto }),
    onSuccess: () => {
      toast.success("Concepto guardado");
      setConcepto({ id: "", nombre: "", cuenta: "" });
      void qc.invalidateQueries({ queryKey: ["conceptos-bancarios"] });
      void qc.invalidateQueries({ queryKey: ["listas-bancos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const puedeGuardar = cuenta.id ? puedeEditar : puedeAgregar;

  return (
    <>
      <PageHeader
        titulo="Maestra de caja y bancos"
        descripcion="Cuentas bancarias, su cuenta del catálogo contable, numeración y conceptos de cargos."
      />

      <Tabs defaultValue="cuentas" className="space-y-5">
        <TabsList>
          <TabsTrigger value="cuentas">Cuentas bancarias</TabsTrigger>
          <TabsTrigger value="conceptos">Conceptos bancarios</TabsTrigger>
        </TabsList>

        <TabsContent value="cuentas" className="space-y-5">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Banco</TableHead>
                    <TableHead>Número de cuenta</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Moneda</TableHead>
                    <TableHead>Cuenta contable</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cuentas.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => setCuenta(c)}
                    >
                      <TableCell className="font-medium">{c.nombre}</TableCell>
                      <TableCell className="tabular-nums">{c.numero_cuenta}</TableCell>
                      <TableCell>
                        {listas?.tipos_cuenta.find((t) => t.id === c.tipo_id)?.nombre ?? c.tipo_id}
                      </TableCell>
                      <TableCell>{c.moneda}</TableCell>
                      <TableCell className="tabular-nums">{c.cuenta_contable}</TableCell>
                      <TableCell>
                        {c.activa ? (
                          <Badge variant="secondary">Activa</Badge>
                        ) : (
                          <Badge variant="outline">Inactiva</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                {cuenta.id ? `Editar cuenta ${cuenta.nombre}` : "Nueva cuenta bancaria"}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setCuenta(VACIA)}>
                <Plus className="size-4" /> Nueva
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <Label>Banco</Label>
                <Input
                  value={cuenta.nombre}
                  onChange={(e) => setCuenta({ ...cuenta, nombre: e.target.value })}
                  maxLength={50}
                />
              </div>
              <div>
                <Label>Nombre corto</Label>
                <Input
                  value={cuenta.nombre_corto}
                  onChange={(e) => setCuenta({ ...cuenta, nombre_corto: e.target.value })}
                  maxLength={10}
                />
              </div>
              <div>
                <Label>Cuenta #</Label>
                <Input
                  value={cuenta.numero_cuenta}
                  onChange={(e) => setCuenta({ ...cuenta, numero_cuenta: e.target.value })}
                  maxLength={25}
                />
              </div>
              <div>
                <Label>Tipo de cuenta</Label>
                <SelectorBuscable
                  opciones={(listas?.tipos_cuenta ?? []).map((t) => ({
                    valor: t.id,
                    etiqueta: t.nombre,
                  }))}
                  valor={cuenta.tipo_id}
                  onSeleccionar={(v) => setCuenta({ ...cuenta, tipo_id: v })}
                />
              </div>
              <div>
                <Label>Moneda</Label>
                <SelectorBuscable
                  opciones={(listas?.monedas ?? []).map((m) => ({
                    valor: m.id,
                    etiqueta: `${m.id} — ${m.nombre}`,
                  }))}
                  valor={cuenta.moneda}
                  onSeleccionar={(v) => setCuenta({ ...cuenta, moneda: v })}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Cuenta del catálogo contable</Label>
                <SelectorBuscable
                  opciones={opcionesCuentas}
                  valor={cuenta.cuenta_contable}
                  onSeleccionar={(v) => setCuenta({ ...cuenta, cuenta_contable: v })}
                  placeholder="Selecciona la cuenta"
                />
              </div>
              <div>
                <Label>RNC</Label>
                <Input
                  value={cuenta.rnc}
                  onChange={(e) => setCuenta({ ...cuenta, rnc: e.target.value })}
                  maxLength={15}
                />
              </div>
              <div>
                <Label>Oficial de la cuenta</Label>
                <Input
                  value={cuenta.oficial}
                  onChange={(e) => setCuenta({ ...cuenta, oficial: e.target.value })}
                  maxLength={30}
                />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input
                  value={cuenta.telefono}
                  onChange={(e) => setCuenta({ ...cuenta, telefono: e.target.value })}
                  maxLength={20}
                />
              </div>
              <div>
                <Label>Dirección</Label>
                <Input
                  value={cuenta.direccion}
                  onChange={(e) => setCuenta({ ...cuenta, direccion: e.target.value })}
                  maxLength={30}
                />
              </div>

              <div>
                <Label>Último depósito usado</Label>
                <Input
                  type="number"
                  value={cuenta.ultimo_deposito}
                  onChange={(e) =>
                    setCuenta({ ...cuenta, ultimo_deposito: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <Label>Último cheque usado</Label>
                <Input
                  type="number"
                  value={cuenta.ultimo_cheque}
                  onChange={(e) => setCuenta({ ...cuenta, ultimo_cheque: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Última nota de crédito</Label>
                <Input
                  type="number"
                  value={cuenta.ultima_nota_credito}
                  onChange={(e) =>
                    setCuenta({ ...cuenta, ultima_nota_credito: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <Label>Última nota de débito</Label>
                <Input
                  type="number"
                  value={cuenta.ultima_nota_debito}
                  onChange={(e) =>
                    setCuenta({ ...cuenta, ultima_nota_debito: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <Label>Límite de cheques en depósito</Label>
                <Input
                  type="number"
                  value={cuenta.limite_cheques}
                  onChange={(e) => setCuenta({ ...cuenta, limite_cheques: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Límite de monto en depósito</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={cuenta.limite_monto}
                  onChange={(e) => setCuenta({ ...cuenta, limite_monto: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>% cargo de tarjeta</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={cuenta.cargo_tc}
                  onChange={(e) => setCuenta({ ...cuenta, cargo_tc: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>% ITBIS del cargo</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={cuenta.itbis_tc}
                  onChange={(e) => setCuenta({ ...cuenta, itbis_tc: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={cuenta.activa}
                    onCheckedChange={(v) => setCuenta({ ...cuenta, activa: v === true })}
                  />
                  Cuenta activa
                </label>
              </div>

              <div className="md:col-span-3">
                <Button
                  disabled={!puedeGuardar || guardarCuenta.isPending}
                  onClick={() => guardarCuenta.mutate()}
                >
                  <Save className="size-4" /> Guardar cuenta
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conceptos" className="space-y-5">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Cuenta contable</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conceptos.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => setConcepto(c)}>
                      <TableCell className="font-medium">{c.nombre}</TableCell>
                      <TableCell className="tabular-nums">{c.cuenta || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                {concepto.id ? `Editar ${concepto.nombre}` : "Nuevo concepto bancario"}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConcepto({ id: "", nombre: "", cuenta: "" })}
              >
                <Plus className="size-4" /> Nuevo
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Nombre del concepto</Label>
                <Input
                  value={concepto.nombre}
                  onChange={(e) => setConcepto({ ...concepto, nombre: e.target.value })}
                  maxLength={50}
                />
              </div>
              <div>
                <Label>Cuenta contable del cargo</Label>
                <SelectorBuscable
                  opciones={opcionesCuentas}
                  valor={concepto.cuenta}
                  onSeleccionar={(v) => setConcepto({ ...concepto, cuenta: v })}
                  placeholder="Selecciona la cuenta"
                />
              </div>
              <div className="md:col-span-2">
                <Button
                  disabled={
                    (concepto.id ? !puedeEditar : !puedeAgregar) || guardarConcepto.isPending
                  }
                  onClick={() => guardarConcepto.mutate()}
                >
                  <Save className="size-4" /> Guardar concepto
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
