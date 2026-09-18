import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";

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
import { obtenerListasCompras } from "@/lib/compras.functions";
import { obtenerBalancesSuplidores, obtenerMovimientosCxP } from "@/lib/cxp.functions";
import { dop, fechaCorta, hoyISO, money } from "@/lib/erp-types";

export const Route = createFileRoute("/cxp/")({
  head: () => ({
    meta: [
      { title: "Cuentas por pagar — ERP Contable RD" },
      {
        name: "description",
        content:
          "Balances pendientes por suplidor y facturas de compras con NCF, retenciones de ITBIS e ISR, moneda y tasa de cambio.",
      },
      { property: "og:title", content: "Cuentas por pagar — ERP Contable RD" },
      {
        property: "og:description",
        content: "Facturas de suplidores y balances pendientes en su moneda.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CxPPage,
});

const TODOS = "todos";

function CxPPage() {
  const { puedeAgregar } = usePermisoPantalla();
  const inicioAno = `${hoyISO().slice(0, 4)}-01-01`;
  const [desde, setDesde] = useState(inicioAno);
  const [hasta, setHasta] = useState(hoyISO());
  const [suplidor, setSuplidor] = useState(TODOS);
  const [ncf, setNcf] = useState("");

  const { data: listas } = useQuery({
    queryKey: ["listas-compras"],
    queryFn: () => obtenerListasCompras(),
    staleTime: 300_000,
  });
  const { data: balances = [], isLoading: cargandoBalances } = useQuery({
    queryKey: ["cxp-balances"],
    queryFn: () => obtenerBalancesSuplidores(),
  });

  const filtro = {
    desde,
    hasta,
    ...(suplidor !== TODOS ? { suplidorId: suplidor } : {}),
    ...(ncf ? { ncf } : {}),
  };
  const { data: movimientos = [], isLoading } = useQuery({
    queryKey: ["cxp-movimientos", filtro],
    queryFn: () => obtenerMovimientosCxP({ data: filtro }),
  });

  const totalPendiente = balances.reduce((a, b) => a + b.balance, 0);

  return (
    <div>
      <PageHeader
        titulo="Cuentas por pagar"
        descripcion="Facturas de suplidores y balances pendientes por pagar."
        acciones={
          puedeAgregar ? (
            <Button asChild>
              <Link to="/cxp/nueva">
                <Plus className="size-4" /> Nueva factura de suplidor
              </Link>
            </Button>
          ) : undefined
        }
      />

      <Tabs defaultValue="pendientes">
        <TabsList className="mb-4">
          <TabsTrigger value="pendientes">Balances pendientes</TabsTrigger>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
        </TabsList>

        <TabsContent value="pendientes">
          <Card className="overflow-hidden">
            <CardContent className="px-0 pb-0 pt-0">
              <p className="border-b bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
                {balances.length} suplidores con balance pendiente · Total equivalente{" "}
                <span className="font-medium text-foreground">{dop(totalPendiente)}</span>
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Suplidor</TableHead>
                      <TableHead>Moneda</TableHead>
                      <TableHead className="text-right">Documentos</TableHead>
                      <TableHead>Más antiguo</TableHead>
                      <TableHead className="text-right">Balance pendiente</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cargandoBalances && (
                      <TableRow>
                        <TableCell colSpan={6}>Cargando…</TableCell>
                      </TableRow>
                    )}
                    {!cargandoBalances && balances.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6}>Sin balances pendientes.</TableCell>
                      </TableRow>
                    )}
                    {balances.map((b) => (
                      <TableRow key={`${b.suplidor_id}-${b.moneda}`}>
                        <TableCell className="font-mono text-xs">{b.suplidor_id}</TableCell>
                        <TableCell>{b.suplidor}</TableCell>
                        <TableCell>{b.moneda}</TableCell>
                        <TableCell className="text-right">{b.documentos}</TableCell>
                        <TableCell>{b.mas_antiguo ? fechaCorta(b.mas_antiguo) : "—"}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {money(b.balance, b.moneda)}
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
          <Card className="mb-4 border-border/80 bg-muted/25">
            <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-4">
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
                <Label>Suplidor</Label>
                <SelectorBuscable
                  opciones={[
                    { valor: TODOS, etiqueta: "Todos" },
                    ...(listas?.suplidores ?? []).map((s) => ({
                      valor: s.id,
                      etiqueta: `${s.id} — ${s.nombre}`,
                    })),
                  ]}
                  valor={suplidor}
                  placeholder="Todos"
                  placeholderBusqueda="Escribe código o nombre…"
                  vacio="Sin suplidores que coincidan"
                  onSeleccionar={setSuplidor}
                />
              </div>
              <div>
                <Label htmlFor="ncf">NCF</Label>
                <Input
                  id="ncf"
                  value={ncf}
                  onChange={(e) => setNcf(e.target.value.toUpperCase())}
                  placeholder="B01…"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardContent className="px-0 pb-0 pt-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead>NCF</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Suplidor</TableHead>
                      <TableHead>Orden</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Efecto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && (
                      <TableRow>
                        <TableCell colSpan={9}>Cargando…</TableCell>
                      </TableRow>
                    )}
                    {!isLoading && movimientos.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9}>Sin movimientos en el período.</TableCell>
                      </TableRow>
                    )}
                    {movimientos.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{fechaCorta(m.fecha)}</TableCell>
                        <TableCell className="font-mono text-xs">{m.documento}</TableCell>
                        <TableCell className="font-mono text-xs">{m.ncf || "—"}</TableCell>
                        <TableCell>{m.tipo}</TableCell>
                        <TableCell>{m.suplidor || m.suplidor_id}</TableCell>
                        <TableCell className="font-mono text-xs">{m.orden_id || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(m.monto, m.moneda)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(m.balance, m.moneda)}
                        </TableCell>
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
