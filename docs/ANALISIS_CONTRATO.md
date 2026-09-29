# Análisis del contrato `contracts/autos-openapi.yaml`

> **Fuente de verdad (Prioridad 1).** Este documento describe lo que el contrato exige; no lo modifica.
>
> | Dato | Valor |
> |---|---|
> | Repositorio | https://github.com/semestre5grupal-ops/Plantilla-Integracion-Sistemas |
> | Commit analizado | `090e863928579bf90eb21c560b798114bafb2028` (2026-09-22) |
> | SHA-256 del archivo | `7ef0fd17b82e2fa24e7efb170f2ec833f905e071b1017cc0bf2741393593ed5b` |
> | OpenAPI | 3.0.3 |
> | Título / versión | GDS Autos Core API / 1.0.0 |
> | Responsable | Joselyn Cadena (jlcadenac@puce.edu.ec) |
>
> La copia local `contracts/autos-openapi.yaml` es **idéntica byte a byte** (mismo SHA-256). Un test verificará que siga así.

> **Actualización 2026-09-29:** el equipo de integración respondió los puntos [CONFIRMAR]. Ver [DECISIONES_CONFIRMADAS.md](DECISIONES_CONFIRMADAS.md), que prevalece sobre este documento donde difieran.

Clasificación usada en observaciones: **[EXPLÍCITO]** lo dice el YAML · **[INFERENCIA]** deducción razonable · **[DECISIÓN]** decisión técnica nuestra · **[CONFIRMAR]** requiere respuesta del equipo de integración.

---

## 1. Metadatos globales

| Elemento | Contenido | Observación |
|---|---|---|
| `info.description` | "El dueño de la reserva (ownerId) se infiere del `sub` del token JWT. La lógica de pagos pertenece a otros dominios/APIs." | **[EXPLÍCITO]** No procesamos pagos; solo guardamos `payment_reference`. El propietario de una orden = claim `sub` del token. |
| `servers` | `https://api.booking-hub.com/autos/v1` (Producción), `https://sandbox.api.booking-hub.com/autos/v1` (Sandbox) | **[CONFIRMADO]** Base path **`/autos/v1`**; nuestra API en Render expone `https://<api>.onrender.com/autos/v1/*`. |
| `security` global | `OAuth2Security: []` | Todo requiere token salvo que el endpoint lo anule con `security: []`. |
| `tags` | Búsqueda y Catálogo · Información de Agencias y Proveedores · Gestión de Órdenes (Reservas) · Componentes Comunes · Webhooks | Se respetan en Swagger. |

---

## 2. Tabla de endpoints (15 operaciones en 14 paths)

