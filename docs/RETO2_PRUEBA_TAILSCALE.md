# Prueba conjunta con Booking por Tailscale (contrato v3)

Guía para la sesión local con Booking Prototipo. La API corre en tu PC; Booking la llama por la red privada de Tailscale, y tu API le envía el stock por gRPC.

```
Booking (Paúl) ──REST──▶  http://<TU_IP_TAILSCALE>:3000/api/v3   (health, autos, reservas, cancelación)
Tu API        ──gRPC──▶  <IP_TAILSCALE_BOOKING>:50051           (PushStockUpdate, sin TLS)
```

## 1. Antes de la sesión

1. **Tailscale.** Ambos deben estar en la misma tailnet. Obtén tu IP con `tailscale ip -4` (empieza con `100.`). Pídele a Paúl la IP de Booking.
2. **Firewall de Windows.** Abre el puerto 3000 de entrada, solo para la red de Tailscale. Ejecuta en PowerShell **como administrador**:
   ```powershell
   New-NetFirewallRule -DisplayName "RutaLibre API (Tailscale)" -Direction Inbound -Protocol TCP -LocalPort 3000 -RemoteAddress 100.64.0.0/10 -Action Allow
   ```
3. **Conexión al gRPC de Booking.** Comprueba que llegas al puerto 50051:
   ```powershell
   Test-NetConnection <IP_TAILSCALE_BOOKING> -Port 50051
   ```
   Debe decir `TcpTestSucceeded : True`.
4. **`backend/.env`.** Cambia estas líneas. `BOOKING_API_KEY` ya está generada; no la cambies.
   ```
   STOCK_SYNC_MODE=grpc
   BOOKING_GRPC_TARGET=<IP_TAILSCALE_BOOKING>:50051
   PUBLIC_BASE_URL=http://<TU_IP_TAILSCALE>:3000
   ```
5. **La clave para Booking.** Copia el valor de `BOOKING_API_KEY` de tu `.env` y envíaselo a Paúl **por privado** (no en el grupo). Él la pone en `TIENDA_AUTOS_API_KEY`.
6. **Arranca la API.** PostgreSQL local debe estar encendido.
   ```bash
   cd backend
   npm run migration:run:dev
   npm run start:dev
   ```
   En la consola debe aparecer: `Sincronización de stock con Booking por grpc → <IP>:50051`.

## 2. Datos para el formulario de nodos de Booking

| Campo | Valor |
|---|---|
| Nombre del sistema | RutaLibre Renta de Autos |
| ID del nodo | `NODE_AUT_RUTALIBRE` |
| Vertical | Autos |
| Base URL REST | `http://<TU_IP_TAILSCALE>:3000/api/v3` |
| IP origen | `<TU_IP_TAILSCALE>` |

## 3. Qué debe pasar (en orden)

| # | Acción en Booking | Llamada | Resultado esperado |
|---|---|---|---|
| 1 | Botón 🔄 (semáforo) | `GET /api/v3/health` | 200 `HEALTHY` → foco verde |
| 2 | Botón 📥 (sincronizar) | `GET /api/v3/autos` | `{ total, limit, data: [...] }` con los autos `DISPONIBLE` |
| 3 | Al arrancar tu API | gRPC `PushStockUpdate` | Booking recibe todos los autos con `available_units = 1` |
| 4 | Reservar un auto | `POST /api/v3/reservas` | 201 con `pnr` (`CAR…`), `status: CONFIRMED` y `voucher_qr_data`; Booking recibe `available_units = 0` con la fecha y hora de retiro |
| 5 | Reservar el mismo auto en fechas que se cruzan | `POST /api/v3/reservas` | 409 `VEHICLE_UNAVAILABLE` → Booking compensa (Saga) |
| 6 | Cancelar o compensar | `POST /api/v3/orders/{pnr}/cancel` | 200, reembolso del 100 %; Booking recibe `available_units = 1` |

## 4. Pruebas manuales con curl (desde tu PC o la de Paúl)

Reemplaza `<BASE>` por `http://<TU_IP_TAILSCALE>:3000/api/v3` y `<CLAVE>` por la de tu `.env`.

```bash
curl <BASE>/health
curl "<BASE>/autos?limit=3"

curl -X POST <BASE>/reservas \
  -H "Content-Type: application/json" -H "X-API-Key: <CLAVE>" \
  -H "Idempotency-Key: $(node -e "console.log(crypto.randomUUID())")" -H "X-Correlation-Id: prueba-tailscale-1" \
  -d '{"vehicle_id":"auto-pan-1006","pickup_date":"2026-11-20","dropoff_date":"2026-11-23","pickup_time":"10:00","dropoff_time":"10:00","coverage_type":"BASIC","driver":{"full_name":"Carlos Zambrano","email":"carlos@example.com","phone":"+593987654321","license_number":"1710034065","age":28}}'

curl -X POST <BASE>/orders/<PNR>/cancel -H "Content-Type: application/json" -H "X-API-Key: <CLAVE>" \
  -d '{"solicitante":"SAGA_ORCHESTRATOR","motivo":"prueba"}'
```

## 5. Evidencias para el informe

- **Log en archivo:** `backend/logs/integration-v3.log`. Tiene una línea JSON por petición, con `correlation_id` e `idempotency_key`.
- **Envíos de stock y acuses de Booking:**
  ```sql
  SELECT created_at, item_id, payload->>'available_units' AS units, payload->>'slot_id' AS slot, success, error_code, message
    FROM stock_sync_log ORDER BY created_at DESC LIMIT 20;
  ```
- **Capturas:** semáforo en verde, autos importados en Booking, reserva confirmada, compensación de la Saga.

## 6. Qué confirmar con Paúl durante la sesión

1. **Límite del catálogo.** `GET /autos` devuelve 10 autos por defecto, como dice el contrato. ¿El botón "Sincronizar" envía `limit`? Si no lo envía, Booking solo importará 10 de los 34.
2. **Cancelación.** ¿Qué ruta usa Booking y si envía `solicitante`? Aceptamos `/orders/{id}/cancel`, `/reservas/{id}/cancel` y `/autos/orders/{id}/cancel`. Si no envía `solicitante`, aplicamos el reembolso del 100 % de la Saga.
3. **Ack del gRPC.** ¿Qué `error_code` devuelve Booking si algo falla? Lo vemos en `stock_sync_log`.

## 7. Reglas de negocio que pueden dar 422 (no son fallos)

- La recogida debe ser al menos **2 horas** en el futuro, y el alquiler dura como máximo 30 días → `INVALID_DATES`.
- La agencia del auto debe estar **abierta** a la hora de retiro y de devolución → `INVALID_DATES`.
- **Edad mínima por categoría:** 21 años (Económico, Compacto), 23 (Sedán, SUV) y 25 (Camioneta, Van) → `DRIVER_UNDERAGE`.
- El retiro y la devolución se hacen en la agencia donde está el auto. `pickup_location` y `dropoff_location` se guardan como referencia.
