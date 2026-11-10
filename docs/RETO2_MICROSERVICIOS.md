# Reto 2: migración a microservicios

Documento vivo: se actualiza al cerrar cada fase.

## 1. Estrategia: Strangler Fig

No se reescribe el sistema de golpe. Se pone un **API Gateway** delante del monolito y los servicios se van sacando uno por uno; el gateway decide a qué servicio va cada ruta. En cada paso Booking y la web siguen funcionando con la misma URL.

| Fase | Contenido | Estado |
|---|---|---|
| A | API Gateway delante del monolito (que pasa a ser `ms-reservas`) | Hecha (local, CI y Azure) |
| B | `ms-identidad` (usuarios, login, roles, JWT RS256 + JWKS) | Hecha en local y CI; falta el despliegue en Azure |
| C | `ms-clientes` (clientes cross-platform, contrato v3.1) | Pendiente |
| D | RabbitMQ + `ms-inventario-stock` (estado de flota y stock hacia Booking por eventos) | Pendiente |
| E | Métricas, traza distribuida y pruebas entre servicios | Pendiente |
| F | Documento técnico final y guía de defensa | Pendiente |

## 2. Arquitectura actual (fase B)

```
Booking (Paúl) ─┐                         /api/auth/*, /api/admin/users/*
Web / panel  ───┼─► API Gateway ──────────────────────────────► ms-identidad ──► PostgreSQL, schema "identidad"
                │    (gateway/)                                   (ms-identidad/)      (tabla users)
                │                                                  ▲        │
                │                           JWKS + estado de cuenta│        │ historial de usuarios
                │                                                  │        ▼ (token del admin)
                │                 todo lo demás                    │
                └────────────────────────────────────────────► ms-reservas ──► PostgreSQL, schema "public"
                                                                 (backend/)     (reservas, flota, catálogo…)
                                                                   ├─HTTP/gRPC─► Booking (stock)
                                                                   └─HTTP──────► Booking (check-in)
```

Ambos servicios usan la misma instancia de PostgreSQL (Supabase), pero cada uno tiene su **schema** y ninguno lee las tablas del otro: los datos del otro servicio se piden por API. Entre los dos schemas no hay claves foráneas; `reservations.user_id`, `depot_reviews.user_id`, `vehicle_blocks.created_by` y `media_images.uploaded_by` quedan como referencias lógicas al id del usuario.

## 3. API Gateway (`gateway/`)

NestJS 10 + `http-proxy-middleware`. No tiene base de datos ni secretos.

| Responsabilidad | Cómo |
|---|---|
| Punto de entrada único | Toda petición pública pasa por el gateway. La tabla `src/routes.ts` asigna prefijo → servicio (gana el más largo): `/api/auth` y `/api/admin/users` → `ms-identidad`; el resto → `ms-reservas` |
| Trazabilidad | Respeta el `X-Correlation-Id` entrante o genera `cid-gw-xxxxxxxx`; lo reenvía al servicio y lo devuelve. Los servicios lo propagan en sus llamadas entre sí, así que el mismo `cid` aparece en los logs de los tres |
| Límite de peticiones | 300 por minuto y por IP del cliente (`RATE_LIMIT_PER_MINUTE`), con cabeceras `RateLimit`; al pasarse responde 429 `RATE_LIMITED` |
| IP real del cliente | Solo confía en `X-Forwarded-For` hasta `TRUST_PROXY_HOPS` saltos (el front-end de Azure). Reenvía al servicio esa IP limpia, y el servicio la lee con su propio `TRUST_PROXY_HOPS` |
| Errores uniformes | Servicio caído → 502 `UPSTREAM_UNAVAILABLE`; servicio lento → 504 `UPSTREAM_TIMEOUT`. Mismo formato Problem Details del contrato v3 |
| Salud agregada | `GET /gateway/health` consulta el `/health` de cada servicio: 200 `HEALTHY` o 503 `DEGRADED` con el detalle por servicio |
| Logs estructurados | JSON con hora ISO, `cid`, servicio de destino, estado y tiempo de respuesta. No registra `Authorization`, cookies ni `X-API-Key` |
| Cuerpo intacto | El gateway no lee ni transforma el cuerpo (`bodyParser: false`); la validación y la autenticación (`X-API-Key`, JWT) siguen en cada servicio |

