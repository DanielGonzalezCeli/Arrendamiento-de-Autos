# Reto 2: migración a microservicios

Documento vivo: se actualiza al cerrar cada fase.

## 1. Estrategia: Strangler Fig

No se reescribe el sistema de golpe. Se pone un **API Gateway** delante del monolito y los servicios se van sacando uno por uno; el gateway decide a qué servicio va cada ruta. En cada paso Booking y la web siguen funcionando con la misma URL.

| Fase | Contenido | Estado |
|---|---|---|
| A | API Gateway delante del monolito (que pasa a ser `ms-reservas`) | Hecha (local, CI y Azure) |
| B | `ms-identidad` (usuarios, login, roles, JWT RS256 + JWKS) | Hecha (local, CI y Azure) |
| C | `ms-clientes` (clientes cross-platform, contrato v3.1) | Hecha (local, CI y Azure) |
| D | RabbitMQ + `ms-inventario` (stock hacia Booking a partir de eventos de flota) | Hecha (local, CI y Azure) |
| E | Métricas Prometheus, página de observabilidad, rutas internas cerradas y restricciones de acceso | Hecha en local y CI; las restricciones ya están en Azure |
| F | Documento técnico final y guía de defensa | Pendiente |

## 2. Arquitectura actual (fase D)

```
Booking (Paúl) ─┐                         /api/auth/*, /api/admin/users/*
Web / panel  ───┼─► API Gateway ──────────────────────────────► ms-identidad ──► PostgreSQL, schema "identidad"
                │    (gateway/)                                   (ms-identidad/)      (tabla users)
                │                                                  ▲        │
                │                           JWKS + estado de cuenta│        │ historial de usuarios
                │                                                  │        ▼ (token del admin)
                │                 todo lo demás                    │
                ├────────────────────────────────────────────► ms-reservas ──► PostgreSQL, schema "public"
                │                                                (backend/)     (reservas, flota, catálogo…)
                │                                                  │ ├─HTTP──────► Booking (check-in)
                │                                                  │ └─evento flota.*─► RabbitMQ ─► ms-inventario ─HTTP/gRPC─► Booking (stock)
                │                                                  │                  (CloudAMQP)   (schema "inventario")
                │                                                  │ cliente de la reserva / búsqueda del mostrador
                │                                                  ▼ (X-API-Key de Booking o token del admin)
                │                 /api/v3/clientes
                └────────────────────────────────────────────► ms-clientes ──► PostgreSQL, schema "clientes"
                                                                 (ms-clientes/)  (tabla clients)
```

Los cuatro servicios usan la misma instancia de PostgreSQL (Supabase), pero cada uno tiene su **schema** y ninguno lee las tablas de otro: los datos de otro servicio se piden por API. Entre schemas no hay claves foráneas; `reservations.user_id`, `depot_reviews.user_id`, `vehicle_blocks.created_by` y `media_images.uploaded_by` quedan como referencias lógicas al id del usuario, y `reservations.client_id` al del cliente.

## 3. API Gateway (`gateway/`)

NestJS 10 + `http-proxy-middleware`. No tiene base de datos ni secretos.

| Responsabilidad | Cómo |
|---|---|
| Punto de entrada único | Toda petición pública pasa por el gateway. La tabla `src/routes.ts` asigna prefijo → servicio (gana el más largo): `/api/auth` y `/api/admin/users` → `ms-identidad`; `/api/v3/clientes` → `ms-clientes`; el resto → `ms-reservas` |
| Trazabilidad | Respeta el `X-Correlation-Id` entrante o genera `cid-gw-xxxxxxxx`; lo reenvía al servicio y lo devuelve. Los servicios lo propagan en sus llamadas entre sí, así que el mismo `cid` aparece en los logs de los tres |
| Límite de peticiones | 300 por minuto y por IP del cliente (`RATE_LIMIT_PER_MINUTE`), con cabeceras `RateLimit`; al pasarse responde 429 `RATE_LIMITED` |
| IP real del cliente | Solo confía en `X-Forwarded-For` hasta `TRUST_PROXY_HOPS` saltos (el front-end de Azure). Reenvía al servicio esa IP limpia, y el servicio la lee con su propio `TRUST_PROXY_HOPS` |
| Errores uniformes | Servicio caído → 502 `UPSTREAM_UNAVAILABLE`; servicio lento → 504 `UPSTREAM_TIMEOUT`. Mismo formato Problem Details del contrato v3 |
| Salud agregada | `GET /gateway/health` consulta el `/health` de cada servicio: 200 `HEALTHY` o 503 `DEGRADED` con el detalle por servicio |
| Logs estructurados | JSON con hora ISO, `cid`, servicio de destino, estado y tiempo de respuesta. No registra `Authorization`, cookies ni `X-API-Key` |
| Cuerpo intacto | El gateway no lee ni transforma el cuerpo (`bodyParser: false`); la validación y la autenticación (`X-API-Key`, JWT) siguen en cada servicio |