| # | Endpoint | Método | Auth / Scope | Headers req. | Request | Respuestas declaradas | Implementación prevista |
|---|---|---|---|---|---|---|---|
| 1 | `/search` | POST | **Público** (`security: []`) | `X-Affiliate-Id` (integer, req.) | `CarSearchRequest` (req.) | 200 `CarSearchResponse` + headers `Cache-Control: public, max-age=300`, `X-API-Deprecation-Date` · 400 · 429 | `SearchService.search()` → crea `search_session`, calcula disponibilidad y precio |
| 2 | `/depots` | POST | Público | `X-Affiliate-Id` | `DepotsRequest` (opcional) | 200 `DepotsResponse` + `Cache-Control: public, max-age=3600` | `DepotService.list()` paginado, filtro `last_modified` |
| 3 | `/depots/reviews/scores` | POST | Público | `X-Affiliate-Id` | `DepotScoresRequest` (req.) | 200 `DepotScoresResponse` + `max-age=600` | `ReviewService.scoresByDepot()` (promedio) |
| 4 | `/details` | POST | Público | `X-Affiliate-Id` | `CarDetailsRequest` (req.) | 200 `CarDetailsResponse` + `max-age=300` | `VehicleService.catalog()` paginado, `last_modified` |
| 5 | `/suppliers` | POST | Público | `X-Affiliate-Id` | `SuppliersRequest` (opcional) | 200 `SuppliersResponse` + `max-age=3600` | `SupplierService.list(ids?)` |
| 6 | `/constants` | POST | Público | `X-Affiliate-Id` | `CarConstantsRequest` (opcional) | 200 `CarConstantsResponse` + `max-age=86400` | `ConstantsService.get(keys, languages)` |
| 7 | `/orders/hold` | POST | `autos:book` | — (sin Idempotency-Key) | `OrderHoldRequest` (req.) | **200** `OrderHoldResponse` · 400 · 409 | `HoldService.create()` bloqueo temporal |
| 8 | `/orders/preview` | POST | `autos:read` | — | `OrderPreviewRequest` (req.) | 200 `OrderPreviewResponse` | `OrderPreviewService.create()` usando `PricingService` |
| 9 | `/orders/create` | POST | `autos:book` | `Idempotency-Key` (uuid, req.) | `OrderCreateRequest` (req.) | **201** `OrderDetail` · 400 · 409 | `ReservationService.createFromPreview()` + idempotencia + evento |
| 10 | `/orders/{orderId}` | GET | `autos:read` | — | path `orderId` (uuid) | 200 `OrderDetail` · 404 | `ReservationService.getForOwner()` |
| 11 | `/orders/{orderId}/modify` | POST | `autos:book` | `Idempotency-Key` (uuid, req.) | path `orderId` + `OrderModifyRequest` (req.) | 200 `OrderDetail` · 409 | `ReservationService.modify()` |
| 12 | `/orders/{orderId}/cancel` | POST | `autos:cancel` | `Idempotency-Key` (uuid, req.) | path `orderId`, **sin body** | 200 (sin schema → **cuerpo vacío**, confirmado) · 409 | `ReservationService.cancel()` + evento |
| 13 | `/webhooks` | GET | `autos:webhooks` | — | — | 200 `WebhookSubscription[]` | `WebhookSubscriptionService.list(ownerSub)` |
| 14 | `/webhooks` | POST | `autos:webhooks` | — | `WebhookSubscription` (req.) | **201** `WebhookSubscription` · callback `carEvent` | `WebhookSubscriptionService.create()` |
| 15 | `/webhooks/{id}` | DELETE | `autos:webhooks` | — | path `id` (uuid) | **204** | `WebhookSubscriptionService.remove()` |

**Observaciones de forma**

- Todos los endpoints de catálogo son **POST** aunque solo leen (estilo de la Demand API de Booking.com). **[EXPLÍCITO]** No se cambian a GET.
- Los endpoints de catálogo **no requieren token**, pero sí `X-Affiliate-Id` entero. Si falta o no es entero, se responde **400 `VALIDATION_FAILED`**.
- `hold` devuelve **200**, no 201. `create` devuelve **201**. `webhooks POST` devuelve **201**. `DELETE` devuelve **204** sin cuerpo.
- `Cache-Control` en respuestas de POST es poco usual, pero **[EXPLÍCITO]**: se envía con los valores exactos.

---

## 3. Seguridad

### 3.1 Security scheme `OAuth2Security` (type `oauth2`)

| Flujo | URLs | Uso previsto |
|---|---|---|
| `authorizationCode` | authorize: `https://auth.booking-hub.com/oauth2/authorize` · token: `https://auth.booking-hub.com/oauth2/token` | Usuario final que inicia sesión en el Hub; `sub` = usuario |
| `clientCredentials` | token: `https://auth.booking-hub.com/oauth2/token` | **B2B: Booking Hub → nuestra API**; `sub` = cliente (sistema) |

### 3.2 Scopes

| Scope | Descripción contrato | Endpoints |
|---|---|---|
| `autos:read` | Leer información de autos, catálogos y reservas | `POST /orders/preview`, `GET /orders/{orderId}` |
| `autos:book` | Crear, mantener en hold y alterar reservas | `POST /orders/hold`, `POST /orders/create`, `POST /orders/{id}/modify` |
| `autos:cancel` | Cancelar reservas | `POST /orders/{id}/cancel` |
| `autos:webhooks` | Gestionar webhooks | `GET/POST /webhooks`, `DELETE /webhooks/{id}` |

