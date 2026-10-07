# API interna (`/api`)

API propia que usa **nuestro frontend** (marketplace y panel de administración). No forma parte del contrato con el Booking Hub y puede evolucionar sin romperlo.

- **Swagger generado:** https://arrendamiento-autos-api.onrender.com/api/docs
- **Formato:** JSON en `camelCase`. Los errores usan el mismo **ProblemDetails (RFC 7807)** que la API de integración.
- **Reutilización:** la búsqueda, el hold, el preview y la reserva llaman a los **mismos servicios de dominio** que `/autos/v1`. Una reserva web y una del Hub siguen exactamente las mismas reglas de disponibilidad, precio y cancelación; solo cambia el canal (`WEB` o `BOOKING_HUB`).

## 1. Autenticación de usuarios

| Método y ruta | Acceso | Descripción |
|---|---|---|
| `POST /api/auth/register` | Público | Crea un **cliente** (rol `CUSTOMER`) y devuelve `{ accessToken, user }` |
| `POST /api/auth/login` | Público, 10 intentos/min | `{ email, password }` → `{ accessToken, user }`. El error es el mismo 401 con correo inexistente o con contraseña incorrecta |
| `GET /api/auth/me` | Usuario | Datos del usuario autenticado |

- El token es un JWT **HS256** (`USER_JWT_SECRET`), distinto del token RS256 de la integración: son dos dominios de seguridad separados.
- En cada petición se verifica en la BD que la cuenta siga **activa** y se usa su **rol actual**: desactivar una cuenta o quitarle el rol de administrador se aplica al instante, sin esperar a que el token expire.
- Las contraseñas se guardan con **bcrypt**; `passwordHash` nunca sale en las respuestas.
- Validaciones: nombres solo con letras (2–60), correo con dominio, teléfono internacional validado según el país (libphonenumber) y guardado en E.164.
- **Correos de Gmail:** se aplican las reglas de Google (solo letras, números y puntos; 6–30 caracteres sin contar puntos; con 8 o más, al menos una letra; sin punto al inicio, al final ni dos seguidos). Además, se guarda un **correo canónico** (sin puntos ni `+etiqueta`, `googlemail.com` = `gmail.com`) con índice único: `dan.iel@gmail.com` y `daniel+x@gmail.com` son la misma cuenta que `daniel@gmail.com` (registro → 409; login con cualquiera de las variantes). El login no aplica las reglas de Gmail, para no bloquear cuentas anteriores.

## 2. Catálogo público (sin sesión)

| Método y ruta | Descripción |
|---|---|
| `GET /api/locations` | Ciudades con sus agencias (dirección, teléfono, horario, coordenadas) y aeropuertos, para el buscador |
| `GET /api/categories` | Categorías con edad mínima |
| `GET /api/extras` | Extras activos (precio por día y tope) |
| `GET /api/vehicles/:id` | Ficha de un modelo publicado |
| `GET /api/images/:id` | Foto subida desde el panel (caché de 1 año; cada subida tiene su propio id) |
| `POST /api/search` | Búsqueda por agencia, ciudad o aeropuerto, con fechas, edad, moneda y filtros. Devuelve las ofertas con su agencia exacta de retiro y devolución, más un `searchToken` |

## 3. Compra y "Mis reservas" (usuario autenticado)

| Método y ruta | Descripción |
|---|---|
| `POST /api/checkout/hold` | Bloquea el vehículo 15 min al precio cotizado |
| `POST /api/checkout/preview` | Precio con extras; lo congela 15 min |
| `POST /api/checkout/confirm` | Paga y confirma: `{ orderPreviewId, driver, paymentToken }`. Autoriza el token de la **pasarela simulada** y crea la reserva en la misma transacción. Tarjeta rechazada → **402 `PAYMENT_NOT_AUTHORIZED`** y no se crea nada. Exige `Idempotency-Key` (una por intento de pago) |
| `GET /api/me/reservations` | Mis reservas |
| `GET /api/me/reservations/:id` | Detalle (404 si es de otro usuario) |
| `POST /api/me/reservations/:id/modify` | Cambiar extras, fechas o agencias (recalcula el precio) |
| `POST /api/me/reservations/:id/cancel` | Cancelar; gratis hasta 24 h antes, después 1 día de tarifa |

### Pasarela de pagos simulada (RutaPay)

El cobro real pertenece al Payment API del Hub; la web simula una pasarela con el mismo flujo que una real:

1. El navegador valida la tarjeta (marca, longitud, **Luhn**, vencimiento, CVV) y la **tokeniza**: `tok_sim_<marca>_<últimos 4>_<nonce>`. El número completo y el CVV **nunca llegan al backend**; el DTO rechaza cualquier otra cosa.
2. El backend ([`domain/payment-simulator.ts`](../backend/src/domain/payment-simulator.ts)) autoriza el token y genera la referencia `PAY-<MARCA>-<últimos 4>-<id>`, que cumple el formato `payment_reference` del contrato.
3. Si la reserva falla (por ejemplo, el auto ya no está disponible), el *rollback* deshace también la autorización.