**Por qué el gateway no valida el JWT:** cada servicio verifica el token por su cuenta con la clave pública de `ms-identidad` (defensa en profundidad: un servicio no confía en que otro ya validó). El gateway queda sin claves ni secretos.

## 4. ms-identidad (`ms-identidad/`)

NestJS 10 + TypeORM. Dueño único de los usuarios.

| Ruta | Quién la usa | Qué hace |
|---|---|---|
| `POST /api/auth/register` | Web | Crea un CLIENTE (RN27: el rol enviado se ignora) y devuelve el token |
| `POST /api/auth/login` | Web | Token RS256; mismo 401 para correo inexistente, clave incorrecta o cuenta inactiva. Límite: 10 intentos/min por IP |
| `GET /api/auth/me` | Web y **ms-reservas** | Datos de la cuenta; 401 si está desactivada |
| `GET/POST/PATCH/DELETE /api/admin/users…` | Panel (solo ADMIN) | Alta, edición, cambio de rol, desactivación, contraseña y borrado |
| `GET /.well-known/jwks.json` | **ms-reservas** | Clave pública (RFC 7517) para verificar los tokens |
| `GET /health` | Gateway y Azure | 200 si la BD responde |

Las rutas y respuestas son las mismas que tenía el monolito, así que el frontend no cambió.

### Contratos entre servicios

| Llamada | Para qué | Autenticación | Si el otro servicio no responde |
|---|---|---|---|
| ms-reservas → `GET ms-identidad/.well-known/jwks.json` | Verificar la firma de los tokens | Pública (es una clave pública); `jose` la guarda en caché | Se sigue usando la clave en caché |
| ms-reservas → `GET ms-identidad/api/auth/me` | En cada petición autenticada: ¿la cuenta sigue activa? ¿qué rol tiene **ahora**? | El mismo token del usuario | Se usan los datos del token (firmado, expira en 2 h) para no dejar fuera a quien ya inició sesión |
| ms-identidad → `GET ms-reservas/api/admin/user-usage` | Reservas, reseñas y bloqueos por usuario: columna "Reservas" del panel y regla "no eliminar cuentas con historial" | Se propaga el token del admin (ms-reservas exige rol ADMIN) | La lista sale con reservas = `null` ("—" en la web); el borrado responde 503 (no se elimina sin poder comprobar el historial) |

Todas llevan `X-Correlation-Id`. Son llamadas directas entre servicios (no pasan por el gateway) y tienen timeout (3 s y 5 s).

### Seguridad

- **RS256 en lugar de HS256:** solo `ms-identidad` tiene la clave privada (`IDENTITY_JWT_PRIVATE_KEY`, solo en la configuración de Azure). Los demás servicios verifican con la pública: ninguno puede emitir tokens ni necesita compartir un secreto.
- `ms-reservas` acepta solo `alg: RS256`, emisor `rutalibre-identidad` y audiencia `rutalibre-internal-api`. Los tokens HS256 del monolito anterior (aunque usen el mismo secreto) se rechazan.
- Contraseñas con bcrypt (costo 12). Al migrar se movieron los hashes tal cual: nadie tuvo que cambiar su clave.
- Desactivar una cuenta o quitarle el rol de ADMIN aplica en la siguiente petición, en los dos servicios.
- Debe quedar al menos un administrador activo; un admin no puede quitarse el rol, desactivarse ni eliminarse.

### Migración de datos

`src/database/prepare-db.ts` corre antes de arrancar el servicio: crea el schema `identidad`, aplica las migraciones (su historial vive en `identidad.migrations`) y crea los usuarios de demostración que falten.

