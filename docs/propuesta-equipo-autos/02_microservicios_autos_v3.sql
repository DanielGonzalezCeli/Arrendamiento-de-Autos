-- =============================================================================
-- PROPUESTA (para consensuar en la reunión del equipo de Autos) — NO es definitivo
-- Modelo de datos unificado para las tiendas de Renta de Autos — RDA2 / contrato v3
--
-- Patrón Database-per-Service: cada microservicio es dueño de sus tablas.
--   * Entre servicios NO hay claves foráneas: se referencian por ID lógico (texto o uuid).
--   * Cada bloque puede ir en su propia base (db_identity, db_catalog, …) o, si el hosting
--     solo da una base (p. ej. Supabase gratuito), en un ESQUEMA propio por servicio con
--     un usuario de BD distinto por servicio. El aislamiento lógico es el mismo.
--   * Nombres en inglés, alineados con los campos canónicos del contrato v3.
--
-- Requiere PostgreSQL 14+ (extensiones pgcrypto y btree_gist).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ms_identity (db_identity): usuarios, roles y claves de API para Booking
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS identity;

CREATE TYPE identity.user_role AS ENUM ('CLIENTE', 'OPERADOR', 'ADMIN', 'MANTENIMIENTO');

CREATE TABLE identity.users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           varchar(254) NOT NULL,
  email_canonical varchar(254) NOT NULL UNIQUE,      -- Gmail sin puntos ni +etiqueta: evita cuentas duplicadas
  password_hash   varchar(100) NOT NULL,             -- bcrypt
  full_name       varchar(120) NOT NULL,
  phone           varchar(20),                       -- E.164 (+593…)
  role            identity.user_role NOT NULL DEFAULT 'CLIENTE',
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Clave precompartida para la comunicación máquina a máquina (X-API-Key del contrato).
CREATE TABLE identity.api_clients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        varchar(100) NOT NULL,                 -- ej. "Booking Prototipo"
  key_hash    varchar(100) NOT NULL,                 -- nunca la clave en claro
  roles       identity.user_role[] NOT NULL DEFAULT '{}',
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ms_catalog (db_catalog): lugares, modelos y autos (datos descriptivos)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS catalog;

CREATE TYPE catalog.vehicle_category AS ENUM ('ECONOMICO', 'COMPACTO', 'SUV', 'PREMIUM', 'VAN');
CREATE TYPE catalog.transmission     AS ENUM ('MANUAL', 'AUTOMATICO');
CREATE TYPE catalog.location_type    AS ENUM ('AIRPORT', 'CITY_OFFICE');

CREATE TABLE catalog.locations (
  id            varchar(40) PRIMARY KEY,             -- ID lógico, ej. 'uio-aeropuerto'
  name          varchar(120) NOT NULL,               -- 'Aeropuerto Mariscal Sucre (UIO), Quito'
  city          varchar(80) NOT NULL,
  iata_code     char(3),                             -- 'UIO', 'GYE', 'CUE'
  type          catalog.location_type NOT NULL,
  address       varchar(200),
  opening_hours jsonb NOT NULL DEFAULT '[]',          -- [{"weekday":1,"opens":"08:00","closes":"18:00"}]
  active        boolean NOT NULL DEFAULT true
);

CREATE TABLE catalog.vehicle_models (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand              varchar(50) NOT NULL,           -- 'Chevrolet'
  model              varchar(60) NOT NULL,           -- 'Spark GT'
  category           catalog.vehicle_category NOT NULL,
  transmission       catalog.transmission NOT NULL,
  seats              smallint NOT NULL CHECK (seats BETWEEN 1 AND 15),
  doors              smallint NOT NULL CHECK (doors BETWEEN 2 AND 6),
  large_bags         smallint NOT NULL DEFAULT 1 CHECK (large_bags >= 0),
  small_bags         smallint NOT NULL DEFAULT 1 CHECK (small_bags >= 0),
  air_conditioning   boolean NOT NULL DEFAULT true,
  unlimited_mileage  boolean NOT NULL DEFAULT true,
  fuel_policy        varchar(30) NOT NULL DEFAULT 'LLENO_A_LLENO',
  photo_url          text,
  images             text[] NOT NULL DEFAULT '{}',
  published          boolean NOT NULL DEFAULT true,
  UNIQUE (brand, model)
);

