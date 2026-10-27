# Reto 2 — Fase A: diagnóstico y plan de trabajo

Fecha: 2026-10-27 · Estado de partida: Reto 1 aprobado (50/50), commit `b620507`, CI en verde.

Este documento compara lo que existe en el repositorio con lo que piden los documentos del Reto 2, identifica lo que falta y propone un plan por fases. **No se modificó código en esta fase.**

---

## 0. Actualización — contrato v3 y guía oficial (2026-10-27)

El equipo de integración entregó tres archivos "oficiales y definitivos": `GUIA_INTEGRACION_AUTOS.md`, `autos-openapi-v3.yaml` (v3.0.0) e `inventory.proto`. **El v3 reemplaza al v2**; el resto de este documento sigue siendo válido salvo en lo que se indica aquí.

### 0.1. Qué cambia del v2 al v3

| Tema | v3 |
|---|---|
| Ruta base | `/api/v3` (se mantienen `/api/v2` y `/api/v1` como compatibilidad) |
| Idioma | Campos **canónicos en inglés**; se toleran alias en español al leer. Reserva: `vehicle_id`, `pickup_date`, `dropoff_date`, `driver` (`full_name`, `email`, `phone`, `license_number`, `age`), `coverage_type` (`BASIC`/`TOTAL`), `pickup_time`/`dropoff_time` (por defecto `10:00`) |
| Errores y Saga | **409** (`VEHICLE_UNAVAILABLE`, `OUT_OF_STOCK`, `VEHICLE_IN_CLEANING_COOLDOWN`) es el **único** que dispara la compensación en Booking; **422** (`DRIVER_UNDERAGE`, `INVALID_DATES`, `INVALID_PAYLOAD`) no la dispara; **400** (`MALFORMED_REQUEST`, `IDEMPOTENCY_CONFLICT`). Ojo: el conflicto de idempotencia es **400**, no 409 como en el v1 |
| Booking en producción | `https://rda1-backend-integracion-sistemas.onrender.com/api/v3`; panel de nodos en `https://rda1-api.onrender.com/admin/dashboard` |
| Flujo principal | Booking → `POST /reservas` (o `/orders/create`) en nuestra URL base, con `Idempotency-Key` y `X-Correlation-Id`. Nosotros → `PushStockUpdate` por gRPC ante **cada cambio de estado** de un auto |
| gRPC | `available_units` 1 (disponible) / 0 (reservado, entregado o en limpieza); nuevo campo **`slot_id`**; la respuesta trae **`error_code`** y **`current_available`** |
| Semáforo | Booking hace `GET /autos/health`; si respondemos en **menos de 4 s** el nodo queda 🟢 |
| Auditoría | Logs **en archivo** con `correlation_id` e `idempotency_key`; alerta de mantenimiento registrada en log |

### 0.2. Directiva de la cátedra (bloquea el inicio del código de integración)

> *"Todos los microservicios deben ser iguales para todo el equipo para que se puedan integrar, caso contrario fallará. Primeramente se debe solventar el tema de los requerimientos, reunirse cada grupo y definir cómo van a crear el modelo de datos unificado."*

Antes de programar la integración, **los compañeros de la vertical de Autos deben reunirse** y acordar: un modelo de datos único (script SQL maestro, *database-per-service*), la división de microservicios y el reparto del trabajo. Para esa reunión preparamos una propuesta en [`RETO2_PROPUESTA_EQUIPO_AUTOS.md`](RETO2_PROPUESTA_EQUIPO_AUTOS.md) y [`propuesta-equipo-autos/02_microservicios_autos_v3.sql`](propuesta-equipo-autos/02_microservicios_autos_v3.sql).

No sabemos quiénes son los demás compañeros de la vertical de Autos: **hay que preguntarlo al equipo de integración o al profesor**.

### 0.3. Hallazgos nuevos (verificados)

