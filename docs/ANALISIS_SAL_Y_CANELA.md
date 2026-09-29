# Análisis del proyecto de referencia Sal-y-Canela

Fuente: `referencias/sal-y-canela/` (zip `Sal-y-Canela-dev (9).zip`, proyecto "Reto 2" de Desarrollo de Plataformas). Es **Prioridad 5**: sirve solo como referencia de nivel técnico. **No se reutiliza su dominio ni su código.**

## 1. Arquitectura observada

```
Sal-y-Canela/
├── index.html, js/, assets/        ← versión 1: SPA vanilla JS (legado, sigue en el repo)
├── frontend/
│   ├── controllers/, models/, views/  ← versión 2: vanilla "MVC" (legado)
│   ├── src/                            ← versión 3: React 18 + Vite (actual)
│   │   ├── App.jsx (310 líneas, orquesta todo)
│   │   ├── components/ (AdminView, CajeroView 604 líneas, MenuView...)
│   │   ├── context/AppContext.jsx (useReducer global)
│   │   ├── models/*.model.js (fetch a la API con JWT)
│   │   └── utils/config.js, supabase.js
│   └── dist/                           ← build commiteado
├── server/                         ← Express 4 + Prisma 5 + PostgreSQL (Supabase)
│   ├── routes/ → controllers/ → models/ (Prisma)
│   ├── middleware/ auth (JWT), roles, validar (express-validator), errorHandler, logger
│   └── prisma/ schema.prisma (17 modelos), seed.js, SQL sueltos
├── vercel.json                     ← frontend estático + API serverless en Vercel
└── .github/workflows/ci.yml        ← CI que valida la versión vanilla y despliega a GitHub Pages
```

| Aspecto | Observado |
|---|---|
| Estilo | Monolito, frontend y backend separados, REST con JSON |
| Backend | `routes → controllers → models`. **No hay capa de servicios**: la lógica de negocio vive en los controllers (ej. `pedidos.controller.create` calcula IVA, valida stock y persiste) |
| Persistencia | Prisma sobre PostgreSQL (Supabase); `prisma db push` (sin migraciones versionadas); SQL manuales (`reset.sql`, `create_sc_tables.sql`, `seed_database.sql`) en paralelo |
| Autenticación | JWT HS256 (8 h) en `Authorization: Bearer`, guardado en `sessionStorage`; bcryptjs |
| Autorización | Middlewares `soloAdmin`, `soloCajeroOAdmin`, `propioOAdmin`; 4 roles |
| Validación | `express-validator` en rutas → 422 con detalle de campos |
| Errores | `errorHandler` central; oculta el stacktrace en producción |
| Logs | morgan + logger propio por `console` |
| Documentación API | Tabla en el README; **sin OpenAPI/Swagger** |
| Tests | **Ninguno** |
| CI/CD | GitHub Actions valida archivos de la versión vanilla (no el backend ni React) y publica en GitHub Pages; el despliegue real es Vercel |

## 2. Fortalezas

1. Separación clara entre frontend y backend, y rutas REST bien nombradas.
2. Uso correcto de bcrypt y exclusión explícita de `passwordHash` en las respuestas.
3. Mensaje de login idéntico para usuario o contraseña incorrectos (evita la enumeración de usuarios).
4. El registro público fuerza `rol: 'usuario'` en el backend (no se puede escalar privilegios desde el body).
5. CORS con lista blanca por variable de entorno.
6. Manejador de errores central que no filtra el stacktrace en producción.
7. **Snapshot histórico** en `PedidoDetalle` (`nombreProducto`, `precioUnitario`): la idea correcta para conservar el precio de la reserva.
8. Uso de `Decimal` para dinero en la BD.
9. `.env.example` documentado y README con endpoints y medidas OWASP.
10. Health check `/api/health`.

## 3. Problemas detectados