-- Un auto concreto = el vehicle_id del contrato (ej. 'auto-spark-01').
CREATE TABLE catalog.vehicles (
  id           varchar(40) PRIMARY KEY CHECK (id ~ '^[a-z0-9-]+$'),
  model_id     uuid NOT NULL REFERENCES catalog.vehicle_models(id),  -- FK dentro del mismo servicio
  plate        varchar(10) NOT NULL UNIQUE,          -- 'PBA-1234'
  color        varchar(30),
  year         smallint NOT NULL,
  location_id  varchar(40) NOT NULL REFERENCES catalog.locations(id),
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ms_inventory (db_inventory): máquina de estados, disponibilidad y envío gRPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS inventory;

CREATE TYPE inventory.vehicle_state AS ENUM
  ('DISPONIBLE', 'RESERVADO', 'LISTO_PARA_ENTREGAR', 'ENTREGADO', 'EN_LIMPIEZA', 'EN_MANTENIMIENTO');
CREATE TYPE inventory.block_kind AS ENUM ('RESERVATION', 'CLEANING', 'MAINTENANCE');

-- Estado actual de cada auto (una fila por vehicle_id del catálogo, por ID lógico).
CREATE TABLE inventory.vehicle_status (
  vehicle_id           varchar(40) PRIMARY KEY,      -- ID lógico (catalog.vehicles.id), sin FK
  state                inventory.vehicle_state NOT NULL DEFAULT 'DISPONIBLE',
  state_since          timestamptz NOT NULL DEFAULT now(),
  cooldown_until       timestamptz,                  -- fin de las 2 h de EN_LIMPIEZA
  current_mileage      integer NOT NULL DEFAULT 0 CHECK (current_mileage >= 0),
  next_maintenance_km  integer NOT NULL DEFAULT 10000,
  maintenance_alert    boolean GENERATED ALWAYS AS (current_mileage >= next_maintenance_km) STORED,
  CHECK (state <> 'EN_LIMPIEZA' OR cooldown_until IS NOT NULL)
);

-- Ocupación por periodo: impide en la BD que un auto tenga dos ocupaciones que se crucen.
CREATE TABLE inventory.availability_blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id  varchar(40) NOT NULL,                  -- ID lógico
  order_id    varchar(40),                           -- ID lógico (ms_orders), si es una reserva
  kind        inventory.block_kind NOT NULL,
  period      tstzrange NOT NULL,
  released    boolean NOT NULL DEFAULT false,        -- true al cancelar (compensación Saga)
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT availability_no_overlap EXCLUDE USING gist (vehicle_id WITH =, period WITH &&) WHERE (NOT released)
);

-- Outbox del envío gRPC a Booking (PushStockUpdate): reintentos y evidencia de cada acuse.
CREATE TABLE inventory.stock_sync_outbox (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id       varchar(40) NOT NULL,
  date             date NOT NULL,                    -- 'YYYY-MM-DD'
  time_slot        char(5) NOT NULL CHECK (time_slot ~ '^([01][0-9]|2[0-3]):(00|30)$'),
  slot_id          varchar(80) NOT NULL,             -- 'slot-auto-spark-01-20261115-1000'
  available_units  smallint NOT NULL CHECK (available_units IN (0, 1)),
  correlation_id   varchar(80),
  attempts         smallint NOT NULL DEFAULT 0,
  sent_at          timestamptz,
  ack_success      boolean,
  ack_error_code   varchar(40),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_sync_pending ON inventory.stock_sync_outbox (created_at) WHERE sent_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ms_pricing (db_pricing): tarifas, coberturas, recargos y convenio B2B (§9)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS pricing;

CREATE TYPE pricing.coverage_type AS ENUM ('BASIC', 'TOTAL');

CREATE TABLE pricing.rates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category    varchar(20) NOT NULL,                  -- ECONOMICO … VAN (valor del catálogo)
  daily_rate  numeric(10,2) NOT NULL CHECK (daily_rate > 0),
  currency    char(3) NOT NULL DEFAULT 'USD',
  valid_from  date NOT NULL,
  valid_to    date NOT NULL,
  CHECK (valid_from <= valid_to),
  CONSTRAINT rates_no_overlap EXCLUDE USING gist (category WITH =, daterange(valid_from, valid_to, '[]') WITH &&)
);