La migración `IdentitySchema` **mueve** `public.users` a `identidad.users` (`ALTER TABLE … SET SCHEMA`) en una transacción: conserva ids, hashes, índices y restricciones. Mientras termina el despliegue deja una vista `public.users` (con los valores por defecto) para la versión anterior de `ms-reservas`. La migración `UsersToIdentityService` de `ms-reservas` borra esa vista y las claves foráneas hacia `users`.

El orden de producción (identidad → reservas) se ensayó sobre una base temporal con el estado actual de producción. Usuarios y claves foráneas antes, durante y después:

| Momento | Usuarios | Claves foráneas hacia `users` |
|---|---|---|
| Antes | en `public` | 4 |
| Tras desplegar `ms-identidad` | todos en `identidad`; el registro por la vista funciona | 4 |
| Tras desplegar `ms-reservas` | todos en `identidad`; la vista ya no existe | 0 |

## 5. ms-clientes (`ms-clientes/`)

NestJS 10 + TypeORM. Dueño único de los clientes cross-platform del contrato v3.1 (identificación y correo canónico únicos: un mismo conductor nunca se duplica entre Booking, la web y el mostrador).

| Ruta | Quién la usa | Autenticación |
|---|---|---|
| `GET /api/v3/clientes?email=…&identificacion=…` | Booking (por el gateway) | `X-API-Key` |
| `POST /api/v3/clientes` | Booking | `X-API-Key`; 201 si es nuevo, 200 con el mismo `client_id` si ya existía |
| `GET /internal/clientes/{id}`, `POST /internal/clientes` | ms-reservas al crear una reserva de Booking | La `X-API-Key` de Booking, reenviada por ms-reservas |
| `GET /internal/clientes?identificacion=…` | ms-reservas en el panel y el mostrador | El token del administrador, reenviado (ms-clientes lo verifica con el JWKS de ms-identidad y exige rol ADMIN) |
| `GET /health` | Gateway y Azure | — |

Las rutas y respuestas de `/api/v3/clientes` son las mismas que tenía el monolito: Booking no tuvo que cambiar nada. `/internal/*` no se publica en el gateway.

| Llamada | Si ms-clientes no responde |
|---|---|
| ms-reservas → crear/buscar el cliente de una reserva de Booking | La reserva se crea igual, sin `client_id` (la Saga de Booking no depende de ms-clientes) |
| ms-reservas → búsqueda por cédula en el mostrador | Se busca solo por localizador, correo, apellido y licencia |
| ms-reservas → detalle de la reserva en el panel | La reserva se muestra sin los datos del cliente |

La migración `ClientsSchema` mueve `public.clients` a `clientes.clients` (conserva los `client_id` que Booking ya guardó) y deja una vista de transición; `ClientsToClientsService` de ms-reservas quita la vista y la clave foránea `reservations.client_id`. Se ensayó con el estado actual de producción, incluido el `INSERT … ON CONFLICT` de la versión anterior a través de la vista.

## 6. Fase D: RabbitMQ y ms-inventario (`ms-inventario/`)

Antes, ms-reservas calculaba el estado de cada auto **y** le enviaba el stock a Booking. Ahora solo publica eventos; el envío es de ms-inventario. Entre los dos no hay ninguna llamada síncrona.

| Evento (routing key) | Cuándo lo publica ms-reservas | Contenido |
|---|---|---|
| `flota.estado_cambiado` | Al reservar o cancelar por Booking, solo ese auto (con el `X-Correlation-Id` de la operación) | `data.vehicles[]`: `vehicle_id`, `state` (6 estados del contrato v3), `available_units` (0/1), `date`, `time_slot` |
| `flota.snapshot` | Cada 30 s (`FLEET_SNAPSHOT_INTERVAL_MS`) y con el botón "Sincronizar stock ahora" | Lo mismo para toda la flota. Cubre reservas web, entregas, devoluciones, fin del cooldown y taller, y repara cualquier evento perdido |

Sobre de **CloudEvents 1.0** (`specversion`, `id`, `type` = `ec.rutalibre.flota.*`, `source` = `ms-reservas`, `time`, `correlationid`), mensajes persistentes y con confirmación del broker.

