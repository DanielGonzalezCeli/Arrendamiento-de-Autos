# Análisis del dominio — Alquiler de vehículos

> Basado en los patrones funcionales públicos de Enterprise, Avis, Hertz, Sixt, Budget, Rentalcars, KAYAK Cars y similares. No se copian diseños, solo patrones. Cada punto se clasifica según su relación con el contrato.

## 1. Conceptos del dominio

| Concepto | Significado | En el contrato |
|---|---|---|
| **Proveedor (supplier)** | Empresa que alquila (Hertz, Avis...). Un marketplace agrega varios | `supplier_id` (int), `/suppliers` |
| **Agencia (depot / branch)** | Punto físico de recogida y devolución (aeropuerto, ciudad), con horario | `depot_id` (int), `/depots`, `DEPOT_CLOSED` |
| **Categoría (ACRISS / car type)** | Económico, compacto, SUV... El cliente suele reservar una categoría "o similar" | `filters.car_types` |
| **Vehículo** | Unidad física (placa) con marca, modelo, puertas, asientos y maletas | `vehicle_id`, `/details` |
| **Tarifa** | Precio por día según categoría, temporada y duración | `price`, `total_price` |
| **Extras / coberturas** | GPS, silla de bebé, conductor adicional, seguros (CDW, SCDW) | `extras[]` |
| **Política de combustible** | Lleno/lleno, prepago, mismo nivel | `/constants fuel_policies` |
| **Momento de pago** | Pago ahora / pago en agencia | `/constants payment_timings` |
| **One-way** | Devolución en otra agencia (con recargo) | `Route.pickup ≠ dropoff` |
| **Conductor joven / edad mínima** | Recargo si tiene menos de 25; bloqueo si tiene menos del mínimo de la categoría | `Driver.age`, `DRIVER_AGE_RESTRICTION` |
| **Depósito / franquicia** | Retención en tarjeta; lo gestiona el dominio de pagos | Fuera de alcance (lo informamos en el detalle) |
| **Localizador** | Código de confirmación (PNR) | `locator` |

## 2. Patrones funcionales observados

### 2.1 Búsqueda
- Lugar de recogida (autocompletado de aeropuerto o ciudad) y casilla "devolver en otra ubicación".
- Fecha y **hora** de recogida y devolución; por defecto, 10:00.
- Edad del conductor (casilla "tengo entre 25 y 70" o campo numérico).
- País de residencia y moneda.
- En el contrato: `route.pickup/dropoff{datetime, location}`, `driver.age`, `booker.country`, `currency`. Coincide.

### 2.2 Resultados
- Tarjeta por vehículo: imagen, categoría, "Toyota Corolla o similar", pasajeros, maletas, puertas, transmisión, A/C, política de combustible, kilometraje, proveedor y agencia, **precio total** y precio por día.
- Filtros: categoría, transmisión, proveedor, precio, capacidad, combustible.
- Orden: precio, recomendado.

### 2.3 Detalle
- Especificaciones, condiciones (edad mínima, licencia, depósito), política de combustible y de cancelación, extras con precio por día y tope, coberturas y ubicación de la agencia con horario.

### 2.4 Reserva
```
Búsqueda → Resultados → Detalle → Extras → Datos del conductor
  → Resumen de precio (preview) → [Hold: precio garantizado por N min]
  → Pago (otro dominio) → Confirmación (localizador) → Email
```

### 2.5 Post-reserva
- Consultar con localizador y correo, o desde "Mis reservas".
- Modificar fechas, ubicaciones o extras (el precio se recalcula).
- Cancelar: gratis hasta X horas antes; después, con cargo o no permitido.

## 3. Alcance MVP (sin sobreingeniería)

### Cliente (marketplace)

| Pantalla | Incluida | Justificación |
|---|---|---|
| Home con buscador | Sí | Punto de entrada (C3) |
| Resultados + filtros (categoría, transmisión, proveedor, precio) | Sí | Consulta (C3) |
| Detalle del vehículo | Sí | Consulta (C3) |
| Login / Registro | Sí | Propiedad de las reservas |
| Checkout: extras → conductor → resumen (preview) → confirmar | Sí | Flujo de venta (C3); reutiliza hold y preview |
| Confirmación con localizador | Sí | Cierre de la venta |
| Mis reservas: detalle, modificar, cancelar | Sí | Post-venta; espejo del contrato |
| Calificar la agencia tras la devolución | Sí (mínimo) | Alimenta `/depots/reviews/scores` |
| Pago real | **No** | El contrato dice que pagos es otro dominio. Usaremos una **pasarela simulada** que genera `payment_reference` |
| Emails | **No** (opcional al final) | No aporta a la rúbrica |

### Administración

| Módulo | Operaciones |
|---|---|
| Dashboard | Reservas de hoy (recogidas y devoluciones), activas, ingresos confirmados, flota por estado, ocupación |
| Vehículos | CRUD, publicar/despublicar, estado (`AVAILABLE`, `MAINTENANCE`, `OUT_OF_SERVICE`), imagen |
| Categorías | CRUD, edad mínima |
| Proveedores | CRUD |
| Agencias | CRUD, horario semanal, servicios, coordenadas |
| Disponibilidad | Bloqueos por rango de fechas (mantenimiento) |
| Tarifas | CRUD de tarifa diaria por categoría y proveedor, con vigencia |
| Extras | CRUD de precio por día y tope |
| Reservas | Listado y filtros, detalle con historial, registrar entrega y devolución, cancelar |
| Usuarios | Listado, activar/desactivar, cambiar rol |
| Integración | Clientes API (Hub), suscripciones webhook, entregas y reintentos |

**Roles:** `CUSTOMER`, `ADMIN`. **[DECISIÓN]** No se añade un rol de agente de mostrador para mantener el alcance; el ADMIN realiza las operaciones.

## 4. Reglas de negocio

Ver [REGLAS_NEGOCIO.md](REGLAS_NEGOCIO.md).
