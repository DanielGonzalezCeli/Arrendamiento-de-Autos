# Reglas de negocio

Todas se ejecutan en el **backend** (servicios de dominio). El frontend solo las refleja para mejorar la UX. Los valores configurables viven en la tabla `system_settings` o en constantes con nombre, **nunca como magic values**.

| ID | Regla | Tipo | Dónde | Error |
|---|---|---|---|---|
| RN01 | `pickup.datetime < dropoff.datetime` | Explícita (sentido común + contrato) | `RouteValidator` | 400 `VALIDATION_FAILED` |
| RN02 | La recogida debe ser como mínimo `MIN_LEAD_TIME` (2 h) en el futuro | Decisión | `RouteValidator` | 400 |
| RN03 | Duración máxima: 30 días | Decisión | `RouteValidator` | 400 |
| RN04 | Días facturables = `ceil((dropoff − pickup − GRACIA_59min) / 24 h)`, mínimo 1 | Decisión (práctica del sector) | `PricingService` | — |
| RN05 | Recogida y devolución dentro del horario de la agencia (en su zona horaria, `America/Guayaquil`) | Contrato (`DEPOT_CLOSED`) | `DepotScheduleService` | 409 `DEPOT_CLOSED` |
| RN06 | Edad del conductor ≥ `category.min_driver_age` | Contrato (`DRIVER_AGE_RESTRICTION`) | `EligibilityService` | En search: se excluye el resultado. En hold/preview/create: 409 |
| RN07 | Conductor < 25 años: recargo de conductor joven por día | Decisión (práctica del sector) | `PricingService` | — |
| RN08 | Un **modelo** (`vehicle_id`) es reservable en una agencia si está `active` ∧ `published`, la agencia está activa y **el stock disponible es > 0**: unidades `AVAILABLE` del modelo en la agencia − reservas `PENDING/CONFIRMED` que se solapan − holds vigentes − unidades bloqueadas en el periodo. Buffer de limpieza de 60 min entre alquileres | Confirmado (vehicle_id = modelo) | `AvailabilityService` | 409 `CAR_NO_LONGER_AVAILABLE` |
| RN09 | Una **unidad física** no puede tener dos alquileres activos solapados: `EXCLUDE USING gist (fleet_unit_id WITH =, rental_period WITH &&)` | Decisión (defensa en profundidad) | Migración | 409 al asignar la placa |
| RN10 | Hold, creación y modificación serializan por modelo (`SELECT … FOR UPDATE` sobre `vehicle_models`) y recuentan el stock en la misma transacción → nunca se sobrevende | Decisión | `AvailabilityService` | — |
| RN11 | One-way solo entre agencias del **mismo proveedor**, con `one_way_fee` | Decisión | `SearchService`/`PricingService` | Sin resultados |
| RN12 | El precio se calcula en **centavos enteros**. Total = base + conductor joven + one-way + extras; IVA 15 % (`TAX_RATE`) sobre el subtotal | Decisión (Ecuador) | `PricingService` | — |
| RN13 | Moneda base USD (Ecuador). El DTO acepta cualquier `^[A-Z]{3}$`; se convierte con `currency_rates` (USD y EUR como mínimo); código sin tasa configurada → error | Confirmado | `CurrencyService` | 400 `VALIDATION_FAILED` (`currency`) |
| RN14 | `search_token` válido 30 min | Decisión | `SearchSessionService` | 400 |
| RN15 | Hold válido 15 min; bloquea el vehículo para otros; un hold por `sub`+vehículo+token (reutilizable); estados `HELD → CONSUMED/EXPIRED/RELEASED` | Contrato (hold) + decisión (TTL) | `HoldService` | 409 si el vehículo no está disponible |
| RN16 | Preview válida 15 min (o hasta que expire su hold); congela el precio y el desglose | Decisión | `OrderPreviewService` | 400 si expiró |
| RN17 | En `create`: si la preview expiró, se recalcula; si el precio cambió → `PRICE_CHANGED`; si no está disponible → `CAR_NO_LONGER_AVAILABLE` | Contrato | `ReservationService` | 409 |
| RN18 | `payment_reference`: 8–64 caracteres, `^[A-Za-z0-9_-]+$`; se guarda sin verificar (el pago es otro dominio) | Contrato + decisión | `PaymentReferencePolicy` | 400 `PAYMENT_REFERENCE_INVALID` |
| RN19 | Una orden creada nace `CONFIRMED`; `PENDING` se reserva para la verificación asíncrona del pago | Inferencia | `ReservationService` | — |
| RN20 | **Precio histórico**: la reserva guarda un snapshot del vehículo, la ruta, las tarifas y los extras. Cambios posteriores del catálogo no la alteran | Explícito (requisito) | Entidad `Reservation` | — |
| RN21 | Modificar: solo en estado `CONFIRMED` y antes de la recogida; se recalcula precio y disponibilidad (excluyendo la propia reserva); se guarda un historial | Contrato (`BOOKING_NOT_CONFIRMED`) | `ReservationService.modify` | 409 |
| RN22 | Cancelar: permitido si `PENDING`/`CONFIRMED` y la recogida aún no ocurrió (`rental_status = NOT_STARTED`). Reembolso **por canal**: Booking (Saga) y admin 100 %; web gratis hasta 24 h antes y, después, se retiene un día de tarifa. Siempre se emite nota de crédito por lo devuelto y el auto vuelve a DISPONIBLE al instante (ver «Cancelación y reembolso») | Contrato (`CANCELLATION_NOT_ALLOWED`) + decisión | `CancellationPolicy` | 409 |
| RN23 | Propiedad: una orden solo la consulta, modifica o cancela su dueño (`owner_sub`) o un ADMIN (web). Si pertenece a otro dueño se responde **404**, no 403, para no revelar que existe | Contrato (ownerId = sub) | `ReservationService.getForOwner` | 404 |
| RN24 | Idempotencia en create/modify/cancel (ver `ANALISIS_CONTRATO.md` §7) | Contrato | `IdempotencyService` | 409 |
| RN25 | Estados operativos (`rental_status`): `NOT_STARTED → PICKED_UP` (el admin **asigna una placa** disponible del modelo en la agencia) `→ RETURNED` (la unidad queda en la agencia de devolución). No alteran el `status` del contrato | Decisión | `RentalOperationsService` | 409 si la transición es inválida |
| RN26 | Reseña de agencia: una por reserva `RETURNED`, puntaje 1–10 (el score expuesto es el promedio decimal, escala 0–10 confirmada) | Decisión | `ReviewService` | 409 |
| RN27 | Registro abierto solo como `CUSTOMER`; el rol ADMIN solo lo asigna otro ADMIN o el seed | Seguridad | `AuthService` | — |
| RN28 | Un modelo o unidad con reservas futuras no se elimina físicamente: se despublica o desactiva (soft delete) | Integridad | `VehicleService` | 409 |
| RN30 | `X-Affiliate-Id`: modo `lenient` (RDA1, cualquier entero) o `strict` (debe existir en `affiliates` y estar activo; si no, 400). Rate limit por afiliado; `affiliate_id` se guarda en la reserva para comisiones | Confirmado | `AffiliateGuard` | 400 / 429 |
| RN29 | Cambios en agencias (alta, edición, cierre) emiten `DEPOT_UPDATE` | Contrato (evento) | `DepotService` + outbox | — |
| RN31 | Datos de contacto: nombres y apellidos solo letras (tildes, ñ), con espacio, apóstrofo o guion, 2–60; correo `nombre@dominio.ext` (extensión de 2–24 letras); teléfono opcional en formato internacional E.164 validado por país con `libphonenumber-js` (cantidad de dígitos y prefijos). Se normalizan antes de guardar | Decisión (solicitud del estudiante) | `domain/contact-rules.ts` (backend) + `lib/validation.ts` (frontend, mismas reglas) | 400 con `invalidParams` por campo |

