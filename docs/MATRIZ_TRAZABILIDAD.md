# Matriz de trazabilidad

`Rúbrica → Requisito → Contrato → Componente → Endpoint → Prueba → Evidencia`

Documento **vivo**: se actualiza al cerrar cada fase (la columna Estado).

## 1. Operaciones del contrato (C4, C6, C7)

| Rúbrica | Requisito | Contrato | Componente | Endpoint | Prueba | Evidencia | Estado |
|---|---|---|---|---|---|---|---|
| C4 C6 C3 | Buscar disponibilidad | `CarSearchRequest/Response`, `X-Affiliate-Id` | `AutosSearchController` → `SearchService` → `AvailabilityService`, `PricingService` | `POST /autos/v1/search` | contract `search.spec`, unit pricing/availability | Swagger try-out + resultados en la web | Hecho ✔ (contract/catalog) |
| C4 C7 | Listar agencias | `DepotsRequest/Response` | `AutosDepotsController` → `DepotService` → `DepotMapper` | `POST /autos/v1/depots` | contract `depots.spec` | Swagger | Hecho ✔ (contract/catalog) |
| C4 C7 | Puntuaciones de agencias | `DepotScores*` | → `ReviewService` | `POST /autos/v1/depots/reviews/scores` | contract | Swagger | Hecho ✔ (contract/catalog) |
| C4 C7 | Detalles de vehículos | `CarDetails*` | → `VehicleService` → `VehicleMapper` | `POST /autos/v1/details` | contract | Swagger | Hecho ✔ (contract/catalog) |
| C4 C7 | Proveedores | `Suppliers*` | → `SupplierService` | `POST /autos/v1/suppliers` | contract | Swagger | Hecho ✔ (contract/catalog) |
| C4 C7 | Constantes | `CarConstants*` | → `ConstantsService` | `POST /autos/v1/constants` | contract | Swagger | Hecho ✔ (contract/catalog) |
| C4 C6 C3 | Bloqueo temporal | `OrderHold*`, `autos:book`, 409 | `AutosOrdersController` → `HoldService` | `POST /autos/v1/orders/hold` | contract + integración (concurrencia) | Swagger + 409 en vivo | Hecho ✔ (contract/orders) |
| C4 C6 C3 | Resumen de precio | `OrderPreview*`, `autos:read` | → `OrderPreviewService` → `PricingService` | `POST /autos/v1/orders/preview` | contract + unit | Swagger + checkout web | Hecho ✔ (contract/orders) |
| C4 C6 C3 C5 | Crear reserva sin duplicados | `OrderCreateRequest`, `OrderDetail`, `Idempotency-Key`, 201/409 | → `IdempotencyInterceptor` → `ReservationService` → outbox | `POST /autos/v1/orders/create` | contract + integración (idempotencia, concurrencia, EXCLUDE) | Doble envío = 1 reserva | Hecho ✔ (contract/orders) |
| C4 C3 | Consultar orden | `OrderDetail`, 404 | → `ReservationService.getForOwner` → `OrderMapper` (+`_links`) | `GET /autos/v1/orders/{orderId}` | contract + API (ownership) | Swagger | Hecho ✔ (contract/orders) |
| C4 C3 | Modificar orden | `OrderModifyRequest`, 409 | → `ReservationService.modify` | `POST /autos/v1/orders/{id}/modify` | contract + unit | Swagger + web | Hecho ✔ (contract/orders) |
| C4 C3 C8 | Cancelar orden | `autos:cancel`, 409 | → `ReservationService.cancel` → outbox | `POST /autos/v1/orders/{id}/cancel` | contract + unit (política) | Webhook `CAR_ORDER_CANCELLED` | Hecho ✔ (contract/orders) |
| C4 C8 | Suscripciones webhook | `WebhookSubscription`, `autos:webhooks` | `WebhooksController` → `WebhookSubscriptionService` | `GET/POST /autos/v1/webhooks`, `DELETE /autos/v1/webhooks/{id}` | contract | Swagger | Hecho ✔ (integration/webhooks) |
| C8 | Entrega de eventos | callback `carEvent`, `WebhookPayload` | `OutboxService` → `WebhookDispatcher` | (saliente) | integración (firma, reintentos) | webhook.site en vivo | Hecho ✔ (integration/webhooks) |

## 2. Requisitos no ligados a un path