### 3.3 Dificultad y propuesta

- **Dificultad [INFERENCIA]:** `auth.booking-hub.com` **no existe todavía**. El README de vuelos indica que en la **fase RDA1 no hay integración**: cada equipo despliega su API en Render de forma independiente.
- **Propuesta [DECISIÓN]:**
  1. La API de integración valida un **Bearer JWT** y sus **scopes** mediante `OAuth2Guard` + `ScopesGuard` (`@RequireScopes('autos:book')`).
  2. El **emisor es configurable** (`INTEGRATION_JWT_ISSUER`, `INTEGRATION_JWKS_URL` o clave pública).
  3. En **RDA1** exponemos un emisor local de desarrollo, `POST /oauth2/token` (grant `client_credentials`), con clientes registrados en la tabla `api_clients` (secretos con hash). Este endpoint **no forma parte del contrato**: es infraestructura que reemplaza temporalmente a `auth.booking-hub.com`.
  4. En **RDA2** se desactiva el emisor local y se valida contra el JWKS del Hub, **sin tocar controllers ni servicios**.
- **Separación de mecanismos [DECISIÓN]:** los usuarios de nuestro marketplace usan **otro** JWT (emisor y audiencia propios, secreto distinto) validado por `UserJwtGuard` + `RolesGuard`. Un token de usuario web **no** sirve para la API de integración, ni al revés.
- **[CONFIRMADO]** Scopes como **array** en los claims del JWT; firma **RS256**; verificación con **JWKS** del IdP (RDA2: Keycloak, Supabase Auth o Auth0).

### 3.4 `X-Affiliate-Id`

- **[EXPLÍCITO]** Obligatorio (integer) en los 6 endpoints públicos de catálogo. No aparece en `/orders/*` ni en `/webhooks`.
- **[DECISIÓN]** Se valida la presencia y que sea entero. Se registra en logs y en `search_sessions.affiliate_id`, y se propaga a la orden cuando esta nace de un `search_token`.
- **[CONFIRMADO]** RDA1: cualquier entero (modo `lenient`). El diseño incluye la tabla `affiliates` (comisión, límite por minuto) y el modo `strict` para producción.

---

## 4. Headers

| Header | Dirección | Dónde | Tipo | Regla |
|---|---|---|---|---|
| `X-Affiliate-Id` | Request | 6 endpoints de catálogo | integer, requerido | 400 si falta o no es entero |
| `Idempotency-Key` | Request | `orders/create`, `orders/{id}/modify`, `orders/{id}/cancel` | string `uuid`, requerido | 400 si falta o no es UUID; ver §7 |
| `Authorization: Bearer` | Request | `/orders/*`, `/webhooks*` | — | 401 si falta o es inválido; 403 si falta el scope |
| `Cache-Control` | Response 200 | catálogo | string | search/details `public, max-age=300`; depots/suppliers `3600`; scores `600`; constants `86400` |
| `X-API-Deprecation-Date` | Response 200 | catálogo | string `date` | **[DECISIÓN]** Opcional; se enviará si la variable `API_DEPRECATION_DATE` está configurada |
| `Retry-After` | Response 409 / 429 | errores | integer (segundos) | 429 siempre; 409 cuando haya una operación idempotente en curso |

---

## 5. Schemas

### 5.1 Tipos base

| Schema | Campos (★ requerido) | Restricciones |
|---|---|---|
| `Booker` | ★`country` | `^[a-z]{2}$`: ISO 3166-1 alfa-2 **en minúsculas** (ej. `ec`) |
| `Driver` | ★`age` | integer 18–99 |
| `LocationPoint` | `airport` (IATA), `city_id` (integer), `coordinates{latitude, longitude}` | Ninguno es requerido → **[DECISIÓN]** exigir al menos uno (400 si viene vacío) |
| `Route` | ★`pickup`, ★`dropoff`; cada uno ★`datetime` (date-time) y ★`location` (`LocationPoint`) | — |

### 5.2 Catálogo

