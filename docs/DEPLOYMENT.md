# Despliegue

## 1. Selección

| Componente | Opciones evaluadas | Elección | Motivo |
|---|---|---|---|
| Backend | Render, Railway, Fly.io, Vercel serverless | **Render (Web Service, Docker)** | Lo indica el equipo de integración para RDA1 ("subir su API a Render"); proceso persistente, necesario para los jobs programados (outbox, expiración de holds), cosa que serverless no permite |
| BD | Render Postgres, Neon, Supabase, Railway | **Neon** (alternativa: Supabase) | Postgres gestionado gratis **sin expiración** (el free de Render expira a los 30 días); soporta `btree_gist` y `pgcrypto` |
| Frontend | Vercel, Netlify, Render Static | **Vercel** | SPA estática, CDN, previews por PR |
| Webhook de demo | webhook.site | — | Receptor público para la defensa |

La arquitectura **no se ata** a ninguna plataforma: el backend es un contenedor Docker estándar configurado solo por variables de entorno, y la BD es Postgres estándar.

## 2. Topología

```
https://<app>.vercel.app  ──►  https://<api>.onrender.com/api/*
Booking Hub               ──►  https://<api>.onrender.com/autos/v1/*   (docs: /autos/v1/docs, /autos/v1/redoc)
<api>.onrender.com        ──►  Neon Postgres (TLS, sslmode=require)
```

## 3. Variables de entorno (backend)

| Variable | Ejemplo / nota |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | la inyecta Render |
| `DATABASE_URL` | Neon (con `sslmode=require`) |
| `CORS_ORIGINS` | `https://<app>.vercel.app` |
| `USER_JWT_SECRET`, `USER_JWT_EXPIRES_IN` | secreto largo aleatorio, `2h` |
| `INTEGRATION_JWT_ISSUER`, `INTEGRATION_JWT_AUDIENCE` | `autos-api` |
| `INTEGRATION_JWKS_URL` **o** `INTEGRATION_JWT_PUBLIC_KEY` | RDA2: JWKS del Hub |
| `LOCAL_OAUTH_ISSUER_ENABLED`, `LOCAL_OAUTH_PRIVATE_KEY` | RDA1: `true` + clave RSA |
| `DATA_ENCRYPTION_KEY` | 32 bytes base64 (secretos de webhooks) |
| `API_DEPRECATION_DATE` | opcional |
| `PUBLIC_BASE_URL` | para `_links` HATEOAS y el servidor de Swagger |

Frontend: `VITE_API_BASE_URL`.

## 4. Procedimiento

1. Crear la BD en Neon → copiar `DATABASE_URL`.
2. Render → New Web Service desde GitHub (`backend/Dockerfile`), variables de entorno, health check `/health`. Comando de inicio: `npm run migration:run && node dist/main`.
3. Seed de demo una sola vez: `npm run seed` (Render Shell o job manual).
4. Vercel → proyecto `frontend/`, `VITE_API_BASE_URL`, rewrites SPA.
5. Actualizar `CORS_ORIGINS` con el dominio de Vercel.
6. Verificar: `/health`, `/autos/v1/docs`, flujo completo, webhook a webhook.site.

## 5. Riesgos operativos

| Riesgo | Mitigación |
|---|---|
| Cold start de Render free (~50 s) | Despertar antes de la demo; monitor de uptime cada 10 min |
| Límites de conexiones del plan free | Pool pequeño (`max: 5`) |
| Migración fallida en deploy | Las migraciones corren antes de levantar; si fallan, el deploy falla y la versión anterior sigue viva |
