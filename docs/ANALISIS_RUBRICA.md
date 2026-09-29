# Análisis de la rúbrica — Integración de Sistemas (Reto 1: Arrendamiento de vehículos)

Fuente: imagen de la rúbrica entregada por el profesor. Tiene **10 criterios binarios** (No cumple = 0 / Cumple = 1), total **10 puntos**. No hay puntaje parcial, así que un criterio a medias vale lo mismo que uno no hecho.

> El criterio 1 dice **"requisito obligatorio"**. Si el sistema no está desplegado y accesible públicamente, es muy probable que el resto no se evalúe. Por eso el despliegue va temprano en el plan (primero un despliegue vacío, luego despliegue continuo), no al final.

## 1. Criterios extraídos (texto literal)

| # | Criterio literal |
|---|---|
| C1 | El sistema está desplegado y accesible públicamente en la nube (requisito obligatorio) |
| C2 | El sistema de administración está funcional (CRUD, gestión operativa, navegación) |
| C3 | El marketplace web está funcional y permite consulta/publicación/flujo de venta definido |
| C4 | Las APIs están implementadas y documentadas con OpenAPI/Swagger/Redoc |
| C5 | La base de datos está operativa y soporta correctamente la solución |
| C6 | Se evidencia diseño API-first y preparación para futura integración |
| C7 | Se identificaron y documentaron contratos o endpoints para interoperabilidad futura |
| C8 | Se incorporó diseño preliminar de eventos o servicios para futura integración (SOA/EDA) |
| C9 | Se entregó documentación técnica mínima (arquitectura, modelo de datos, APIs) |
| C10 | El estudiante demuestra dominio del código fuente durante la defensa (explica lógica, estructura, decisiones técnicas y responde preguntas) |

## 2. Matriz de cumplimiento

| Criterio | Qué solicita (requisito verificable) | Cómo lo cumpliremos | Evidencia para la presentación |
|---|---|---|---|
| **C1** Despliegue | Frontend, backend y BD accesibles por URL pública, sin ejecutar nada local | Backend NestJS en **Render** (lo pide el equipo de integración para RDA1), frontend como **sitio estático en Render**, PostgreSQL gestionado (**Supabase**). Variables de entorno en cada plataforma. `GET /health` con estado de la BD | 3 URLs en el README; `/health` respondiendo; flujo completo hecho en vivo sobre producción |
| **C2** Administración | (a) CRUD real de las entidades del negocio; (b) operaciones propias del negocio, no solo CRUD; (c) navegación coherente, protegida por rol | Panel `/admin` (solo rol ADMIN): CRUD de vehículos, categorías, agencias, proveedores, tarifas, extras y usuarios. **Gestión operativa:** bloqueos por mantenimiento, cambio de estado de flota, registro de entrega/devolución, cancelación asistida, vista de ocupación. Dashboard con KPIs | Demo: crear un vehículo → publicarlo → verlo en el marketplace; bloquearlo por mantenimiento → desaparece de la búsqueda; marcar una reserva como entregada |
| **C3** Marketplace | (a) **Consulta**: buscar y ver catálogo; (b) **Publicación**: lo que publica el admin aparece al cliente; (c) **flujo de venta definido** de principio a fin | Home con buscador → resultados con filtros → detalle → extras → datos del conductor → resumen de precio (preview) → confirmación → "Mis reservas" (consultar, modificar, cancelar). Flag `published` en el vehículo | Grabación o demo del flujo completo; diagrama del flujo de venta en `ANALISIS_DOMINIO.md` |
| **C4** APIs + OpenAPI | APIs funcionando **y** documentadas con OpenAPI, navegables en Swagger UI / Redoc | API de integración que implementa `autos-openapi.yaml`; Swagger UI (`/autos/v1/docs`) y Redoc (`/autos/v1/redoc`) sirven **el contrato oficial**. La API interna tiene su propio OpenAPI generado (`/api/docs`) | Abrir Swagger, obtener token, ejecutar `/search` → `/orders/create` en producción |
| **C5** Base de datos | BD real, persistente, con integridad, que soporte todos los flujos | PostgreSQL con migraciones versionadas (TypeORM), FKs, `CHECK`, índices, **constraint de exclusión** anti-solapamiento, seeds de demo | Diagrama ER; mostrar el constraint; intentar una reserva solapada y obtener un 409 |
| **C6** API-first | El contrato existe **antes** que el código, y el código se adapta al contrato | Contrato copiado sin cambios y verificado por SHA-256; DTOs escritos desde el YAML; **tests de contrato** que validan cada respuesta real contra el YAML; Swagger servido desde el YAML, no generado | Historial de commits (contrato → tests → código); ejecución de `npm run test:contract` en verde |
| **C7** Contratos de interoperabilidad | Endpoints identificados y documentados para que otro sistema se integre | `ANALISIS_CONTRATO.md` (15 operaciones, schemas, seguridad, errores), `CONTRATO_INTEGRACION.md` (guía para el Hub: cómo obtener token, ejemplos), colección Postman/Bruno | Documento + colección ejecutada contra producción |
| **C8** SOA / EDA | Diseño (al menos preliminar) de servicios y eventos | **SOA:** servicio de autos como proveedor con contrato. **EDA:** eventos de dominio → *outbox* → webhooks firmados (HMAC) a suscriptores, con reintentos. Catálogo de eventos en **AsyncAPI** (`contracts/autos-events.asyncapi.yaml`, nuestro, complementario) | Registrar un webhook (webhook.site), crear una reserva y ver el evento llegar en vivo; tabla de entregas en el admin |
| **C9** Documentación técnica | Mínimo: arquitectura, modelo de datos, APIs | `docs/ARQUITECTURA.md`, `BASE_DATOS.md`, `ANALISIS_CONTRATO.md`, `API_INTERNA.md`, `SOA_EDA.md`, `DEPLOYMENT.md`, README | Carpeta `docs/` enlazada desde el README |
| **C10** Defensa | Explicar lógica, estructura y decisiones, y responder preguntas | Código por capas simple y predecible; decisiones justificadas en `DECISION_STACK.md` y en este análisis; `GUIA_DEFENSA.md` con las preguntas probables y sus respuestas; **cada fase se revisa contigo** antes de avanzar | Ensayo de defensa; recorrido guiado por un request (controller → service → repository → BD) |

