# Despliegue

## 1. Selección

| Componente | Opciones evaluadas | Elección | Motivo |
|---|---|---|---|
| Backend | Render, Railway, Fly.io, Vercel serverless | **Render (Web Service, Docker)** | Lo indica el equipo de integración para RDA1 ("subir su API a Render"); proceso persistente, necesario para los jobs programados (outbox, expiración de holds), cosa que serverless no permite |
| BD | Render Postgres, Neon, Supabase, Railway | **Supabase** (solo como PostgreSQL; alternativa: Neon) | Decisión del estudiante: ya lo conoce (Sal-y-Canela), tiene editor visual útil para la defensa y el free no expira (el de Render expira a los 30 días); soporta `btree_gist` y `pgcrypto`. **No** se usan Supabase Auth, su API REST ni la clave `anon`: todo acceso a datos pasa por nuestro backend |
| Frontend | Vercel, Netlify, Render Static | **Render Static Site** | Decisión del estudiante: una sola plataforma para frontend y backend (un solo `render.yaml`, una cuenta). Es gratis, tiene CDN y HTTPS, y los sitios estáticos no se duermen |
| Webhook de demo | webhook.site | — | Receptor público para la defensa |

La arquitectura **no se ata** a ninguna plataforma: el backend es un contenedor Docker estándar configurado solo por variables de entorno, y la BD es Postgres estándar.

## 2. Topología

```
https://<web>.onrender.com ──►  https://<api>.onrender.com/api/*
Booking Hub               ──►  https://<api>.onrender.com/autos/v1/*   (docs: /autos/v1/docs, /autos/v1/redoc)
<api>.onrender.com        ──►  Supabase Postgres vía pooler Supavisor (session mode, puerto 5432, TLS)
```

## 3. Variables de entorno (backend)

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

## 4. Procedimiento

1. Crear un proyecto en Supabase (región más cercana, p. ej. `us-east-1`) → Connect → copiar la URI del **Session pooler** como `DATABASE_URL`.
2. Render → New Web Service desde GitHub (`backend/Dockerfile`), variables de entorno, health check `/health`. Comando de inicio: `npm run migration:run && node dist/main`.
3. Seed de demo una sola vez: `npm run seed` (Render Shell o job manual).
4. El mismo Blueprint crea el sitio estático `arrendamiento-autos-web` (`frontend/`, rewrite SPA). Cargar `VITE_API_BASE_URL` = URL de la API.
5. Actualizar `CORS_ORIGINS` de la API con la URL del sitio estático.
6. Verificar: `/health`, `/autos/v1/docs`, flujo completo, webhook a webhook.site.

## 5. Riesgos operativos

| Riesgo | Mitigación |
|---|---|
| Cold start de Render free (~50 s) | Despertar antes de la demo; monitor de uptime cada 10 min |
| Límites de conexiones del plan free | Pool pequeño (`max: 5`) |
| Supabase free **pausa el proyecto tras 7 días sin actividad** | Uso diario durante el desarrollo; revisar el panel el día antes de la defensa y reactivar si hiciera falta |
| Contraseña de BD con caracteres especiales rompe la URL | Codificarlos (URL-encode) o generar una contraseña alfanumérica |
| Migración fallida en deploy | Las migraciones corren antes de levantar; si fallan, el deploy falla y la versión anterior sigue viva |