**Por qué el gateway no valida el JWT:** cada servicio verifica el token por su cuenta con la clave pública de `ms-identidad` (defensa en profundidad: un servicio no confía en que otro ya validó). El gateway queda sin claves ni secretos.

## 4. ms-identidad (`ms-identidad/`)

NestJS 10 + TypeORM. Dueño único de los usuarios.

| Ruta | Quién la usa | Qué hace |
|---|---|---|
| `POST /api/auth/register` | Web | Crea un CLIENTE (RN27: el rol enviado se ignora) y devuelve el token |
| `POST /api/auth/login` | Web | Token RS256; mismo 401 para correo inexistente, clave incorrecta o cuenta inactiva. Límite: 10 intentos/min por IP |
| `GET /api/auth/me` | Web y **ms-reservas** | Datos de la cuenta; 401 si está desactivada |
| `GET/POST/PATCH/DELETE /api/admin/users…` | Panel (solo ADMIN) | Alta, edición, cambio de rol, desactivación, contraseña y borrado |
| `GET /.well-known/jwks.json` | **ms-reservas** | Clave pública (RFC 7517) para verificar los tokens |
| `GET /health` | Gateway y Azure | 200 si la BD responde |

Las rutas y respuestas son las mismas que tenía el monolito, así que el frontend no cambió.

### Contratos entre servicios

| Llamada | Para qué | Autenticación | Si el otro servicio no responde |
|---|---|---|---|
| ms-reservas → `GET ms-identidad/.well-known/jwks.json` | Verificar la firma de los tokens | Pública (es una clave pública); `jose` la guarda en caché | Se sigue usando la clave en caché |
| ms-reservas → `GET ms-identidad/api/auth/me` | En cada petición autenticada: ¿la cuenta sigue activa? ¿qué rol tiene **ahora**? | El mismo token del usuario | Se usan los datos del token (firmado, expira en 2 h) para no dejar fuera a quien ya inició sesión |
| ms-identidad → `GET ms-reservas/api/admin/user-usage` | Reservas, reseñas y bloqueos por usuario: columna "Reservas" del panel y regla "no eliminar cuentas con historial" | Se propaga el token del admin (ms-reservas exige rol ADMIN) | La lista sale con reservas = `null` ("—" en la web); el borrado responde 503 (no se elimina sin poder comprobar el historial) |

Todas llevan `X-Correlation-Id`. Son llamadas directas entre servicios (no pasan por el gateway) y tienen timeout (3 s y 5 s).

### Seguridad

- **RS256 en lugar de HS256:** solo `ms-identidad` tiene la clave privada (`IDENTITY_JWT_PRIVATE_KEY`, solo en la configuración de Azure). Los demás servicios verifican con la pública: ninguno puede emitir tokens ni necesita compartir un secreto.
- `ms-reservas` acepta solo `alg: RS256`, emisor `rutalibre-identidad` y audiencia `rutalibre-internal-api`. Los tokens HS256 del monolito anterior (aunque usen el mismo secreto) se rechazan.
- Contraseñas con bcrypt (costo 12). Al migrar se movieron los hashes tal cual: nadie tuvo que cambiar su clave.
- Desactivar una cuenta o quitarle el rol de ADMIN aplica en la siguiente petición, en los dos servicios.
- Debe quedar al menos un administrador activo; un admin no puede quitarse el rol, desactivarse ni eliminarse.

### Migración de datos

