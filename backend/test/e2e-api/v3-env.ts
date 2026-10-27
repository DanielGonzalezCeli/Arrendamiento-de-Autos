/**
 * Variables del test v3. Se importa ANTES que AppModule: ConfigModule valida el entorno al cargarse.
 * El servidor gRPC simulado de Booking escucha en un puerto fijo de pruebas.
 */
export const TEST_API_KEY = 'clave-de-prueba-booking-v3-0123456789';
export const FAKE_BOOKING_GRPC_PORT = 50_999;

process.env.BOOKING_API_KEY = TEST_API_KEY;
process.env.STOCK_SYNC_MODE = 'grpc';
process.env.BOOKING_GRPC_TARGET = `127.0.0.1:${FAKE_BOOKING_GRPC_PORT}`;
process.env.STOCK_SYNC_INTERVAL_MS = '0';
