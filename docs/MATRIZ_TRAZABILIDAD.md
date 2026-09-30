# Matriz de trazabilidad

`Rúbrica → Requisito → Contrato → Componente → Endpoint → Prueba → Evidencia`

Documento **vivo**: se actualiza al cerrar cada fase (la columna Estado).

## 1. Operaciones del contrato (C4, C6, C7)

| Rúbrica | Requisito | Contrato | Componente | Endpoint | Prueba | Evidencia | Estado |
|---|---|---|---|---|---|---|---|
| C4 C6 C3 | Buscar disponibilidad | `CarSearchRequest/Response`, `X-Affiliate-Id` | `AutosSearchController` → `SearchService` → `AvailabilityService`, `PricingService` | `POST /autos/v1/search` | contract `search.spec`, unit pricing/availability | Swagger try-out + resultados en la web | Pendiente |
| C4 C7 | Listar agencias | `DepotsRequest/Response` | `AutosDepotsController` → `DepotService` → `DepotMapper` | `POST /autos/v1/depots` | contract `depots.spec` | Swagger | Pendiente |
| C4 C7 | Puntuaciones de agencias | `DepotScores*` | → `ReviewService` | `POST /autos/v1/depots/reviews/scores` | contract | Swagger | Pendiente |
| C4 C7 | Detalles de vehículos | `CarDetails*` | → `VehicleService` → `VehicleMapper` | `POST /autos/v1/details` | contract | Swagger | Pendiente |
| C4 C7 | Proveedores | `Suppliers*` | → `SupplierService` | `POST /autos/v1/suppliers` | contract | Swagger | Pendiente |
| C4 C7 | Constantes | `CarConstants*` | → `ConstantsService` | `POST /autos/v1/constants` | contract | Swagger | Pendiente |
| C4 C6 C3 | Bloqueo temporal | `OrderHold*`, `autos:book`, 409 | `AutosOrdersController` → `HoldService` | `POST /autos/v1/orders/hold` | contract + integración (concurrencia) | Swagger + 409 en vivo | Pendiente |
| C4 C6 C3 | Resumen de precio | `OrderPreview*`, `autos:read` | → `OrderPreviewService` → `PricingService` | `POST /autos/v1/orders/preview` | contract + unit | Swagger + checkout web | Pendiente |
| C4 C6 C3 C5 | Crear reserva sin duplicados | `OrderCreateRequest`, `OrderDetail`, `Idempotency-Key`, 201/409 | → `IdempotencyInterceptor` → `ReservationService` → outbox | `POST /autos/v1/orders/create` | contract + integración (idempotencia, concurrencia, EXCLUDE) | Doble envío = 1 reserva | Pendiente |
| C4 C3 | Consultar orden | `OrderDetail`, 404 | → `ReservationService.getForOwner` → `OrderMapper` (+`_links`) | `GET /autos/v1/orders/{orderId}` | contract + API (ownership) | Swagger | Pendiente |
| C4 C3 | Modificar orden | `OrderModifyRequest`, 409 | → `ReservationService.modify` | `POST /autos/v1/orders/{id}/modify` | contract + unit | Swagger + web | Pendiente |
| C4 C3 C8 | Cancelar orden | `autos:cancel`, 409 | → `ReservationService.cancel` → outbox | `POST /autos/v1/orders/{id}/cancel` | contract + unit (política) | Webhook `CAR_ORDER_CANCELLED` | Pendiente |
| C4 C8 | Suscripciones webhook | `WebhookSubscription`, `autos:webhooks` | `WebhooksController` → `WebhookSubscriptionService` | `GET/POST /autos/v1/webhooks`, `DELETE /autos/v1/webhooks/{id}` | contract | Swagger | Pendiente |
| C8 | Entrega de eventos | callback `carEvent`, `WebhookPayload` | `OutboxService` → `WebhookDispatcher` | (saliente) | integración (firma, reintentos) | webhook.site en vivo | Pendiente |

## 2. Requisitos no ligados a un path

| Rúbrica | Requisito | Componente | Prueba | Evidencia | Estado |
|---|---|---|---|---|---|
| C2 C3 | Autenticación web y roles | `AuthModule` (`/api/auth/*`), `UserJwtGuard`, `RolesGuard` | e2e-api/auth, unit/auth/roles.guard | `/api/docs` | Hecho ✔ |
| C5 C6 | Reglas de dominio (precio, días, horario, edad, cancelación) | `src/domain/*` | unit/domain (28 casos) | Tests | Hecho ✔ |
| C5 | Disponibilidad por inventario | `AvailabilityService` | integration/availability (11 casos) | Tests | Hecho ✔ |

**Tabla general:**

| Rúbrica | Requisito | Componente | Prueba | Evidencia | Estado |
|---|---|---|---|---|---|
| C6 | Contrato inalterado | `contracts/autos-openapi.yaml` + `UPSTREAM.md` | test de checksum | CI verde | Copiado ✔ |
| C4 | Docs públicas desde el contrato | `DocsModule` (Swagger UI + Redoc desde el YAML) | API: `/autos/v1/docs` 200 | URL pública | Pendiente |
| C6 C4 | Errores estándar | `ProblemDetailsFilter` | e2e-api/auth (400/401/409, solo campos permitidos) | Swagger | Hecho (filtro global) ✔ |
| C6 | Seguridad entre sistemas | `OAuth2Guard`, `ScopesGuard`, emisor local | API: 401/403 | Token → llamada | Pendiente |
| C2 | CRUD de administración | `internal-api/admin/*` + frontend `/admin` | API + E2E | Demo | Pendiente |
| C2 | Gestión operativa | `RentalOperationsService`, `vehicle_blocks` | unit + E2E | Demo | Pendiente |
| C3 | Publicación → marketplace | `vehicles.published` + búsqueda | E2E | Demo | Pendiente |
| C3 | Flujo de venta web | `internal-api/checkout` (reutiliza servicios) | E2E Playwright | Demo | Pendiente |
| C5 | Integridad | migración `InitialSchema`, EXCLUDE (placa y tarifas), FK, CHECK, seed | integration/schema-alignment, integration/availability | ER + 409 | Hecho ✔ |
| C1 | Despliegue | Render (API + web) + Supabase | smoke `/health` | URLs en README | Esqueleto desplegado ✔ |
| C8 | Catálogo de eventos | `autos-events.asyncapi.yaml` | lint AsyncAPI | Documento | Pendiente |
| C9 | Documentación | `docs/*` | — | Carpeta docs | Análisis ✔ |
| C10 | Defensa | `GUIA_DEFENSA.md` | ensayo | — | Pendiente |
