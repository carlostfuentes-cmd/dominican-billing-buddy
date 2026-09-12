-- ERP Contable RD — esquema del módulo de Facturación
-- Ejecutar una sola vez en tu servidor MySQL/MariaDB.
-- Compatible con MySQL 8 y MariaDB 10.5+.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS empresa (
  id            TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  nombre        VARCHAR(160) NOT NULL,
  rnc           VARCHAR(15)  NOT NULL,
  direccion     VARCHAR(240) NOT NULL DEFAULT '',
  telefono      VARCHAR(30)  NOT NULL DEFAULT '',
  email         VARCHAR(160) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS clientes (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(160) NOT NULL,
  rnc           VARCHAR(15)  NOT NULL,
  tipo_ncf      ENUM('B01','B02','B14','B15') NOT NULL DEFAULT 'B02',
  telefono      VARCHAR(30)  NOT NULL DEFAULT '',
  email         VARCHAR(160) NOT NULL DEFAULT '',
  direccion     VARCHAR(240) NOT NULL DEFAULT '',
  dias_credito  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  activo        TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_clientes_rnc (rnc),
  KEY idx_clientes_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS items (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  codigo        VARCHAR(30)  NOT NULL,
  descripcion   VARCHAR(200) NOT NULL,
  unidad        VARCHAR(10)  NOT NULL DEFAULT 'UND',
  precio        DECIMAL(14,2) NOT NULL DEFAULT 0,
  tasa_itbis    DECIMAL(5,2) NOT NULL DEFAULT 18.00,
  activo        TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_items_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ncf_secuencias (
  tipo_ncf      ENUM('B01','B02','B14','B15') NOT NULL PRIMARY KEY,
  desde         INT UNSIGNED NOT NULL DEFAULT 1,
  hasta         INT UNSIGNED NOT NULL DEFAULT 1000,
  proximo       INT UNSIGNED NOT NULL DEFAULT 1,
  vence         DATE         NOT NULL,
  activa        TINYINT(1)   NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS facturas (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ncf           CHAR(11)     NOT NULL,
  tipo_ncf      ENUM('B01','B02','B14','B15') NOT NULL,
  cliente_id    INT UNSIGNED NOT NULL,
  fecha         DATE         NOT NULL,
  vencimiento   DATE         NOT NULL,
  subtotal      DECIMAL(14,2) NOT NULL DEFAULT 0,
  descuento     DECIMAL(14,2) NOT NULL DEFAULT 0,
  itbis         DECIMAL(14,2) NOT NULL DEFAULT 0,
  total         DECIMAL(14,2) NOT NULL DEFAULT 0,
  estado        ENUM('emitida','pagada','anulada') NOT NULL DEFAULT 'emitida',
  notas         VARCHAR(300) NOT NULL DEFAULT '',
  creado_en     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_facturas_ncf (ncf),
  KEY idx_facturas_fecha (fecha),
  KEY idx_facturas_cliente (cliente_id),
  CONSTRAINT fk_facturas_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS factura_lineas (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  factura_id    INT UNSIGNED NOT NULL,
  item_id       INT UNSIGNED NULL,
  codigo        VARCHAR(30)  NOT NULL DEFAULT '',
  descripcion   VARCHAR(200) NOT NULL,
  cantidad      DECIMAL(14,3) NOT NULL DEFAULT 1,
  precio        DECIMAL(14,2) NOT NULL DEFAULT 0,
  descuento_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  tasa_itbis    DECIMAL(5,2) NOT NULL DEFAULT 18.00,
  subtotal      DECIMAL(14,2) NOT NULL DEFAULT 0,
  itbis         DECIMAL(14,2) NOT NULL DEFAULT 0,
  total         DECIMAL(14,2) NOT NULL DEFAULT 0,
  KEY idx_lineas_factura (factura_id),
  CONSTRAINT fk_lineas_factura FOREIGN KEY (factura_id) REFERENCES facturas(id) ON DELETE CASCADE,
  CONSTRAINT fk_lineas_item FOREIGN KEY (item_id) REFERENCES items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Datos iniciales mínimos ---------------------------------------------------

INSERT INTO empresa (id, nombre, rnc, direccion, telefono, email)
VALUES (1, 'Mi Empresa SRL', '000000000', '', '', '')
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO ncf_secuencias (tipo_ncf, desde, hasta, proximo, vence, activa) VALUES
  ('B01', 1, 1000, 1, '2026-12-31', 1),
  ('B02', 1, 1000, 1, '2026-12-31', 1),
  ('B14', 1,  200, 1, '2026-12-31', 1),
  ('B15', 1,  200, 1, '2026-12-31', 1)
ON DUPLICATE KEY UPDATE tipo_ncf = tipo_ncf;