| Schema | Campos | Notas |
|---|---|---|
| `CarSearchRequest` | ★`booker`, ★`currency` (`^[A-Z]{3}$`), ★`driver`, ★`route`, `filters{car_types[], transmission[]}`, `maximum_results` (10–500, default 100), `language`, `page` (string) | `page` = cursor opaco |
| `CarSearchResponse` | `request_id`, `data[]{vehicle_id: string, price: number, supplier_id: integer}`, `metadata{total_results, next_page (nullable)}`, `search_token` | Respuesta mínima; el detalle se obtiene con `/details`, `/depots` y `/suppliers` |
| `DepotsRequest` | `last_modified`, `maximum_results` (100), `languages[]`, `page` | Sincronización incremental |
| `DepotsResponse` | `request_id`, `data[]{depot_id: integer, name, location: LocationPoint}`, `metadata{}` | `depot_id` es **integer** |
| `DepotScoresRequest` | `maximum_results` (100), `page` | — |
| `DepotScoresResponse` | `request_id`, `data[]{depot_id, score: number}`, `metadata{}` | **[CONFIRMADO]** decimal 0–10 (ej. 8.5) |
| `CarDetailsRequest` | `last_modified`, `maximum_results`, `page` | **No filtra por `vehicle_id`**: devuelve el catálogo completo paginado |
| `CarDetailsResponse` | `request_id`, `data[]{vehicle_id, make, model, doors, bag_capacity, seats}` | — |
| `SuppliersRequest` | `suppliers[]` (integer; vacío = todos), `maximum_results`, `page` | — |
| `SuppliersResponse` | `request_id`, `data[]{supplier_id: integer, name}` | — |
| `CarConstantsRequest` | `languages[]`, `constants[]` ∈ {`depot_services`, `fuel_policies`, `fuel_types`, `general`, `payment_timings`, `transmission`} | — |
| `CarConstantsResponse` | `request_id`, `data: object` (libre) | **[DECISIÓN]** `data` indexado por nombre de constante: `{ "transmission": [{ "code": "AUTOMATIC", "name": "Automática" }], ... }` |

### 5.3 Órdenes

| Schema | Campos | Notas |
|---|---|---|
| `OrderHoldRequest` | ★`vehicle_id`, ★`search_token`, `driver` | Las fechas y la ruta salen del `search_token` |
| `OrderHoldResponse` | `hold_id`, `expires_at`, `status` ∈ {`HELD`, `FAILED`} | — |
| `OrderPreviewRequest` | ★`vehicle_id`, ★`search_token`, `hold_id`, `extras[]` (string) | Los extras son códigos (ej. `GPS`, `CHILD_SEAT`) |
| `OrderPreviewResponse` | `request_id`, `data{order_preview_id, total_price, currency, breakdown: object}` | `breakdown` libre → lo definimos nosotros |
| `OrderCreateRequest` | ★`order_preview_id`, ★`payment_reference`, ★`driver_details{first_name, last_name, email, phone_number}` | Los campos internos de `driver_details` no son requeridos por el contrato → **[DECISIÓN]** exigir `first_name`, `last_name` y `email` por regla de negocio (400) |
| `OrderDetail` | `order_id` (uuid), `locator` (tipo PNR, ej. `HERTZ-X789`), `status` ∈ {`CONFIRMED`, `CANCELLED`, `PENDING`}, `vehicle_details: object`, `route_details: object`, `total_price`, `currency`, `creation_date`, `_links` (map string→uri, HATEOAS) | `vehicle_details` y `route_details` son **snapshots históricos** |
| `OrderModifyRequest` | `extras_to_add[]`, `extras_to_remove[]`, `route: Route` | Todo opcional |

### 5.4 Webhooks

| Schema | Campos | Notas |
|---|---|---|
| `WebhookSubscription` | ★`id` (uuid), ★`url` (uri), ★`events[]` ∈ {`CAR_ORDER_CONFIRMED`, `CAR_ORDER_CANCELLED`, `DEPOT_UPDATE`}, `secret` | Se usa **como request y como response** |
| `WebhookPayload` | ★`eventId` (uuid), ★`eventType` (string), ★`timestamp`, ★`resourceId`, `data: object` | Cuerpo del callback `carEvent` |

