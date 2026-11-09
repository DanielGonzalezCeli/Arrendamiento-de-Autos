# Reto 2: migración a microservicios

Documento vivo: se actualiza al cerrar cada fase.

## 1. Estrategia: Strangler Fig

No se reescribe el sistema de golpe. Se pone un **API Gateway** delante del monolito y los servicios se van sacando uno por uno; el gateway decide a qué servicio va cada ruta. En cada paso Booking y la web siguen funcionando con la misma URL.

| Fase | Contenido | Estado |
|---|---|---|
| A | API Gateway delante del monolito (que pasa a ser `ms-reservas`) | Hecha (local y CI) |
| B | `ms-identidad` (usuarios, login, roles, JWT) | Pendiente |
| C | `ms-clientes` (clientes cross-platform, contrato v3.1) | Pendiente |
| D | RabbitMQ + `ms-inventario-stock` (estado de flota y stock hacia Booking por eventos) | Pendiente |
| E | Métricas, traza distribuida y pruebas entre servicios | Pendiente |
| F | Documento técnico final y guía de defensa | Pendiente |

## 2. Arquitectura actual (fase A)

```
Booking (Paúl) ─┐
Web / panel  ───┼─► API Gateway (gateway/) ──REST──► ms-reservas (backend/) ──► PostgreSQL (Supabase)
                │     · enrutamiento por prefijo          │
                │     · X-Correlation-Id                   ├─HTTP/gRPC─► Booking (stock)
                │     · límite por IP (429)                └─HTTP──────► Booking (check-in)
                │     · errores 502/504 en Problem Details
                │     · /gateway/health agregado
```

## 3. API Gateway (`gateway/`)

NestJS 10 + `http-proxy-middleware`. No tiene base de datos ni secretos.

| Responsabilidad | Cómo |
|---|---|
| Punto de entrada único | Toda petición pública pasa por el gateway. La tabla `src/routes.ts` asigna prefijo → servicio (gana el más largo) |
| Trazabilidad | Respeta el `X-Correlation-Id` entrante o genera `cid-gw-xxxxxxxx`; lo reenvía al servicio y lo devuelve. El mismo `cid` aparece en el log del gateway y en el del servicio |
| Límite de peticiones | 300 por minuto y por IP del cliente (`RATE_LIMIT_PER_MINUTE`), con cabeceras `RateLimit`; al pasarse responde 429 `RATE_LIMITED` |
| IP real del cliente | Solo confía en `X-Forwarded-For` hasta `TRUST_PROXY_HOPS` saltos (el front-end de Azure). Reenvía al servicio esa IP limpia, y el servicio la lee con su propio `TRUST_PROXY_HOPS` |
| Errores uniformes | Servicio caído → 502 `UPSTREAM_UNAVAILABLE`; servicio lento → 504 `UPSTREAM_TIMEOUT`. Mismo formato Problem Details del contrato v3 |
| Salud agregada | `GET /gateway/health` consulta el `/health` de cada servicio: 200 `HEALTHY` o 503 `DEGRADED` con el detalle por servicio |
| Logs estructurados | JSON con hora ISO, `cid`, servicio de destino, estado y tiempo de respuesta. No registra `Authorization`, cookies ni `X-API-Key` |
| Cuerpo intacto | El gateway no lee ni transforma el cuerpo (`bodyParser: false`); la validación y la autenticación (`X-API-Key`, JWT) siguen en cada servicio |

**Por qué la autenticación no está en el gateway todavía:** hoy la valida el monolito y funciona. Moverla en esta fase duplicaría reglas sin ganar nada. Cuando exista `ms-identidad` (fase B), el gateway podrá validar el JWT antes de reenviar.

### Pruebas

`gateway/test/gateway.spec.ts`, 12 pruebas con un microservicio falso:
- reenvío de método, ruta, query y cuerpo;
- `X-Correlation-Id` propagado o generado;
- IP del cliente sin cadenas falsas;
- 504 por timeout y 502 con el servicio caído;
- salud agregada `HEALTHY` y `DEGRADED`;
- 429;
- tabla de rutas y validación de la configuración.

En el CI, el E2E de Playwright entra por el gateway (puerto 3000 → `ms-reservas` en 3001), igual que en producción.

## 4. Variables

| Servicio | Variable | Local | Azure |
|---|---|---|---|
| gateway | `MS_RESERVAS_URL` | `http://localhost:3000` | URL de la Web App de `ms-reservas` |
| gateway | `TRUST_PROXY_HOPS` | `0` | `1` |
| ms-reservas | `TRUST_PROXY_HOPS` | `0` directo, `1` detrás del gateway | `2` (front-end de Azure + gateway) |
| ms-reservas | `PUBLIC_BASE_URL` | URL del gateway | URL del gateway (los enlaces HATEOAS apuntan a la entrada pública) |
