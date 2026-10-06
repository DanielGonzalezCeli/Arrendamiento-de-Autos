# Guía de defensa — RutaLibre (Reto 1: Arrendamiento de vehículos)

Para preparar la presentación: qué revisar antes, en qué orden mostrar la demo, cómo recorrer el código y las preguntas probables con su respuesta. Los criterios C1–C10 son los de la rúbrica ([`ANALISIS_RUBRICA.md`](ANALISIS_RUBRICA.md)).

## 1. Antes de la defensa (30 minutos antes)

- [ ] **Despertar la API**: abrir https://arrendamiento-autos-api.onrender.com/health y esperar `"status":"ok"` (el plan gratuito duerme; la primera vez tarda ~50 s).
- [ ] **Supabase activo**: el proyecto se pausa tras 7 días sin uso. Si `/health` reporta la BD caída, reactivarlo desde el panel de Supabase.
- [ ] Abrir en pestañas:
  - el marketplace: https://arrendamiento-autos-web.onrender.com
  - Swagger: https://arrendamiento-autos-api.onrender.com/autos/v1/docs
  - Redoc: https://arrendamiento-autos-api.onrender.com/autos/v1/redoc
  - GitHub Actions (CI en verde)
  - una URL nueva de https://webhook.site
- [ ] Tener a mano, **sin mostrarlas en pantalla**, las contraseñas de `admin@rutalibre.ec` y `cliente@rutalibre.ec` y el secreto de `booking-hub-demo`. Están en Render → Environment (`SEED_ADMIN_PASSWORD`, `SEED_CUSTOMER_PASSWORD`, `SEED_HUB_CLIENT_SECRET`).
- [ ] Pedir un token para Swagger (válido 1 h):
  ```bash
  curl -X POST https://arrendamiento-autos-api.onrender.com/oauth2/token \
    -d grant_type=client_credentials -d client_id=booking-hub-demo -d client_secret=<SECRETO> \
    -d "scope=autos:read autos:book autos:cancel autos:webhooks"
  ```
- [ ] Tener abierto el proyecto en VS Code con los archivos del recorrido (§3).

## 2. Guion de la demo (≈ 12 minutos)

| # | Criterio | Qué mostrar | Qué decir |
|---|---|---|---|
| 1 | **C1** | Las dos URLs públicas y `/health` | "Frontend estático y API en Docker en Render, PostgreSQL en Supabase. Cada push a `main` pasa por CI y se despliega solo." |
| 2 | **C3** consulta | Portada → buscar en "Guayaquil — todas las agencias" → filtros y orden → detalle con dirección, horario y mapa | "Cada oferta dice exactamente en qué agencia se retira. El precio ya incluye IVA, días con tolerancia de 59 min y recargos." |
| 3 | **C3** venta | Reservar → registro → checkout con cuenta regresiva del hold → agregar GPS (el precio cambia en vivo) → confirmar → localizador | "El hold aparta el auto 15 min para que nadie lo tome mientras paga. Confirmar lleva `Idempotency-Key`: un doble clic no crea dos reservas." |
| 4 | **C3** posventa | Mis reservas → modificar extras → cancelar | "Cancelar es gratis hasta 24 h antes; después se cobra un día." |
| 5 | **C2** + publicación | Admin → Modelos → ocultar un modelo → buscar en la web: ya no aparece → publicarlo de nuevo | "El admin publica la oferta y el marketplace la muestra: la publicación de la rúbrica." |
| 6 | **C2** operación | Admin → Reservas → abrir la reserva → **Registrar entrega** (eligiendo la placa) → **Registrar devolución** → historial | "No es solo CRUD: el cliente reserva un *modelo* y la placa se asigna al entregar el auto, comprobando que esté libre en todo el periodo." |
| 7 | **C2** reglas | Flota → bloqueo de mantenimiento; Catálogo → tarifa que se superpone → error 409 | "Las reglas están en el backend y en la BD: si alguien salta la interfaz, la API responde igual." |
| 8 | **C4 C6 C7** | Swagger: Authorize con el token → `/search` → `/orders/preview` → `/orders/create` (repetirla con la **misma** `Idempotency-Key` → misma respuesta) | "Swagger muestra el contrato oficial, sin generar nada desde nuestro código. La implementación se adapta al contrato, no al revés." |
| 9 | **C8** | Swagger `POST /webhooks` hacia webhook.site → crear una orden → ver `CAR_ORDER_CONFIRMED` con su firma → Admin → Integración → entrega exitosa | "Patrón *transactional outbox*: el evento se guarda en la misma transacción que la reserva y un despachador lo envía firmado con HMAC, con reintentos." |
| 10 | **C5** | Supabase o `docs/BASE_DATOS.md`: tablas, `EXCLUDE`, FK, CHECK | "La BD también defiende la integridad: dos reservas de la misma placa que se cruzan son imposibles por el `EXCLUDE`, aunque haya un error en el código." |
| 11 | **C6** | CI: job de pruebas de contrato y checksum | "Si alguien cambia un byte del contrato, CI falla. Las pruebas de contrato validan cada respuesta real contra el YAML." |
| 12 | **C9** | Carpeta `docs/` y README | Arquitectura, modelo de datos, API interna, guía de integración, SOA/EDA y trazabilidad. |

