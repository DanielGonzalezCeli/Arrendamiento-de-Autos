# Estrategia de testing

| Nivel | Herramienta | Qué cubre | Dónde |
|---|---|---|---|
| **Unit** | Jest | `PricingService` (días, IVA, joven, one-way, extras, redondeo), `AvailabilityService`, `CancellationPolicy`, `RouteValidator`, `DepotScheduleService`, mappers, `IdempotencyService` (hash) | `backend/test/unit` |
| **Integración** | Jest + Postgres real (docker-compose / servicio de GitHub Actions) + migraciones | Repositorios, **stock por inventario** (N unidades → la reserva N+1 da 409), **constraint de exclusión** por placa, transacciones y locks concurrentes, outbox | `backend/test/integration` |
| **API** | supertest sobre la app Nest | Status codes, headers (`Cache-Control`, `Retry-After`), guards (401/403), roles, ProblemDetails | `backend/test/e2e-api` |
| **Contrato** | `jest-openapi` (`expect(res).toSatisfyApiSpec()`) cargando `contracts/autos-openapi.yaml` | **Cada operación del contrato**: respuesta con schema, status, enum y nombres de propiedades válidos. Casos negativos: falta `X-Affiliate-Id`, falta o no es UUID la `Idempotency-Key`, `currency` inválida | `backend/test/contract` |
| **Checksum** | Jest | SHA-256 de `contracts/autos-openapi.yaml` = valor registrado en `contracts/UPSTREAM.md` | `backend/test/contract` |
| **Frontend unit** | Vitest + Testing Library | Formularios de búsqueda y checkout, guards de rutas | `frontend/src/**/*.test.tsx` |
| **E2E** | Playwright | Búsqueda → detalle → checkout → confirmación → mis reservas → cancelar; admin crea y publica un vehículo → visible | `e2e/` |
| **Fuzz de contrato (opcional)** | Schemathesis contra staging | Robustez frente a inputs generados desde el YAML | Manual o CI nocturno |

## Estado actual

| Suite | Casos | Dónde |
|---|---|---|
| Backend: unit, integración, API, contrato, checksum | 219 (21 suites) | `backend/test` |
| Frontend (Vitest) | 15 | `frontend/src/**/*.test.ts` |
| E2E (Playwright) | 7: flujo de compra (pago rechazado y aprobado en la pasarela simulada), rutas privadas, móvil, validaciones de registro, fotos, panel admin (entrega → devolución), acceso de cliente al panel | `e2e/tests` |

Las tres suites corren en GitHub Actions en cada push. El E2E también se ejecutó contra producción (`E2E_BASE_URL`). La fila "Fuzz de contrato" de la tabla anterior quedó fuera del alcance.

## Casos prioritarios (flujo crítico)

1. `search` devuelve solo vehículos disponibles, publicados y aptos por edad, con `search_token`.
2. `hold` bloquea: un segundo hold o una reserva de otro dueño → 409 `CAR_NO_LONGER_AVAILABLE`.
3. Hold expirado → vehículo disponible de nuevo.
4. `preview` calcula el desglose correcto y lo congela.
5. `create` con la misma `Idempotency-Key` ×2 → **una sola** reserva, respuestas idénticas.
6. `create` con la misma clave y otro body → 409.
7. `create` concurrente sobre un modelo con 1 sola unidad libre (2 requests en paralelo) → exactamente 1 éxito.
8. `modify` con cambio de fechas: se recalcula el precio y respeta la disponibilidad; en estado `CANCELLED` → 409 `BOOKING_NOT_CONFIRMED`.
9. `cancel` responde 200 **con cuerpo vacío**; con la misma clave → 200 vacío (replay); con otra clave → 409 `CANCELLATION_NOT_ALLOWED`.
10. `GET /orders/{id}` de otro `sub` → 404.
11. Webhook: un evento genera entregas firmadas; un fallo se reintenta.

## CI (GitHub Actions)

`lint → typecheck → unit → (servicio postgres) migraciones + integración + API + contrato → build backend/frontend → [main] Render despliega API y frontend automáticamente → smoke test /health`.

**Criterio de fase terminada:** CI en verde; ninguna fase avanza con tests rojos conocidos.
