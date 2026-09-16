-- =====================================================================
-- Diario general: estructura recomendada (cabecera + detalle + catálogo
-- + períodos). Se crea junto a las tablas existentes; `diario`,
-- `gl_catalog`, `gl_entry` y sus auxiliares NO se modifican ni se borran.
--
-- 1. gl_accounts        catálogo de cuentas (copia normalizada de gl_catalog)
-- 2. gl_periods         períodos contables (año/mes, abierto o cerrado)
-- 3. gl_journal         cabecera del asiento
-- 4. gl_journal_detail  líneas del asiento (débito/crédito por cuenta)
--
-- Multimoneda: la cabecera guarda moneda + tasa; cada línea guarda el
-- importe en la moneda del asiento y su equivalente en pesos (amount_dop).
-- =====================================================================

CREATE TABLE IF NOT EXISTS gl_accounts (
  account        VARCHAR(15)  NOT NULL,
  name           VARCHAR(150) NOT NULL,
  parent_account VARCHAR(15)  NULL,
  level          TINYINT      NOT NULL DEFAULT 1,
  kind           VARCHAR(30)  NOT NULL DEFAULT 'NO DEFINIDO',
  kind_id        VARCHAR(5)   NULL,
  nature         CHAR(1)      NOT NULL DEFAULT 'D',
  is_detail      TINYINT(1)   NOT NULL DEFAULT 1,
  currency       VARCHAR(5)   NULL,
  status         CHAR(1)      NOT NULL DEFAULT 'A',
  PRIMARY KEY (account),
  KEY ix_gl_accounts_parent (parent_account),
  KEY ix_gl_accounts_detail (is_detail, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS gl_periods (
  gl_period_id INT          NOT NULL AUTO_INCREMENT,
  year         SMALLINT     NOT NULL,
  month        TINYINT      NOT NULL,
  date_from    DATE         NOT NULL,
  date_to      DATE         NOT NULL,
  status       VARCHAR(10)  NOT NULL DEFAULT 'ABIERTO',
  PRIMARY KEY (gl_period_id),
  UNIQUE KEY ux_gl_periods (year, month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS gl_journal (
  journal_id     INT           NOT NULL AUTO_INCREMENT,
  entry_no       INT           NOT NULL,
  date           DATE          NOT NULL,
  year           SMALLINT      NOT NULL,
  month          TINYINT       NOT NULL,
  source_app     VARCHAR(20)   NOT NULL DEFAULT 'ED',
  document       VARCHAR(30)   NULL,
  reference_id   VARCHAR(30)   NULL,
  kind           CHAR(1)       NOT NULL DEFAULT 'N',
  description    VARCHAR(500)  NULL,
  currency       VARCHAR(5)    NOT NULL DEFAULT 'DOP',
  exchange_rate  DECIMAL(14,6) NOT NULL DEFAULT 1.000000,
  total_debit    DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  total_credit   DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  branch_id      INT           NULL,
  department_id  INT           NULL,
  posted         TINYINT(1)    NOT NULL DEFAULT 1,
  void           TINYINT(1)    NOT NULL DEFAULT 0,
  created_by     VARCHAR(50)   NULL,
  created_at     DATETIME      NULL,
  posted_at      DATETIME      NULL,
  legacy_entry_id INT          NULL,
  legacy_origen  VARCHAR(20)   NULL,
  PRIMARY KEY (journal_id),
  KEY ix_gl_journal_date (date),
  KEY ix_gl_journal_period (year, month),
  KEY ix_gl_journal_entry (year, entry_no),
  KEY ix_gl_journal_legacy (legacy_entry_id, legacy_origen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS gl_journal_detail (
  journal_detail_id INT           NOT NULL AUTO_INCREMENT,
  journal_id        INT           NOT NULL,
  line_no           SMALLINT      NOT NULL DEFAULT 1,
  account           VARCHAR(15)   NOT NULL,
  debit             DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  credit            DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  amount_dop        DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  description       VARCHAR(255)  NULL,
  reference         VARCHAR(50)   NULL,
  department_id     INT           NULL,
  project_id        INT           NULL,
  customer_id       VARCHAR(15)   NULL,
  supplier_id       VARCHAR(15)   NULL,
  document          VARCHAR(30)   NULL,
  date              DATE          NULL,
  PRIMARY KEY (journal_detail_id),
  KEY ix_gl_jd_journal (journal_id),
  KEY ix_gl_jd_account (account, date),
  KEY ix_gl_jd_department (department_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- ------------------------- Carga del catálogo -------------------------
INSERT INTO gl_accounts
  (account, name, parent_account, level, kind, kind_id, nature, is_detail, currency, status)
SELECT c.catalog_account,
       COALESCE(c.name, c.catalog_account),
       NULLIF(c.parent_account, ''),
       COALESCE(c.level, 1),
       COALESCE(k.name, 'NO DEFINIDO'),
       c.gl_kind_id,
       CASE WHEN c.nature = 'C' THEN 'C' ELSE 'D' END,
       CASE WHEN EXISTS (SELECT 1 FROM gl_catalog h WHERE h.parent_account = c.catalog_account)
            THEN 0 ELSE 1 END,
       NULLIF(c.currency_id, ''),
       'A'
FROM gl_catalog c
LEFT JOIN gl_kinds k ON k.gl_kind_id = c.gl_kind_id
ON DUPLICATE KEY UPDATE
  name = VALUES(name), parent_account = VALUES(parent_account), level = VALUES(level),
  kind = VALUES(kind), kind_id = VALUES(kind_id), nature = VALUES(nature),
  is_detail = VALUES(is_detail), currency = VALUES(currency);

-- ------------------------- Períodos contables -------------------------
INSERT IGNORE INTO gl_periods (year, month, date_from, date_to, status)
SELECT y.year, m.month,
       DATE(CONCAT(y.year, '-', LPAD(m.month, 2, '0'), '-01')),
       LAST_DAY(DATE(CONCAT(y.year, '-', LPAD(m.month, 2, '0'), '-01'))),
       CASE WHEN y.year < YEAR(CURDATE()) THEN 'CERRADO' ELSE 'ABIERTO' END
FROM (SELECT 2021 AS year UNION SELECT 2022 UNION SELECT 2023 UNION SELECT 2024
      UNION SELECT 2025 UNION SELECT 2026 UNION SELECT 2027) y
CROSS JOIN (SELECT 1 AS month UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
            UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10
            UNION SELECT 11 UNION SELECT 12) m;

-- ---------------- Migración del histórico desde `diario` ----------------
-- Un asiento por (entry_id, fecha, origen); el detalle conserva cada línea.
INSERT INTO gl_journal
  (entry_no, date, year, month, source_app, document, kind, description, currency,
   exchange_rate, total_debit, total_credit, department_id, posted, void, created_at,
   legacy_entry_id, legacy_origen)
SELECT MIN(d.nmid), d.fecha, YEAR(d.fecha), MONTH(d.fecha),
       COALESCE(NULLIF(d.origen, ''), 'ED'), MIN(d.documento), 'N',
       MIN(COALESCE(d.concepto, d.descripcion)), 'DOP', 1.000000,
       ROUND(SUM(COALESCE(d.debit, 0)), 2), ROUND(SUM(COALESCE(d.credit, 0)), 2),
       MIN(d.department_id), 1, 0, NOW(),
       COALESCE(d.entry_id, 0), COALESCE(NULLIF(d.origen, ''), 'ED')
FROM diario d
WHERE NOT EXISTS (
        SELECT 1 FROM gl_journal j
        WHERE j.legacy_entry_id = COALESCE(d.entry_id, 0)
          AND j.legacy_origen = COALESCE(NULLIF(d.origen, ''), 'ED')
          AND j.date = d.fecha)
GROUP BY COALESCE(d.entry_id, 0), d.fecha, COALESCE(NULLIF(d.origen, ''), 'ED');

INSERT INTO gl_journal_detail
  (journal_id, line_no, account, debit, credit, amount_dop, description, reference,
   department_id, document, date)
SELECT j.journal_id, 1, d.catalog_account,
       ROUND(COALESCE(d.debit, 0), 2), ROUND(COALESCE(d.credit, 0), 2),
       ROUND(COALESCE(d.debit, 0) - COALESCE(d.credit, 0), 2),
       LEFT(COALESCE(d.descripcion, ''), 255), LEFT(COALESCE(d.operacion, ''), 50),
       d.department_id, d.documento, d.fecha
FROM diario d
JOIN gl_journal j
  ON j.legacy_entry_id = COALESCE(d.entry_id, 0)
 AND j.legacy_origen = COALESCE(NULLIF(d.origen, ''), 'ED')
 AND j.date = d.fecha
WHERE NOT EXISTS (SELECT 1 FROM gl_journal_detail x WHERE x.journal_id = j.journal_id);
