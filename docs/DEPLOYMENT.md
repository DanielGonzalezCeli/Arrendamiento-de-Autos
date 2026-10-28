# Despliegue

## 1. Selección

| Componente | Opciones evaluadas | Elección | Motivo |
|---|---|---|---|
| Backend | Render, Railway, Fly.io, Vercel serverless | **Render (Web Service, Docker)** | Lo indica el equipo de integración para RDA1 ("subir su API a Render"); proceso persistente, necesario para los jobs programados (outbox, expiración de holds), cosa que serverless no permite |
| BD | Render Postgres, Neon, Supabase, Railway | **Supabase** (solo como PostgreSQL; alternativa: Neon) | Decisión del estudiante: ya lo conoce (Sal-y-Canela), tiene editor visual útil para la defensa y el free no expira (el de Render expira a los 30 días); soporta `btree_gist` y `pgcrypto`. **No** se usan Supabase Auth, su API REST ni la clave `anon`: todo acceso a datos pasa por nuestro backend |
| Frontend | Vercel, Netlify, Render Static | **Render Static Site** | Decisión del estudiante: una sola plataforma para frontend y backend (un solo `render.yaml`, una cuenta). Es gratis, tiene CDN y HTTPS, y los sitios estáticos no se duermen |
| Webhook de demo | webhook.site | — | Receptor público para la defensa |

La arquitectura **no se ata** a ninguna plataforma: el backend es un contenedor Docker estándar configurado solo por variables de entorno, y la BD es Postgres estándar.

## 2. URLs de producción (desplegadas 2026-09-29)

- Web: https://arrendamiento-autos-web.onrender.com
- API: https://arrendamiento-autos-api.onrender.com (`/health`, `/autos/v1/docs`, `/autos/v1/redoc`)

**Nota SSL con Supabase:** `pg` trata `sslmode=require` como `verify-full`, y la CA de Supabase no está en el almacén de Node (`SELF_SIGNED_CERT_IN_CHAIN`). Se usa `?uselibpqcompat=true&sslmode=require`: conexión cifrada sin verificar la CA (semántica estándar de libpq). Mejora pendiente: cargar el certificado CA de Supabase y usar `verify-full`.

## 3. Topología

```
https://<web>.onrender.com ──►  https://<api>.onrender.com/api/*
Booking Hub               ──►  https://<api>.onrender.com/autos/v1/*   (docs: /autos/v1/docs, /autos/v1/redoc)
<api>.onrender.com        ──►  Supabase Postgres vía pooler Supavisor (session mode, puerto 5432, TLS)
```

## 4. Variables de entorno (backend)

| Variable | Ejemplo / nota |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | la inyecta Render |
| `DATABASE_URL` | Supabase → Connect → **Session pooler** (`postgresql://postgres.<ref>:<pass>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require`). **No** usar la conexión directa (`db.<ref>.supabase.co`, solo IPv6; Render no tiene IPv6) |
| `CORS_ORIGINS` | `https://<web>.onrender.com` (URL del sitio estático) |
| `USER_JWT_SECRET`, `USER_JWT_EXPIRES_IN` | secreto largo aleatorio, `2h` |
| `INTEGRATION_JWT_ISSUER`, `INTEGRATION_JWT_AUDIENCE` | `autos-api` |
| `INTEGRATION_JWKS_URL` **o** `INTEGRATION_JWT_PUBLIC_KEY` | RDA2: JWKS del Hub |
| `LOCAL_OAUTH_ISSUER_ENABLED`, `LOCAL_OAUTH_PRIVATE_KEY` | RDA1: `true` + clave RSA |
| `DATA_ENCRYPTION_KEY` | 32 bytes base64 (secretos de webhooks) |
| `API_DEPRECATION_DATE` | opcional |
| `PUBLIC_BASE_URL` | para `_links` HATEOAS y el servidor de Swagger |

Frontend: `VITE_API_BASE_URL`.

## 5. Procedimiento