### 5.5 Errores

`ProblemDetails` (RFC 7807, `application/problem+json`, **`additionalProperties: false`**):

| Campo | Req. | Tipo |
|---|---|---|
| `type` | ★ | string |
| `title` | ★ | string |
| `status` | ★ | integer |
| `code` | ★ | enum (abajo) |
| `detail` | | string |
| `invalidParams[]` | | `{name, reason}` |

**Enum `code`:** `VALIDATION_FAILED`, `CAR_NO_LONGER_AVAILABLE`, `PRICE_CHANGED`, `DEPOT_CLOSED`, `DRIVER_AGE_RESTRICTION`, `BOOKING_NOT_CONFIRMED`, `CANCELLATION_NOT_ALLOWED`, `RATE_LIMIT_EXCEEDED`, `PAYMENT_REFERENCE_INVALID`, `PAYMENT_NOT_AUTHORIZED`.

Respuestas reutilizables: `ProblemDetails400`, `ProblemDetails403` (definida, **no usada** por ningún path), `ProblemDetails404`, `ProblemDetails409` (+`Retry-After`) y `ProblemDetails429` (+`Retry-After`).

**Consecuencias:**
- **No se puede** añadir `instance`, `request_id`, `timestamp` ni ningún otro campo al cuerpo de error (`additionalProperties: false`).
- Un filtro global de excepciones convierte **todos** los errores (incluidos los de `ValidationPipe` de NestJS) a este formato, con `Content-Type: application/problem+json`.

**Mapa de errores de negocio → código [DECISIÓN]:**

| Situación | HTTP | `code` |
|---|---|---|
| Body, header o parámetro inválido | 400 | `VALIDATION_FAILED` (+`invalidParams`) |
| `search_token`, hold o preview inexistente o expirado | 400 | `VALIDATION_FAILED` |
| Vehículo ya no disponible (solapamiento, bloqueo o hold ajeno) | 409 | `CAR_NO_LONGER_AVAILABLE` |
| Precio recalculado ≠ precio de la preview | 409 | `PRICE_CHANGED` |
| Recogida o devolución fuera del horario de la agencia | 409 | `DEPOT_CLOSED` |
| Edad menor al mínimo de la categoría | 409 (o 400 en search) | `DRIVER_AGE_RESTRICTION` |
| Modificar una orden que no está `CONFIRMED` | 409 | `BOOKING_NOT_CONFIRMED` |
| Cancelar una orden ya cancelada o con la recogida ya iniciada | 409 | `CANCELLATION_NOT_ALLOWED` |
| Límite de peticiones | 429 | `RATE_LIMIT_EXCEEDED` |
| `payment_reference` con formato inválido | 400 | `PAYMENT_REFERENCE_INVALID` |
| Pago no autorizado (futuro, dominio de pagos) | 409 | `PAYMENT_NOT_AUTHORIZED` |

**Brechas del enum (status confirmados: 401, 403, 404, 409 de idempotencia):** no hay códigos para 401 (sin token), 403 (sin scope), 404 (orden no encontrada) ni para "Idempotency-Key reutilizada con otro payload". Propuesta temporal: usar `VALIDATION_FAILED` con el `status` HTTP correcto (401/403/404/409) y un `detail` explicativo, porque es el único valor genérico del enum.

---

## 6. Enums consolidados

| Enum | Valores | Ubicación |
|---|---|---|
| Estado de orden | `CONFIRMED`, `CANCELLED`, `PENDING` | `OrderDetail.status` |
| Estado de hold | `HELD`, `FAILED` | `OrderHoldResponse.status` |
| Constantes | `depot_services`, `fuel_policies`, `fuel_types`, `general`, `payment_timings`, `transmission` | `CarConstantsRequest.constants` |
| Eventos webhook | `CAR_ORDER_CONFIRMED`, `CAR_ORDER_CANCELLED`, `DEPOT_UPDATE` | `WebhookSubscription.events` |
| Códigos de error | 10 valores (§5.5) | `ProblemDetails.code` |
| Scopes | `autos:read`, `autos:book`, `autos:cancel`, `autos:webhooks` | `securitySchemes` |

