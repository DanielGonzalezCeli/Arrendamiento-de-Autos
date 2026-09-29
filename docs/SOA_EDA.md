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
| `DepotUpdated` | CRUD de agencias u horarios | `DEPOT_UPDATE` | Hub (refresca su caché de `/depots`) |
| `HoldExpired` | Job programado | — | Interno (libera disponibilidad) |
| `VehicleAvailabilityChanged` | Bloqueo o cambio de estado | — | Interno / futuro |

### 3.1 Flujo (patrón Transactional Outbox)

```
ReservationService.create()
  └─ BEGIN
       INSERT reservations ...
       INSERT outbox_events (CAR_ORDER_CONFIRMED, resourceId=order_id, payload)
     COMMIT                                   ← evento y dato, atómicos
WebhookDispatcher (cada 10 s, @nestjs/schedule)
  └─ SELECT outbox_events WHERE dispatched_at IS NULL  FOR UPDATE SKIP LOCKED
       para cada suscripción activa que incluya el tipo de evento:
         POST url  body=WebhookPayload  headers: X-Hub-Signature-256: sha256=HMAC(secret, body)
                                                 X-Webhook-Event-Id: eventId
         2xx → SUCCEEDED  |  otro/timeout → FAILED + next_attempt_at (backoff 1m,5m,30m,2h,12h) → DEAD
```

**Por qué outbox:** si enviáramos el webhook dentro del request y la BD hiciera rollback, avisaríamos al Hub de una reserva inexistente. Si lo enviáramos después del commit y el proceso cayera, el evento se perdería. El outbox garantiza **al menos una entrega**. El consumidor deduplica por `eventId`.

### 3.2 Payload (ejemplo conforme a `WebhookPayload`)

```json
{
  "eventId": "7b1f7c1e-6a0f-4a57-9d0d-0f8f5f2d2a11",
  "eventType": "CAR_ORDER_CONFIRMED",
  "timestamp": "2026-10-15T14:03:22Z",
  "resourceId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "data": { "locator": "RNT-7K2Q9M", "status": "CONFIRMED", "total_price": 184.00, "currency": "USD" }
}
```

### 3.3 Catálogo AsyncAPI

Se documentará en `contracts/autos-events.asyncapi.yaml` (AsyncAPI 2.6). Es **nuestro**, complementario al contrato y **no lo reemplaza**: describe canales, payloads y firma. Evidencia directa para C8.

## 4. Demostración en la defensa

1. Registrar un webhook con `POST /autos/v1/webhooks` apuntando a `https://webhook.site/<id>`.
2. Crear una reserva desde el marketplace o desde Swagger.
3. Mostrar el evento `CAR_ORDER_CONFIRMED` recibido, con su firma.
4. Mostrar la tabla de entregas en el panel admin y un reintento (URL caída).
