# Guía de integración para el Booking Hub

Cómo consumir la **API de autos de RutaLibre**, que implementa el contrato oficial [`contracts/autos-openapi.yaml`](../contracts/autos-openapi.yaml) sin modificarlo. CI verifica el SHA-256 del archivo en cada commit.

| | URL |
|---|---|
| Base de la API | `https://arrendamiento-autos-api.onrender.com/autos/v1` |
| Swagger UI (probar en vivo) | https://arrendamiento-autos-api.onrender.com/autos/v1/docs |
| Redoc | https://arrendamiento-autos-api.onrender.com/autos/v1/redoc |
| Contrato (bytes exactos) | https://arrendamiento-autos-api.onrender.com/autos/v1/openapi.yaml |
| Eventos (AsyncAPI, complementario) | [`contracts/autos-events.asyncapi.yaml`](../contracts/autos-events.asyncapi.yaml) |
| Estado del servicio | https://arrendamiento-autos-api.onrender.com/health |

> El plan gratuito de Render apaga la API tras 15 minutos sin uso: la primera llamada puede tardar unos 50 s. Antes de una demo, abre `/health`.

## 1. Las 15 operaciones

| Grupo | Operación | Autenticación | Caché |
|---|---|---|---|
| Catálogo | `POST /search` | `X-Affiliate-Id` | `max-age=300` |
| | `POST /depots` | `X-Affiliate-Id` | `max-age=3600` |
| | `POST /depots/reviews/scores` | `X-Affiliate-Id` | `max-age=600` |
| | `POST /details` | `X-Affiliate-Id` | `max-age=300` |
| | `POST /suppliers` | `X-Affiliate-Id` | `max-age=3600` |
| | `POST /constants` | `X-Affiliate-Id` | `max-age=86400` |
| Órdenes | `POST /orders/hold` | Bearer, `autos:book` | — |
| | `POST /orders/preview` | Bearer, `autos:read` | — |
| | `POST /orders/create` | Bearer, `autos:book` + `Idempotency-Key` | — |
| | `GET /orders/{orderId}` | Bearer, `autos:read` | — |
| | `POST /orders/{orderId}/modify` | Bearer, `autos:book` + `Idempotency-Key` | — |
| | `POST /orders/{orderId}/cancel` | Bearer, `autos:cancel` + `Idempotency-Key` | — |
| Webhooks | `GET /webhooks`, `POST /webhooks`, `DELETE /webhooks/{id}` | Bearer, `autos:webhooks` | — |

## 2. Autenticación

### 2.1 Catálogo: `X-Affiliate-Id`

Las operaciones de catálogo son públicas, pero exigen la cabecera `X-Affiliate-Id` con un entero positivo. En RDA1 se acepta cualquier entero (`AFFILIATE_VALIDATION=lenient`, acordado con el equipo de integración); en modo `strict` el afiliado debe existir y estar activo.

### 2.2 Órdenes y webhooks: OAuth2 *client credentials*

Los tokens son JWT **RS256** con `iss=rutalibre-local-idp`, `aud=autos-api` y el claim `scopes` (lista). Duran **1 hora**.

Mientras no exista el IdP central del Hub (RDA1), la propia API emite los tokens:

```bash
curl -X POST https://arrendamiento-autos-api.onrender.com/oauth2/token \
  -d grant_type=client_credentials \
  -d client_id=booking-hub-demo \
  -d client_secret=<SECRET_ENTREGADO_POR_CANAL_PRIVADO> \
  -d "scope=autos:read autos:book autos:cancel autos:webhooks"
```

```json
{ "access_token": "eyJ…", "token_type": "Bearer", "expires_in": 3600, "scope": "autos:read autos:book autos:cancel autos:webhooks" }
```

- También se aceptan las credenciales en HTTP Basic (RFC 6749 §2.3.1).
- Los errores siguen RFC 6749 §5.2: `invalid_client` (401), `invalid_scope` (400), `unsupported_grant_type` (400).
- La clave pública está en `GET /.well-known/jwks.json`. En RDA2 se desactiva el emisor local (`LOCAL_OAUTH_ISSUER_ENABLED=false`) y se valida contra el JWKS del IdP central sin tocar los controladores.
- El secreto del cliente **no** se publica en el repositorio; se entrega por un canal privado.

## 3. Flujo de una reserva

```
search ──► (opcional) hold ──► preview ──► create ──► get / modify / cancel
   │            15 min            15 min        Idempotency-Key
   └─ search_token (30 min)
```