**Topología** (la declara ms-inventario, idempotente):

```
exchange rutalibre.eventos (topic, durable) ──flota.*──► cola ms-inventario.flota (durable, prefetch 1, ack manual)
                                                                │ mensaje inválido (no es JSON, tipo desconocido, datos mal formados)
                                                                ▼
                             exchange rutalibre.eventos.dlx ──► cola ms-inventario.flota.dlq (para revisarlos a mano)
```

**ms-inventario** compara cada evento con lo último que Booking confirmó (`inventario.stock_sync_state`) y solo envía los cambios, por gRPC (`inventory.proto`) o HTTP, con la misma lógica de antes: timestamps crecientes, `STALE_TIMESTAMP_IGNORED` cuenta como confirmado y cada envío queda en `inventario.stock_sync_log`. Un evento más viejo que el último aplicado a ese auto se ignora (`last_event_at`): el orden de llegada no se garantiza.

| Falla | Qué pasa |
|---|---|
| ms-inventario caído | Las reservas siguen funcionando; los eventos esperan en la cola durable y se procesan al volver |
| RabbitMQ caído | ms-reservas no puede publicar (lo registra) y reintenta conectarse cada 5 s; el siguiente snapshot repone el estado |
| Booking rechaza o no responde | Queda registrado (panel /admin/booking) y el siguiente snapshot lo reintenta |
| Mensaje mal formado | Va a la cola de mensajes muertos, no bloquea la cola |

**API interna** `GET /internal/stock` (token de ADMIN reenviado por ms-reservas): modo, destino, estado y últimos envíos, para el panel. No se publica en el gateway, que solo consulta su `/health` para la salud agregada.

La migración `InventorySchema` mueve `stock_sync_state` y `stock_sync_log` al schema `inventario` (conserva el último estado confirmado y su timestamp, así el primer snapshot no reenvía toda la flota) y deja vistas de transición; `StockToInventoryService` de ms-reservas las elimina. Ensayada con el estado de producción, incluidas las escrituras de la versión anterior a través de las vistas.

## 7. Fase E: observabilidad y seguridad

### Métricas (Prometheus)

Cada servicio expone `GET /metrics` (formato de texto de Prometheus, librería `prom-client`) y todas sus series llevan `service="<nombre>"`:

| Métrica | Servicio | Para qué |
|---|---|---|
| `http_requests_total{method,route,status}` y `http_request_duration_seconds` (histograma) | los 4 microservicios | Tráfico, errores y latencia por ruta. La ruta es la **plantilla** (`/api/v3/orders/:orderId/cancel`), no la URL concreta, para que no crezca el número de series |
| `gateway_requests_total{upstream,status}`, `gateway_request_duration_seconds` | gateway | Tráfico por microservicio de destino, visto por el cliente |
| `gateway_upstream_errors_total{upstream,type}`, `gateway_rate_limited_total` | gateway | Microservicio caído o lento (502/504) y rechazos 429 |
| `fleet_events_published_total{routing_key,result}`, `rabbitmq_connected` | ms-reservas | Eventos publicados en RabbitMQ (ok, sin conexión, error) |
| `fleet_events_consumed_total{routing_key,result}`, `booking_stock_push_total{transport,result}`, `rabbitmq_connected` | ms-inventario | Eventos procesados (ok, inválido → DLQ, error → reintento) y envíos de stock a Booking (confirmado, fallido) |
| `auth_logins_total{result}` | ms-identidad | Inicios de sesión correctos y rechazados (detección de fuerza bruta) |
| `clients_registrations_total{source,result}` | ms-clientes | Altas de clientes: creados o ya existentes (deduplicación) |
| `process_*`, `nodejs_*` | todos | Memoria, CPU, event loop y hora de arranque |

`/metrics` **no se publica**: el gateway responde 404 a `/metrics` y a `/internal/*`. Las métricas se leen a través del gateway, solo con el token de un ADMIN (verificado con el JWKS de ms-identidad, sin secretos en el gateway):
- `GET /gateway/metrics`: las del gateway;
- `GET /gateway/metrics/{servicio}`: las de ese microservicio.

