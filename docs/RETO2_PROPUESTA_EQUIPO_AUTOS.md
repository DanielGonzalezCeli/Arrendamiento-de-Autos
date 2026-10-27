# Propuesta para la reunión del equipo de Autos (RDA2 · contrato v3)

> **Estado:** propuesta de RutaLibre para **consensuar** con los demás compañeros de la vertical de Autos. No es definitiva. Cumple el "Paso 0" de la guía oficial: **no se escribió código de integración** antes de acordar el modelo común.

Fuentes: `GUIA_INTEGRACION_AUTOS.md`, `autos-openapi-v3.yaml` (v3.0.0) y la directiva de la cátedra (*"Todos los microservicios deben ser iguales para todo el equipo…"*).

## 1. Qué hay que acordar en la reunión

1. **Lista de microservicios** y la responsabilidad de cada uno (§2).
2. **Modelo de datos único**: el script [`propuesta-equipo-autos/02_microservicios_autos_v3.sql`](propuesta-equipo-autos/02_microservicios_autos_v3.sql) (§3).
3. **Contratos internos** entre microservicios (§4) y cómo se conectan con Booking (§5).
4. **Stack común**: proponemos NestJS 10 + TypeORM + PostgreSQL (es la plantilla oficial del equipo de integración y la que ya usamos).
5. **Reparto del trabajo**: quién hace cada servicio y cómo se comparte el código (un repositorio común, por ejemplo).
6. **Respuestas pendientes del equipo de integración** que afectan a todos (§6).

## 2. Microservicios (los 7 que recomienda la guía)

| Microservicio | Base de datos | Responsabilidad | Endpoints del contrato v3 que atiende |
|---|---|---|---|
| **api-gateway** | — | Punto de entrada único para Booking y la web: enrutamiento, `X-API-Key`/JWT, `X-Correlation-Id`, límites de uso, errores RFC 7807 | Todos (los reenvía) |
| **ms_identity** | `db_identity` | Usuarios, roles (`CLIENTE`, `OPERADOR`, `ADMIN`, `MANTENIMIENTO`), tokens JWT y claves de API | (interno) |
| **ms_catalog** | `db_catalog` | Lugares, modelos y autos (datos descriptivos y fotos) | `GET /autos`, `GET /autos/{id}` (junto con inventario) |
| **ms_inventory** | `db_inventory` | Máquina de 6 estados, disponibilidad por periodo, cooldown de 2 h, **cliente gRPC** `PushStockUpdate` | `POST /autos/search`, `GET /autos/flota`, `POST /autos/{id}/devolucion` |
| **ms_orders** | `db_orders` | Reservas (`pnr`, conductor, cobertura, voucher), idempotencia, cancelación con reembolso 100 %, eventos CloudEvents | `POST /autos/reservas`, `POST /autos/orders/create`, `GET /autos/orders`, `GET /autos/orders/{id}`, `POST /autos/orders/{id}/cancel`, `GET /autos/eventos` |
| **ms_counter** | `db_counter` | Mostrador: check-in digital (QR), entrega (`km_salida`) y devolución (`km_retorno`) | `POST /autos/reservas/{id}/checkin`, `POST /autos/orders/{id}/checkin-entrega`, `POST /autos/orders/{id}/checkin-devolucion` |
| **ms_maintenance** | `db_maintenance` | Bitácora técnica, odómetro y alertas por umbral (rol `MANTENIMIENTO`/`ADMIN`) | `POST /autos/{id}/mantenimiento/registro` |
| **ms_pricing** | `db_pricing` | Tarifas por categoría, coberturas BASIC/TOTAL, recargos (< 25 y > 70 años) y convenio B2B | `GET /autos/{id}/coberturas`, `GET/PUT /autos/promociones/contrato` |

`GET /autos/health` lo responde el gateway consultando la salud de cada servicio (`HEALTHY` si todos responden, `DEGRADED` si alguno falla).

## 3. Modelo de datos (resumen del script)

- **Database-per-Service:** cada servicio es dueño de sus tablas. **Entre servicios no hay claves foráneas**: se referencian por ID lógico (por ejemplo, `orders.vehicle_id` guarda `'auto-spark-01'`).
- Si el hosting da una sola base de datos (Supabase gratuito), cada servicio usa **su propio esquema y su propio usuario de BD**, con el mismo aislamiento.
- **`vehicle_id` = un auto concreto** (`catalog.vehicles.id`, ej. `auto-spark-01`), como pide el contrato.
- **La base impide reservas dobles:** `inventory.availability_blocks` tiene una restricción de exclusión, así que un auto no puede tener dos ocupaciones (reserva, limpieza o mantenimiento) que se crucen. Probado: la segunda inserción es rechazada.
- **Idempotencia** en `orders.idempotency_keys`: misma clave y otro cuerpo → `400 IDEMPOTENCY_CONFLICT` (regla del v3).
- **Outbox** para no perder eventos: `orders.outbox_events` (CloudEvents) e `inventory.stock_sync_outbox` (envíos gRPC con reintentos y acuse).

