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
| API interna — Swagger | https://arrendamiento-autos-api.onrender.com/api/docs |
| Panel de administración | https://arrendamiento-autos-web.onrender.com/admin (rol ADMIN) |

Hosting: Render (API en Docker + sitio estático) · Base de datos: Supabase (PostgreSQL). La API gratuita de Render "duerme" tras 15 min sin uso; el primer request puede tardar ~50 s.

## Estructura

| Carpeta | Contenido |
|---|---|
| [`backend/`](backend/) | NestJS 10 + TypeORM + PostgreSQL (basado en la plantilla oficial del equipo de integración) |
| [`frontend/`](frontend/) | React 19 + Vite + TypeScript + Tailwind |
| [`contracts/`](contracts/) | Contrato oficial (copia exacta) y su origen |
| [`e2e/`](e2e/) | Tests end-to-end con Playwright (flujo de compra, móvil, validaciones y panel de administración) |
| [`docs/`](docs/) | Análisis, arquitectura, modelo de datos, SOA/EDA, despliegue, trazabilidad y plan |

## Marketplace (frontend)

| Ruta | Página |
|---|---|
| `/` | Portada con buscador (ciudad o agencia; fechas, horas, edad, moneda) |
| `/buscar` | Resultados con filtros y orden |
| `/vehiculo/:id` | Detalle, condiciones y precio |
| `/ingresar`, `/registro` | Cuenta de cliente |
| `/reservar/:id` | Checkout: hold de 15 min, extras con precio en vivo, conductor y pago en la **pasarela simulada RutaPay** (tarjetas de prueba; aprobado o rechazado) |
| `/mis-reservas`, `/mis-reservas/:id` | Consultar, modificar extras y cancelar |
| `/creditos` | Autores y licencias de las fotos (Wikimedia Commons, Creative Commons) |

## Panel de administración (`/admin`, solo rol ADMIN)

| Sección | Qué permite |
|---|---|
| Resumen | Entregas y devoluciones del día, alquileres en curso, atrasos, ingresos del mes, flota, estado de los webhooks |
| Reservas | Buscar y filtrar; **registrar entrega** (asigna placa), **devolución** y cancelación; historial |
| Modelos | Alta y edición; publicar u ocultar en el marketplace |
| Flota | Unidades por placa y **bloqueos de mantenimiento** |
| Agencias | Datos, servicios y horario semanal (emite `DEPOT_UPDATE`) |
| Catálogo y tarifas | Categorías, proveedores, extras, tarifas por vigencia y ciudades |
| Usuarios | Crear cuentas (clientes o administradores), editar datos, restablecer contraseñas, activar, desactivar y eliminar |
| Integración | Clientes OAuth2, suscripciones y entregas de webhooks (reintentar, procesar ahora) |

Las credenciales de demo (`admin@rutalibre.ec`, `cliente@rutalibre.ec`) las crea el seed con las contraseñas de las variables `SEED_ADMIN_PASSWORD` y `SEED_CUSTOMER_PASSWORD`. En local, sin esas variables, usa las de desarrollo definidas en `backend/src/database/seeds/seed.ts`.

## Rutas del backend

| Ruta | Descripción |
|---|---|
| `/autos/v1/*` | **API de integración** (Booking Hub), según `autos-openapi.yaml` |
| `/autos/v1/docs` | Swagger UI del contrato oficial |
| `/autos/v1/redoc` | Redoc del contrato oficial |
| `/autos/v1/openapi.yaml` | Contrato oficial (bytes exactos) |
| `/api/*` | API interna para nuestro frontend (catálogo, checkout, mis reservas, `/api/admin`) — ver [`docs/API_INTERNA.md`](docs/API_INTERNA.md) |
| `/api/docs` | Swagger de la API interna |
| `/oauth2/token`, `/.well-known/jwks.json` | Emisor OAuth2 local (RDA1) para el Booking Hub |
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

| Documento | Contenido |
|---|---|
| [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) | Capas, módulos y decisiones |
| [`docs/BASE_DATOS.md`](docs/BASE_DATOS.md) | Modelo de datos y restricciones |
| [`docs/CONTRATO_INTEGRACION.md`](docs/CONTRATO_INTEGRACION.md) | **Guía para el Booking Hub**: token, flujo de reserva, idempotencia, errores, webhooks |
| [`docs/API_INTERNA.md`](docs/API_INTERNA.md) | API del marketplace y del panel |
| [`docs/SOA_EDA.md`](docs/SOA_EDA.md) | Servicios, eventos, outbox y webhooks |
| [`docs/ANALISIS_CONTRATO.md`](docs/ANALISIS_CONTRATO.md) | Análisis de las 15 operaciones del contrato |
| [`docs/REGLAS_NEGOCIO.md`](docs/REGLAS_NEGOCIO.md) | Reglas RN01–RN31 |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Despliegue en Render y Supabase |
| [`docs/GUIA_DEFENSA.md`](docs/GUIA_DEFENSA.md) · [versión HTML](docs/GUIA_DEFENSA.html) | Guion de la demo, arquitectura, patrones, tecnología y preguntas de la defensa |

 El avance por fases está en [`docs/PLAN_IMPLEMENTACION.md`](docs/PLAN_IMPLEMENTACION.md) y la relación rúbrica → evidencia en [`docs/MATRIZ_TRAZABILIDAD.md`](docs/MATRIZ_TRAZABILIDAD.md).