**1. Buscar**

```http
POST /autos/v1/search
X-Affiliate-Id: 1001
Content-Type: application/json

{
  "booker": { "country": "ec" },
  "currency": "USD",
  "driver": { "age": 35 },
  "route": {
    "pickup":  { "datetime": "2026-11-10T10:00:00-05:00", "location": { "airport": "UIO" } },
    "dropoff": { "datetime": "2026-11-13T10:00:00-05:00", "location": { "airport": "UIO" } }
  },
  "filters": { "car_types": ["SEDAN"] }
}
```

La respuesta trae `data[]` (`vehicle_id`, `price`, `supplier_id`) y un `search_token`. Las fichas completas se piden aparte con `/details`, `/depots` y `/suppliers`.

**2. Bloquear (opcional)**: `POST /orders/hold` con `{ "vehicle_id", "search_token", "driver": { "age": 35 } }` → `hold_id`, válido 15 minutos. Otro cliente que intente el mismo vehículo recibe 409.

**3. Cotizar**: `POST /orders/preview` con `{ "vehicle_id", "search_token", "hold_id", "extras": ["GPS", "CHILD_SEAT"] }` → `order_preview_id` con el desglose y el precio congelado durante 15 minutos.

**4. Crear**

```http
POST /autos/v1/orders/create
Authorization: Bearer <token>
Idempotency-Key: 6f1d7c1e-2b9a-4c55-9b0e-3d1f2a7c8e90
Content-Type: application/json

{
  "order_preview_id": "<del paso 3>",
  "payment_reference": "PAY-8F3A21C9",
  "driver_details": { "first_name": "Lucía", "last_name": "Mora", "email": "lucia.mora@correo.ec", "phone_number": "+593998765432" }
}
```

→ `201 OrderDetail` con `order_id`, localizador, estado `CONFIRMED` y `_links`. Al mismo tiempo se publica el evento `CAR_ORDER_CONFIRMED`.

**5. Posventa**: `GET /orders/{id}`; `POST /orders/{id}/modify` (extras, fechas o agencias, con precio recalculado); `POST /orders/{id}/cancel` (200 con cuerpo vacío, emite `CAR_ORDER_CANCELLED`).

## 4. Reglas que aplica el servicio

| Regla | Valor |
|---|---|
| Moneda base de tarifas | USD; IVA 15 % incluido en `price` |
| Día de alquiler | Bloques de 24 h, con 59 min de tolerancia antes de cobrar otro día |
| Anticipación mínima / duración máxima | 2 h / 30 días |
| Edad | Mínima según la categoría; menores de 25 pagan 10 USD por día |
| Devolución en otra agencia | +40 USD |
| Horario | Retiro y devolución solo con la agencia abierta (hora de Ecuador, `America/Guayaquil`) |
| Disponibilidad | Unidades de la flota − reservas que se cruzan − holds vigentes − bloqueos de mantenimiento, con 60 min de limpieza entre alquileres |
| Cancelación | Gratis hasta 24 h antes del retiro; después se cobra 1 día de tarifa |
| `payment_reference` | 8–64 caracteres `[A-Za-z0-9_-]` (el cobro real pertenece al Payment API del Hub) |

## 5. Idempotencia

`orders/create`, `orders/{id}/modify` y `orders/{id}/cancel` exigen `Idempotency-Key` (UUID):

| Caso | Respuesta |
|---|---|
| Primera vez | Se ejecuta y se guarda la respuesta (24 h) |
| Misma clave y mismo cuerpo | Se devuelve la **misma** respuesta (*replay*); no se crea nada nuevo |
| Misma clave con otro cuerpo | `409` |
| Dos peticiones simultáneas con la misma clave | Una gana; la otra recibe `409` |
| Sin clave o clave que no es UUID | `400` |

Si se pierde la respuesta por un timeout de red, basta con **repetir la petición con la misma clave**.

## 6. Errores

Todas las respuestas de error usan **ProblemDetails (RFC 7807)** con el `code` del contrato:

```json
{
  "type": "https://api.booking-hub.com/errors/payment-reference-invalid",
  "title": "Referencia de pago inválida",
  "status": 400,
  "detail": "payment_reference debe tener 8–64 caracteres alfanuméricos, \"-\" o \"_\"",
  "code": "PAYMENT_REFERENCE_INVALID",
  "invalidParams": [{ "name": "payment_reference", "reason": "formato inválido" }]
}
```

