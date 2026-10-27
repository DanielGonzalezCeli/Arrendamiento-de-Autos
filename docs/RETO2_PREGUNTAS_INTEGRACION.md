# Preguntas para el equipo de integración (Booking) — vertical de Autos

Basadas en `GUIA_INTEGRACION_AUTOS.md`, `autos-openapi-v3.yaml` (v3.0.0) e `inventory.proto` (SHA-256 `e5a3661bd8897ab13a6368ac962b3ed8f253049951993d4d857ca95210434f31`). Fecha: 2026-10-27.

Las marcadas con ⛔ bloquean la implementación.

## A. gRPC (`inventory.proto`)

1. ⛔ **¿A qué dirección enviamos `PushStockUpdate` en producción?** El `.proto` indica `booking.epn.edu.ec:50051`, pero ese dominio no existe (no resuelve en DNS). La guía indica `rda1-backend-integracion-sistemas.onrender.com:50051`, pero probamos y el puerto 50051 no acepta conexiones desde Internet (el 443 sí); Render solo publica HTTPS. ¿Hay otro host o puerto, se usa gRPC sobre 443 con TLS, o el gRPC solo funcionará en la prueba local por Tailscale?
2. ⛔ **Formato de `time_slot`:** el `.proto` dice `"10:30 a.m."` o `"10:30:00"`; el contrato v3 y la guía usan `"10:00"`. ¿Cuál debemos enviar?
3. ⛔ **Formato de `slot_id`:** el `.proto` dice `"slot-YYYYMMDD-HHMM"`; la guía usa `"slot-auto-spark-01-20261115-1000"` (con el `vehicle_id`). ¿Cuál es el correcto para autos?
4. ⛔ **Alquileres de varios días:** si un auto se reserva del 15 al 18 de noviembre, ¿qué `date` y `time_slot` enviamos? ¿Solo la fecha y hora de retiro, uno por cada día, o uno por cada franja?
5. **`ITEM_NOT_FOUND`:** para no recibir este error, ¿Booking ya debe conocer nuestros `item_id` antes del primer envío? ¿Los aprende al pulsar "Sincronizar" en el panel de nodos? ¿Qué endpoint nuestro llama ese botón?
6. **`service_id`:** ¿es el "ID del Nodo" que escribimos en el formulario de registro? ¿Hay un formato obligatorio (`NODE_AUT_…`)?
7. **Métodos obligatorios:** ¿basta con `PushStockUpdate`, o también debemos usar `StreamInventoryChanges` y `GetSlotAvailability`?
8. **Regla monotónica (`STALE_TIMESTAMP_IGNORED`):** ¿Booking compara el `timestamp` por `item_id` + `slot_id`? Lo necesitamos saber para los reintentos.

## B. REST (contrato v3)

9. ⛔ **URL exacta:** ¿qué ponemos como "Base URL REST" en el formulario, con o sin `/api/v3`? ¿A qué ruta completa llega la reserva (`<base>/api/v3/autos/reservas` o `<base>/reservas`) y a cuál el semáforo (`<base>/api/v3/autos/health` o `<base>/autos/health`)?
10. ⛔ **Respuesta `201` de la reserva:** el esquema del contrato usa `status: "CONFIRMED"`, `auto_id` y `voucher_qr_data`; el ejemplo de la guía usa `status: "RESERVADO"`, `vehicle_id` y `voucher_qr_payload`. ¿Cuál valida Booking?
11. ⛔ **Autenticación:** ¿Booking enviará `X-API-Key` o un token `Bearer` en la reserva? Si es una clave, ¿cómo la intercambiamos? ¿O esos endpoints quedan sin autenticación?
12. **¿Qué endpoints llama Booking realmente?** Además de la reserva y el semáforo, ¿llama a `GET /autos`, `POST /autos/search`, `POST /autos/orders/{id}/cancel` (compensación de la Saga), los check-ins o `GET /autos/eventos`? Así priorizamos.
13. **Cancelación:** ¿el reembolso del 100 % aplica a toda cancelación o solo a las compensaciones de la Saga (`solicitante: SAGA_ORCHESTRATOR`)?
14. **Semáforo de 4 s:** en Render gratuito la API se duerme tras 15 min sin uso y tarda unos 50 s en despertar, así que el nodo aparecería en rojo. ¿Es aceptable mantenerla despierta con un ping periódico?
15. **Eventos:** ¿Booking consume nuestros eventos por RabbitMQ o Kafka (¿cuál es la URL del broker?) o leyendo `GET /autos/eventos`?

## C. Organización

16. **¿Quiénes son los compañeros de la vertical de Autos** y cuándo es la reunión para acordar el modelo de datos común?
17. **Prueba por Tailscale:** ¿qué fecha y qué puertos se usarán?

---

## Respuestas del equipo de integración (2026-10-27) y decisiones