`filters.car_types` y `filters.transmission` son strings **sin enum**. **[DECISIÓN]** Sus valores válidos serán los que publique `/constants` (`transmission`) y los códigos de categoría (`ECONOMY`, `COMPACT`, `SUV`...). Un valor desconocido no genera error: simplemente no devuelve resultados (lector tolerante).

---

## 7. Idempotencia

**[EXPLÍCITO]** `Idempotency-Key` (uuid) es obligatorio en `orders/create`, `orders/{id}/modify` y `orders/{id}/cancel`. **No** lo es en `orders/hold`.

La plantilla trae `IdempotencyKeyGuard`, pero **solo valida el formato**: no evita duplicados. Diseño completo **[DECISIÓN]**:

| Aspecto | Diseño |
|---|---|
| Almacenamiento | Tabla `idempotency_records` (PK compuesta `owner_sub + key + operation`) |
| Huella del request | `request_hash = SHA-256(método + ruta + body JSON canónico)` |
| Ciclo | 1) `INSERT … status=IN_PROGRESS` (la PK impide la carrera) → 2) ejecutar la operación → 3) guardar `response_status` + `response_body`, `status=COMPLETED` |
| TTL | 24 h (`expires_at`); limpieza programada |
| Misma clave + mismo request (completado) | Se **reproduce** la respuesta guardada: mismo status y cuerpo. No se crea una segunda orden |
| Misma clave + mismo request (en curso) | 409 + `Retry-After: 1` |
| Misma clave + request distinto | **409** (confirmado) `VALIDATION_FAILED` "Idempotency-Key reutilizada con otro payload" |
| La operación falla con 4xx de negocio | Se guarda y se reproduce (resultado determinista) |
| La operación falla con 5xx | Se borra el registro para permitir el reintento |
| Alcance | La clave pertenece al `sub` que la usó; otro cliente puede usar el mismo UUID sin colisión |

`hold` no lleva la clave, pero es **naturalmente acotado**: un hold nuevo del mismo `sub` sobre el mismo `vehicle_id` + `search_token` devuelve el hold vigente en lugar de crear otro **[DECISIÓN]**.

---

## 8. Webhooks y callbacks

- `GET /webhooks`, `POST /webhooks` y `DELETE /webhooks/{id}` gestionan suscripciones (scope `autos:webhooks`).
- `POST /webhooks` declara el callback **`carEvent`**: nuestra API hará `POST {$request.body#/url}` con un `WebhookPayload` y espera **200**.
- Eventos suscribibles: `CAR_ORDER_CONFIRMED`, `CAR_ORDER_CANCELLED`, `DEPOT_UPDATE`.

**Observaciones:**

| Tema | Detalle | Propuesta |
|---|---|---|
| `id` requerido en el request | El cliente debe enviar el UUID de la suscripción | **[EXPLÍCITO]** Se exige. Si el `id` ya existe para otro dueño → 409 |
| `secret` | Se envía al crear; el contrato no dice cómo se usa | **[DECISIÓN]** Firmar cada entrega con HMAC-SHA256 del cuerpo usando `secret`. Header **`X-Hub-Signature-256: sha256=<hex>`** (confirmado). El `secret` **no** se devuelve en `GET /webhooks` (es opcional en el schema) |
| Orden modificada | No existe `CAR_ORDER_MODIFIED` en el enum | Se genera como evento interno (outbox), pero **no** se entrega al Hub hasta que el contrato lo incluya |
| Entrega | No se definen reintentos | **[DECISIÓN]** Outbox transaccional + dispatcher con reintentos exponenciales (1 min, 5 min, 30 min, 2 h, 12 h) y registro de cada intento |
| `eventType` | string libre | Se usa el mismo valor del enum (`CAR_ORDER_CONFIRMED`...) |

---

## 9. Semántica inferida del flujo