| Rúbrica | Requisito | Componente | Prueba | Evidencia | Estado |
|---|---|---|---|---|---|
| C2 C3 | Autenticación web y roles | `AuthModule` (`/api/auth/*`), `UserJwtGuard`, `RolesGuard` | e2e-api/auth, unit/auth/roles.guard | `/api/docs` | Hecho ✔ |
| C5 C6 | Reglas de dominio (precio, días, horario, edad, cancelación) | `src/domain/*` | unit/domain (28 casos) | Tests | Hecho ✔ |
| C5 | Disponibilidad por inventario | `AvailabilityService` | integration/availability (11 casos) | Tests | Hecho ✔ |

**Tabla general:**

| Rúbrica | Requisito | Componente | Prueba | Evidencia | Estado |
|---|---|---|---|---|---|
| C1 | Despliegue público | Render (API Docker + sitio estático) + Supabase; despliegue automático desde `main` | smoke `/health`; E2E también ejecutado contra producción | URLs en el README | Hecho ✔ |
| C2 | CRUD de administración | `modules/admin/*` (`/api/admin`) + `frontend/src/features/admin/*` | e2e-api/admin (17 casos) + e2e/admin.spec | Panel `/admin` | Hecho ✔ |
| C2 | Gestión operativa | `RentalOperationsService` (entrega con asignación de placa, devolución), cancelación asistida, `vehicle_blocks`, dashboard | e2e-api/admin + e2e/admin.spec | Demo: entrega → devolución con historial | Hecho ✔ |
| C2 | Protección por rol | `UserJwtGuard` + `RolesGuard` en todo `/api/admin` | e2e-api/admin (401 sin sesión, 403 cliente), unit/auth/roles.guard | 403 en vivo | Hecho ✔ |
| C3 | Consulta | Buscador por ciudad o agencia, filtros, detalle con agencia, horario y mapa | e2e/purchase-flow, e2e/mobile, Vitest | Demo | Hecho ✔ |
| C3 | Publicación → marketplace | `vehicle_models.published` (publicar u ocultar desde el admin) + búsqueda | contract/catalog, e2e-api/admin | Ocultar → desaparece de la búsqueda | Hecho ✔ |
| C3 | Flujo de venta web | `internal-api/checkout` (reutiliza los servicios del Hub) | e2e-api/web-checkout + e2e/purchase-flow | Demo | Hecho ✔ |
| C4 | Docs públicas desde el contrato | `DocsModule`: Swagger UI + Redoc desde el YAML; `/api/docs` generado para la API interna | app-smoke (`/autos/v1/docs`), e2e-api/auth (`/api/docs`) | URLs públicas | Hecho ✔ |
| C5 | Integridad | Migraciones versionadas, EXCLUDE (placa y tarifas), FK, CHECK, seed idempotente | integration/schema-alignment, integration/availability | 409 en vivo | Hecho ✔ |
| C6 | Contrato inalterado | `contracts/autos-openapi.yaml` + `UPSTREAM.md` | contract-checksum | CI verde | Hecho ✔ |
| C6 C4 | Errores estándar | `ProblemDetailsFilter` (RFC 7807, `code` del contrato) | e2e-api/auth, contract/* | Swagger | Hecho ✔ |
| C6 | Seguridad entre sistemas | `IntegrationAuthGuard` (RS256 + scopes), `AffiliateGuard`, emisor local `/oauth2/token` | e2e-api/integration-auth | Token → llamada | Hecho ✔ |
| C7 | Guía de interoperabilidad | [`CONTRATO_INTEGRACION.md`](CONTRATO_INTEGRACION.md) (flujo, token, idempotencia, errores, webhooks y firma) | Ejemplos tomados de las pruebas de contrato | Swagger "Try it out" | Hecho ✔ |
| C8 | Eventos y webhooks | Outbox + `WebhookDispatcher` (HMAC, reintentos) + monitor en el panel | integration/webhooks | webhook.site en vivo | Hecho ✔ |
| C8 | Catálogo de eventos | `contracts/autos-events.asyncapi.yaml` + [`SOA_EDA.md`](SOA_EDA.md) | — | Documento | Hecho ✔ |
| C9 | Documentación técnica | `ARQUITECTURA.md`, `BASE_DATOS.md`, `API_INTERNA.md`, `CONTRATO_INTEGRACION.md`, `SOA_EDA.md`, `DEPLOYMENT.md`, README | — | Carpeta `docs/` | Hecho ✔ |
| C10 | Defensa | [`GUIA_DEFENSA.md`](GUIA_DEFENSA.md): checklist, guion por criterio, recorrido del código, preguntas | Ensayo | — | Hecho ✔ (falta ensayar) |

**Totales de pruebas (CI):** 253 backend (unit, integración, API, contrato, checksum) · 15 frontend (Vitest) · 7 E2E (Playwright).