| # | Problema | Evidencia | Impacto |
|---|---|---|---|
| P1 | **Clave anon de Supabase y URL escritas en el código del frontend** | `frontend/src/utils/config.js` | Si RLS no está bien configurado, la BD queda accesible desde el navegador |
| P2 | **Usuarios con contraseña en texto plano** como fallback (`password: '1234'`) y login local comparando en claro | `frontend/controllers/autenticacion.js` | Bypass completo de la autenticación del backend |
| P3 | Doble canal de persistencia (API + Supabase directo + localStorage) | `autenticacion.js`, `supabase.js` | Inconsistencias; reglas de negocio eludibles |
| P4 | Lógica de negocio en los controllers (sin servicios) | `pedidos.controller.js` | No se puede reutilizar desde otra API (justo lo que necesitamos para el Hub) ni probar en aislamiento |
| P5 | Controllers que llaman a `prisma` directamente, saltándose los models | `reservaciones.controller.js` | Capas inconsistentes |
| P6 | Tres versiones del frontend conviviendo (vanilla, vanilla MVC, React) + `dist/` commiteado | árbol del repo | Confusión, código muerto, difícil de defender |
| P7 | Sin tests de ningún tipo | — | Regresiones invisibles |
| P8 | CI valida la versión obsoleta y despliega a una plataforma distinta de la real | `ci.yml` vs `vercel.json` | El CI no protege nada |
| P9 | `prisma db push` + SQL manuales, sin migraciones versionadas | README, `prisma/*.sql` | El esquema de producción no es reproducible |
| P10 | Magic values (`IVA_PCT = 15`, estados como strings sueltos, `precio` duplicado en el frontend) | controllers, `config.js` | El cálculo de precio queda duplicado en cliente y servidor |
| P11 | Sin API documentada con OpenAPI | README | No cumpliría C4 de esta rúbrica |
| P12 | Reservaciones sin control de solapamiento | `reservaciones.controller.create` | En autos sería un error crítico (doble alquiler) |
| P13 | Reglas de negocio con listas duplicadas (`valid = [...]`) en lugar de enums compartidos | controllers | Divergencia con el schema |
| P14 | Formato de error propio (`{ error }`) | middleware | Incompatible con `ProblemDetails` del contrato |
| P15 | Archivos gigantes (`CajeroView.jsx` 604 líneas, `styles.css` 2 241 líneas ×3 copias) | frontend | Mantenimiento difícil |

## 4. Reutilizable conceptualmente

- Estructura del monorepo `frontend/` + backend + `docs/`.
- Patrón de middleware de autenticación + roles (en NestJS pasará a **Guards**: `UserJwtGuard`, `RolesGuard`).
- Exclusión explícita de campos sensibles en las respuestas.
- Snapshot histórico de precios y nombres en la reserva.
- `.env.example` + CORS por variable de entorno.
- Seeds con usuarios de demo con hash.
- Sección OWASP en el README (bien valorada en defensa).
- Uso de React + Vite en el frontend.

## 5. Lo que NO debe repetirse

1. Secretos o claves en el frontend. **El frontend solo habla con nuestro backend.**
2. Fallbacks de autenticación en el cliente o persistencia paralela en localStorage.
3. Lógica de negocio en controllers.
4. Varias versiones del frontend en el repo y `dist/` commiteado.
5. `db push` en producción; en su lugar, **migraciones versionadas**.
6. CI que no ejecuta tests del código real.
7. Cálculo de precios en el cliente como fuente de verdad (el cliente **solo muestra** lo que calcula el backend).
8. Documentar la API a mano en el README sin OpenAPI.
9. Componentes de más de ~250 líneas.

## 6. Mejoras aplicadas al nuevo proyecto

| Sal-y-Canela | Proyecto de autos |
|---|---|
| Express sin estructura impuesta | **NestJS** (módulos, DI, guards, pipes), alineado con la plantilla del equipo de integración |
| Controller con la lógica | Controller (HTTP) → **Service** (reglas) → **Repository** (TypeORM) |
| Prisma `db push` | **Migraciones TypeORM** versionadas + seeds |
| Sin tests | Unit + integración + **contrato** + E2E en CI |
| README con endpoints | **OpenAPI** oficial (Swagger + Redoc) + OpenAPI interno generado |
| `{ error: '...' }` | **RFC 7807 ProblemDetails** en todas las respuestas de error |
| Sin control de concurrencia | Bloqueo de fila + **constraint de exclusión** en PostgreSQL |
| JWT único | Dos mecanismos separados: JWT de usuario web / OAuth2 con scopes para el Hub |
| CI de otra versión | GitHub Actions: lint, typecheck, tests (con Postgres de servicio), build |
| Supabase desde el cliente | El cliente solo consume nuestra API |