| Tarjeta de prueba | Resultado |
|---|---|
| `4242 4242 4242 4242` (Visa), `5555 5555 5555 4444` (Mastercard), `3782 822463 10005` (Amex) | Aprobada |
| `4000 0000 0000 0002` | Rechazada por el banco (402) |
| `4000 0000 0000 9995` | Fondos insuficientes (402) |

La reserva muestra "Pagado con Visa •••• 4242" a partir de la referencia, sin guardar datos de la tarjeta.

## 4. Administración (`/api/admin`, solo rol `ADMIN`)

Todo el controlador está protegido con `UserJwtGuard` + `RolesGuard` + `@Roles(ADMIN)`. Sin sesión responde **401**; con un usuario cliente, **403**. La protección está en el servidor, no solo en la interfaz.

| Área | Rutas | Reglas destacadas |
|---|---|---|
| Resumen | `GET dashboard` | Entregas y devoluciones del día, alquileres en curso, devoluciones atrasadas, ingresos del mes, reservas por canal, flota por estado, estado de los webhooks |
| Reservas | `GET reservations?status&rentalStatus&depotId&from&to&q`, `GET reservations/:id` | El detalle incluye historial, unidades libres y acciones permitidas |
| Operación | `POST reservations/:id/pickup` `{ fleetUnitId? }`, `POST reservations/:id/return` `{ mileage? }`, `POST reservations/:id/cancel` | La entrega asigna una placa libre para todo el periodo. En la devolución el kilometraje no puede bajar y la unidad queda en la agencia de devolución. La cancelación emite `CAR_ORDER_CANCELLED` |
| Modelos | `GET/POST models`, `PATCH models/:id` | `published` controla la visibilidad en la web y en `/search`. No se puede desactivar un modelo con reservas futuras. El listado incluye `searchIssues`: por qué el modelo **no** aparecería en la búsqueda (no publicado, sin tarifa vigente, sin unidades en agencias de su proveedor) |
| Fotos | `POST images` (multipart, campo `file`) | JPG, PNG o WebP de hasta 2 MB, verificados por su contenido real (no por la extensión; SVG no admitido). Devuelve `{ url: "/api/images/{id}" }` para el campo `imageUrl` del modelo. El panel redimensiona la foto a 1280 px antes de subirla |
| Flota | `GET fleet?vehicleModelId&depotId`, `POST fleet`, `PATCH fleet/:id` | Placa `ABC-1234` única. La unidad debe estar en una agencia **del mismo proveedor que su modelo** (si no, nunca aparecería en la búsqueda → 400). No se da de baja una unidad si alguna reserva futura quedaría sin auto |
| Mantenimiento | `GET/POST fleet/:id/blocks`, `DELETE blocks/:id` | No se bloquea una unidad asignada en ese periodo ni se deja una reserva sin auto |
| Agencias | `GET/POST depots`, `PATCH depots/:id`, `GET/POST cities` | Horario semanal (apertura < cierre). Cada cambio emite **`DEPOT_UPDATE`** en la misma transacción. No se desactiva una agencia con reservas activas |
| Catálogo comercial | `categories`, `suppliers`, `extras`: `GET/POST/PATCH` | Códigos en mayúsculas y únicos |
| Tarifas | `GET/POST rates`, `PATCH/DELETE rates/:id` | Las vigencias de un mismo proveedor y categoría no pueden superponerse (restricción `EXCLUDE` en la BD → 409) |
| Usuarios | `GET users`, `POST users` (crear con rol y contraseña inicial), `PATCH users/:id` (nombre, correo, teléfono, rol, activo), `POST users/:id/password` (restablecer), `DELETE users/:id` | Mismas reglas que el registro (Gmail, correo canónico único, contraseña con letras y números). Un administrador no puede quitarse su rol, desactivarse ni eliminarse (409). Solo se eliminan cuentas sin historial (reservas, reseñas, bloqueos); las demás se desactivan. Debe quedar al menos un administrador activo |
| Integración | `GET integration`, `POST integration/deliveries/:id/retry`, `POST integration/dispatch` | Clientes OAuth2 (sin secretos), suscripciones, últimas 50 entregas; reintento manual y "procesar ahora" |

## 5. Errores frecuentes

| HTTP | Ejemplo |
|---|---|
| 400 | Campo inválido (`invalidParams` indica cuál), hold vencido, agencia cerrada a esa hora |
| 401 | Sin token o token vencido. El frontend cierra la sesión y lleva al login |
| 403 | Un cliente intenta usar `/api/admin` |
| 404 | La reserva no existe o es de otro usuario |
| 409 | Vehículo ya no disponible, placa duplicada, tarifas superpuestas, operación no permitida en ese estado |
