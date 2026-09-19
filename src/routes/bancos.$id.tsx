import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Printer } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { usePermisoPantalla } from "@/components/Sesion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { anularMovimientoBanco, obtenerMovimientoBanco } from "@/lib/bancos.functions";
import { fechaCorta, money } from "@/lib/erp-types";

export const Route = createFileRoute("/bancos/$id")({
  head: () => ({
    meta: [
      { title: "Operación bancaria — ERP Contable RD" },
      {
        name: "description",
        content:
          "Detalle de la operación bancaria con su asiento contable, retenciones, moneda y centro de costo.",
      },
      { property: "og:title", content: "Operación bancaria — ERP Contable RD" },
      {
        property: "og:description",
        content: "Detalle del movimiento del libro de bancos y su asiento contable.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DetalleOperacion,
});

function DetalleOperacion() {
  const { id } = useParams({ from: "/bancos/$id" });
  const qc = useQueryClient();
  const { puedeEliminar, puedeImprimir } = usePermisoPantalla();

  const { data: mov, isLoading } = useQuery({
    queryKey: ["movimiento-banco", id],
    queryFn: () => obtenerMovimientoBanco({ data: { id: Number(id) } }),
  });

  const anular = useMutation({
    mutationFn: () => anularMovimientoBanco({ data: { id: Number(id) } }),
    onSuccess: () => {
      toast.success("Operación anulada");
      void qc.invalidateQueries({ queryKey: ["movimiento-banco", id] });
      void qc.invalidateQueries({ queryKey: ["movimientos-banco"] });
      void qc.invalidateQueries({ queryKey: ["disponibilidad-bancaria"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-muted-foreground">Cargando operación…</p>;
  if (!mov) return <p className="text-muted-foreground">No encontramos esta operación.</p>;

  const debito = mov.lineas.reduce((s, l) => s + l.debito, 0);
  const credito = mov.lineas.reduce((s, l) => s + l.credito, 0);

  return (
    <>
      <PageHeader
        titulo={`Operación ${mov.numero}`}
        descripcion={`${mov.tipo} · ${mov.banco} · ${fechaCorta(mov.fecha)}`}
        acciones={
          <>
            <Button variant="ghost" asChild>
              <Link to="/bancos">
                <ArrowLeft className="size-4" /> Volver
              </Link>
            </Button>
            {puedeImprimir ? (
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer className="size-4" /> Imprimir
              </Button>
            ) : null}
            {puedeEliminar && mov.estado !== "I" ? (
              <Button variant="destructive" onClick={() => anular.mutate()} disabled={anular.isPending}>
                <Ban className="size-4" /> Anular
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Datos del movimiento</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <Dato titulo="Cuenta bancaria" valor={`${mov.banco} (${mov.moneda})`} />
            <Dato titulo="Tipo de operación" valor={mov.tipo} />
            <Dato titulo="Beneficiario" valor={mov.beneficiario || "—"} />
            <Dato titulo="Suplidor" valor={mov.suplidor || "—"} />
            <Dato titulo="Concepto" valor={mov.concepto || "—"} />
            <Dato titulo="NCF" valor={mov.ncf || "—"} />
            <Dato titulo="Monto" valor={money(Math.abs(mov.monto), mov.moneda)} />
            <Dato titulo="Tasa de cambio" valor={String(mov.tasa_cambio)} />
            <Dato titulo="Comisión" valor={money(mov.comision, mov.moneda)} />
            <Dato titulo="ITBIS" valor={money(mov.itbis, mov.moneda)} />
            <div className="sm:col-span-2">
              <Dato titulo="Descripción" valor={mov.descripcion || "—"} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Estado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {mov.estado === "A" ? (
              <Badge variant="secondary">Activa</Badge>
            ) : mov.estado === "P" ? (
              <Badge variant="outline">Pendiente</Badge>
            ) : (
              <Badge variant="destructive">Anulada</Badge>
            )}
            <p className="text-muted-foreground">
              {mov.signo === "D" ? "Entrada de fondos" : "Salida de fondos"} en la cuenta bancaria.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle className="text-base">Asiento contable</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cuenta</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Centro de costo</TableHead>
                <TableHead className="text-right">Débito</TableHead>
                <TableHead className="text-right">Crédito</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mov.lineas.map((l, i) => (
                <TableRow key={`${l.cuenta}-${i}`}>
                  <TableCell className="tabular-nums">{l.cuenta}</TableCell>
                  <TableCell className="text-sm">{l.cuenta_nombre || l.descripcion}</TableCell>
                  <TableCell className="text-sm">{l.departamento || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.debito ? money(l.debito, mov.moneda) : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.credito ? money(l.credito, mov.moneda) : ""}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={3} className="font-medium">
                  Totales
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {money(debito, mov.moneda)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {money(credito, mov.moneda)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <p>
      <span className="block text-xs uppercase text-muted-foreground">{titulo}</span>
      <span className="font-medium">{valor}</span>
    </p>
  );
}
