# Arquitectura

## 1. Vista general (monolito modular, preparado para SOA/EDA)

```
                ┌──────────────────────────┐          ┌───────────────────────────┐
                │  Frontend React (Vercel)  │          │  BOOKING HUB (otro equipo) │
                │  Marketplace + Admin      │          │  cliente OAuth2 B2B        │
                └────────────┬─────────────┘          └─────────────┬─────────────┘
                   JWT usuario│ /api/*          Bearer + scopes│ /autos/v1/*  (autos-openapi.yaml)
                             ▼                                        ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Backend NestJS (Render)                                                                │
│                                                                                        │
│  ┌────────────── API INTERNA ──────────────┐   ┌──────── API DE INTEGRACIÓN ────────┐   │
│  │ UserJwtGuard + RolesGuard               │   │ OAuth2Guard + ScopesGuard           │   │
│  │ Catalog / Checkout / MyReservations /   │   │ AffiliateHeaderGuard                │   │
│  │ Admin* controllers  (DTOs internos)     │   │ Autos controllers (DTOs = contrato) │   │
│  └──────────────────┬──────────────────────┘   │ Mappers  dominio ⇄ contrato         │   │
│                     │                          └──────────────┬──────────────────────┘   │
│                     ▼                                         ▼                          │
│  ┌──────────────────────── CAPA DE DOMINIO (servicios compartidos) ───────────────────┐  │
│  │ SearchService · AvailabilityService · PricingService · HoldService                  │  │
│  │ OrderPreviewService · ReservationService · CancellationPolicy · DepotService        │  │
│  │ VehicleService · ReviewService · IdempotencyService · DomainEventPublisher          │  │
│  └───────────────┬───────────────────────────────────────────────┬───────────────────┘  │
│                  ▼                                                ▼                      │
│         Repositories (TypeORM)                         Outbox ──► WebhookDispatcher ─────┼──► URLs suscritas (Hub)
│                  │                                     (cron, reintentos, HMAC)          │
└──────────────────┼───────────────────────────────────────────────────────────────────────┘
                   ▼
           PostgreSQL (Neon)
```

**Principio:** una sola lógica de negocio, dos "puertas" HTTP. Ejemplo:

```
InternalCheckoutController ─┐
                            ├──► ReservationService ──► ReservationRepository
AutosOrdersController ──────┘         (reglas RN08–RN24)
```

## 2. Estructura del repositorio

```
car-rental/                          (raíz = esta carpeta)
├── backend/                         ← basado en la plantilla oficial (NestJS)
│   ├── src/
│   │   ├── main.ts, app.module.ts
│   │   ├── config/                  env validado (Joi/zod), typeorm.config.ts
│   │   ├── common/                  problem-details filter, guards, decorators, pipes, logging
│   │   ├── database/migrations/, seeds/
│   │   ├── modules/
│   │   │   ├── auth/                usuarios web: register/login/me, UserJwtGuard, RolesGuard
│   │   │   ├── users/
│   │   │   ├── catalog/             suppliers, depots, categories, vehicles, extras, rates, constants
│   │   │   ├── availability/        availability + vehicle_blocks
│   │   │   ├── pricing/
│   │   │   ├── search/              search_sessions
│   │   │   ├── orders/              holds, previews, reservations, cancellation policy
│   │   │   ├── reviews/
│   │   │   ├── idempotency/
│   │   │   ├── events/              outbox, domain events, webhook subscriptions, dispatcher
│   │   │   ├── integration-auth/    OAuth2Guard, ScopesGuard, emisor local RDA1, api_clients
│   │   │   ├── integration-api/     ← controllers + DTOs + mappers de autos-openapi.yaml
│   │   │   ├── internal-api/        ← controllers para el frontend (public, customer, admin)
│   │   │   └── health/
│   ├── test/ unit/, integration/, contract/, e2e-api/
│   └── Dockerfile
├── frontend/                        React + Vite
│   └── src/ app/, pages/, features/(search, checkout, reservations, admin/*), components/, api/, lib/
├── contracts/
│   ├── autos-openapi.yaml           ← copia EXACTA del contrato (checksum en CI)
│   ├── UPSTREAM.md                  commit de origen
│   └── autos-events.asyncapi.yaml   ← nuestro: catálogo de eventos (complementario)
├── e2e/                             Playwright
├── docs/
├── docker-compose.yml               Postgres local
├── .github/workflows/ci.yml
└── README.md
```

Dentro de cada módulo de dominio: `*.controller.ts` (HTTP) → `*.service.ts` (reglas) → `*.repository.ts` (persistencia) · `entities/` · `dto/` · `mappers/`.

## 3. Responsabilidades por capa

| Capa | Hace | No hace |
|---|---|---|
| Controller | Leer HTTP (params, headers, body DTO), llamar a un servicio, fijar status y headers | Reglas de negocio ni queries |
| DTO + ValidationPipe | Validar forma y tipos (contrato) | Validar disponibilidad |
| Mapper | Dominio ⇄ formato del contrato (`snake_case`, ids int/uuid, `_links`) | Lógica |
| Service | Reglas RN01–RN29, transacciones, emitir eventos de dominio | Conocer HTTP |
| Repository | Queries TypeORM, locks | Decidir reglas |
| Guard | Autenticación, roles, scopes, `X-Affiliate-Id` | — |
| Interceptor | Idempotencia, logging, headers de caché | — |
| Exception filter | Convertir cualquier error en `ProblemDetails` | — |