## 3. Requisitos derivados (checklist verificable)

- [ ] R1.1 URL pública del frontend funcionando.
- [ ] R1.2 URL pública del backend con `/health` en 200 y la BD conectada.
- [ ] R1.3 Ningún secreto en el repositorio.
- [ ] R2.1 CRUD completo (crear, listar, editar, desactivar) de al menos: vehículos, categorías, agencias, proveedores, tarifas, extras.
- [ ] R2.2 Operaciones: bloqueo de disponibilidad, estados de flota, entrega/devolución, gestión de reservas.
- [ ] R2.3 Rutas de admin protegidas (401/403 en backend, no solo ocultas en la UI).
- [ ] R3.1 Búsqueda por lugar, fechas, horas y edad.
- [ ] R3.2 Vehículo publicado por el admin visible en el marketplace; uno no publicado, invisible.
- [ ] R3.3 Flujo de venta completo con confirmación y localizador.
- [ ] R3.4 Post-venta: consultar, modificar y cancelar.
- [ ] R4.1 Las 15 operaciones del contrato implementadas y respondiendo.
- [ ] R4.2 Swagger UI y Redoc públicos mostrando el contrato.
- [ ] R5.1 Migraciones reproducibles y seeds de demo.
- [ ] R5.2 Integridad garantizada por la BD (FK, CHECK, EXCLUDE).
- [ ] R6.1 Checksum del contrato verificado en CI.
- [ ] R6.2 Tests de contrato en verde para todas las operaciones.
- [ ] R7.1 Guía de integración para el Hub con ejemplos reales.
- [ ] R8.1 Eventos `CAR_ORDER_CONFIRMED`, `CAR_ORDER_CANCELLED` y `DEPOT_UPDATE` entregados por webhook.
- [ ] R8.2 Documento SOA/EDA + AsyncAPI.
- [ ] R9.1 Documentos de arquitectura, datos y APIs.
- [ ] R10.1 Guía de defensa y ensayo.

## 4. Riesgos respecto a la rúbrica

| Riesgo | Criterio | Mitigación |
|---|---|---|
| Render (plan free) "duerme" tras 15 min sin tráfico; el primer request tarda 30–60 s | C1 | Despertar el servicio antes de la defensa; `/health` en un monitor externo (UptimeRobot) |
| Postgres gratuito de Render expira a los 30 días | C1, C5 | Usar Supabase (decisión confirmada; no expira, pero se pausa tras 7 días sin uso → revisar antes de la defensa) |
| Sobreingeniería que no se puede explicar | C10 | Sin Kafka ni microservicios; un monolito modular con capas claras |
| "Publicación" interpretada como algo que publica el cliente | C3 | **[CONFIRMAR]** con el profesor. Nuestra interpretación: el admin publica la oferta (vehículo y tarifa) y el marketplace la muestra |