## Cancelación y reembolso (Reto 2)

| Canal | Quién cancela | Reembolso | Por qué |
|---|---|---|---|
| Booking (`POST /api/v3/autos/orders/{id}/cancel`, alias `/orders/{id}/cancel` y `/reservas/{id}/cancel`) | La Saga de Booking (compensación) o el admin | **100 %** siempre | La cancelación no la decide el cliente: es la compensación de un fallo en otra tienda del paquete (p. ej. el vuelo). El contrato v3 fija el 100 % y Booking factura a su cliente final |
| Web propia (`POST /api/me/reservations/{id}/cancel`) | El cliente | **100 %** hasta 24 h antes de la recogida; después se retiene **un día de tarifa** | Es nuestra política comercial, informada antes de pagar («Aún puedes cancelar sin costo» / «se cobrará un día de tarifa») |
| Panel de admin | El administrador | 100 % | Cancelación operativa (error, avería, pedido del cliente atendido por la agencia) |

**Justificación con la facturación electrónica (SRI).** La reserva se factura al confirmarse (factura electrónica en formato SRI). Al cancelar no se borra ni se modifica esa factura: se emite una **nota de crédito** por el valor devuelto, que es el comprobante que exige el SRI para anular total o parcialmente una venta ya facturada.
- Con 100 %, la nota de crédito es por el total y lo facturado neto queda en cero.
- Con la retención de un día, la nota de crédito es por el total menos ese día. El día retenido sigue respaldado por la factura original, así que la contabilidad cuadra sin documentos adicionales.
- Por eso la web muestra el **porcentaje real** (100 % o menos) y no un 100 % fijo. Lo que ve el cliente coincide siempre con el comprobante electrónico; un «100 %» que no cuadre con la nota de crédito sería una inconsistencia fiscal.
- La retención compensa el costo de haber bloqueado el auto, que ya no se puede alquilar a otro cliente con menos de 24 h de aviso.

**Guardia de retiro (409).** Si el auto ya fue retirado en mostrador (`PICKED_UP`), devuelto (`RETURNED`) o ya pasó la hora de recogida, la cancelación responde `409 Cancelación no permitida` en Booking y en la web, y la orden sigue activa. La web lo indica con «Vehículo entregado / Alquiler en curso (no cancelable)».

**Idempotencia.** Cancelar una orden ya cancelada devuelve 200 con el mismo reembolso (mismo `REF-AUTO-…`) sin repetir la nota de crédito ni el aviso de stock.

**Restitución de flota.** Al cancelar (por cualquier canal) se avisa al instante por RabbitMQ y ms-inventario actualiza el stock en Booking:
- Una reserva de Booking tiene un auto concreto, así que se publica `flota.estado_cambiado` de ese auto.
- Una reserva web reserva un modelo (la placa se asigna en la recogida), así que se publica `flota.snapshot`.

**Reglas de mostrador acordadas con Booking.**
1. No hay reembolso por devolución anticipada: si el cliente devuelve antes, no se devuelve dinero en mostrador. El sistema no tiene ningún flujo de reembolso por devolución.
2. Upgrades, días extra o accesorios pedidos al retirar no modifican la reserva original: se gestionan en mostrador como un contrato anexo. Después del retiro la reserva ya no se puede modificar (RN21). Los cargos de la devolución (combustible, limpieza, daños, retraso) se facturan aparte con `issueCharges`, así la orden de Booking y su factura no se desfasan.