## 4. API interna vs API de integración

| | API interna | API de integración |
|---|---|---|
| Consumidor | Nuestro frontend | Booking Hub (y otros sistemas) |
| Prefijo | `/api/*` | `/autos/v1/*` (confirmado por el equipo de integración) |
| Diseño | Libre, orientado a la UX (GET con query params, respuestas ricas) | **Exactamente** `autos-openapi.yaml` |
| Auth | JWT de usuario (HS256, emisor `rentacar-web`), roles `CUSTOMER`/`ADMIN` | OAuth2 Bearer (RS256/JWKS) con scopes `autos:*` |
| Docs | OpenAPI **generado** por decoradores → `/api/docs` | OpenAPI **oficial servido desde el YAML** → `/autos/v1/docs` (Swagger UI) y `/autos/v1/redoc` |
| Formato | camelCase | snake_case según el contrato |
| Errores | ProblemDetails (mismo filtro) | ProblemDetails estricto |

### Borrador de endpoints de la API interna

| Área | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Público | `GET /locations?q=` (agencias, ciudades y aeropuertos), `GET /search?pickupDepotId&dropoffDepotId&pickupAt&dropoffAt&driverAge&...` (crea `search_session` y devuelve un token + resultados enriquecidos), `GET /vehicles/:id?searchToken=`, `GET /extras`, `GET /constants` |
| Checkout (CUSTOMER) | `POST /checkout/hold`, `POST /checkout/preview`, `POST /checkout/confirm` (con `Idempotency-Key`; genera `payment_reference` simulado) |
| Mis reservas (CUSTOMER) | `GET /me/reservations`, `GET /me/reservations/:id`, `POST /me/reservations/:id/modify`, `POST /me/reservations/:id/cancel`, `POST /me/reservations/:id/review` |
| Admin | `GET /admin/dashboard`; CRUD `/admin/{vehicles,categories,suppliers,depots,rates,extras}`; `/admin/vehicles/:id/blocks`; `/admin/reservations` (+`/:id/pickup`, `/:id/return`, `/:id/cancel`); `/admin/users`; `/admin/integration/{clients,webhooks,deliveries}` |

Checkout interno = **los mismos servicios** que hold/preview/create del contrato. El `owner_sub` de una reserva web es `user:<uuid>`; el de una reserva del Hub es el `sub` del token (ej. `client:booking-hub` o el usuario del Hub).

## 5. Seguridad

| Tema | Medida |
|---|---|
| Contraseñas | bcrypt (cost 12); nunca se devuelven ni se registran en logs |
| Auth usuarios | JWT HS256 de 2 h, `iss`/`aud` propios, secreto `USER_JWT_SECRET` |
| Auth sistemas | OAuth2 client credentials; JWT RS256 validado con `jose`; scopes por endpoint; emisor local solo si `LOCAL_OAUTH_ISSUER_ENABLED=true` |
| Autorización | `RolesGuard` (ADMIN), `ScopesGuard`; propiedad por `owner_sub` (RN23) |
| Validación | `ValidationPipe` global + reglas en servicios; `ParseUUIDPipe` |
| Inyección | Solo queries parametrizadas (TypeORM) |
| CORS | Lista blanca `CORS_ORIGINS` (frontend de Vercel) para `/api`; `/autos/v1` abierto a servidores (sin credenciales de navegador) |
| Headers | `helmet` |
| Rate limit | `@nestjs/throttler` (search: 60/min por IP + afiliado) → 429 + `Retry-After` |
| Errores | ProblemDetails; sin stacktrace fuera de desarrollo |
| Webhooks | Solo URLs `https` en producción; bloqueo de IPs privadas (anti-SSRF); firma HMAC; timeout de 5 s |
| Secretos | Solo variables de entorno; `.env` en `.gitignore`; `.env.example` sin valores reales; secretos de webhooks cifrados (AES-256-GCM con `DATA_ENCRYPTION_KEY`) |

## 6. Observabilidad

- `nestjs-pino`: logs JSON con `request_id` (header `X-Request-Id` generado o propagado), método, ruta, status y duración.
- Redacción automática: `authorization`, `password`, `secret`, `client_secret`, `token`.
- Logs de negocio: `order.created`, `order.cancelled`, `hold.created/expired`, `idempotency.replayed/conflict`, `webhook.delivered/failed`, `integration.auth.denied` (con `sub`, `client_id`, `affiliate_id`, sin el token completo).
- `GET /health` (app + BD) para Render y el monitor de uptime.
- La tabla `webhook_deliveries` es visible en el admin (auditoría de integración).

## 7. Estrategia de testing

Ver [ESTRATEGIA_TESTING.md](ESTRATEGIA_TESTING.md).
