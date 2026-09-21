import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  enviarCorreoPrueba,
  guardarConfigCorreo,
  obtenerConfigCorreo,
} from "@/lib/correo.functions";

interface Form {
  servidor: string;
  puerto: number;
  usuario: string;
  clave: string;
  remitente: string;
  remitenteNombre: string;
  copia: string;
  autenticacion: boolean;
  ssl: boolean;
}

const vacio: Form = {
  servidor: "",
  puerto: 25,
  usuario: "",
  clave: "",
  remitente: "",
  remitenteNombre: "",
  copia: "",
  autenticacion: true,
  ssl: false,
};

export function ConfigCorreoCard({ empresaId }: { empresaId: number | string | undefined }) {
  const qc = useQueryClient();
  const id = Number(empresaId) || 0;
  const [form, setForm] = useState<Form>(vacio);
  const [prueba, setPrueba] = useState("");

  const { data } = useQuery({
    queryKey: ["config-correo", id],
    queryFn: () => obtenerConfigCorreo({ data: { empresaId: id } }),
    enabled: id > 0,
  });

  useEffect(() => {
    if (data) setForm({ ...vacio, ...data });
  }, [data]);

  const guardar = useMutation({
    mutationFn: () => guardarConfigCorreo({ data: { empresaId: id, ...form } }),
    onSuccess: () => {
      toast.success("Datos del servidor de correos guardados");
      void qc.invalidateQueries({ queryKey: ["config-correo", id] });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar"),
  });

  const probar = useMutation({
    mutationFn: () => enviarCorreoPrueba({ data: { empresaId: id, para: prueba } }),
    onSuccess: () => toast.success("Correo de prueba enviado"),
    onError: (e: Error) => toast.error(e.message || "No se pudo enviar el correo de prueba"),
  });

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Datos servidor de correos</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="smtp">Servidor SMTP</Label>
          <Input
            id="smtp"
            value={form.servidor}
            maxLength={120}
            placeholder="smtp.miproveedor.com"
            onChange={(e) => setForm({ ...form, servidor: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="puerto">Puerto</Label>
          <Input
            id="puerto"
            inputMode="numeric"
            value={String(form.puerto)}
            onChange={(e) =>
              setForm({ ...form, puerto: Number(e.target.value.replace(/\D/g, "")) || 0 })
            }
          />
        </div>
        <div>
          <Label htmlFor="usuario">Usuario</Label>
          <Input
            id="usuario"
            value={form.usuario}
            maxLength={120}
            onChange={(e) => setForm({ ...form, usuario: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="clave">Clave</Label>
          <Input
            id="clave"
            type="password"
            value={form.clave}
            maxLength={120}
            onChange={(e) => setForm({ ...form, clave: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="remitente">Remitente</Label>
          <Input
            id="remitente"
            value={form.remitente}
            maxLength={120}
            placeholder="info@miempresa.com"
            onChange={(e) => setForm({ ...form, remitente: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="remitenteNombre">Nombre del remitente</Label>
          <Input
            id="remitenteNombre"
            value={form.remitenteNombre}
            maxLength={120}
            onChange={(e) => setForm({ ...form, remitenteNombre: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="copia">Copia oculta (opcional)</Label>
          <Input
            id="copia"
            value={form.copia}
            maxLength={120}
            onChange={(e) => setForm({ ...form, copia: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-6 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.autenticacion}
              onCheckedChange={(v) => setForm({ ...form, autenticacion: v === true })}
            />
            ¿Requiere autenticación?
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.ssl}
              onCheckedChange={(v) => setForm({ ...form, ssl: v === true })}
            />
            ¿SSL / TLS?
          </label>
        </div>
        <div className="sm:col-span-2">
          <Button onClick={() => guardar.mutate()} disabled={guardar.isPending || id === 0}>
            {guardar.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
        <div className="grid gap-2 border-t pt-4 sm:col-span-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="prueba">Enviar un correo de prueba a</Label>
            <Input
              id="prueba"
              value={prueba}
              placeholder="mi.correo@empresa.com"
              onChange={(e) => setPrueba(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            onClick={() => probar.mutate()}
            disabled={probar.isPending || !prueba.includes("@")}
          >
            {probar.isPending ? "Enviando…" : "Enviar prueba"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2">
          El correo sale por este servidor y lleva el documento anexo en PDF. Si cambió el archivo
          puente, vuelva a subir la versión que se descarga en esta misma pantalla.
        </p>
      </CardContent>
    </Card>
  );
}
