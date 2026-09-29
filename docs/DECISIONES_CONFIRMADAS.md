# Decisiones confirmadas por el equipo de integración (2026-09-29)

Respuestas a los puntos **[CONFIRMAR]** de `ANALISIS_CONTRATO.md`. Prevalecen sobre las propuestas iniciales.

| # | Tema | Respuesta del equipo de integración | Impacto en nuestro diseño |
|---|---|---|---|
| 1 | Ruta base | **`/autos/v1`** (bloque `servers` del contrato). Si el gateway usa `/api/v1/autos`, hará proxy hacia `/autos/v1` | API de integración montada en **`/autos/v1/*`**. API interna en `/api/*`. Docs del contrato: `/autos/v1/docs` (Swagger UI) y `/autos/v1/redoc` |
| 2 | Tokens | RDA1: tokens mock o **self-signed** locales. RDA2: IdP central (Keycloak, Supabase Auth, Auth0). **Scopes como array** en los claims. Firma **RS256**, verificación con **JWKS** | `OAuth2Guard` con `jose` + RS256. Scopes desde el claim array `scopes` (se acepta también `scope` string por compatibilidad). RDA1: emisor local `POST /oauth2/token` + JWKS propio en `/.well-known/jwks.json`. RDA2: solo cambia `INTEGRATION_JWKS_URL` e `INTEGRATION_JWT_ISSUER` |
| 3 | `X-Affiliate-Id` | Producción: validar contra afiliados. RDA1: se acepta cualquier entero (mock), pero el código debe contemplar comisiones y límites por afiliado | Tabla `affiliates` (id, nombre, `commission_rate`, `rate_limit_per_min`, `active`). Modo `AFFILIATE_VALIDATION=lenient` (RDA1: cualquier entero, se registra) o `strict` (debe existir y estar activo). El rate limit usa el afiliado como clave. `affiliate_id` se guarda en la sesión de búsqueda y en la reserva (base para comisiones) |
| 4 | Errores | 401 sin token, expirado o firma inválida; 403 token válido sin scope; 404 recurso inexistente (`orderId`, `vehicle_id`). Idempotencia: misma clave y mismo payload → misma respuesta (200/201); misma clave y otro body → **409** | Filtro ProblemDetails con esos status. El campo `code` (enum cerrado, obligatorio) usa `VALIDATION_FAILED` para 401/403/404/409-idempotencia, con `title` y `detail` específicos (decisión nuestra: es el único valor genérico del enum) |
| 5 | Respuesta de `cancel` | **200 sin cuerpo** (o un mensaje simple); no hay schema | `POST /autos/v1/orders/{id}/cancel` → **200 con cuerpo vacío**. El reintento idempotente también devuelve 200 vacío |
| 6 | Firma de webhooks | `X-Hub-Signature-256` o `X-Autos-Signature`, HMAC-SHA256 del cuerpo con el `secret` de la suscripción | Header **`X-Hub-Signature-256: sha256=<hex>`** (formato de facto de la industria) |
| 7 | Significado de `vehicle_id` | **Modelo / categoría comercial** ("Toyota Corolla o similar"), no una unidad física. La placa se asigna en el mostrador | **Cambio de modelo de datos**: `vehicle_models` (oferta comercial, `id` = `vehicle_id`) + `fleet_units` (unidades físicas con placa). La disponibilidad es **por inventario** (unidades del modelo en la agencia − reservas, holds y bloqueos que se solapan). La unidad física se asigna al registrar la entrega (operación de admin) |
| 8 | Escala de score | Decimal 0–10 (ej. 8.5); basta con que sea numérico | Reseñas con puntaje 1–10; `/depots/reviews/scores` devuelve el promedio con 1 decimal |
| 9 | Monedas | Patrón `^[A-Z]{3}$`; el DTO acepta cualquier código de 3 letras. Soportar al menos **USD y EUR**; en Ecuador procesar en USD | DTO: solo el patrón. Tarifas en USD; conversión por `currency_rates` (USD=1, EUR, más COP, PEN, MXN y GBP de ejemplo, editables por el admin). Código bien formado sin tasa configurada → 400 `VALIDATION_FAILED` con `invalidParams: currency` |

## Decisiones del estudiante

| Tema | Decisión |
|---|---|
| Stack | NestJS + TypeORM (plantilla), React + Vite |
| Fecha de entrega | Próxima semana (≈ 2026-10-06) → plan comprimido a 7 días |
| Base de datos en la nube | **Supabase** (solo como PostgreSQL, vía Session pooler); sin Supabase Auth ni clave `anon` en el frontend |
| Hosting | **Todo en Render**: API (Docker) + frontend (sitio estático), en un solo `render.yaml` |
| Repositorio | https://github.com/DanielGonzalezCeli/Arrendamiento-de-Autos |
