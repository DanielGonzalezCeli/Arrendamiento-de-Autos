// Booking simulado para el E2E de CI: recibe el POST de stock de ms-inventario (modo http) y responde como el real.
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 3900);
createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    console.log(new Date().toISOString(), req.method, req.url, req.headers['x-correlation-id'] ?? '-', body);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ success: true, acknowledged: true, message: 'Stock actualizado' }));
  });
}).listen(port, '127.0.0.1', () => console.log(`Booking simulado (stock) en ${port}`));