1. **El puerto gRPC de Booking en producción no es accesible desde Internet.** Una conexión TCP a `rda1-backend-integracion-sistemas.onrender.com:50051` no se establece; el 443 sí. Render solo publica HTTPS, así que el `PushStockUpdate` hacia producción **no puede funcionar** tal como está documentado. Solo funcionaría en la prueba local por Tailscale.
2. ~~Falta el archivo `inventory.proto`.~~ **Resuelto:** el usuario lo agregó en `contracts/inventory.proto` (SHA-256 `e5a3661b…0434f31`). Trae `slot_id`, `error_code`, `current_available` y un método nuevo, `GetSlotAvailability`. Pero **contradice a la guía**: indica el servidor `booking.epn.edu.ec:50051` (el dominio no existe en DNS), `time_slot` como `"10:30 a.m."`/`"10:30:00"` (la guía usa `"10:00"`) y `slot_id` como `"slot-YYYYMMDD-HHMM"` (la guía incluye el `vehicle_id`).
3. **La respuesta de ejemplo de la guía no coincide con el esquema del contrato.** La guía devuelve `status: "RESERVADO"`, `vehicle_id` y `voucher_qr_payload`; el esquema `AutoOrderResponseV2` usa `status: "CONFIRMED"`, `auto_id` y `voucher_qr_data`. Ídem en el 409: la guía usa `instance: "/reservas"` y el contrato `/api/v2/autos/orders/create`.
4. **Ruta exacta de la reserva ambigua.** El contrato define `/autos/reservas` bajo `/api/v3`; la guía dice que Booking envía `POST /reservas` a la URL base registrada. ¿La URL completa es `<base>/api/v3/autos/reservas` o `<base>/reservas`?
5. **Autenticación:** la guía lista como obligatorias solo `Content-Type`, `Idempotency-Key` y `X-Correlation-Id`; no menciona token ni API key, aunque el contrato declara seguridad global (JWT o `X-API-Key`).
6. **Semáforo de 4 s vs Render gratuito:** si nuestra API está dormida (~50 s en despertar), el nodo aparecerá 🔴. Hace falta mantenerla despierta o una instancia siempre activa.
7. **Roles:** la guía agrega `OPERADOR` a `CLIENTE`, `ADMIN` y `MANTENIMIENTO`.

