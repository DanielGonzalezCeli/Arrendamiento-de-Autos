import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { DataSource } from 'typeorm';
import { DomainError } from '../../domain/domain-error';
import { OrderStatus, RentalStatus } from '../../domain/enums';
import { describePaymentReference } from '../../domain/payment-simulator';
import { Reservation } from '../orders/entities/reservation.entity';
import { VoucherSigner } from './voucher-token';

const TIME_ZONE = 'America/Guayaquil';

const LABELS: Record<string, string> = {
  MANUAL: 'Manual', AUTOMATIC: 'Automática', GASOLINE: 'Gasolina', DIESEL: 'Diésel', HYBRID: 'Híbrido', ELECTRIC: 'Eléctrico',
};
const label = (value?: string | null) => (value ? LABELS[value] ?? value : null);

type Endpoint = { name: string; address?: string; datetime: string };
type VehicleSnapshot = {
  display_name: string; category?: { name: string }; transmission?: string; fuel_type?: string; seats?: number;
  image_url?: string | null; plate?: string; supplier?: { name: string };
};

export type VoucherView = Awaited<ReturnType<VoucherService['view']>>;

/**
 * Voucher de la reserva: lo que el cliente presenta en el mostrador. Se comparte por un link firmado
 * (o su QR), así que NO incluye correo ni teléfono del conductor: solo lo necesario para retirar el auto.
 */
@Injectable()
export class VoucherService {
  private readonly signer: VoucherSigner;
  private readonly webUrl: string;

  constructor(config: ConfigService, @InjectDataSource() private readonly dataSource: DataSource) {
    this.signer = new VoucherSigner(config.get<string>('USER_JWT_SECRET')!);
    const web = config.get<string>('PUBLIC_WEB_URL') ?? config.get<string>('CORS_ORIGINS')?.split(',')[0]?.trim() ?? '';
    this.webUrl = web.replace(/\/+$/, '');
  }

  /** Ruta del voucher en el frontend (relativa) y URL absoluta que va en el QR. */
  linkFor(r: Pick<Reservation, 'id' | 'locator'>) {
    const path = `/voucher/${r.locator}?t=${this.signer.sign(r.id)}`;
    return { path, url: `${this.webUrl}${path}` };
  }

  async view(locator: string, token: unknown) {
    const r = await this.load(locator, token);
    const vehicle = r.vehicleSnapshot as VehicleSnapshot;
    const route = r.routeSnapshot as { pickup: Endpoint; dropoff: Endpoint; one_way: boolean; rental_days: number };
    const { url } = this.linkFor(r);
    return {
      id: r.id,
      locator: r.locator,
      status: r.status,
      rentalStatus: r.rentalStatus,
      issuedAt: r.createdAt,
      vehicle: {
        name: vehicle.display_name,
        category: vehicle.category?.name ?? null,
        transmission: label(vehicle.transmission),
        fuelType: label(vehicle.fuel_type),
        seats: vehicle.seats ?? null,
        imageUrl: vehicle.image_url ?? null,
        supplier: vehicle.supplier?.name ?? null,
        plate: vehicle.plate ?? null,
      },
      pickup: { depot: route.pickup.name, address: route.pickup.address ?? null, at: r.pickupAt },
      dropoff: { depot: route.dropoff.name, address: route.dropoff.address ?? null, at: r.dropoffAt },
      rentalDays: route.rental_days,
      oneWay: route.one_way,
      driver: { fullName: `${r.driverFirstName} ${r.driverLastName}`, age: r.driverAge },
      extras: (r.extras ?? []).map((e) => e.name),
      total: r.totalPrice,
      currency: r.currency,
      paymentCard: cardLabel(r.paymentReference),
      url,
      qrSvg: await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0c1518', light: '#ffffff' } }),
    };
  }