Un Prometheus puede leerlas con el token como `bearer_token`. Para la defensa, el panel tiene la página **Admin → Observabilidad**: estado y latencia de cada servicio, peticiones, errores 5xx, latencia p95, memoria y tiempo activo, más los eventos de RabbitMQ, los envíos a Booking, los logins y las altas de clientes. Se actualiza cada 10 s.

### Logs y traza

Los tres pilares de la observabilidad quedan cubiertos: **métricas** (arriba), **logs** JSON con hora ISO, servicio y `cid` (sin `Authorization`, cookies ni `X-API-Key`), y **traza**: el `X-Correlation-Id` que pone el gateway (o Booking) viaja en cada llamada entre servicios y en los eventos de RabbitMQ (`correlationid` del CloudEvent), así que una reserva de Booking se puede seguir en los logs del gateway, ms-reservas, ms-clientes y ms-inventario, y en el aviso de stock que llega a Booking.

### Seguridad: solo el gateway es público

Los cuatro microservicios tienen **restricciones de acceso de Azure**: solo aceptan tráfico de las IPs de salida del plan B1 (el gateway y ellos mismos entre sí); cualquier otra IP recibe **403**. El sitio de despliegue (SCM) no usa esas reglas, para que GitHub Actions pueda publicar. El CI ya no consulta el `/health` de cada microservicio directamente: lo verifica en la salud agregada del gateway.

| Capa | Control |
|---|---|
| Red | Solo el gateway es accesible desde Internet; los microservicios, solo desde el plan (403 para el resto) |
| Gateway | Límite de 300 peticiones/min por IP, `/internal/*` y `/metrics` cerrados (404), métricas solo para ADMIN, CORS de `/gateway/*` solo para la web, sin secretos |
| Identidad | JWT RS256 (solo ms-identidad tiene la clave privada), JWKS público, rechazo de HS256, 10 intentos de login/min por IP, bcrypt costo 12 |
| Entre servicios | Se reenvía la credencial de quien originó la operación (token del usuario o X-API-Key de Booking); cada servicio la vuelve a validar |
| Booking | `X-API-Key` comparada en tiempo constante, idempotencia por `Idempotency-Key` |
| Datos | Un schema por servicio; ningún servicio lee las tablas de otro; secretos solo en la configuración de Azure |
| Cabeceras | `helmet` en todos los servicios; errores en Problem Details sin trazas internas |

## 8. Pruebas

| Proyecto | Pruebas | Qué cubren |
|---|---|---|
| `gateway/` | 20 | Reenvío, correlación, IP real, 502/504, salud agregada, 429, tablas de rutas reales de las fases B y C, enrutamiento a dos servicios, y fase E: `/internal/*` y `/metrics` cerrados, `/gateway/metrics` solo ADMIN (401/403/200), métricas de un microservicio a través del gateway, CORS solo para la web |
| `ms-identidad/` | 20 (con BD) | Registro, reglas de correo/nombre/teléfono, Gmail, login, límite de 10 intentos/min por IP, JWKS y verificación RS256, rechazo de HS256, gestión de usuarios, llamada a ms-reservas (token y `cid` propagados; degradación si no responde), cambios de estado y rol al instante, schema `identidad` |
| `ms-clientes/` | 7 (con BD) | Contrato v3.1 (consulta, alta sin duplicados, 422 con el formato v3), correlation id, X-API-Key frente a tokens, API interna con la clave reenviada o un token de ADMIN (cliente → 403), schema `clientes` |
| `ms-inventario/` | 15 (con BD; 1 con RabbitMQ real en CI) | Reglas del envío (cambios, franja, timestamps, REST con los campos exactos), validación de eventos (→ cola de muertos), snapshot sin reenvíos, reserva con fecha de retiro y cid, evento fuera de orden ignorado, Booking caído y reintento, API interna solo ADMIN, y de punta a punta con RabbitMQ: evento publicado → Booking simulado recibe el stock; mensaje inválido → DLQ |
| `backend/` (ms-reservas) | 317 | Todo lo anterior del monolito, más: tokens RS256 de ms-identidad (válido, alterado, expirado, otro emisor, HS256 heredado), rol del token y del estado actual, llamada a ms-identidad con un servidor falso (rol actual, cuenta desactivada, servicio caído), `/api/admin/user-usage`, vínculo reserva ↔ cliente con un ms-clientes falso (clave y cid reenviados; ms-clientes caído → la reserva se crea igual), y eventos de flota: snapshot al arrancar, `flota.estado_cambiado` al reservar y al cancelar (con el cid de la reserva), panel con un ms-inventario falso (y sin él) |
| `e2e/` (Playwright) | 9 | La web entra por el gateway: registro y login en ms-identidad, compra y panel en ms-reservas; el flujo de Booking entre servicios: alta del cliente en ms-clientes y reserva vinculada en ms-reservas, con el mismo correlation id; y en CI, con RabbitMQ: reserva de Booking → evento → ms-inventario → Booking simulado recibe 0 unidades con la fecha y hora de retiro |

