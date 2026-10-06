# Plan de implementación

> **Estado (2026-10-06):** fases 0–16 completadas. Las desviaciones del plan están en el historial de commits; el estado por criterio de la rúbrica está en [`MATRIZ_TRAZABILIDAD.md`](MATRIZ_TRAZABILIDAD.md).

Regla de trabajo: **una fase a la vez → compilar → ejecutar → probar → corregir → documentar → revisión contigo → siguiente fase.** No se avanza con errores conocidos.

El despliegue se adelanta como **"despliegue esqueleto" en la Fase 1** porque C1 es obligatorio. La Fase 15 consolida el despliegue final.

| Fase | Objetivo | Archivos principales | Tareas | Criterio de finalización | Pruebas |
|---|---|---|---|---|---|
| **0 Análisis** | Entender los requisitos | `docs/*`, `contracts/*` | Este análisis | Aprobación tuya | — |
| **1 Setup** | Monorepo ejecutable y desplegado vacío | `backend/` (desde la plantilla, commit fijado), `frontend/`, `docker-compose.yml`, `.github/workflows/ci.yml`, `.env.example`, `.gitignore`, `contracts/UPSTREAM.md` | git init; copiar la plantilla; habilitar `AutosModule`; config validada; `helmet`, CORS, pino; `/health`; Vite + Tailwind; Dockerfile; **deploy esqueleto** en Render (API + web) y Supabase | `npm run build` OK en ambos; `/health` público; CI verde | test de checksum; smoke `/health` |
| **2 Base de datos** | Esquema completo | `database/migrations/*`, entidades, `seeds/*` | Extensiones; tablas y enums; EXCLUDE; índices; seed de demo (2 proveedores, 5 agencias, 6 categorías, ~25 vehículos, tarifas, extras, admin) | Migraciones up/down limpias; seed idempotente | integración: constraints (solapamiento → error) |
| **3 Dominio** | Reglas puras | `pricing/`, `availability/`, `orders/cancellation.policy.ts`, validators | `PricingService`, `AvailabilityService`, `DepotScheduleService`, `EligibilityService`, `CancellationPolicy` | RN01–RN13, RN22 cubiertas | **unit ≥ 90 %** en estas clases |
| **4 Autenticación** | Usuarios web | `auth/`, `users/` | register/login/me; bcrypt; `UserJwtGuard`, `RolesGuard`, `@Roles`; `ProblemDetailsFilter` global | Login funcional; rutas de admin con 401/403 | API auth |
| **5 Administración (backend + UI)** | C2 | `internal-api/admin/*`, `frontend/src/features/admin/*` | CRUD de catálogo; bloqueos; gestión de usuarios; layout admin | CRUD operativo desde la UI | API + Vitest |
| **6 Marketplace (UI)** | C3 (consulta) | `frontend/src/pages/{Home,Results,VehicleDetail}` | Buscador, resultados, filtros, detalle; auth UI | Navegación completa con datos reales | Vitest |
| **7 Búsqueda y disponibilidad** | Motor de búsqueda | `search/`, `internal-api/public/*` | `search_sessions`; resolución de `LocationPoint`; filtros; exclusión por edad y horario | Resultados correctos según las reglas | unit + integración |
| **8 Reservas** | Flujo de venta + post-venta | `orders/` (holds, previews, reservations), `internal-api/checkout`, `me/reservations`, UI checkout y Mis reservas | Hold, preview, create con lock + snapshot, modify, cancel, history; pago simulado; operaciones pickup/return en admin; reseñas | Flujo web completo | unit + integración (concurrencia) + E2E |
| **9 API de integración** | Las 15 operaciones | `integration-api/` controllers, DTOs 1:1 con el YAML, mappers | Reemplazar los stubs de la plantilla con los servicios; headers `Cache-Control`; HATEOAS | Todas responden según el schema | **contract tests** |
| **10 Seguridad Hub** | OAuth2 + scopes | `integration-auth/` | `OAuth2Guard` (jose), `ScopesGuard`, `AffiliateHeaderGuard`, emisor local `/oauth2/token` + `api_clients`, rate limit 429 | 401/403/429 correctos | API + contract |
| **11 Idempotencia** | Sin duplicados | `idempotency/` | `IdempotencyInterceptor` + tabla + TTL + limpieza | Casos §7 del contrato verificados | integración (paralelo) |
| **12 Webhooks / eventos** | C8 | `events/` | CRUD de suscripciones; outbox; dispatcher HMAC; reintentos; `DEPOT_UPDATE`; vista admin de entregas; AsyncAPI | Evento recibido en webhook.site | integración |
| **13 Testing** | Cerrar huecos | `test/*`, `e2e/*` | E2E Playwright de los flujos críticos; revisar cobertura | CI verde con E2E | todos |
| **14 OpenAPI / Swagger** | C4 | `docs.module.ts` | Swagger UI + Redoc desde el YAML (servidor de demo inyectado en memoria); OpenAPI interno generado; colección Postman/Bruno | Docs públicas navegables | API `/autos/v1/docs` |
| **15 Despliegue** | C1 final | Render (API + web), Supabase | Variables de producción; seed; monitor uptime; smoke test | Demo completa en producción | smoke + E2E contra staging |
| **16 Documentación** | C9, C10 | `README.md`, `docs/API_INTERNA.md`, `docs/CONTRATO_INTEGRACION.md`, `docs/GUIA_DEFENSA.md`, actualizar la matriz | Diagramas finales; guía del Hub; preguntas de defensa | Matriz 100 % "Hecho" | — |