## 4. Comunicación entre microservicios

| Desde → hacia | Mecanismo | Para qué |
|---|---|---|
| gateway → servicios | REST (HTTP interno) | Reenviar cada petición con `X-Correlation-Id` |
| ms_orders → ms_inventory | REST síncrono | Reservar el auto (bloque de disponibilidad) en el momento de crear la orden; si no hay → **409 `VEHICLE_UNAVAILABLE`** |
| ms_orders → ms_pricing | REST síncrono | Calcular el precio (tarifa + cobertura + recargos) |
| ms_counter → ms_inventory | REST síncrono | Pasar el auto a `ENTREGADO` o `EN_LIMPIEZA` (cooldown 2 h) |
| ms_counter / ms_maintenance → ms_inventory | REST síncrono | Actualizar odómetro y umbral de mantenimiento |
| ms_inventory → Booking | **gRPC** `PushStockUpdate` | Avisar cada cambio de estado (`available_units` 1/0) |
| ms_orders → Booking / broker | CloudEvents (feed `GET /autos/eventos`; RabbitMQ/Kafka si se confirma broker) | `order.confirmed`, `order.cancelled` |

## 5. Flujos clave con Booking

**Reserva desde Booking** (`POST /autos/reservas`):
1. El gateway valida cabeceras (`Idempotency-Key` UUID, `X-Correlation-Id`) y la credencial acordada.
2. ms_orders valida el cuerpo en inglés (acepta alias en español) → si `driver.age < 18` → **422 `DRIVER_UNDERAGE`**; fechas inválidas → **422 `INVALID_DATES`**.
3. ms_orders pide a ms_inventory el bloque del auto para ese periodo. Si está ocupado o en limpieza → **409 `VEHICLE_UNAVAILABLE`** (o `VEHICLE_IN_CLEANING_COOLDOWN`), que es lo que dispara la compensación de la Saga en Booking.
4. Se guarda la orden + evento `order.confirmed` en la misma transacción; el auto pasa a `RESERVADO` y ms_inventory envía `PushStockUpdate(available_units = 0)`.
5. Respuesta **201** con `pnr`, voucher y precio.

**Devolución:** `checkin-devolucion` → auto a `EN_LIMPIEZA` con `cooldown_until = ahora + 2 h` → `PushStockUpdate(0)`. Al vencer el cooldown, un proceso programado lo pasa a `DISPONIBLE` → `PushStockUpdate(1)`.

**Cancelación (compensación Saga):** reembolso del 100 %, el bloque se libera, el auto vuelve a `DISPONIBLE` → `PushStockUpdate(1)` y evento `order.cancelled`.

**Regla del odómetro:** en entrega, devolución y registro técnico se actualiza `current_mileage`; si `current_mileage >= next_maintenance_km` se marca la alerta, se escribe en el log de auditoría y se emite `auto.mantenimiento.alerta`.

## 6. Dudas que afectan a todo el equipo (para el equipo de integración)

1. **`inventory.proto`** (ya disponible en `contracts/`): ¿formato de `time_slot` (`"10:00"` o `"10:30 a.m."`) y de `slot_id` (con o sin `vehicle_id`)? Lista completa en [`RETO2_PREGUNTAS_INTEGRACION.md`](RETO2_PREGUNTAS_INTEGRACION.md).
2. **El puerto 50051 de Booking en Render no es accesible desde Internet** (lo comprobamos: el 443 conecta, el 50051 no). ¿Cómo se envía el stock en producción?
3. **URL exacta** de la reserva y del semáforo: ¿`<base>/api/v3/autos/reservas` o `<base>/reservas`?
4. **Respuesta 201**: ¿esquema del contrato (`status: "CONFIRMED"`, `auto_id`) o ejemplo de la guía (`status: "RESERVADO"`, `vehicle_id`)?
5. **Autenticación** de Booking hacia las tiendas: ¿`X-API-Key` (¿cómo se entrega?), JWT, o ninguna?
6. **Semáforo de 4 s**: en Render gratuito la API se duerme y tarda ~50 s en despertar; el nodo aparecería en rojo. ¿Se acepta un "ping" de mantenimiento o hace falta instancia siempre activa?
7. **`date`/`time_slot` en gRPC** para alquileres de varios días: ¿se envía solo la franja de retiro?

## 7. Qué aporta RutaLibre al equipo

Nuestro sistema del Reto 1 ya resuelve buena parte de lo que piden estos servicios y lo podemos compartir como base: disponibilidad sin reservas dobles (restricción de exclusión), idempotencia, outbox con reintentos, cálculo de precios con recargos, flota con placas y entregas/devoluciones, panel de administración, validaciones de contacto y pruebas automatizadas (unitarias, de contrato y E2E).