Códigos usados: `VALIDATION_FAILED`, `CAR_NO_LONGER_AVAILABLE`, `PRICE_CHANGED`, `DEPOT_CLOSED`, `DRIVER_AGE_RESTRICTION`, `BOOKING_NOT_CONFIRMED`, `CANCELLATION_NOT_ALLOWED`, `RATE_LIMIT_EXCEEDED` y `PAYMENT_REFERENCE_INVALID`. El contrato no tiene códigos propios para 401, 403 ni 404, así que esas respuestas usan `VALIDATION_FAILED` con el `status` correspondiente.

| HTTP | Cuándo |
|---|---|
| 400 | Cuerpo inválido, `search_token` vencido, regla de negocio incumplida |
| 401 / 403 | Sin token, token inválido o sin el scope requerido |
| 404 | La orden no existe **o pertenece a otro cliente** (no se revela cuál de los dos) |
| 409 | Vehículo ya no disponible, idempotencia en conflicto, orden en un estado que no admite el cambio |
| 429 | Límite superado (búsqueda: 60/min por afiliado), con `Retry-After` |

## 7. Webhooks

**Suscribirse**

```http
POST /autos/v1/webhooks
Authorization: Bearer <token con autos:webhooks>

{ "url": "https://hub.example.com/hooks/autos", "events": ["CAR_ORDER_CONFIRMED", "CAR_ORDER_CANCELLED", "DEPOT_UPDATE"] }
```

La respuesta 201 incluye el `secret`. **Solo se muestra en esa respuesta**: guárdalo, porque `GET /webhooks` no lo devuelve.

**Qué llega**

```http
POST https://hub.example.com/hooks/autos
Content-Type: application/json
X-Hub-Signature-256: sha256=5d41402abc4b2a76b9719d911017c592…
X-Webhook-Event-Id: 7b1f7c1e-6a0f-4a57-9d0d-0f8f5f2d2a11
X-Webhook-Event-Type: CAR_ORDER_CONFIRMED

{ "eventId": "7b1f7c1e-…", "eventType": "CAR_ORDER_CONFIRMED", "timestamp": "2026-11-01T14:03:22Z",
  "resourceId": "<order_id>", "data": { "order_id": "…", "locator": "ANDES-7K2Q9M", "status": "CONFIRMED", "total_price": 179.4, "currency": "USD" } }
```

| Evento | Se envía a | Cuándo |
|---|---|---|
| `CAR_ORDER_CONFIRMED` | Solo al cliente dueño de la orden | Se crea una orden |
| `CAR_ORDER_CANCELLED` | Solo al cliente dueño de la orden | Cancelación por la API, la web o el panel |
| `DEPOT_UPDATE` | Todos los suscriptores | Se crea, edita o desactiva una agencia u horario |

**Verificar la firma**: es el HMAC-SHA256 del cuerpo **exacto** recibido, con el `secret`:

```js
const crypto = require('crypto')
const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.get('X-Hub-Signature-256')))
```

**Garantías**:
- La entrega es *at least once*: el consumidor debe deduplicar por `eventId`.
- Una respuesta distinta de 2xx (o que tarde más de 5 s) se reintenta tras **1 min, 5 min, 30 min, 2 h y 12 h**; después queda como `DEAD`.
- Los eventos se registran en la misma transacción que el cambio (*transactional outbox*): nunca se anuncia una orden que no existe, y no se pierde un evento si el servidor se reinicia.
- En producción solo se aceptan URLs `https` públicas (protección anti-SSRF).

## 8. Diferencias y supuestos documentados

| Tema | Decisión | Origen |
|---|---|---|
| Emisor de tokens | Local en RDA1; IdP central en RDA2 | Equipo de integración |
| `vehicle_id` | Es un **modelo comercial** ("Kia Picanto o similar"); la placa se asigna al entregar el auto | Práctica del sector; no cambia el contrato |
| Modificación de orden | Se registra internamente, pero no se envía como webhook (no está en el enum del contrato) | Contrato |
| Afiliado | Validación *lenient* en RDA1 | Equipo de integración |

Más detalle en [`ANALISIS_CONTRATO.md`](ANALISIS_CONTRATO.md), [`SOA_EDA.md`](SOA_EDA.md) y [`DECISIONES_CONFIRMADAS.md`](DECISIONES_CONFIRMADAS.md).
