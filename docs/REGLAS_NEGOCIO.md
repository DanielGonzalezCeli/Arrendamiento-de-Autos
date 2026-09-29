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
| RN22 | Cancelar: permitido si `PENDING`/`CONFIRMED` y la recogida aún no ocurrió (`rental_status = NOT_STARTED`). Política: gratis hasta 24 h antes; después se registra una penalización informativa (el reembolso lo ejecuta el dominio de pagos) | Contrato (`CANCELLATION_NOT_ALLOWED`) | `CancellationPolicy` | 409 |
| RN23 | Propiedad: una orden solo la consulta, modifica o cancela su dueño (`owner_sub`) o un ADMIN (web). Si pertenece a otro dueño se responde **404**, no 403, para no revelar que existe | Contrato (ownerId = sub) | `ReservationService.getForOwner` | 404 |
| RN24 | Idempotencia en create/modify/cancel (ver `ANALISIS_CONTRATO.md` §7) | Contrato | `IdempotencyService` | 409 |
| RN25 | Estados operativos (`rental_status`): `NOT_STARTED → PICKED_UP` (el admin **asigna una placa** disponible del modelo en la agencia) `→ RETURNED` (la unidad queda en la agencia de devolución). No alteran el `status` del contrato | Decisión | `RentalOperationsService` | 409 si la transición es inválida |
| RN26 | Reseña de agencia: una por reserva `RETURNED`, puntaje 1–10 (el score expuesto es el promedio decimal, escala 0–10 confirmada) | Decisión | `ReviewService` | 409 |
| RN27 | Registro abierto solo como `CUSTOMER`; el rol ADMIN solo lo asigna otro ADMIN o el seed | Seguridad | `AuthService` | — |
| RN28 | Un modelo o unidad con reservas futuras no se elimina físicamente: se despublica o desactiva (soft delete) | Integridad | `VehicleService` | 409 |
| RN30 | `X-Affiliate-Id`: modo `lenient` (RDA1, cualquier entero) o `strict` (debe existir en `affiliates` y estar activo; si no, 400). Rate limit por afiliado; `affiliate_id` se guarda en la reserva para comisiones | Confirmado | `AffiliateGuard` | 400 / 429 |
| RN29 | Cambios en agencias (alta, edición, cierre) emiten `DEPOT_UPDATE` | Contrato (evento) | `DepotService` + outbox | — |