> **Ojo con el webhook (paso 9):** los eventos de una orden se envían **solo al dueño de la orden**. Una reserva hecha desde la web no llega al webhook del Hub. Para la demo, crear la orden **desde Swagger con el token del Hub**, o editar una agencia en el panel: `DEPOT_UPDATE` se envía a todos los suscriptores.

## 3. Recorrido por el código: crear una orden

Seguir un request de punta a punta es la mejor forma de mostrar dominio del código (C10).

| Paso | Archivo | Qué ocurre |
|---|---|---|
| 1 | [`integration-api/orders.controller.ts`](../backend/src/modules/integration-api/orders.controller.ts) | `IntegrationAuthGuard` valida el JWT RS256 y el scope `autos:book`; `IdempotencyKeyGuard` exige el UUID |
| 2 | [`idempotency/idempotency.service.ts`](../backend/src/modules/idempotency/idempotency.service.ts) | Reclama la clave con `INSERT … ON CONFLICT`. Si ya existía con el mismo cuerpo devuelve la respuesta guardada; con otro cuerpo, 409 |
| 3 | [`orders/reservation.service.ts`](../backend/src/modules/orders/reservation.service.ts) → `create()` | Valida la referencia de pago y el conductor; bloquea la preview (`FOR UPDATE`) para que no se use dos veces |
| 4 | [`availability/availability.service.ts`](../backend/src/modules/availability/availability.service.ts) | `lockVehicleModel` serializa las reservas del mismo modelo; `countAvailableUnits` calcula unidades − reservas que se cruzan − holds − bloqueos, con 60 min de limpieza |
| 5 | [`domain/pricing.ts`](../backend/src/domain/pricing.ts) | Recotiza: días, tarifa vigente, extras con tope, recargo joven y por devolver en otra agencia, IVA. Si la preview venció y el precio cambió → 409 `PRICE_CHANGED` |
| 6 | `reservation.service.ts` | Guarda la reserva con *snapshots* (vehículo, ruta y precio congelados), marca el hold como consumido y escribe el historial |
| 7 | [`events/outbox.service.ts`](../backend/src/modules/events/outbox.service.ts) | Inserta `CAR_ORDER_CONFIRMED` en `outbox_events` **en la misma transacción** |
| 8 | [`events/webhook-dispatcher.service.ts`](../backend/src/modules/events/webhook-dispatcher.service.ts) | Cada 10 s: `FOR UPDATE SKIP LOCKED`, firma HMAC, envía y reintenta (1 m, 5 m, 30 m, 2 h, 12 h) |
| 9 | [`integration-api/mappers`](../backend/src/modules/integration-api/mappers) | Convierte la entidad interna al `OrderDetail` del contrato (`snake_case`, `_links`) |

**Arquitectura en una frase:** monolito modular por capas — controladores delgados → servicios de aplicación → dominio puro (`src/domain`, sin framework, con pruebas unitarias) → PostgreSQL. La web y el Hub comparten los mismos servicios; solo cambian los controladores y los mappers.

## 4. Preguntas probables

**¿Qué significa API-first en su proyecto?**
El contrato `autos-openapi.yaml` existía antes que el código y no se modifica. CI verifica su SHA-256, los DTO se escribieron a partir del YAML, Swagger y Redoc sirven el YAML original y las pruebas de contrato (`jest-openapi`) comprueban que cada respuesta real cumpla el esquema.

**¿Por qué NestJS?**
Era la plantilla oficial del equipo de integración: módulos, inyección de dependencias, guards y pipes de validación encajan con un contrato grande. TypeScript también en el frontend, así que un solo lenguaje en todo el proyecto.

**¿Cómo evitan que dos personas reserven el último auto?**
En tres niveles:
1. El hold aparta el auto durante el pago.
2. Al confirmar, `SELECT … FOR UPDATE` sobre el modelo serializa las transacciones concurrentes, que recalculan la disponibilidad en orden.
3. La BD tiene un `EXCLUDE` que impide dos reservas de la misma placa que se cruzan.

Hay una prueba que lanza dos creaciones en paralelo sobre una sola unidad y exige exactamente un éxito.

**¿Qué es la idempotencia y por qué la necesitan?**
En redes, un timeout no dice si la operación se hizo. Con `Idempotency-Key` el cliente puede reintentar sin miedo: la misma clave y el mismo cuerpo devuelven la misma respuesta, y la misma clave con otro cuerpo da 409. La respuesta se guarda en la misma transacción que la reserva.

**¿Por qué el `vehicle_id` es un modelo y no una placa?**
Así funciona el sector ("Kia Picanto o similar"): el cliente reserva una categoría y modelo, y la placa concreta se asigna al entregar el auto, según la flota disponible.

