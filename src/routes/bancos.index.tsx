import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Landmark } from "lucide-react";

import { PageHeader } from "@/components/AppShell";
import { usePermisoPantalla } from "@/components/Sesion";
import { SelectorBuscable } from "@/components/SelectorBuscable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  obtenerDisponibilidadBancaria,
  obtenerListasBancos,
  obtenerMovimientosBanco,
} from "@/lib/bancos.functions";
import { fechaCorta, hoyISO, money } from "@/lib/erp-types";

export const Route = createFileRoute("/bancos/")({
  head: () => ({
    meta: [
      { title: "Operaciones bancarias — ERP Contable RD" },
      {
        name: "description",
        content:
          "Libro de bancos: cheques, depósitos, transferencias, notas de crédito y débito con su asiento contable, moneda y tasa de cambio.",
      },
      { property: "og:title", content: "Operaciones bancarias — ERP Contable RD" },
      {
        property: "og:description",
        content: "Movimientos bancarios y disponibilidad por cuenta en su moneda.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BancosPage,
});

const TODOS = "todos";

function BancosPage() {
  const { puedeAgregar } = usePermisoPantalla();
  const inicioAno = `${hoyISO().slice(0, 4)}-01-01`;
  const [desde, setDesde] = useState(inicioAno);
  const [hasta, setHasta] = useState(hoyISO());
  const [banco, setBanco] = useState(TODOS);
  const [tipo, setTipo] = useState(TODOS);
  const [busqueda, setBusqueda] = useState("");

  const { data: listas } = useQuery({
    queryKey: ["listas-bancos"],
    queryFn: () => obtenerListasBancos(),
    staleTime: 300_000,
  });
  const { data: disponibilidad = [] } = useQuery({
    queryKey: ["disponibilidad-bancaria"],
    queryFn: () => obtenerDisponibilidadBancaria(),
  });

  const filtro = {
    desde,
    hasta,
    ...(banco !== TODOS ? { bancoId: banco } : {}),
    ...(tipo !== TODOS ? { tipoId: tipo } : {}),
    ...(busqueda.trim() ? { busqueda: busqueda.trim() } : {}),
  };
  const { data: movimientos = [], isLoading } = useQuery({
    queryKey: ["movimientos-banco", filtro],
    queryFn: () => obtenerMovimientosBanco({ data: filtro }),
  });

  return (
    <>
      <PageHeader
        titulo="Operaciones bancarias"
        descripcion="Cheques, depósitos, transferencias y notas del libro de bancos, con su asiento contable."
        acciones={
          puedeAgregar ? (
            <Button asChild>
              <Link to="/bancos/nueva">
                <Plus className="size-4" /> Nueva operación
              </Link>
            </Button>
          ) : undefined
        }
      />

      <Tabs defaultValue="movimientos" className="space-y-5">
        <TabsList>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
          <TabsTrigger value="disponibilidad">Disponibilidad bancaria</TabsTrigger>
        </TabsList>

        <TabsContent value="movimientos" className="space-y-4">
          <Card>
            <CardContent className="grid gap-3 pt-6 md:grid-cols-5">
              <div>
                <Label>Desde</Label>
                <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
              </div>
              <div>
                <Label>Hasta</Label>
                <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
              </div>
              <div>
                <Label>Cuenta bancaria</Label>
                <SelectorBuscable
                  opciones={[
                    { valor: TODOS, etiqueta: "Todas las cuentas" },
                    ...(listas?.bancos ?? []).map((b) => ({
                      valor: b.id,
                      etiqueta: `${b.nombre} (${b.moneda})`,
                      detalle: b.numero_cuenta,
                    })),
                  ]}
                  valor={banco}
                  onSeleccionar={setBanco}
                  placeholder="Todas las cuentas"
                />
              </div>
              <div>
                <Label>Tipo de operación</Label>
                <SelectorBuscable
                  opciones={[
                    { valor: TODOS, etiqueta: "Todos los tipos" },
                    ...(listas?.tipos ?? []).map((t) => ({
                      valor: t.id,
                      etiqueta: `${t.id} — ${t.nombre}`,
                    })),
                  ]}
                  valor={tipo}
                  onSeleccionar={setTipo}
                  placeholder="Todos los tipos"
                />
              </div>
              <div>
                <Label>Buscar</Label>
                <Input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Número, beneficiario o concepto"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <Table className="min-w-[1080px] table-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Documento</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Cuenta bancaria</TableHead>
                    <TableHead>Beneficiario</TableHead>
                    <TableHead className="w-[180px] min-w-[180px] whitespace-nowrap text-right">
                      Monto
                    </TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-muted-foreground">
                        Cargando movimientos…
                      </TableCell>
                    </TableRow>
                  ) : movimientos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-muted-foreground">
                        No hay movimientos con estos criterios.
                      </TableCell>
                    </TableRow>
                  ) : (
                    movimientos.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap">{fechaCorta(m.fecha)}</TableCell>
                        <TableCell>
                          <Link
                            to="/bancos/$id"
                            params={{ id: String(m.id) }}
                            className="font-medium text-primary hover:underline"
                          >
                            {m.numero}
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{m.tipo}</TableCell>
                        <TableCell className="text-sm">{m.banco}</TableCell>
                        <TableCell className="max-w-[220px] truncate text-sm">
                          {m.beneficiario || m.suplidor || m.concepto}
                        </TableCell>
                        <TableCell
                          className={`w-[180px] min-w-[180px] whitespace-nowrap pr-4 text-right tabular-nums ${
                            m.signo === "D" ? "text-success" : ""
                          }`}
                        >
                          {m.signo === "D" ? "+" : "−"}
                          {money(Math.abs(m.monto), m.moneda)}
                        </TableCell>
                        <TableCell>
                          {m.estado === "A" ? (
                            <Badge variant="secondary">Activa</Badge>
                          ) : m.estado === "P" ? (
                            <Badge variant="outline">Pendiente</Badge>
                          ) : (
                            <Badge variant="destructive">Anulada</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="disponibilidad">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cuenta bancaria</TableHead>
                    <TableHead>Número</TableHead>
                    <TableHead>Moneda</TableHead>
                    <TableHead className="text-right">Movimientos</TableHead>
                    <TableHead>Último</TableHead>
                    <TableHead className="text-right">Saldo en libros</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {disponibilidad.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground">
                        Sin cuentas bancarias activas.
                      </TableCell>
                    </TableRow>
                  ) : (
                    disponibilidad.map((d) => (
                      <TableRow key={d.banco_id}>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-2">
                            <Landmark className="size-4 text-muted-foreground" />
                            {d.banco}
                          </span>
                        </TableCell>
                        <TableCell className="tabular-nums">{d.numero_cuenta}</TableCell>
                        <TableCell>{d.moneda}</TableCell>
                        <TableCell className="text-right tabular-nums">{d.movimientos}</TableCell>
                        <TableCell>{d.ultimo ? fechaCorta(d.ultimo) : "—"}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {money(d.saldo, d.moneda)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-muted-foreground">
                El saldo suma los movimientos activos del libro de bancos en la moneda de cada
                cuenta.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
