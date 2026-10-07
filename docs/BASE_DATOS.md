# Modelo de datos (conceptual / lógico)

PostgreSQL 16. Nombres de tablas y columnas en `snake_case` y en inglés, consistentes con el contrato. Dinero en `numeric(12,2)` (el cálculo se hace en centavos enteros en el servicio). Fechas en `timestamptz` (UTC). Extensiones: `pgcrypto` (`gen_random_uuid`) y `btree_gist` (constraint de exclusión).

**PKs:** `uuid` por defecto (lo sugiere la plantilla), **salvo** `suppliers`, `depots` y `cities`, que usan `integer` identity **porque el contrato expone `supplier_id`, `depot_id` y `city_id` como integer**.

## 1. Diagrama ER (resumen)

```
cities 1─* depots *─1 suppliers
depots 1─* depot_opening_hours
suppliers 1─* vehicle_models *─1 vehicle_categories      (vehicle_models.id = vehicle_id del contrato)
vehicle_models 1─* fleet_units *─1 depots                 (unidades físicas con placa)
fleet_units 1─* vehicle_blocks
vehicle_categories 1─* rates *─1 suppliers
users 1─* reservations
vehicle_models 1─* reservations *─1 depots (pickup) / depots (dropoff)
fleet_units 0..1─* reservations   (placa asignada en la entrega)
reservations 1─* reservation_extras *─1 extras
reservations 1─* reservation_history
reservations 1─0..1 depot_reviews *─1 depots
search_sessions 1─* holds, 1─* order_previews
holds 0..1─* order_previews 1─0..1 reservations
affiliates · api_clients · idempotency_records · webhook_subscriptions 1─* webhook_deliveries *─1 outbox_events
currency_rates
```

## 2. Enums

| Enum | Valores |
|---|---|
| `user_role` | `CUSTOMER`, `ADMIN` |
| `transmission` | `MANUAL`, `AUTOMATIC` |
| `fuel_type` | `GASOLINE`, `DIESEL`, `HYBRID`, `ELECTRIC` |
| `fuel_policy` | `FULL_TO_FULL`, `SAME_TO_SAME`, `PREPAID` |
| `unit_status` | `AVAILABLE`, `MAINTENANCE`, `OUT_OF_SERVICE` |
| `order_status` | `PENDING`, `CONFIRMED`, `CANCELLED` (**idéntico al contrato**) |
| `rental_status` | `NOT_STARTED`, `PICKED_UP`, `RETURNED` |
| `hold_status` | `HELD`, `CONSUMED`, `EXPIRED`, `RELEASED` (se mapea a `HELD`/`FAILED` del contrato) |
| `order_channel` | `WEB`, `BOOKING_HUB` |
| `extra_type` | `EQUIPMENT`, `COVERAGE`, `SERVICE` |
| `idempotency_status` | `IN_PROGRESS`, `COMPLETED` |
| `delivery_status` | `PENDING`, `SUCCEEDED`, `FAILED`, `DEAD` |

## 3. Tablas

