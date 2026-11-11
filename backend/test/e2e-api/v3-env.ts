/**
 * Variables del test v3. Se importa ANTES que AppModule: ConfigModule valida el entorno al cargarse.
 * Los servicios simulados (Booking por HTTP, ms-clientes, ms-inventario) escuchan en puertos fijos de pruebas.
 */
export const TEST_API_KEY = 'clave-de-prueba-booking-v3-0123456789';
export const FAKE_BOOKING_HTTP_PORT = 50_998;
export const FAKE_CLIENTS_PORT = 50_997;
export const FAKE_INVENTORY_PORT = 50_995;

process.env.BOOKING_API_KEY = TEST_API_KEY;
// ms-clientes simulado (fase C): la reserva de Booking se vincula a un cliente pidiéndolo por HTTP.
process.env.CLIENTS_URL = `http://127.0.0.1:${FAKE_CLIENTS_PORT}`;
// ms-inventario simulado (fase D): el panel /admin/booking le pide el estado del envío de stock.
process.env.INVENTORY_URL = `http://127.0.0.1:${FAKE_INVENTORY_PORT}`;
process.env.BOOKING_NOTIFY_MODE = 'http';
process.env.BOOKING_CHECKIN_URL = `http://127.0.0.1:${FAKE_BOOKING_HTTP_PORT}/api/v3/reservas/{external_order_id}/checkin`;