**¿Qué es el outbox y por qué no envían el webhook directamente?**
Si se enviara dentro de la transacción y luego hubiera rollback, avisaríamos de una reserva inexistente. Si se enviara después del commit y el proceso cayera, el evento se perdería. Guardarlo en la misma transacción garantiza *at least once*; el consumidor deduplica por `eventId`.

**¿Cómo sabe el Hub que el webhook viene de ustedes?**
Por el header `X-Hub-Signature-256`: un HMAC-SHA256 del cuerpo con el secreto de la suscripción. El secreto se muestra una sola vez y se guarda cifrado con AES-256-GCM, porque hace falta en claro para firmar.

**¿Cómo funciona la seguridad entre sistemas?**
OAuth2 *client credentials*: el Hub pide un JWT RS256 con scopes. Cada operación exige su scope (`autos:read`, `autos:book`, `autos:cancel`, `autos:webhooks`). En RDA1 nuestro servicio emite los tokens; en RDA2 se validarán con el JWKS del IdP central sin tocar los controladores.

**¿Por qué dos APIs (`/api` y `/autos/v1`)?**
`/autos/v1` es el contrato público y estable con el Hub. `/api` es la API de nuestro frontend y puede cambiar libremente sin romper al Hub. Por dentro, ambas usan los mismos servicios.

**¿Qué pasa si se cae la URL del webhook?**
La entrega queda `FAILED` y se reintenta tras 1 min, 5 min, 30 min, 2 h y 12 h. Después queda `DEAD` y se ve en el panel, donde se puede reintentar a mano.

**¿Cómo calculan el precio?**
Días = bloques de 24 h con 59 min de tolerancia; tarifa vigente de la categoría y el proveedor; extras por día con tope; +10 USD/día a menores de 25; +40 USD si se devuelve en otra agencia; IVA 15 %. Todo en centavos enteros para no perder precisión, en `src/domain/pricing.ts` con pruebas unitarias.

**¿Qué pruebas tienen?**
- 210 pruebas del backend: dominio, integración con PostgreSQL real, API, contrato y checksum.
- 9 pruebas de frontend (Vitest).
- 7 pruebas E2E con Playwright: flujo de compra, móvil, validaciones y panel.
- Todas corren en GitHub Actions en cada push.

**¿Qué es SOA y qué es EDA en su proyecto?**
- **SOA:** somos un servicio con contrato estándar dentro del ecosistema del Hub (vuelos, alojamiento, pagos…), con bajo acoplamiento y reutilización de servicios.
- **EDA:** publicamos eventos de dominio (`CAR_ORDER_CONFIRMED`, `CAR_ORDER_CANCELLED`, `DEPOT_UPDATE`) que el Hub consume de forma asíncrona, documentados en AsyncAPI.

**¿Por qué no usaron Kafka o microservicios?**
La rúbrica pide un diseño preliminar de eventos, y el contrato define webhooks. Un broker añadiría infraestructura que no se puede justificar en este alcance. El outbox deja el punto de extensión listo: el despachador podría publicar en un broker sin cambiar los servicios.

**¿Qué hacen con los datos personales y los secretos?**
- Contraseñas con bcrypt.
- Ningún secreto en el repositorio: solo variables de entorno en Render.
- Los secretos de webhooks se guardan cifrados.
- Un cliente solo ve sus reservas (404 si no es suyo).
- Protección anti-SSRF en las URLs de webhook.

**¿Qué mejorarían?**
- Pago real con el Payment API del Hub (hoy es simulado).
- Correos de confirmación.
- IdP central (RDA2).
- Emitir la modificación de órdenes como evento cuando el contrato lo incluya.
- Monitoreo con alertas.

## 5. Dónde está cada cosa

| Tema | Documento |
|---|---|
| Arquitectura | [`ARQUITECTURA.md`](ARQUITECTURA.md) |
| Modelo de datos | [`BASE_DATOS.md`](BASE_DATOS.md) |
| Reglas de negocio (RN01–RN31) | [`REGLAS_NEGOCIO.md`](REGLAS_NEGOCIO.md) |
| Contrato analizado | [`ANALISIS_CONTRATO.md`](ANALISIS_CONTRATO.md) |
| Guía para el Hub | [`CONTRATO_INTEGRACION.md`](CONTRATO_INTEGRACION.md) |
| API interna | [`API_INTERNA.md`](API_INTERNA.md) |
| SOA y eventos | [`SOA_EDA.md`](SOA_EDA.md) + [`contracts/autos-events.asyncapi.yaml`](../contracts/autos-events.asyncapi.yaml) |
| Despliegue | [`DEPLOYMENT.md`](DEPLOYMENT.md) |
| Pruebas | [`ESTRATEGIA_TESTING.md`](ESTRATEGIA_TESTING.md) |
| Rúbrica → evidencia | [`MATRIZ_TRAZABILIDAD.md`](MATRIZ_TRAZABILIDAD.md) |