> **Actualización:** el equipo de integración respondió todas las preguntas. Respuestas, decisiones y rutas finales en [`RETO2_PREGUNTAS_INTEGRACION.md`](RETO2_PREGUNTAS_INTEGRACION.md#respuestas-del-equipo-de-integración-2026-10-27-y-decisiones). En resumen: gRPC solo por Tailscale (respaldo HTTP en la nube), base URL `…/api/v3`, semáforo en `GET {base}/health`, sin broker obligatorio.

### 0.4. Preguntas adicionales para el equipo de integración

> **Versión vigente y corregida:** [`RETO2_PREGUNTAS_INTEGRACION.md`](RETO2_PREGUNTAS_INTEGRACION.md). La lista de abajo y la del §8 quedan como historial.

10. ¿Nos envían el archivo **`inventory.proto` v3**? Solo llegaron la guía y el YAML.
11. El puerto **50051 en Render no es accesible desde Internet** (lo comprobamos). ¿Cómo enviamos el stock a Booking en producción: por otro host o puerto, o gRPC sobre 443 con TLS?
12. ¿La URL completa de la reserva es `<base>/api/v3/autos/reservas` o `<base>/reservas`? ¿Y la del semáforo, `<base>/api/v3/autos/health`?
13. ¿El `201` de la reserva debe seguir el esquema del contrato (`status: "CONFIRMED"`, `auto_id`) o el ejemplo de la guía (`status: "RESERVADO"`, `vehicle_id`)?
14. ¿Booking enviará algún token o `X-API-Key` en la reserva, o el endpoint queda sin autenticación?
15. ¿Quiénes son los compañeros de la vertical de Autos y cuándo es la reunión de alineación?

## 1. Documentos analizados

| Documento | Disponible | Observaciones |
|---|---|---|
| Rúbrica del Reto 2 (imagen, 11 criterios) | Sí | Criterio 1 obligatorio y excluyente: todas las tiendas integradas con Booking |
| `autos-openapi-v2.yaml` (contrato v2.0.0) — **reemplazado por el v3** (§0) | Solo como adjunto en el chat | **No está en el repositorio** ni en la plantilla del equipo de integración (`referencias/`, sin cambios desde `090e863`). Hace falta el archivo original para versionarlo con su huella |
| Contrato gRPC `inventory.proto` | Versión v2 embebida en el contrato v2; **la versión v3 no llegó** (§0.3) | La guía v3 menciona campos que no están en el v2: hace falta el archivo nuevo |
| Guía de prueba local con Tailscale | Sí | Solo configuración: `0.0.0.0`, firewall, IP `100.x`, HTTP sin TLS, gRPC sin TLS |
| Proyecto de la asignatura (PDF) | Sí | Reto 2 = semanas 7–11: microservicios, API Gateway, contract testing, observabilidad, seguridad |
| Mensajes del grupo de integración (2) | Sí | Booking registra cada tienda con su **URL base** (`…/api/v2`), hace **Ping** (semáforo) y **Sincronizar** (importa el catálogo) |
| Colección de Postman | **No** | No se recibió |
| Credenciales / mecanismo de autenticación de Booking hacia las tiendas | **No** | El contrato admite JWT (`BearerAuth`) o `X-API-Key`, sin indicar cuál usa Booking ni cómo se intercambian |

## 2. Estado real del proyecto (verificado en el repositorio)

| Aspecto | Estado actual |
|---|---|
| Backend | NestJS 10 + TypeORM 0.3, **un solo proceso** (monolito modular con 16 módulos) |
| Frontend | React 19 + Vite 8 + Tailwind 4 + TanStack Query (SPA) |
| Base de datos | PostgreSQL en Supabase, 26 tablas, 6 migraciones |
| APIs | `/autos/v1/*` (contrato v1, 15 operaciones) y `/api/*` (API interna del marketplace y del panel) |
| Seguridad | Usuarios: JWT HS256 + roles (rol y estado verificados en BD en cada petición). Hub: OAuth2 client credentials (JWT RS256 + scopes) + `X-Affiliate-Id` |
| Eventos | Transactional outbox + webhooks firmados (HMAC) con reintentos; AsyncAPI propio |
| Pruebas | 253 backend (unit, integración, API, contrato), 15 Vitest, 7 E2E Playwright; todas en GitHub Actions |
| Despliegue | Render: 1 servicio Docker (API) + 1 sitio estático (web), plan gratuito |
| Escucha de red | `app.listen(PORT)` sin host: Node escucha en todas las interfaces (sirve para Tailscale). Vite (`npm run dev`) solo en `localhost` |
| gRPC, RabbitMQ, Kafka, API Gateway, correlation-id | **No existen** |

**Conclusión:** el sistema es un monolito modular bien estructurado, no una arquitectura de microservicios. Su modularidad facilita la migración, pero el criterio 2 de la rúbrica exige migrar.

## 3. Hallazgo principal: el contrato v2 reemplaza al v1

El contrato v2 **no es una extensión del v1**: cambia rutas, nombres, modelo de datos, seguridad, errores y eventos. Nuestra API `/autos/v1` cumple el v1, pero **no sirve para el Reto 2 sin una nueva capa**.

| Tema | Contrato v1 (lo que tenemos) | Contrato v2 (lo que pide Booking) |
|---|---|---|
| Ruta base | `/autos/v1/*` | `/api/v2/autos/*` |
| Vehículo | `vehicle_id` = **modelo comercial** ("Kia Picanto o similar") con varias unidades | `vehicle_id` = **un auto concreto** (`auto-spark-01`) con su propio estado |
| Estados del auto | Solo de la orden (`CONFIRMED`…) y operativo (`PICKED_UP`, `RETURNED`) | Máquina de 6 estados por auto: `DISPONIBLE → RESERVADO → LISTO_PARA_ENTREGAR → ENTREGADO → EN_LIMPIEZA → EN_MANTENIMIENTO` |
| Búsqueda | `POST /search` con aeropuerto/ciudad/agencia, fecha-hora RFC 3339, `booker`, `driver` | `POST /autos/search` con `pickup_location` (texto), fecha + hora en franjas de 30 min, categorías `ECONOMICO…VAN`, transmisión `AUTOMATICO` |
| Flujo de reserva | `hold` → `preview` → `create` | `create` directo (con `Idempotency-Key`), más alias `POST /autos/reservas` |
| Operación en mostrador | Panel interno (entrega asigna placa, devolución) | Endpoints del contrato: check-in digital (QR), `checkin-entrega` (licencia + km), `checkin-devolucion` (km + combustible) |
| Limpieza entre alquileres | 60 min (regla RN08) | **Cooldown de 2 h** en estado `EN_LIMPIEZA`; reservar → 409 `VEHICLE_IN_CLEANING_COOLDOWN` |
| Cancelación | Gratis hasta 24 h antes; después, 1 día de penalidad | **Reembolso del 100 %** sin penalidad (compensación Saga), auto vuelve a `DISPONIBLE` |
| Edad | Mínimo según categoría (21/25); recargo menores de 25 | Recargo < 25 y **> 70**; **menores de 18 → 422** |
| Coberturas | Extra `CDW` | `BASICA` (franquicia $1.200 + depósito) vs `TOTAL` (franquicia $0) |
| Mantenimiento | Bloqueos de mantenimiento por fechas | Registro técnico con odómetro y alerta por `proximo_mantenimiento_km`, **rol `MANTENIMIENTO`** |
| Promociones | No existe | `GET/PUT /autos/promociones/contrato` (acuerdo B2B: % máximo de descuento, destinos, vigencia) |
| Seguridad | OAuth2 client credentials + scopes + `X-Affiliate-Id` | `BearerAuth` (JWT con roles `CLIENTE/ADMIN/MANTENIMIENTO`) **o** `X-API-Key`; catálogo, búsqueda, salud y flota públicos |
| Trazabilidad | `X-Request-Id` | `X-Correlation-Id` propagado en HTTP, logs y eventos |
| Errores | ProblemDetails con `code` cerrado e `invalidParams` | ProblemDetails con `instance`, `correlation_id`, `timestamp`, **`invalid_params`** (snake_case) y códigos nuevos |
| Eventos | Webhooks HMAC (`CAR_ORDER_CONFIRMED`…) | **CloudEvents 1.0** hacia RabbitMQ/Kafka (`ec.edu.epn.booking.autos.order.confirmed`…) + feed `GET /autos/eventos` (outbox) |
| Inventario | Booking consulta por REST | **Obligatorio gRPC**: la tienda **envía** cambios de stock a Booking (`PushStockUpdate`, puerto 50051) |
| Salud | `/health` → `{status: "ok"}` | `GET /autos/health` → `HEALTHY/DOWN/DEGRADED`, latencia, uptime, autos en cooldown, estado del circuit breaker |

### 3.1. Cómo encaja el v2 con nuestro modelo (propuesta)

La diferencia más importante, que el `vehicle_id` sea un auto concreto, **encaja bien** con lo que ya tenemos: nuestras **unidades de flota con placa** ya son autos concretos. Propuesta:
- En la API v2, `vehicle_id` = **unidad de flota** (por ejemplo `auto-pba-1234`). La máquina de 6 estados vive en la unidad.
- Una reserva v2 asigna **esa unidad** desde el inicio. La restricción `EXCLUDE` que impide reservas dobles por placa ya existe.
- El marketplace web puede seguir mostrando modelos ("o similar"); por dentro, ambos canales comparten las mismas reglas.

### 3.2. Conflictos de reglas de negocio (requieren decisión)

| Conflicto | Propuesta |
|---|---|
| Cancelación: 100 % de reembolso (v2) vs penalidad tardía (nuestra RN22) | Aplicar la regla v2 a las órdenes del canal Booking y mantener la actual para la web. Documentarlo como regla por canal |
| Limpieza: 2 h (v2) vs 60 min (nuestra) | Subir a 2 h para todos: es una regla operativa, no comercial, y evita dos inventarios distintos |
| Edad: > 70 con recargo y < 18 → 422 (v2) | Agregarlas; conservar la edad mínima por categoría |

### 3.3. Inconsistencias o ambigüedades del propio contrato v2 (consultar al equipo de integración)

1. **Rutas que chocan:** `GET /autos/{id}` comparte forma con `GET /autos/flota`, `/autos/health`, `/autos/eventos` y `/autos/orders`. Se resuelve registrando primero las rutas fijas, pero un auto nunca podrá llamarse `flota`, `health`, etc.
2. **Autorización por cabecera `X-Role`:** si se confía en ella, cualquiera puede decir que es `ADMIN`. Propuesta: el rol sale del JWT (o de la API key); `X-Role` solo se acepta como dato informativo.
3. **gRPC `date` + `time_slot`:** no queda claro qué fecha y franja enviar cuando un alquiler dura varios días (¿solo la franja de retiro? ¿una por cada franja?).
4. **Eventos:** el contrato menciona RabbitMQ, Kafka y el feed `GET /autos/eventos`, pero no da URL de broker ni dice cuál consume Booking.
5. **Campos duplicados en varios idiomas** (`marca`/`brand`, `asientos`/`seats`, `conductor.nombre`/`full_name`…) y ejemplos contradictorios (`asientos: 5` vs `seats: 4`): ¿son obligatorios ambos o basta uno?
6. **Seguridad:** ¿Booking enviará JWT (¿de qué emisor?) o `X-API-Key` (¿cómo se entrega la clave?)?

## 4. Matriz rúbrica → trabajo

| # | Criterio (Reto 2) | Componente | Existe hoy | Falta | Evidencia necesaria |
|---|---|---|---|---|---|
| 1 | Todas las tiendas integradas con Booking (**excluyente**) | API v2 + gRPC + eventos | API v1 (no compatible con v2) | Implementar el contrato v2 y el cliente gRPC; probar con Booking por Tailscale y en producción | Booking hace Ping (🟢) y Sincroniza nuestro catálogo; reserva creada desde Booking. **Depende también de los demás equipos** |
| 2 | Migración a microservicios | Backend | Monolito modular | Separar servicios con límites de dominio (§5) | Servicios desplegados por separado, diagrama, cada uno con su healthcheck |
| 3 | Booking consume APIs y/o eventos | API v2, gRPC, eventos | Webhooks v1 | Endpoints v2 + `PushStockUpdate` + CloudEvents/feed | Logs con `X-Correlation-Id` de llamadas reales de Booking; acuse gRPC |
| 4 | Marketplace web en entorno distribuido | Frontend + gateway | Marketplace contra el monolito | Apuntar al gateway; rediseño (prioridad del usuario) | Flujo de compra E2E pasando por el gateway |
| 5 | Administración operativa en arquitectura distribuida | Panel | Panel completo contra el monolito | Rutas por el gateway; vistas nuevas: estados v2, check-ins, mantenimiento, promociones, salud de servicios | E2E del panel contra los microservicios |
| 6 | API Gateway funcional | Nuevo servicio | No existe | Gateway con enrutamiento, JWT/API key, rate limit, correlation-id, manejo de errores | Rutas documentadas; prueba de que todo entra por el gateway |
| 7 | Contratos documentados y versionados | `contracts/` | v1 + AsyncAPI con checksum | Agregar v2 (archivo original) + `inventory.proto`; mantener v1; versionado | Contratos en el repo con huella; Swagger v2 |
| 8 | Pruebas de integración entre sistemas | Tests | Contract tests v1, E2E | Contract tests v2, pruebas gRPC, pruebas con Booking (Tailscale) | Reporte de pruebas + registro de la reunión de integración |
| 9 | Seguridad básica | Gateway + servicios | JWT + roles + OAuth2 + scopes | Esquema v2 (JWT/API key, rol `MANTENIMIENTO`), entre servicios | Pruebas 401/403 por rol y por API key |
| 10 | Todo desplegado en Internet | Render/Supabase | 2 servicios en Render | Desplegar gateway + servicios; salida gRPC hacia Booking | URLs públicas activas durante la presentación |
| 11 | Dominio técnico en la defensa | Documentación | Guía de defensa del Reto 1 | Actualizar arquitectura, diagramas y guía | Guía de defensa del Reto 2 |

## 5. Arquitectura propuesta (preliminar; se decide en la Fase C)

Separación razonable, sin fragmentar de más:

| Servicio | Responsabilidad | Módulos actuales que absorbe |
|---|---|---|
| **api-gateway** | Punto de entrada único: enrutamiento, JWT/API key, rate limit, `X-Correlation-Id`, errores uniformes | (nuevo) |
| **ms-identidad** | Usuarios, login, roles (`CLIENTE`, `ADMIN`, `MANTENIMIENTO`), emisión de tokens | `auth`, `users` |
| **ms-catalogo-flota** | Catálogo, agencias, flota y sus 6 estados, disponibilidad, precios, búsqueda, mantenimiento, fotos | `catalog`, `availability`, `search`, `media`, parte de `admin` |
| **ms-reservas** | Órdenes, checkout, check-ins, cancelación/compensación, pagos simulados, idempotencia, outbox | `orders`, `idempotency`, `internal-api/checkout`, parte de `admin` |
| **ms-integracion-booking** | Contrato v2 hacia Booking, cliente gRPC de stock, publicación de CloudEvents/feed, contrato de promociones | `integration-api`, `integration-auth`, `events` |

- **Datos:** un esquema de PostgreSQL por servicio (en la misma instancia de Supabase), sin acceso cruzado a tablas: cada servicio es dueño de sus datos.
- **Comunicación:** REST interno entre servicios + eventos (outbox). gRPC **saliente** hacia Booking.
- **Riesgo de despliegue:** en Render gratuito cada servicio se duerme y las horas gratuitas se comparten entre servicios. Hay que evaluar en la Fase C/F (por ejemplo, gateway + servicios en un plan con instancia siempre activa, u otro proveedor). gRPC saliente desde Render no requiere abrir puertos entrantes (nosotros somos el cliente).

## 6. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| La reunión de integración por Tailscale puede ser antes de terminar el rediseño | Llegar sin endpoints v2 → no se valida la integración (criterio excluyente) | Implementar primero una **porción mínima v2** (salud, catálogo/búsqueda, crear/consultar/cancelar orden, push gRPC) si la reunión es inminente |
| Ambigüedades del contrato v2 (§3.3) | Implementar algo que Booking no consume | Lista de preguntas al equipo de integración antes de la Fase D |
| Falta el archivo original del contrato v2 | No se puede versionar con huella exacta | Pedir el `.yaml` y el `.proto` originales |
| Migración a microservicios rompe funciones del Reto 1 | Regresiones | Migración por pasos, con las 275 pruebas actuales como red de seguridad |
| Límites del hosting gratuito con 5 servicios | Servicios dormidos o sin horas en la presentación | Decidir plataforma en la Fase C |
| Criterio 1 depende de los otros equipos | Puede no cumplirse aunque nuestra parte esté bien | Documentar nuestra evidencia por separado |

## 7. Plan de trabajo

| Fase | Contenido | Salida verificable |
|---|---|---|
| **A** Diagnóstico | Este documento | Revisión y decisiones del usuario |
| **B** Rediseño del frontend | Identidad visual, portada, catálogo, detalle, checkout, panel; animaciones con `prefers-reduced-motion` | Capturas escritorio/móvil, E2E en verde |
| **C** Arquitectura | Servicios, gateway, contratos v2 + proto, datos por servicio, plataforma de despliegue | Documento de arquitectura aprobado |
| **D** Integración | API v2, máquina de estados, check-ins, cooldown 2 h, mantenimiento, promociones, cliente gRPC, CloudEvents, correlation-id; separación en servicios | Contract tests v2, pruebas gRPC |
| **E** Pruebas | Unitarias, contrato, integración entre servicios, E2E, sesión con Booking por Tailscale | Reporte con resultados reales |
| **F** Despliegue y documentación | Servicios públicos, guía de defensa del Reto 2 | URLs activas, documentación actualizada |

## 8. Preguntas para el equipo de integración

1. ¿Nos pueden pasar el archivo original `autos-openapi-v2.yaml` (y el `.proto`) para versionarlo con su huella?
2. ¿Qué endpoints llama Booking exactamente al hacer **Ping** y **Sincronizar**?
3. ¿Booking se autentica con **JWT** (¿qué emisor y algoritmo?) o con **`X-API-Key`** (¿cómo se entrega la clave?)?
4. gRPC: ¿qué `service_id` nos corresponde? ¿Qué `date`/`time_slot` se envían para un alquiler de varios días? ¿Cuál es la dirección de producción y lleva TLS?
5. Eventos: ¿Booking consume **RabbitMQ**, **Kafka** o el feed `GET /autos/eventos`? Si es un broker, ¿cuál es la URL?
6. ¿`vehicle_id` debe ser un auto concreto (unidad con placa)? ¿Es aceptable que el marketplace propio siga mostrando modelos?
7. ¿La regla de reembolso del 100 % aplica a todas las cancelaciones o solo a las compensaciones de la Saga?
8. ¿Hay que responder los campos en español **y** en inglés (alias), o basta uno?
9. ¿La reunión por Tailscale es en qué fecha? ¿Qué puertos se acordaron?