Cada microservicio prueba también su `/metrics` (plantilla de ruta, métricas de negocio); el E2E recorre la página de Observabilidad con los cinco servicios.

Los tests de `ms-reservas` no levantan ms-identidad: `test/setup-env.ts` genera un par de claves RSA por archivo y `test/identity-tokens.ts` firma tokens iguales a los de ms-identidad.

## 9. Variables

| Servicio | Variable | Local | Azure |
|---|---|---|---|
| gateway | `MS_RESERVAS_URL` | `http://localhost:3001` | URL de `rutalibre-ms-reservas` |
| gateway | `MS_IDENTIDAD_URL` | `http://localhost:3002` | URL de `rutalibre-ms-identidad` |
| gateway | `TRUST_PROXY_HOPS` | `0` | `1` |
| gateway | `MS_CLIENTES_URL` | `http://localhost:3003` | URL de `rutalibre-ms-clientes` |
| ms-reservas | `IDENTITY_URL` | `http://localhost:3002` | URL de `rutalibre-ms-identidad` |
| ms-reservas | `CLIENTS_URL` | `http://localhost:3003` | URL de `rutalibre-ms-clientes` |
| ms-reservas | `AMQP_URL` | vacía (eventos en memoria) | URL de CloudAMQP (secreta) |
| ms-reservas | `INVENTORY_URL` | `http://localhost:3004` | URL de `rutalibre-ms-inventario` |
| gateway | `MS_INVENTARIO_URL` | `http://localhost:3004` | URL de `rutalibre-ms-inventario` (salud y métricas) |
| gateway | `CORS_ORIGINS` | `http://localhost:5173` | URL de la web (solo para `/gateway/*`) |
| ms-reservas | `TRUST_PROXY_HOPS` | `0` directo, `1` detrás del gateway | `2` (front-end de Azure + gateway) |
| ms-reservas | `PUBLIC_BASE_URL` | URL del gateway | URL del gateway (los enlaces HATEOAS apuntan a la entrada pública) |
| ms-identidad | `DATABASE_URL` | la misma BD local | la misma de Supabase (usa solo el schema `identidad`) |
| ms-identidad | `IDENTITY_JWT_PRIVATE_KEY` | vacía (clave efímera) | clave RSA 2048 (secreta) |
| ms-identidad | `MS_RESERVAS_URL` | `http://localhost:3001` | URL de `rutalibre-ms-reservas` |
| ms-identidad | `TRUST_PROXY_HOPS` | `1` detrás del gateway | `2` |
| ms-identidad | `CORS_ORIGINS` | `http://localhost:5173` | la URL de la web (igual que ms-reservas) |
| ms-clientes | `DATABASE_URL` | la misma BD local | la misma de Supabase (usa solo el schema `clientes`) |
| ms-clientes | `BOOKING_API_KEY` | vacía (abierto en desarrollo) | la misma de ms-reservas (secreta) |
| ms-clientes | `IDENTITY_URL` | `http://localhost:3002` | URL de `rutalibre-ms-identidad` |
| ms-clientes | `TRUST_PROXY_HOPS` | `1` detrás del gateway | `2` |
| ms-inventario | `AMQP_URL` | CloudAMQP o vacía | URL de CloudAMQP (secreta) |
| ms-inventario | `STOCK_SYNC_MODE`, `BOOKING_API_KEY` | `off` | `http` y la misma clave de Booking (secreta) |
| ms-inventario | `DATABASE_URL`, `IDENTITY_URL` | locales | la misma de Supabase (schema `inventario`); URL de `rutalibre-ms-identidad` |
