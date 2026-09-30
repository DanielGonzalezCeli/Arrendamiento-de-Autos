# Arrendamiento de Autos — e-commerce + API para Booking Hub

Proyecto de **Integración de Sistemas (PUCE)**. Es un e-commerce de alquiler de vehículos que:

1. funciona como plataforma independiente (marketplace + panel de administración), y
2. expone la **API de integración** definida por el contrato oficial [`contracts/autos-openapi.yaml`](contracts/autos-openapi.yaml), que consumirá el **Booking Hub**.

> **API-first:** el contrato manda. El archivo no se modifica (su SHA-256 se verifica en CI) y la implementación se adapta a él.

## Despliegue público

| Componente | URL |
|---|---|
| Marketplace (frontend) | https://arrendamiento-autos-web.onrender.com |
| API — health | https://arrendamiento-autos-api.onrender.com/health |
| API de integración — Swagger | https://arrendamiento-autos-api.onrender.com/autos/v1/docs |
| API de integración — Redoc | https://arrendamiento-autos-api.onrender.com/autos/v1/redoc |

Hosting: Render (API en Docker + sitio estático) · Base de datos: Supabase (PostgreSQL). La API gratuita de Render "duerme" tras 15 min sin uso; el primer request puede tardar ~50 s.

## Estructura

| Carpeta | Contenido |
|---|---|
| [`backend/`](backend/) | NestJS 10 + TypeORM + PostgreSQL (basado en la plantilla oficial del equipo de integración) |
| [`frontend/`](frontend/) | React 19 + Vite + TypeScript + Tailwind |
| [`contracts/`](contracts/) | Contrato oficial (copia exacta) y su origen |
| [`e2e/`](e2e/) | Tests end-to-end con Playwright (flujo de compra y móvil) |
| [`docs/`](docs/) | Análisis, arquitectura, modelo de datos, SOA/EDA, despliegue, trazabilidad y plan |

## Marketplace (frontend)

| Ruta | Página |
|---|---|
| `/` | Portada con buscador (aeropuerto, ciudad o agencia; fechas, horas, edad, moneda) |
| `/buscar` | Resultados con filtros y orden |
| `/vehiculo/:id` | Detalle, condiciones y precio |
| `/ingresar`, `/registro` | Cuenta de cliente |
| `/reservar/:id` | Checkout: hold de 15 min, extras con precio en vivo, conductor, confirmación (pago simulado) |
| `/mis-reservas`, `/mis-reservas/:id` | Consultar, modificar extras y cancelar |
| `/creditos` | Autores y licencias de las fotos (Wikimedia Commons, Creative Commons) |

## Rutas del backend

| Ruta | Descripción |
|---|---|
| `/autos/v1/*` | **API de integración** (Booking Hub), según `autos-openapi.yaml` |
| `/autos/v1/docs` | Swagger UI del contrato oficial |
| `/autos/v1/redoc` | Redoc del contrato oficial |
| `/autos/v1/openapi.yaml` | Contrato oficial (bytes exactos) |
| `/api/*` | API interna para nuestro frontend (desde la Fase 4) |
| `/health` | Estado de la app y de la BD |

## Ejecutar en local

Requisitos: Node 22+ y PostgreSQL 16+. Puedes usar un Postgres instalado localmente o `docker compose up -d` si tienes Docker funcionando.

```bash
# Base de datos (si usas Postgres local, crea la BD "autos_db")
docker compose up -d            # opcional

# Backend
cd backend
cp .env.example .env            # ajustar DATABASE_URL
npm install
npm run migration:run:dev
npm run start:dev               # http://localhost:3000/health · /autos/v1/docs

# Frontend
cd ../frontend
cp .env.example .env
npm install
npm run dev                     # http://localhost:5173
```

Tests del backend: `npm test` (necesita la BD). Solo tests de contrato: `npm run test:contract`.
Tests del frontend: `cd frontend && npm test`.
E2E (con backend y frontend levantados): `cd e2e && npm ci && npx playwright install chromium && npx playwright test`
(`SCREENSHOTS=1` guarda capturas en `e2e/screenshots/`; `E2E_BASE_URL=<url>` prueba otro entorno).

## Documentación

Empieza por [`docs/ANALISIS_CONTRATO.md`](docs/ANALISIS_CONTRATO.md), [`docs/DECISIONES_CONFIRMADAS.md`](docs/DECISIONES_CONFIRMADAS.md) y [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md). El avance por fases está en [`docs/PLAN_IMPLEMENTACION.md`](docs/PLAN_IMPLEMENTACION.md) y la relación rúbrica → evidencia en [`docs/MATRIZ_TRAZABILIDAD.md`](docs/MATRIZ_TRAZABILIDAD.md).