CREATE TABLE pricing.coverages (
  type             pricing.coverage_type PRIMARY KEY,
  name             varchar(80) NOT NULL,
  daily_cost       numeric(10,2) NOT NULL DEFAULT 0,  -- BASIC 0 (incluida), TOTAL p. ej. 18.00
  deductible       numeric(10,2) NOT NULL,            -- franquicia: BASIC 1200, TOTAL 0
  deposit          numeric(10,2) NOT NULL,            -- depósito en tarjeta: TOTAL 0
  benefits         text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE pricing.surcharges (
  code          varchar(20) PRIMARY KEY,              -- 'YOUNG_DRIVER' (<25), 'SENIOR_DRIVER' (>70)
  daily_amount  numeric(10,2) NOT NULL CHECK (daily_amount >= 0)
);

-- Convenio B2B con Booking (una sola fila por tienda).
CREATE TABLE pricing.promotion_agreement (
  id                     smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  node_id                varchar(60) NOT NULL,        -- proveedor_codigo, ej. 'autos-concesionaria-01'
  partner_name           varchar(120) NOT NULL,
  allows_promotions      boolean NOT NULL DEFAULT false,
  max_discount_pct       numeric(5,2) NOT NULL DEFAULT 0 CHECK (max_discount_pct BETWEEN 0 AND 100),
  enabled_destinations   text[] NOT NULL DEFAULT '{}',
  valid_until            date,
  combo_conditions       text,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ms_orders (db_orders): reservas, idempotencia y eventos (outbox CloudEvents)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS orders;

CREATE TYPE orders.order_status AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED');
CREATE TYPE orders.order_channel AS ENUM ('WEB', 'BOOKING');

CREATE TABLE orders.orders (
  id                 varchar(40) PRIMARY KEY DEFAULT ('order-aut-' || substr(md5(random()::text), 1, 10)),
  pnr                char(8) NOT NULL UNIQUE,         -- 'CAR7849B'
  vehicle_id         varchar(40) NOT NULL,            -- ID lógico (catálogo/inventario)
  status             orders.order_status NOT NULL DEFAULT 'CONFIRMED',
  channel            orders.order_channel NOT NULL,
  pickup_date        date NOT NULL,
  pickup_time        char(5) NOT NULL DEFAULT '10:00',
  dropoff_date       date NOT NULL,
  dropoff_time       char(5) NOT NULL DEFAULT '10:00',
  pickup_location    varchar(120),
  dropoff_location   varchar(120),
  coverage_type      varchar(10) NOT NULL DEFAULT 'BASIC',
  driver_full_name   varchar(120) NOT NULL,
  driver_email       varchar(254) NOT NULL,
  driver_phone       varchar(20) NOT NULL,
  driver_license     varchar(30) NOT NULL,
  driver_country     varchar(60) NOT NULL DEFAULT 'Ecuador',
  driver_age         smallint NOT NULL CHECK (driver_age >= 18),
  flight_number      varchar(10),
  price_breakdown    jsonb NOT NULL,                  -- tarifa, días, cobertura, recargos, total
  total_price        numeric(10,2) NOT NULL CHECK (total_price >= 0),
  currency           char(3) NOT NULL DEFAULT 'USD',
  deposit            numeric(10,2) NOT NULL DEFAULT 0,
  voucher_qr_data    varchar(200) NOT NULL,
  refund_id          varchar(40),                     -- 'REF-AUTO-…' al cancelar
  refund_amount      numeric(10,2),
  customer_user_id   uuid,                            -- ID lógico (ms_identity) si es venta web
  correlation_id     varchar(80),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (pickup_date <= dropoff_date)
);

CREATE TABLE orders.idempotency_keys (
  key            uuid NOT NULL,
  operation      varchar(60) NOT NULL,                -- 'orders.create', 'orders.cancel', …
  request_hash   char(64) NOT NULL,                   -- mismo key + otro cuerpo → 400 IDEMPOTENCY_CONFLICT
  status         varchar(12) NOT NULL DEFAULT 'IN_PROGRESS',
  response_code  smallint,
  response_body  jsonb,
  expires_at     timestamptz NOT NULL,
  PRIMARY KEY (key, operation)
);

-- Eventos CloudEvents 1.0 (feed GET /autos/eventos y publicación al broker).
CREATE TABLE orders.outbox_events (
  id               varchar(40) PRIMARY KEY,           -- 'evt-car-ord-7762'
  type             varchar(80) NOT NULL,              -- 'ec.edu.epn.booking.autos.order.confirmed'
  source           varchar(80) NOT NULL DEFAULT '/microservices/ms-autos',
  time             timestamptz NOT NULL DEFAULT now(),
  correlation_id   varchar(80),
  data             jsonb NOT NULL,
  published_at     timestamptz
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ms_counter (db_counter): mostrador — check-in digital, entrega y devolución
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS counter;

CREATE TYPE counter.checkin_type AS ENUM ('DIGITAL', 'ENTREGA', 'DEVOLUCION');

CREATE TABLE counter.checkins (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         varchar(40) NOT NULL,              -- ID lógico (ms_orders)
  vehicle_id       varchar(40) NOT NULL,              -- ID lógico
  type             counter.checkin_type NOT NULL,
  license_number   varchar(30),
  identity_doc     varchar(30),
  license_expires  date,
  mileage          integer CHECK (mileage >= 0),      -- km_salida (ENTREGA) o km_retorno (DEVOLUCION)
  fuel_level       smallint CHECK (fuel_level BETWEEN 0 AND 100),
  agent            varchar(120),
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, type)                             -- cada check-in una sola vez por orden
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. ms_maintenance (db_maintenance): bitácora técnica y alertas por kilometraje
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS maintenance;

CREATE TABLE maintenance.maintenance_logs (
  id                       varchar(40) PRIMARY KEY DEFAULT ('BIT-AUTO-' || substr(md5(random()::text), 1, 8)),
  vehicle_id               varchar(40) NOT NULL,      -- ID lógico
  technician_id            varchar(60) NOT NULL,
  recorded_mileage         integer NOT NULL CHECK (recorded_mileage >= 0),
  fuel_level               smallint NOT NULL CHECK (fuel_level BETWEEN 0 AND 100),
  body_condition           text,
  tire_condition           varchar(20),
  notes                    text,
  maintenance_performed    boolean NOT NULL DEFAULT false,
  next_maintenance_km      integer,
  alert_triggered          boolean NOT NULL DEFAULT false,
  correlation_id           varchar(80),
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX maintenance_logs_vehicle ON maintenance.maintenance_logs (vehicle_id, created_at DESC);
