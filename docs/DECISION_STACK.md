# Decisión de stack

## 1. Factor determinante

El repositorio oficial del equipo de integración (Prioridad 3) **es una plantilla NestJS 10 + TypeORM + PostgreSQL + @nestjs/swagger + class-validator**. Además:
- ya trae un `AutosModule` con los 15 endpoints del contrato como stubs,
- trae el `IdempotencyKeyGuard`, `BaseResponseDto` (HATEOAS) y `ColumnNumericTransformer`,
- su README ordena instalar exactamente `@nestjs/typeorm typeorm pg @nestjs/config class-validator class-transformer @nestjs/swagger`,
- menciona una futura migración a **microservicios / Apollo Federation**.

Apartarse de esa base aumenta el riesgo de incompatibilidad en RDA2 sin ningún beneficio para la rúbrica.

## 2. Alternativas comparadas

| Criterio (peso) | A: React + Express + Prisma | **B: React + NestJS + TypeORM** | B': React + NestJS + Prisma | C: Angular + Spring Boot |
|---|---|---|---|---|
| Alineación con la plantilla de integración (alto) | Baja: reescribir todo | **Total** | Media: cambia el ORM | Nula |
| Experiencia previa (Sal-y-Canela) (alto) | Alta | Media (mismo lenguaje; NestJS nuevo) | Media-alta | Baja |
| Estructura impuesta: capas y DI (alto) | Manual | **Nativa** (módulos, providers) | Nativa | Nativa |
| Guards para scopes OAuth2 y roles (alto) | Middleware manual | **Guards + decoradores** | Igual | Spring Security (potente, curva alta) |
| OpenAPI (alto) | swagger-jsdoc manual | `@nestjs/swagger` + servir el YAML | Igual | springdoc |
| Testing (medio) | Jest + supertest | **Jest + supertest + TestingModule** | Igual | JUnit + MockMvc |
| Velocidad de implementación (medio) | Alta al inicio, baja al crecer | Media-alta | Media-alta | Baja |
| Transacciones y bloqueos (`FOR UPDATE`) (medio) | Prisma: `$transaction`, SQL crudo para locks | TypeORM: `QueryRunner` / `lock: pessimistic_write` nativo | SQL crudo para locks | JPA `@Lock` |
| Despliegue en Render (medio) | Fácil | Fácil (Docker/Node) | Fácil | Más pesado (JVM) |
| Defensa académica (alto) | Fácil de explicar; estructura propia | **Estructura estándar explicable** | Igual | Difícil sin experiencia |

## 3. Tabla de decisión

| Tecnología | Ventajas | Desventajas | Decisión |
|---|---|---|---|
| **NestJS 10 (TypeScript)** | Es la plantilla oficial; DI, módulos, guards, pipes, interceptors; Swagger integrado; test harness | Curva de decoradores y DI | **Backend** |
| **TypeORM 0.3** | Es el ORM de la plantilla; migraciones; lock pesimista nativo; `QueryRunner` para transacciones | API menos ergonómica que Prisma; `synchronize` peligroso | **ORM** con **migraciones** (`synchronize: false` en producción y en tests) |
| Prisma | Experiencia previa; tipado excelente | Diverge de la plantilla; locks y `EXCLUDE` requieren SQL crudo | Descartado (decisión confirmada: NestJS + TypeORM) |
| **PostgreSQL 16** | La plantilla lo usa; `EXCLUDE USING gist` + `tstzrange` para el anti-solapamiento; JSONB para snapshots | — | **BD** |
| **React 19 + Vite 8 + TypeScript** | Experiencia previa (Sal-y-Canela); build rápido; despliegue estático | — | **Frontend** |
| React Router 7 | Estándar | — | Rutas y áreas protegidas |
| TanStack Query | Caché y estados de carga y error sin reducer gigante (problema de Sal-y-Canela) | Una librería más | Sí |
| React Hook Form + Zod | Formularios validados y tipados | Dos dependencias más para 4 formularios | **No** (decisión Fase 6): formularios controlados simples; el backend valida y devuelve `invalidParams`, que se muestran por campo |
| Tailwind CSS (+ componentes propios) | UI moderna y consistente sin un CSS de 2 000 líneas | Clases largas | Sí |
| Angular + Spring Boot | Robusto, empresarial | Sin experiencia; no coincide con la plantilla | Descartado |
| Express puro | Conocido | Hay que reinventar DI y guards; diverge de la plantilla | Descartado |
| class-validator / class-transformer | Los usa la plantilla; DTOs = contrato | — | Validación de DTOs |
| `jose` (JWT/JWKS) | Verificación RS256 + JWKS para OAuth2 del Hub | — | API de integración |
| `@nestjs/jwt` + `bcrypt` | Auth de usuarios web | — | API interna |
| `@nestjs/throttler` | Rate limit → 429 `RATE_LIMIT_EXCEEDED` | — | Sí |
| `@nestjs/schedule` | Expiración de holds, limpieza de idempotencia, dispatcher de webhooks | Una dependencia más para dos temporizadores | **No** (decisión Fase 12): `setInterval` propio en `WebhookDispatcherService` y `MaintenanceService`, sin Redis ni colas |
| `@nestjs/event-emitter` | Eventos in-process (EDA interno) | Los eventos en memoria se pierden si el proceso cae | **No** (decisión Fase 12): los eventos van al *transactional outbox* en la BD |
| `nestjs-pino` | Logs JSON con `request_id` y redacción de secretos | — | Sí |
| Jest + supertest | Default de NestJS | — | Unit, integración y API |
| `jest-openapi` | Valida respuestas reales contra `autos-openapi.yaml` | — | **Tests de contrato** |
| Playwright | E2E del marketplace | Descarga de navegador | Flujo de compra completo + móvil, **en CI** |
| Kafka / RabbitMQ | EDA "real" | Sobreingeniería para la rúbrica | **No** (outbox + webhooks basta) |
| Docker (compose local, Dockerfile de deploy) | Paridad con Render; la plantilla ya trae compose | — | Sí |

## 4. Resultado

```
Frontend : React 19 + Vite 8 + TS + React Router + TanStack Query + Tailwind + lucide-react  → Render (sitio estático)
Backend  : NestJS 10 + TypeORM 0.3 + class-validator + @nestjs/swagger + jose + pino + helmet + throttler → Render (Docker)
BD       : PostgreSQL (Supabase como Postgres gestionado; local: PostgreSQL 18 o docker-compose)
Tests    : Jest, supertest, jest-openapi, Playwright
CI       : GitHub Actions
```