| # | Respuesta | Qué implica para nosotros |
|---|---|---|
| 1 | El puerto 50051 en Render está bloqueado (solo 80/443). Vía oficial para la demo y la calificación: **gRPC por Tailscale** a la IP de Booking, puerto 50051, sin TLS (h2c). Respaldo en la nube: **`POST https://rda1-backend-integracion-sistemas.onrender.com/api/v3/inventory/stock`** con el mismo JSON del mensaje protobuf | `ms_inventory` tendrá un emisor con dos transportes configurables: **gRPC** (Tailscale/local) y **HTTP de respaldo** (producción) |
| 2 | `time_slot` = **`"HH:mm"`** 24 h (ej. `"10:00"`) | Enviar siempre `HH:mm` |
| 3 | `slot_id` = **`slot-YYYYMMDD-HHMM`**; el auto va en `item_id`. Clave en Booking: `service_id|item_id_date_time_slot` | Usar el formato canónico sin el id del auto |
| 4 | Al reservar, limpiar o mantener: enviar `available_units = 0` con la **fecha y hora de retiro**. Booking marca el auto como `RESERVADO` en su catálogo | Un mensaje por cambio de estado; `1` cuando el auto vuelve a `DISPONIBLE` (fin del cooldown o cancelación) |
| 5 | Booking no rechaza `item_id` desconocidos, pero para mostrarlos debe importarlos con **"Sincronizar" → `GET {base}/autos`** (arreglo o `{ "data": [...] }`) | `GET /autos` es prioridad 2 |
| 6 | `service_id` = ID del nodo del formulario, formato **`NODE_AUT_<NOMBRE>`** | Usaremos `NODE_AUT_RUTALIBRE` |
| 7 | **Basta con `PushStockUpdate`**; los otros dos RPC son opcionales | Solo el unario |
| 8 | Regla de timestamp por clave; un reintento con timestamp menor se descarta (`STALE_TIMESTAMP_IGNORED`) | Los reintentos conservan su timestamp original: si ya se envió un estado más nuevo, el viejo se descarta solo |
| 9 | Base URL = `https://<tienda>/api/v3`. Reserva: `POST {base}/reservas` (o `{base}/autos/reservas`). Semáforo: **`GET {base}/health`** (200 = verde) | Exponer también las rutas cortas (`/api/v3/health`, `/api/v3/reservas`) además de las del contrato (`/api/v3/autos/...`) |
| 10 | `201` según el contrato: `status: "CONFIRMED"`, `auto_id`, `voucher_qr_data`, `total_price {currency, total}`. Booking tolera los alias | Seguimos el esquema del contrato |
| 11 | Booking puede enviar **`X-API-Key`**; la clave se comparte por privado con Paúl (`TIENDA_AUTOS_API_KEY`). Si no la exigimos, igual funciona | **Decisión pendiente del usuario** (ver abajo) |
| 12 | Prioridades: 1) `GET /health`, 2) `GET /autos`, 3) `POST /reservas`, 4) `POST /orders/{id}/cancel` o `/reservas/{id}/cancel` (Saga), 5) `GET/PUT /autos/promociones/contrato`. Check-ins y mantenimiento son internos | Implementar en ese orden. La cancelación necesita ambos alias |
| 13 | Saga (`SAGA_ORCHESTRATOR`) → **100 %** sin penalidad; cancelación voluntaria → política comercial normal | Coincide con nuestra propuesta: se mantiene la regla de 24 h para el cliente |
| 14 | Mantener la API despierta con un **ping cada 10 min** (UptimeRobot o cron) | Ojo: Render gratuito da **750 h/mes en total**; varios servicios despiertos todo el mes no caben (ver diagnóstico) |
| 15 | No hace falta broker: basta **`GET /autos/eventos`** + gRPC | El outbox existente sirve de feed; sin Kafka/RabbitMQ |
| 16 | Paúl Rosero convocará la reunión de la vertical de Autos (Discord/Teams) | Llevar la propuesta y el SQL |
| 17 | gRPC 50051 (h2c); REST 3000 local o 443 en Render. Prueba conjunta **48 h antes de la entrega de la Semana 9** | Necesitamos la fecha exacta de esa entrega |

### Rutas que expondrá la tienda (bajo `/api/v3`)

| Llamada de Booking | Rutas que aceptaremos |
|---|---|
| Semáforo | `GET /health` y `GET /autos/health` |
| Sincronizar | `GET /autos` |
| Reserva | `POST /reservas`, `POST /autos/reservas`, `POST /autos/orders/create` |
| Cancelación (Saga) | `POST /orders/{id}/cancel`, `POST /reservas/{id}/cancel`, `POST /autos/orders/{id}/cancel` |
| Promociones | `GET/PUT /autos/promociones/contrato` |
| Feed de eventos | `GET /autos/eventos` |

### Pendiente

- **¿Exigimos `X-API-Key`?** Recomendación: sí en las operaciones que modifican (reserva, cancelación, promociones `PUT`) y en el feed de eventos; dejar públicos el catálogo y el semáforo, como marca el contrato (`security: []`). Suma al criterio de seguridad de la rúbrica. Riesgo: si Booking configura mal la clave, la reserva falla; se mitiga probándolo en la sesión por Tailscale.
- **Fecha de la entrega de la Semana 9** (la prueba conjunta es 48 h antes).
- **Reunión de la vertical de Autos** (la convoca Paúl).