### Catálogo
| Tabla | Columnas clave | Restricciones / índices |
|---|---|---|
| `cities` | `id int PK`, `name`, `country_code char(2)` (minúsculas) | unique(`name`, `country_code`) |
| `suppliers` | `id int PK`, `code varchar(10) UNIQUE`, `name`, `logo_url`, `active`, `created_at`, `updated_at` | — |
| `depots` | `id int PK`, `supplier_id FK`, `city_id FK`, `name`, `address`, `airport_code char(3) NULL`, `latitude numeric(9,6)`, `longitude numeric(9,6)`, `timezone`, `phone`, `services text[]`, `active`, `updated_at` | idx(`airport_code`), idx(`city_id`), idx(`updated_at`) → `last_modified` |
| `depot_opening_hours` | `depot_id FK`, `weekday smallint 0–6`, `opens time`, `closes time` | PK(`depot_id`, `weekday`); CHECK `opens < closes` |
| `vehicle_categories` | `id uuid`, `code UNIQUE` (`ECONOMY`, `COMPACT`, `SUV`...), `name`, `description`, `min_driver_age smallint` (CHECK 18–99) | — |
| `vehicle_models` | `id uuid PK` (= **`vehicle_id`** del contrato: modelo comercial "o similar"), `supplier_id FK`, `category_id FK`, `make`, `model`, `acriss_code`, `transmission`, `fuel_type`, `fuel_policy`, `seats`, `doors`, `bag_capacity`, `air_conditioning`, `image_url`, `description`, `published bool`, `active bool`, `created_at`, `updated_at` | CHECK `seats>0`, `doors>0`, `bag_capacity>=0`; idx(`updated_at`) → `last_modified` de `/details` |
| `fleet_units` | `id uuid PK`, `vehicle_model_id FK`, `depot_id FK` (agencia actual), `plate UNIQUE`, `year`, `color`, `mileage`, `status unit_status`, `active`, timestamps | idx(`vehicle_model_id`, `depot_id`) WHERE `active AND status='AVAILABLE'` |
| `vehicle_blocks` | `id`, `fleet_unit_id FK`, `period tstzrange`, `reason`, `created_by FK users` | GIST(`fleet_unit_id`, `period`) |
| `rates` | `id`, `supplier_id FK`, `category_id FK`, `daily_rate numeric(12,2)`, `currency char(3) DEFAULT 'USD'`, `valid_from date`, `valid_to date` | CHECK `daily_rate>0`; EXCLUDE sin solapamiento de vigencia por (`supplier`, `category`) |
| `extras` | `id`, `code UNIQUE` (`GPS`, `CHILD_SEAT`, `ADDITIONAL_DRIVER`, `CDW`...), `name`, `type`, `price_per_day`, `max_price NULL`, `active` | — |
| `currency_rates` | `currency char(3) PK`, `rate_from_usd numeric(12,6)`, `updated_at` | USD = 1 |
| ~~`system_settings`~~ | — | **No se creó** (decisión Fase 2): los parámetros de negocio viven como constantes con nombre en `src/domain/business-rules.ts`; son fijos para el MVP y así quedan versionados y probados |
| `media_images` | `id uuid PK`, `content_type` (solo `image/jpeg`, `image/png`, `image/webp`), `data bytea`, `size_bytes` (≤ 2 MB), `original_name`, `uploaded_by FK users`, `created_at` | Fotos subidas desde el panel; se guardan en la BD porque el disco de Render se borra en cada despliegue. Se sirven en `GET /api/images/{id}` |

### Usuarios e integración
| Tabla | Columnas clave | Restricciones |
|---|---|---|
| `users` | `id uuid`, `email UNIQUE (citext)`, `password_hash`, `first_name`, `last_name`, `phone`, `role`, `active`, timestamps | — Correo canónico `email_canonical` UNIQUE (en Gmail sin puntos ni `+etiqueta`). |
| `affiliates` | `id int PK` (= `X-Affiliate-Id`), `name`, `commission_rate numeric(5,4)`, `rate_limit_per_min int`, `active` | El modo `strict` valida contra esta tabla; `lenient` (RDA1) acepta cualquier entero |
| `api_clients` | `client_id varchar PK`, `client_secret_hash`, `name`, `scopes text[]`, `affiliate_id int NULL`, `active` | Emisor OAuth2 local (RDA1) |