  /** PDF A4 del voucher (pdfkit, fuentes estándar: no hace falta incrustar archivos). */
  async pdf(locator: string, token: unknown): Promise<{ filename: string; content: Buffer }> {
    const v = await this.view(locator, token);
    const qr = await QRCode.toBuffer(v.url, { type: 'png', margin: 1, width: 360, errorCorrectionLevel: 'M' });
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Voucher ${v.locator}`, Author: 'RutaLibre' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((ok) => doc.on('end', () => ok(Buffer.concat(chunks))));

    const BRAND = '#0d564f', ACCENT = '#d27a0c', INK = '#0c1518', MUTED = '#64748b', LINE = '#e7e5e4';
    const left = 48, width = doc.page.width - 96;

    // Cabecera
    doc.rect(0, 0, doc.page.width, 96).fill(INK);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text('Ruta', left, 34, { continued: true }).fillColor('#f8b043').text('Libre');
    doc.fillColor('#cbd5e1').font('Helvetica').fontSize(10).text('Voucher de alquiler de vehículo', left, 62);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text(v.locator, left, 38, { width, align: 'right' });
    doc.fillColor('#f8b043').font('Helvetica-Bold').fontSize(9).text(statusLabel(v.status, v.rentalStatus).toUpperCase(), left, 64, { width, align: 'right' });

    // QR + resumen
    let y = 124;
    doc.image(qr, left + width - 150, y, { width: 150 });
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('Escanea en el mostrador', left + width - 150, y + 154, { width: 150, align: 'center' });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text(v.vehicle.name, left, y, { width: width - 170 });
    y = doc.y + 4;
    const specs = [v.vehicle.category, v.vehicle.transmission, v.vehicle.fuelType, v.vehicle.seats && `${v.vehicle.seats} asientos`].filter(Boolean).join('  ·  ');
    doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(specs, left, y, { width: width - 170 });
    y = doc.y + 6;
    if (v.vehicle.supplier) doc.text(`Proveedor: ${v.vehicle.supplier}`, left, y, { width: width - 170 });
    if (v.vehicle.plate) doc.fillColor(BRAND).font('Helvetica-Bold').text(`Placa asignada: ${v.vehicle.plate}`, left, doc.y + 2);
    y = Math.max(doc.y, 124 + 170) + 16;

    // Recogida / devolución
    const col = (width - 16) / 2;
    const block = (x: number, label: string, e: { depot: string; address: string | null; at: Date }) => {
      doc.roundedRect(x, y, col, 92, 8).lineWidth(1).strokeColor(LINE).stroke();
      doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(8).text(label, x + 14, y + 12);
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(12).text(formatDate(e.at), x + 14, y + 26, { width: col - 28 });
      doc.fillColor(INK).font('Helvetica').fontSize(10).text(e.depot, x + 14, y + 46, { width: col - 28 });
      if (e.address) doc.fillColor(MUTED).fontSize(8.5).text(e.address, x + 14, doc.y + 2, { width: col - 28 });
    };
    block(left, 'RECOGIDA', v.pickup);
    block(left + col + 16, v.oneWay ? 'DEVOLUCIÓN (OTRA AGENCIA)' : 'DEVOLUCIÓN', v.dropoff);
    y += 108;

    // Conductor, extras y pago
    const row = (label: string, value: string) => {
      doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(label, left, y, { width: 150 });
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(value, left + 150, y, { width: width - 150 });
      y = Math.max(doc.y, y + 12) + 8;
    };
    row('Conductor principal', `${v.driver.fullName} (${v.driver.age} años)`);
    row('Duración', `${v.rentalDays} ${v.rentalDays === 1 ? 'día' : 'días'}`);
    row('Extras', v.extras.length ? v.extras.join(', ') : 'Ninguno');
    row('Total pagado (IVA incluido)', [formatMoney(v.total, v.currency), v.paymentCard].filter(Boolean).join('  ·  '));
    row('Emitido', formatDate(v.issuedAt));

    // Instrucciones
    y += 6;
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(1).strokeColor(LINE).stroke();
    y += 14;
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text('Para retirar el vehículo', left, y);
    doc.fillColor(INK).font('Helvetica').fontSize(9.5).list([
      'Presenta este voucher (impreso o en el celular), tu licencia de conducir vigente y tu cédula o pasaporte.',
      'El conductor principal debe ser la persona indicada en la reserva.',
      'Llega 15 minutos antes de la hora de recogida.',
      'Devuelve el vehículo con el mismo nivel de combustible y en buen estado: la inspección puede generar cargos adicionales.',
      'Cancelación gratuita hasta 24 horas antes de la recogida.',
    ], left, doc.y + 6, { bulletRadius: 1.6, width, paragraphGap: 3 });
    // Pie dentro del margen inferior: sin esto pdfkit abre una segunda página.
    doc.page.margins.bottom = 0;
    doc.fillColor(MUTED).fontSize(8).text(`Verifica este voucher en: ${v.url}`, left, doc.page.height - 64, { width, align: 'center', link: v.url, lineBreak: false });
    doc.text('RutaLibre · Proyecto académico (PUCE). Pagos simulados.', left, doc.page.height - 52, { width, align: 'center', lineBreak: false });
    doc.end();

    return { filename: `voucher-${v.locator}.pdf`, content: await done };
  }

  private async load(locator: string, token: unknown): Promise<Reservation> {
    const reservation = await this.dataSource.getRepository(Reservation).findOne({
      where: { locator: String(locator).trim().toUpperCase() }, relations: { extras: true },
    });
    // Mismo 404 si no existe o si el token no coincide: no se revela qué localizadores existen.
    if (!reservation || !this.signer.verify(reservation.id, token)) throw DomainError.notFound('El voucher no existe o el enlace no es válido');
    return reservation;
  }
}

function statusLabel(status: OrderStatus, rental: RentalStatus): string {
  if (status === OrderStatus.Cancelled) return 'Cancelada';
  if (rental === RentalStatus.PickedUp) return 'En curso';
  if (rental === RentalStatus.Returned) return 'Finalizada';
  return status === OrderStatus.Pending ? 'Pendiente' : 'Confirmada';
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('es-EC', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d));
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency }).format(amount);
}

/** "Visa •••• 4242" (o null si la referencia no es de la pasarela simulada). */
function cardLabel(reference: string): string | null {
  const card = describePaymentReference(reference);
  return card ? `${card.brand.charAt(0).toUpperCase()}${card.brand.slice(1)} •••• ${card.last4}` : null;
}