1. Crear un proyecto en Supabase (región más cercana, p. ej. `us-east-1`) → Connect → copiar la URI del **Session pooler** como `DATABASE_URL`.
2. Render → New Web Service desde GitHub (`backend/Dockerfile`), variables de entorno, health check `/health`. Comando de inicio: `npm run migration:run && node dist/main`.
3. Seed de demo una sola vez: `npm run seed` (Render Shell o job manual).
4. El mismo Blueprint crea el sitio estático `arrendamiento-autos-web` (`frontend/`, rewrite SPA). Cargar `VITE_API_BASE_URL` = URL de la API.
5. Actualizar `CORS_ORIGINS` de la API con la URL del sitio estático.
6. Verificar: `/health`, `/autos/v1/docs`, flujo completo, webhook a webhook.site.

## 6. Riesgos operativos

| Riesgo | Mitigación |
|---|---|
| Cold start de Render free (~50 s) | Despertar antes de la demo; monitor de uptime cada 10 min |
| Límites de conexiones del plan free | Pool pequeño (`max: 5`) |
| Supabase free **pausa el proyecto tras 7 días sin actividad** | Uso diario durante el desarrollo; revisar el panel el día antes de la defensa y reactivar si hiciera falta |
| Contraseña de BD con caracteres especiales rompe la URL | Codificarlos (URL-encode) o generar una contraseña alfanumérica |
| Migración fallida en deploy | Las migraciones corren antes de levantar; si fallan, el deploy falla y la versión anterior sigue viva |

## 7. Reto 2: backend en Azure App Service (desde 2026-10-28)

Booking Prototipo exige que `/health` responda en < 4 s; Render free se duerme a los 15 min (cold start ~50 s), así que la API que se registra en Booking corre en Azure (suscripción Azure for Students). Render sigue disponible para el frontend estático.

| Recurso | Valor |
|---|---|
| Grupo / plan | `rg-rutalibre` / `plan-rutalibre` (Linux **B1**, Canada Central, *Always On*) |
| Web App | `rutalibre-autos-api` → https://rutalibre-autos-api.azurewebsites.net (Node 22 LTS, solo HTTPS, health check `/health`) |
| Base URL para Booking | `https://rutalibre-autos-api.azurewebsites.net/api/v3` |
| Base de datos | la misma de Supabase (session pooler) |
| Comando de inicio | `cd /home/site/wwwroot/backend && node ./node_modules/typeorm/cli.js migration:run -d dist/config/data-source.js && node dist/database/seeds/seed.js && node dist/main` |

**Variables:** públicas (configuradas por CLI) `NODE_ENV`, `PUBLIC_BASE_URL`, `CORS_ORIGINS`, `PUBLIC_WEB_URL`, `USER_JWT_EXPIRES_IN`, `STOCK_SYNC_MODE`, `SCM_DO_BUILD_DURING_DEPLOYMENT=false`, `WEBSITES_CONTAINER_START_TIME_LIMIT=600`; secretas (cargadas a mano en el portal, nunca en el repo) `DATABASE_URL`, `USER_JWT_SECRET` (la misma de Render: deriva la clave de los secretos de webhooks), `LOCAL_OAUTH_PRIVATE_KEY`, `BOOKING_API_KEY` (distinta de la local; se comparte solo con el líder técnico de Booking).

**Despliegue continuo:** el job `deploy-azure` de `.github/workflows/ci.yml` corre en cada push a `main` después de backend, frontend y E2E: compila, poda dependencias de desarrollo, empaqueta `backend/{dist,node_modules,package.json}` + `contracts/` y lo publica con `azure/webapps-deploy` usando el secreto de GitHub `AZURE_WEBAPP_PUBLISH_PROFILE` (perfil de publicación descargado del portal).

**Costo:** B1 ≈ 13 USD/mes contra los 100 USD de crédito; el mismo plan puede alojar el gateway y los microservicios de la fase C sin costo adicional.
