# Origen de los contratos

| Archivo | Origen | Versión / fecha | SHA-256 |
|---|---|---|---|
| `autos-openapi.yaml` | https://github.com/semestre5grupal-ops/Plantilla-Integracion-Sistemas (`contracts/autos-openapi.yaml`), commit `090e863928579bf90eb21c560b798114bafb2028` | Reto 1 · 2026-09-22 | `7ef0fd17b82e2fa24e7efb170f2ec833f905e071b1017cc0bf2741393593ed5b` |
| `autos-openapi-v3.yaml` | Equipo de integración (Paúl Rosero, Booking Prototipo): archivo `autos-openapi-v3.yaml` enviado al grupo de la vertical de Autos | Reto 2 · v3.0.0 · 2026-10-27 | `eb0d5eeae290949ccc366a58e7442ed3fcfdb6b047ca05e881c4f468a4e8010e` |
| `inventory.proto` | Equipo de integración (`src/proto/inventory.proto` de Booking Prototipo) | Reto 2 · 2026-10-27 | `e5a3661bd8897ab13a6368ac962b3ed8f253049951993d4d857ca95210434f31` |

**No editar estos archivos.** Si el equipo de integración publica una nueva versión: se copia de nuevo, se actualiza esta tabla, se revisa el diff (`docs/ANALISIS_CONTRATO.md` para el v1, `docs/RETO2_DIAGNOSTICO.md` para el v3) y se ejecutan los tests de contrato. `backend/test/contract/contract-checksum.spec.ts` falla si un archivo no coincide con su SHA-256.

- `autos-openapi.yaml` (v1) sigue publicado en `/autos/v1` para Booking Hub (Reto 1).
- `autos-openapi-v3.yaml` lo implementa `/api/v3` (`backend/src/modules/integration-v3`).
- `inventory.proto`: la tienda es **cliente** de `inventory.InventoryStockService/PushStockUpdate` (`backend/src/modules/stock-sync`).
