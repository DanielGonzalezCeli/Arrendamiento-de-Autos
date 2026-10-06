# SOA y EDA en el servicio de autos

## 1. Nivel necesario

La rúbrica (C8) pide **"diseño preliminar de eventos o servicios para futura integración (SOA/EDA)"**, y el contrato define **webhooks**. No exige un broker de mensajes. Por eso:

- **Sí:** servicio con contrato (SOA), eventos de dominio, outbox transaccional y webhooks firmados con reintentos (EDA práctico y demostrable).
- **No:** Kafka, RabbitMQ ni microservicios separados. Serían sobreingeniería imposible de defender en el tiempo disponible. La arquitectura deja el punto de extensión preparado (el dispatcher del outbox podría publicar en un broker sin tocar los servicios).

## 2. SOA — el sistema como proveedor de servicio

| Principio SOA | Cómo se cumple |
|---|---|
| Contrato estandarizado | `autos-openapi.yaml` (OpenAPI 3.0.3) es la interfaz pública |
| Bajo acoplamiento | El Hub solo conoce el contrato; nuestro modelo interno queda oculto tras mappers |
| Abstracción | Tarifas, flota y agencias se exponen como capacidades (search, hold, order) |
| Reutilización | Los mismos servicios de dominio atienden a la web y al Hub |
| Autonomía | BD propia; el pago y los clientes pertenecen a otros dominios (`payment_reference`, `sub`) |
| Descubribilidad | Swagger UI + Redoc públicos; guía de integración |
| Seguridad entre servicios | OAuth2 client credentials + scopes |

```
            ┌─────────── Booking Hub (orquestador) ───────────┐
            │  Vuelos API   Alojamientos API   Autos API ◄─ nosotros
            │  Payment API  Customer API       Billing API     │
            └──────────────────────────────────────────────────┘
```

## 3. EDA — eventos de dominio

| Evento interno | Disparador | Webhook del contrato | Consumidores |
|---|---|---|---|
| `ReservationConfirmed` | `orders/create`, checkout web | `CAR_ORDER_CONFIRMED` | Hub, (futuro) Billing, notificaciones |
| `ReservationCancelled` | `orders/{id}/cancel`, cancelación web o admin | `CAR_ORDER_CANCELLED` | Hub, (futuro) Payment para el reembolso |
| `ReservationModified` | `orders/{id}/modify` | — (no está en el enum) | Solo interno; **propuesto** al equipo de integración |
| `DepotUpdated` | CRUD de agencias u horarios (panel admin) | `DEPOT_UPDATE` | Hub (refresca su caché de `/depots`) |
| `HoldExpired` | `MaintenanceService` (cada 10 min) | — | Interno (estado explícito; la disponibilidad ya ignora holds vencidos) |
| `VehicleAvailabilityChanged` | Bloqueo o cambio de estado | — | Interno / futuro |

### 3.1 Flujo implementado (patrón Transactional Outbox)

```
ReservationService.create() / cancel()
  └─ BEGIN
       INSERT/UPDATE reservations ...
       INSERT outbox_events (CAR_ORDER_CONFIRMED | CAR_ORDER_CANCELLED, resource_id = order_id, payload)
     COMMIT                                          ← evento y dato, atómicos

WebhookDispatcherService (cada WEBHOOK_DISPATCH_INTERVAL_MS, por defecto 10 s)
  1. fan-out:  SELECT outbox_events WHERE dispatched_at IS NULL  FOR UPDATE SKIP LOCKED
               → una fila en webhook_deliveries por suscripción destinataria (UNIQUE evento+suscripción)
               → dispatched_at = now()
  2. envío:    UPDATE webhook_deliveries SET next_attempt_at = now() + 60 s  (lease)
                 WHERE status IN (PENDING, FAILED) AND next_attempt_at <= now()  … SKIP LOCKED
               POST url  body = WebhookPayload
                         X-Hub-Signature-256: sha256=HMAC(secret, body)
                         X-Webhook-Event-Id / X-Webhook-Event-Type
               2xx → SUCCEEDED · otro / timeout 5 s / redirección → FAILED + next_attempt_at
               (1 min, 5 min, 30 min, 2 h, 12 h) → tras 6 intentos: DEAD
```

