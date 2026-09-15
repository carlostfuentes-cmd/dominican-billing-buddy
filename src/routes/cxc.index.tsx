import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  obtenerBalancesCxC,
  obtenerListasCxC,
  obtenerMovimientosCxC,
} from "@/lib/cxc.functions";
import { obtenerClientes } from "@/lib/erp.functions";
import { dop, fechaCorta, hoyISO, money } from "@/lib/erp-types";

export const Route = createFileRoute("/cxc/")({
  head: () => ({
    meta: [
      { title: "Cuentas por cobrar — ERP Contable RD" },
      {
        name: "description",
        content:
          "Balances pendientes por cliente y movimientos de cuentas por cobrar: recibos de cobro, notas de crédito y débito, avances y retenciones.",
      },
      { property: "og:title", content: "Cuentas por cobrar — ERP Contable RD" },
      {
        property: "og:description",
        content: "Balances pendientes por cliente y movimientos de cobro en su moneda.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CxCPage,
});

const TODOS = "todos";

function CxCPage() {
  const inicioAno = `${hoyISO().slice(0, 4)}-01-01`;
  const [desde, setDesde] = useState(inicioAno);
  const [hasta, setHasta] = useState(hoyISO());
  const [cliente, setCliente] = useState(TODOS);
  const [tipo, setTipo] = useState(TODOS);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes", ""],
    queryFn: () => obtenerClientes({ data: { busqueda: "" } }),
  });
  const { data: listas } = useQuery({
    queryKey: ["listas-cxc"],
    queryFn: () => obtenerListasCxC(),
    staleTime: 300_000,
  });
  const { data: balances = [], isLoading: cargandoBalances } = useQuery({
    queryKey: ["cxc-balances"],
    queryFn: () => obtenerBalancesCxC(),
  });

  const filtro = {
    desde,
    hasta,
    ...(cliente !== TODOS ? { clienteId: cliente } : {}),
    ...(tipo !== TODOS ? { tipoId: tipo } : {}),
  };
  const { data: movimientos = [], isLoading } = useQuery({
    queryKey: ["cxc-movimientos", filtro],
    queryFn: () => obtenerMovimientosCxC({ data: filtro }),
  });

  const totalPendiente = balances.reduce((a, b) => a + b.balance, 0);

  return (
    <div>
      <PageHeader
        titulo="Cuentas por cobrar"
        descripcion="Balances pendientes por cliente y movimientos de cobro."
        acciones={
          <Button asChild>
            <Link to="/cxc/nuevo" search={{ cliente: "" }}>
              <Plus className="size-4" /> Nuevo movimiento
            </Link>
          </Button>
        }
      />

      <Tabs defaultValue="pendientes">
        <TabsList className="mb-4">
          <TabsTrigger value="pendientes">Balances pendientes</TabsTrigger>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
        </TabsList>

        <TabsContent value="pendientes">
          <Card>
            <CardContent className="pt-6">
              <p className="mb-3 text-sm text-muted-foreground">
                {balances.length} clientes con balance pendiente · Total equivalente{" "}
                <span className="font-medium text-foreground">{dop(totalPendiente)}</span>
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Moneda</TableHead>
                      <TableHead className="text-right">Documentos</TableHead>
                      <TableHead>Más antiguo</TableHead>
                      <TableHead className="text-right">Balance pendiente</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cargandoBalances && (
                      <TableRow>
                        <TableCell colSpan={7}>Cargando…</TableCell>
                      </TableRow>
                    )}
                    {!cargandoBalances && balances.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7}>Sin balances pendientes.</TableCell>
                      </TableRow>
                    )}
                    {balances.map((b) => (
                      <TableRow key={`${b.cliente_id}-${b.moneda}`}>
                        <TableCell className="font-mono text-xs">{b.cliente_id}</TableCell>
                        <TableCell>{b.cliente}</TableCell>
                        <TableCell>{b.moneda}</TableCell>
                        <TableCell className="text-right">{b.documentos}</TableCell>
                        <TableCell>{b.mas_antiguo ? fechaCorta(b.mas_antiguo) : "—"}</TableCell>
                        <TableCell className="text-right font-medium">
                          {money(b.balance, b.moneda)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="outline" size="sm">
                            <Link to="/cxc/nuevo" search={{ cliente: b.cliente_id }}>
                              Cobrar
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movimientos">
          <Card className="mb-4">
            <CardContent className="grid gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label htmlFor="desde">Desde</Label>
                <Input
                  id="desde"
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="hasta">Hasta</Label>
                <Input
                  id="hasta"
                  type="date"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                />
              </div>
              <div>
                <Label>Cliente</Label>
                <Select value={cliente} onValueChange={setCliente}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODOS}>Todos</SelectItem>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de transacción</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODOS}>Todas</SelectItem>
                    {(listas?.tipos ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Forma / Banco</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Efecto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && (
                      <TableRow>
                        <TableCell colSpan={7}>Cargando…</TableCell>
                      </TableRow>
                    )}
                    {!isLoading && movimientos.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7}>Sin movimientos en el período.</TableCell>
                      </TableRow>
                    )}
                    {movimientos.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{fechaCorta(m.fecha)}</TableCell>
                        <TableCell className="font-mono text-xs">{m.documento}</TableCell>
                        <TableCell>{m.tipo}</TableCell>
                        <TableCell>{m.cliente || m.cliente_id}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {[m.forma_pago, m.banco].filter(Boolean).join(" · ") || "—"}
                        </TableCell>
                        <TableCell className="text-right">{money(m.monto, m.moneda)}</TableCell>
                        <TableCell>
                          <Badge variant={m.signo === "C" ? "secondary" : "outline"}>
                            {m.signo === "C" ? "Abono" : "Cargo"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