## Dependencias

```
1 → 2 → 3 → 4 → 5
            3 → 7 → 8 → 9 → 10 → 11 → 12
                6 ─┘
13 transversal · 14 tras 9 · 15 continuo desde 1 · 16 continuo
```

**Ruta mínima para no perder puntos si el tiempo aprieta:** 1, 2, 3, 4, 7, 8, 9, 10, 11 (create), 12 (confirmación y cancelación), 14, 15, 16 con el admin básico (5) y la UI mínima (6).

## Calendario comprimido (entrega la próxima semana, ≈ 2026-10-06)

| Día | Fecha | Fases | Entregable verificable |
|---|---|---|---|
| 1 | mar 29-sep | 0 (cierre) + **1 Setup** | Monorepo en GitHub, backend y frontend compilan, `/health`, checksum en CI, **deploy esqueleto** |
| 2 | mié 30-sep | **2 BD** + **3 Dominio** + **4 Auth** | Migraciones + seed; Pricing y Availability con unit tests; login y roles |
| 3 | jue 1-oct | **7 Búsqueda** + **9 Integración (catálogo)** + **10 Seguridad Hub** | `/autos/v1/search`, `depots`, `details`, `suppliers`, `constants`, `scores` con contract tests; OAuth2 RS256 + emisor local |
| 4 | vie 2-oct | **8 Reservas** + **9 (órdenes)** + **11 Idempotencia** | hold, preview, create, get, modify, cancel con contract tests e idempotencia |
| 5 | sáb 3-oct | **12 Webhooks** + **6 Marketplace UI** | Outbox + dispatcher firmado; buscador, resultados, detalle, checkout, mis reservas |
| 6 | dom 4-oct | **5 Admin (API + UI)** | CRUD de catálogo, flota, bloqueos, reservas (entrega/devolución), usuarios, integración |
| 7 | lun 5-oct | **13–16** | E2E del flujo principal, Swagger/Redoc, deploy final, README, guía de defensa, matriz 100 % |

**Recortes para caber en una semana** (no afectan a la rúbrica):
- E2E: un solo flujo Playwright (reserva completa) en lugar de varios.
- Tests de frontend: solo los formularios críticos.
- Reseñas: el cliente puede calificar y se agregan datos de seed; sin moderación.
- AsyncAPI: documento breve con los 3 eventos del contrato.
- Sin emails ni pagos reales (pasarela simulada que genera `payment_reference`).