**Decisiones de implementación (Fase 12):**

| Tema | Decisión | Por qué |
|---|---|---|
| Destinatarios | Eventos de orden → solo suscripciones del **dueño** de la orden (`owner_sub`); `DEPOT_UPDATE` → todas | Una reserva web o de otro sistema no debe filtrarse al Hub |
| Eventos internos | `CAR_ORDER_MODIFIED` se registra en el outbox pero **no se entrega** | No está en el enum `WebhookSubscription.events` del contrato |
| Secret | Opcional en el request; si no se envía se genera. Se devuelve **solo** en la respuesta 201; `GET` nunca lo muestra | Mismo patrón que Stripe/GitHub |
| Almacenamiento del secret | AES-256-GCM; clave `DATA_ENCRYPTION_KEY` o derivada con HKDF-SHA256 de `USER_JWT_SECRET` (contexto propio) | Hace falta el secret en claro para firmar: no puede guardarse con hash |
| Anti-SSRF | En producción solo `https` y hosts públicos (sin localhost, 10/8, 172.16/12, 192.168/16, 169.254/16); `redirect: manual` | Evita usar el servidor para atacar servicios internos |
| Concurrencia | `FOR UPDATE SKIP LOCKED` + lease de 60 s | Varias instancias pueden correr el dispatcher sin duplicar envíos |
| Scheduler | `setInterval` propio (sin Redis/colas); `0` lo desactiva (tests usan `runOnce()`) | Suficiente para el volumen del proyecto y fácil de explicar |
| Mantenimiento | `MaintenanceService` cada 10 min: holds vencidos → `EXPIRED`, idempotencia caducada → borrada | Estado explícito y tablas acotadas |

**Por qué outbox:** si enviáramos el webhook dentro del request y la BD hiciera rollback, avisaríamos al Hub de una reserva inexistente. Si lo enviáramos después del commit y el proceso cayera, el evento se perdería. El outbox garantiza **al menos una entrega**. El consumidor deduplica por `eventId`.

### 3.2 Payload (ejemplo conforme a `WebhookPayload`)

```json
{
  "eventId": "7b1f7c1e-6a0f-4a57-9d0d-0f8f5f2d2a11",
  "eventType": "CAR_ORDER_CONFIRMED",
  "timestamp": "2026-10-15T14:03:22Z",
  "resourceId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "data": { "order_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6", "locator": "ANDES-7K2Q9M", "status": "CONFIRMED", "total_price": 179.4, "currency": "USD" }
}
```

### 3.3 Catálogo AsyncAPI

[`contracts/autos-events.asyncapi.yaml`](../contracts/autos-events.asyncapi.yaml) (AsyncAPI 2.6). Es **nuestro**, complementario al contrato y **no lo reemplaza**: describe los 3 mensajes, el payload (idéntico a `WebhookPayload`), los headers de firma, reintentos y garantías. Evidencia directa para C8 (se puede visualizar en https://studio.asyncapi.com).

## 4. Demostración en la defensa

1. Registrar un webhook con `POST /autos/v1/webhooks` apuntando a `https://webhook.site/<id>`.
2. Crear una orden **desde Swagger con el token del mismo cliente** (los eventos de orden solo se envían al dueño de la orden; una reserva web no llega a la suscripción del Hub). Alternativa: editar una agencia en el panel, porque `DEPOT_UPDATE` se envía a todos los suscriptores.
3. Mostrar el evento `CAR_ORDER_CONFIRMED` recibido, con su firma.
4. Mostrar la tabla de entregas en el panel admin y un reintento (URL caída).