`src/database/prepare-db.ts` corre antes de arrancar el servicio: crea el schema `identidad`, aplica las migraciones (su historial vive en `identidad.migrations`) y crea los usuarios de demostración que falten.

La migración `IdentitySchema` **mueve** `public.users` a `identidad.users` (`ALTER TABLE … SET SCHEMA`) en una transacción: conserva ids, hashes, índices y restricciones. Mientras termina el despliegue deja una vista `public.users` (con los valores por defecto) para la versión anterior de `ms-reservas`. La migración `UsersToIdentityService` de `ms-reservas` borra esa vista y las claves foráneas hacia `users`.

El orden de producción (identidad → reservas) se ensayó sobre una base temporal con el estado actual de producción. Usuarios y claves foráneas antes, durante y después:

| Momento | Usuarios | Claves foráneas hacia `users` |
|---|---|---|
| Antes | en `public` | 4 |
| Tras desplegar `ms-identidad` | todos en `identidad`; el registro por la vista funciona | 4 |
| Tras desplegar `ms-reservas` | todos en `identidad`; la vista ya no existe | 0 |

## 5. Pruebas

| Proyecto | Pruebas | Qué cubren |
|---|---|---|
| `gateway/` | 15 | Reenvío, correlación, IP real, 502/504, salud agregada, 429, tabla de rutas real de la fase B y enrutamiento a dos servicios |
| `ms-identidad/` | 19 (con BD) | Registro, reglas de correo/nombre/teléfono, Gmail, login, límite de 10 intentos/min por IP, JWKS y verificación RS256, rechazo de HS256, gestión de usuarios, llamada a ms-reservas (token y `cid` propagados; degradación si no responde), cambios de estado y rol al instante, schema `identidad` |
| `backend/` (ms-reservas) | 320 | Todo lo anterior del monolito, más: tokens RS256 de ms-identidad (válido, alterado, expirado, otro emisor, HS256 heredado), rol del token y del estado actual, llamada a ms-identidad con un servidor falso (rol actual, cuenta desactivada, servicio caído), `/api/admin/user-usage` |
| `e2e/` (Playwright) | 7 | La web entra por el gateway: registro y login en ms-identidad, compra y panel en ms-reservas |

Los tests de `ms-reservas` no levantan ms-identidad: `test/setup-env.ts` genera un par de claves RSA por archivo y `test/identity-tokens.ts` firma tokens iguales a los de ms-identidad.

## 6. Variables

| Servicio | Variable | Local | Azure |
|---|---|---|---|
| gateway | `MS_RESERVAS_URL` | `http://localhost:3001` | URL de `rutalibre-ms-reservas` |
| gateway | `MS_IDENTIDAD_URL` | `http://localhost:3002` | URL de `rutalibre-ms-identidad` |
| gateway | `TRUST_PROXY_HOPS` | `0` | `1` |
| ms-reservas | `IDENTITY_URL` | `http://localhost:3002` | URL de `rutalibre-ms-identidad` |
| ms-reservas | `TRUST_PROXY_HOPS` | `0` directo, `1` detrás del gateway | `2` (front-end de Azure + gateway) |
| ms-reservas | `PUBLIC_BASE_URL` | URL del gateway | URL del gateway (los enlaces HATEOAS apuntan a la entrada pública) |
| ms-identidad | `DATABASE_URL` | la misma BD local | la misma de Supabase (usa solo el schema `identidad`) |
| ms-identidad | `IDENTITY_JWT_PRIVATE_KEY` | vacía (clave efímera) | clave RSA 2048 (secreta) |
| ms-identidad | `MS_RESERVAS_URL` | `http://localhost:3001` | URL de `rutalibre-ms-reservas` |
| ms-identidad | `TRUST_PROXY_HOPS` | `1` detrás del gateway | `2` |
| ms-identidad | `CORS_ORIGINS` | `http://localhost:5173` | la URL de la web (igual que ms-reservas) |