### Flujo de reserva
| Tabla | Columnas clave | Restricciones |
|---|---|---|
| `search_sessions` | `id uuid` (= `search_token`), `affiliate_id int NULL`, `owner_sub NULL`, `channel`, `pickup_at`, `dropoff_at`, `pickup_depot_ids int[]`, `dropoff_depot_ids int[]`, `driver_age`, `booker_country`, `currency`, `request jsonb`, `results jsonb` (vehicle_id → precio cotizado), `expires_at` | idx(`expires_at`) |
| `holds` | `id uuid` (= `hold_id`), `search_session_id FK`, `vehicle_model_id FK`, `pickup_depot_id FK`, `owner_sub`, `period tstzrange`, `quoted_total`, `currency`, `status`, `expires_at`, `created_at` | idx(`vehicle_model_id`, `pickup_depot_id`) WHERE `status='HELD'` |
| `order_previews` | `id uuid` (= `order_preview_id`), `search_session_id FK`, `hold_id FK NULL`, `vehicle_model_id FK`, `pickup_depot_id`, `dropoff_depot_id`, `owner_sub`, `extras jsonb`, `breakdown jsonb`, `total_price`, `currency`, `expires_at`, `consumed_at NULL` | — |
| `reservations` | `id uuid` (= `order_id`), `locator varchar(20) UNIQUE`, `status order_status`, `rental_status`, `channel`, `owner_sub`, `user_id FK NULL`, `affiliate_id NULL`, `vehicle_model_id FK`, **`fleet_unit_id FK NULL`** (se asigna en la entrega), `pickup_depot_id FK`, `dropoff_depot_id FK`, `rental_period tstzrange`, `pickup_at`, `dropoff_at`, `driver_first_name`, `driver_last_name`, `driver_email`, `driver_phone`, `driver_age`, `booker_country`, **`vehicle_snapshot jsonb`**, **`route_snapshot jsonb`**, **`price_breakdown jsonb`**, `total_price numeric(12,2)`, `currency char(3)`, `payment_reference`, `order_preview_id FK UNIQUE`, `hold_id FK NULL`, `cancelled_at`, `cancellation_fee`, `version int` (lock optimista), timestamps | **`EXCLUDE USING gist (fleet_unit_id WITH =, rental_period WITH &&) WHERE (fleet_unit_id IS NOT NULL AND status IN ('PENDING','CONFIRMED') AND rental_status <> 'RETURNED')`** (una placa nunca está en dos alquileres activos; un alquiler devuelto ya no ocupa la placa); idx(`vehicle_model_id`, `pickup_depot_id`, `status`); CHECK `pickup_at < dropoff_at`; CHECK `total_price >= 0`; idx(`owner_sub`, `created_at`); idx(`status`, `pickup_at`) |
| `reservation_extras` | `reservation_id FK`, `extra_id FK`, `code`, `name`, `unit_price`, `days`, `subtotal` (snapshot) | PK(`reservation_id`, `extra_id`) |
| `reservation_history` | `id`, `reservation_id FK`, `action` (CREATED, MODIFIED, CANCELLED, PICKED_UP, RETURNED), `actor_sub`, `before jsonb`, `after jsonb`, `at` | Auditoría |
| `depot_reviews` | `id`, `depot_id FK`, `reservation_id FK UNIQUE`, `user_id FK`, `score smallint CHECK 1–10`, `comment`, `created_at` | — |

### Idempotencia y eventos
| Tabla | Columnas clave | Restricciones |
|---|---|---|
| `idempotency_records` | `owner_sub`, `key uuid`, `operation`, `request_hash char(64)`, `status`, `response_status`, `response_body jsonb`, `created_at`, `expires_at` | PK(`owner_sub`, `key`, `operation`); idx(`expires_at`) |
| `outbox_events` | `id uuid` (= `eventId`), `event_type`, `resource_id`, `payload jsonb`, `occurred_at`, `dispatched_at NULL` | idx parcial WHERE `dispatched_at IS NULL` |
| `webhook_subscriptions` | `id uuid` (enviado por el cliente), `owner_sub`, `url`, `events text[]`, `secret_encrypted`, `active`, `created_at` | — |
| `webhook_deliveries` | `id`, `event_id FK`, `subscription_id FK`, `attempt`, `status`, `response_code`, `last_error`, `next_attempt_at`, `delivered_at` | idx(`status`, `next_attempt_at`) |

## 4. Cardinalidades clave

- Un proveedor tiene N agencias y N modelos comerciales; un modelo pertenece a 1 categoría y tiene N unidades físicas repartidas en agencias.
- Una reserva es de **un modelo en una agencia**; la unidad física (placa) se asigna al entregar.
- **Disponibilidad por inventario:** unidades activas del modelo en la agencia − reservas activas que se solapan − holds vigentes − unidades bloqueadas en el periodo > 0. Se serializa con `SELECT … FOR UPDATE` sobre la fila de `vehicle_models` dentro de la transacción de hold, create y modify.
- Una unidad física nunca tiene dos alquileres activos solapados (constraint EXCLUDE).
- Una preview genera como máximo 1 reserva (`UNIQUE order_preview_id`), lo que añade una protección extra contra duplicados.
- Una reserva tiene como máximo 1 reseña.

## 5. Por qué los snapshots

`vehicle_snapshot` (modelo, categoría, specs; y la placa cuando se asigna), `route_snapshot`, `price_breakdown` y `reservation_extras` copian los datos en el momento de la venta. Si mañana el admin cambia la tarifa o el modelo del vehículo, `GET /orders/{id}` sigue mostrando lo que se vendió (RN20). Además, alimentan directamente `OrderDetail.vehicle_details` y `route_details`.
