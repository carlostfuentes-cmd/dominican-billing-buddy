import { useMutation } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { enviarDocumentoPorCorreo } from "@/lib/correo.functions";

/** Convierte lo que se está viendo en pantalla (el documento) en un PDF base64. */
async function pdfDelDocumento(): Promise<string> {
  const area = document.querySelector<HTMLElement>(".print-area");
  if (!area) throw new Error("No se encontró el documento para anexar");
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const lienzo = await html2canvas(area, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const anchoPagina = pdf.internal.pageSize.getWidth();
  const altoPagina = pdf.internal.pageSize.getHeight();
  const alto = (lienzo.height * anchoPagina) / lienzo.width;
  const imagen = lienzo.toDataURL("image/jpeg", 0.92);
  let restante = alto;
  let desplazamiento = 0;
  while (restante > 0) {
    pdf.addImage(imagen, "JPEG", 0, desplazamiento, anchoPagina, alto);
    restante -= altoPagina;
    if (restante > 0) {
      desplazamiento -= altoPagina;
      pdf.addPage();
    }
  }
  const datos = pdf.output("datauristring");
  return datos.slice(datos.indexOf(",") + 1);
}

interface Props {
  empresaId: number | string | undefined;
  archivo: string;
  asunto: string;
  mensaje: string;
  paraSugerido?: string | undefined;
  /** Abre el diálogo automáticamente al montar (envío tras emitir). */
  iniciarAbierto?: boolean | undefined;
  /** Aviso cuando el diálogo se cierra (para limpiar la dirección de la URL). */
  alCerrar?: (() => void) | undefined;
}

export function EnviarPorCorreo({
  empresaId,
  archivo,
  asunto,
  mensaje,
  paraSugerido,
  iniciarAbierto,
  alCerrar,
}: Props) {
  const [abierto, setAbierto] = useState(Boolean(iniciarAbierto));
  const [para, setPara] = useState(paraSugerido ?? "");
  const [tema, setTema] = useState(asunto);
  const [texto, setTexto] = useState(mensaje);

  const cerrar = (v: boolean) => {
    setAbierto(v);
    if (!v && alCerrar) alCerrar();
  };

  const enviar = useMutation({
    mutationFn: async () => {
      const idEmpresa = Number(empresaId) || 0;
      const base64 = await pdfDelDocumento();
      return enviarDocumentoPorCorreo({
        data: {
          empresaId: idEmpresa,
          para,
          asunto: tema,
          mensaje: texto,
          anexos: [{ filename: archivo, contentType: "application/pdf", base64 }],
        },
      });
    },
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.mensaje);
        return;
      }
      toast.success("Correo enviado con el documento anexo");
      cerrar(false);
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo enviar el correo"),
  });

  return (
    <Dialog open={abierto} onOpenChange={cerrar}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Mail className="size-4" /> Enviar por correo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar por correo</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label htmlFor="para">Para</Label>
            <Input
              id="para"
              value={para}
              placeholder="cliente@correo.com"
              onChange={(e) => setPara(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Puedes escribir varios correos separados por coma.
            </p>
          </div>
          <div>
            <Label htmlFor="asunto">Asunto</Label>
            <Input id="asunto" value={tema} onChange={(e) => setTema(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="mensaje">Mensaje</Label>
            <Textarea
              id="mensaje"
              rows={5}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Se anexa el documento en PDF tal como se ve en pantalla ({archivo}).
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => cerrar(false)}>
            Cancelar
          </Button>
          <Button onClick={() => enviar.mutate()} disabled={enviar.isPending}>
            {enviar.isPending ? "Enviando…" : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
