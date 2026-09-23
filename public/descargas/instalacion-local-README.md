# Instalación local (on-premise) — Suite Empresarial BP Dominicana

Guía para instalar la Suite en el propio servidor del cliente, conectada a su
MariaDB local y validando su licencia contra el servidor de BP Dominicana.

## 1. Requisitos del servidor del cliente

- Linux o Windows con Node.js 20 o superior (o Bun 1.1+).
- MariaDB 10.4+ / MySQL 8 con la base del ERP ya restaurada.
- Salida a internet por HTTPS hacia `erp.bpdominicana.com` (para validar la licencia).
- Un puerto libre para la aplicación (por defecto 3000).

## 2. Qué entrega BP Dominicana

1. El paquete de la aplicación (carpeta con el build de producción).
2. La **clave de licencia** de esa instalación (`BPD-...`), creada en
   Sistema → Licenciamiento de clientes con modalidad **local**.
3. La **clave pública** de firma (ya viene en `.env.ejemplo`).
4. Este README y el archivo `.env.ejemplo`.

La clave privada de firma **nunca** sale del servidor de licencias.

## 3. Pasos de instalación

```bash
# 1. Descomprimir el paquete
unzip suite-bpd.zip -d /opt/suite-bpd
cd /opt/suite-bpd

# 2. Configurar el entorno
cp .env.ejemplo .env
nano .env            # complete base de datos, SESSION_SECRET y LICENSE_KEY

# 3. Instalar dependencias y arrancar
npm ci --omit=dev
npm run start        # queda escuchando en http://IP-DEL-SERVIDOR:3000
```

Para que arranque solo al encender el servidor, use `pm2 start npm -- run start`
o un servicio de systemd.

## 4. Verificación

1. Abra la aplicación e inicie sesión con un usuario administrador.
2. Entre a **Sistema → Licencia del sistema**: debe mostrar el plan, el estado
   "Activa", el vencimiento y los usuarios permitidos frente a los usados.
3. En el panel de BP Dominicana (**Sistema → Licenciamiento de clientes**) la
   fila de ese cliente debe mostrar el último contacto y la versión.

## 5. Cómo se comporta la licencia

- Se valida al iniciar sesión y se guarda en memoria por 10 minutos.
- Si no hay internet, la instalación sigue trabajando **7 días de gracia**.
- Vencida o suspendida, el sistema queda en **solo lectura**: se consulta,
  reimprime y exporta, pero no se registra nada nuevo.
- El tope de usuarios del plan se verifica al crear un usuario.

## 6. Recuperación y respaldo

- El respaldo de la base es responsabilidad del cliente (recomendado: diario).
- Si cambia la base o el servidor, basta editar `.env` y reiniciar.
- Si el cliente pierde su clave de licencia, BP Dominicana la vuelve a
  entregar desde el panel; no hace falta reinstalar.
