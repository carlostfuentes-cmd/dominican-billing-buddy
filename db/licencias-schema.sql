-- Tablas de control del licenciamiento de la Suite Empresarial BP Dominicana.
-- Viven en la base de control del proveedor (no en la base del cliente).
-- La aplicación las crea automáticamente la primera vez que se usa la pantalla
-- de licencias; este archivo sirve como referencia y para crearlas a mano.

CREATE TABLE IF NOT EXISTS licencias (
  licencia_id  INT AUTO_INCREMENT PRIMARY KEY,
  license_key  VARCHAR(64)  NOT NULL,
  client_name  VARCHAR(120) NOT NULL,
  rnc          VARCHAR(20)  NOT NULL DEFAULT '',
  contact      VARCHAR(160) NOT NULL DEFAULT '',
  deployment   VARCHAR(10)  NOT NULL DEFAULT 'cloud',  -- cloud | local
  plan         VARCHAR(40)  NOT NULL DEFAULT 'BASICO',
  max_users    INT          NOT NULL DEFAULT 1,
  expires_on   DATE         NOT NULL,
  status       CHAR(1)      NOT NULL DEFAULT 'A',      -- A activa, S suspendida, V vencida, C cancelada
  notes        VARCHAR(255) NOT NULL DEFAULT '',
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_licencias_key (license_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS licencia_eventos (
  evento_id   INT AUTO_INCREMENT PRIMARY KEY,
  licencia_id INT          NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_name   VARCHAR(60)  NOT NULL DEFAULT '',
  action      VARCHAR(60)  NOT NULL DEFAULT '',
  detail      VARCHAR(255) NOT NULL DEFAULT '',
  KEY ix_licencia_eventos (licencia_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS licencia_instalaciones (
  license_key  VARCHAR(64)  NOT NULL,
  last_seen    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  app_version  VARCHAR(40)  NOT NULL DEFAULT '',
  users_in_use INT          NOT NULL DEFAULT 0,
  host         VARCHAR(160) NOT NULL DEFAULT '',
  PRIMARY KEY (license_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Variables de entorno usadas por cada instalación:
--   LICENSE_KEY          clave única entregada al cliente
--   LICENSE_SERVER_URL   https://.../api/public/licencia  (validación remota)
--   LICENSE_PUBLIC_KEY   clave pública Ed25519 (base64 SPKI) para verificar la firma
-- Solo en el servidor del proveedor:
--   LICENSE_PRIVATE_KEY  clave privada Ed25519 (base64 PKCS8) para firmar