```
POST /search  ──► search_token (contexto: ruta, fechas, edad, moneda, afiliado)
      │
      ├─► POST /details | /depots | /suppliers | /constants   (contenido estático)
      ▼
POST /orders/hold      (vehicle_id + search_token) ──► hold_id, expires_at   [opcional]
      ▼
POST /orders/preview   (vehicle_id + search_token [+hold_id] + extras) ──► order_preview_id, total
      ▼
[pago en OTRO dominio → payment_reference]
      ▼
POST /orders/create    (Idempotency-Key; order_preview_id + payment_reference + driver_details) ──► 201 OrderDetail
      ▼
GET /orders/{id} · POST /orders/{id}/modify · POST /orders/{id}/cancel
      ▼
Webhooks: CAR_ORDER_CONFIRMED / CAR_ORDER_CANCELLED / DEPOT_UPDATE ──► suscriptores (Hub)
```

**Consecuencias de diseño:**
1. `search_token` **tiene estado** y lo persistimos (`search_sessions`, TTL 30 min), porque hold y preview no reenvían fechas ni ruta.
2. `vehicle_id` es string. **[CONFIRMADO]** Representa un **modelo o categoría comercial** ("Toyota Corolla o similar"). La disponibilidad se calcula por inventario de unidades físicas del modelo en la agencia; la placa se asigna en la entrega.
3. `depot_id` y `supplier_id` son **integer** → PK enteras en esas tablas (a diferencia del resto, que usa UUID como sugiere la plantilla).
4. `LocationPoint` resuelve agencias con esta precedencia: `airport` → `city_id` → `coordinates` (radio configurable, 30 km).
5. La orden se crea como `CONFIRMED` al recibir un `payment_reference` válido. `PENDING` queda reservado para la verificación asíncrona del pago (fase futura).
6. `OrderDetail._links` depende del estado: `CONFIRMED` → `self`, `modify`, `cancel`; `CANCELLED` → `self`.

---

## 10. Dificultades detectadas (sin modificar el contrato)

| # | Qué exige | Por qué es difícil | Cómo lo cumpliremos |
|---|---|---|---|
| D1 | OAuth2 contra `auth.booking-hub.com` (RDA1: self-signed permitido) | El servidor de autorización no existe en RDA1 | Validador de JWT con emisor configurable + emisor local de desarrollo (§3.3) |
| D2 | `ProblemDetails` con `additionalProperties:false` y enum cerrado | Sin códigos para 401/403/404 ni para conflictos de idempotencia | Filtro global; status confirmados (401/403/404/409); `code` = `VALIDATION_FAILED` con title/detail específicos **[DECISIÓN]** |
| D3 | `servers` apuntan al gateway del Hub | "Try it out" de Swagger fallaría | Se sirve el YAML **sin modificar el archivo**; al servirlo se añade en memoria el servidor actual para la demo. Documentado |
| D4 | `POST /webhooks` exige `id` en el body | Poco usual (normalmente lo genera el servidor) | Se cumple tal cual; el cliente envía un UUID |
| D5 | `cancel` 200 sin schema | Ambiguo si devolver cuerpo | **[CONFIRMADO]** 200 con cuerpo vacío |
| D6 | `CarSearchResponse` mínima | Nuestro frontend necesita más datos | El frontend usa la **API interna**; la API de integración devuelve exactamente lo definido |
| D7 | `ValidationPipe` de la plantilla con `forbidNonWhitelisted: true` | Rechaza campos extra; el contrato no prohíbe campos adicionales en requests | **[DECISIÓN]** En integración: `whitelist:true` y `forbidNonWhitelisted:false` (lector tolerante). |
| D8 | `currency` libre (`^[A-Z]{3}$`) | Tarifas en USD (Ecuador) | **[CONFIRMADO]** El DTO acepta cualquier código de 3 letras; USD y EUR como mínimo vía `currency_rates`; código sin tasa → 400 `VALIDATION_FAILED` en `currency` |
| D9 | Sin evento de modificación | EDA incompleto | Evento interno + propuesta al equipo de integración |
| D10 | Contrato reciente y cambiante (último commit 22-09-2026) | Puede cambiar | Commit fijado + test de checksum + revisión periódica del upstream |
