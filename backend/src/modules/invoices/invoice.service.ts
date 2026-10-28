import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomInt } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { DomainError } from '../../domain/domain-error';
import { PriceBreakdown } from '../../domain/pricing';
import {
  accessKey, Buyer, BuyerIdType, BuyerInput, documentNumber, FINAL_CONSUMER, isValidCedula, normalizeBuyer,
  SRI_EMITTER, SriDocType, VAT_15,
} from '../../domain/sri';
import { Reservation } from '../orders/entities/reservation.entity';
import { Invoice, InvoiceLine } from './entities/invoice.entity';
import { isUuid } from '../orders/uuid';
import { renderInvoicePdf } from './invoice-pdf';
import { buildInvoiceXml, ecuadorDate } from './invoice-xml';

/** Línea con IVA por calcular (importe sin impuestos). */
export interface ChargeLine {
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

const cents = (n: number) => Math.round(n * 100);

/**
 * Emisión de comprobantes (RN27). Se llama DENTRO de la transacción de la reserva, así la factura y la
 * operación que la origina se confirman juntas: nunca hay un pago sin factura ni una factura huérfana.
 *  - confirmación → factura por el total;
 *  - modificación → factura por el aumento o nota de crédito por la disminución;
 *  - cancelación → nota de crédito por lo que se reembolsa;
 *  - devolución con cargos (inspección) → factura por los cargos.
 */
@Injectable()
export class InvoiceService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Valida los datos de facturación del checkout antes de cobrar (errores con los nombres de campo de la API). */
  validateBuyer(input: BuyerInput, total: number, field = 'billing'): Buyer {
    const { buyer, errors } = normalizeBuyer(input, total);
    if (!buyer) {
      throw DomainError.validation('Revisa los datos de facturación', Object.entries(errors).map(([name, reason]) => ({ name: `${field}.${name}`, reason: reason! })));
    }
    return buyer;
  }

  /** Factura de una reserva recién confirmada. Sin comprobador explícito (canales B2B) se deriva del conductor. */
  issueForReservation(m: EntityManager, r: Reservation, buyer?: Buyer | null): Promise<Invoice> {
    return this.issue(m, r, {
      docType: SriDocType.Invoice,
      buyer: buyer ?? defaultBuyer(r),
      reason: `Alquiler de vehículo · reserva ${r.locator}`,
      lines: linesFromBreakdown(r.priceBreakdown),
      totals: { subtotal: r.priceBreakdown.subtotal, vat: r.priceBreakdown.tax },
    });
  }

  /** Modificación: comprobante por la diferencia entre el desglose anterior y el nuevo. */
  async issueAdjustment(m: EntityManager, r: Reservation, before: PriceBreakdown): Promise<Invoice | null> {
    const deltaSubtotal = (cents(r.priceBreakdown.subtotal) - cents(before.subtotal)) / 100;
    const deltaVat = (cents(r.priceBreakdown.tax) - cents(before.tax)) / 100;
    if (deltaSubtotal === 0 && deltaVat === 0) return null;
    const increase = deltaSubtotal + deltaVat > 0;
    const subtotal = Math.abs(deltaSubtotal);
    const vat = Math.abs(deltaVat);
    const line: InvoiceLine = { code: 'MODIF', description: `Ajuste por modificación de la reserva ${r.locator}`, quantity: 1, unitPrice: subtotal, subtotal, vat };
    return this.issue(m, r, {
      docType: increase ? SriDocType.Invoice : SriDocType.CreditNote,
      buyer: await this.buyerOf(m, r),
      reason: increase ? `Ajuste por modificación de la reserva ${r.locator}` : `Devolución por modificación de la reserva ${r.locator}`,
      lines: [line],
      totals: { subtotal, vat },
    });
  }

  /** Cancelación: nota de crédito por el importe reembolsado (IVA incluido). */
  async issueRefund(m: EntityManager, r: Reservation, refund: number, reason: string): Promise<Invoice | null> {
    if (cents(refund) <= 0) return null;
    const totalCents = cents(refund);
    const subtotalCents = Math.round(totalCents / (1 + VAT_15.rate / 100));
    const subtotal = subtotalCents / 100;
    const vat = (totalCents - subtotalCents) / 100;
    return this.issue(m, r, {
      docType: SriDocType.CreditNote,
      buyer: await this.buyerOf(m, r),
      reason,
      lines: [{ code: 'DEVOL', description: `Reembolso de la reserva ${r.locator}`, quantity: 1, unitPrice: subtotal, subtotal, vat }],
      totals: { subtotal, vat },
    });
  }

  /** Cargos adicionales (p. ej. inspección de devolución): factura nueva al mismo comprador. */
  async issueCharges(m: EntityManager, r: Reservation, charges: ChargeLine[], reason: string): Promise<Invoice | null> {
    if (!charges.length) return null;
    const lines = withVat(charges);
    const subtotal = lines.reduce((s, l) => s + cents(l.subtotal), 0) / 100;
    const vat = lines.reduce((s, l) => s + cents(l.vat), 0) / 100;
    return this.issue(m, r, { docType: SriDocType.Invoice, buyer: await this.buyerOf(m, r), reason, lines, totals: { subtotal, vat } });
  }

  listForReservation(reservationId: string, manager: EntityManager = this.dataSource.manager): Promise<Invoice[]> {
    return manager.find(Invoice, { where: { reservationId }, order: { issuedAt: 'ASC', number: 'ASC' } });
  }

  /** Comprobantes de una reserva del dueño indicado (null = administrador). */
  async listForOwner(reservationId: string, ownerSub: string | null): Promise<Invoice[]> {
    const [r] = isUuid(reservationId)
      ? await this.dataSource.query(`SELECT owner_sub FROM reservations WHERE id = $1`, [reservationId])
      : [];
    if (!r || (ownerSub !== null && r.owner_sub !== ownerSub)) throw DomainError.notFound('La reserva no existe');
    return this.listForReservation(reservationId);
  }

  /** Últimos comprobantes emitidos (panel), con el localizador; filtro por número, comprador o reserva. */
  listRecent(q?: string, limit = 100) {
    const term = q?.trim() ? `%${q.trim().toLowerCase()}%` : null;
    return this.dataSource.query(
      `SELECT i.id, i.doc_type AS "docType", i.number, i.issued_at AS "issuedAt", i.reason, i.buyer_id AS "buyerId", i.buyer_name AS "buyerName",
              i.subtotal::float, i.vat::float, i.total::float, i.currency, r.id AS "reservationId", r.locator
         FROM invoices i JOIN reservations r ON r.id = i.reservation_id
        WHERE $1::text IS NULL OR lower(i.number) LIKE $1 OR lower(i.buyer_name) LIKE $1 OR i.buyer_id LIKE $1 OR lower(r.locator) LIKE $1
        ORDER BY i.issued_at DESC, i.number DESC LIMIT $2`,
      [term, limit],
    );
  }

  /** XML o RIDE (PDF) de un comprobante, comprobando el dueño de la reserva (null = administrador). */
  async document(id: string, format: 'pdf' | 'xml', ownerSub: string | null): Promise<{ filename: string; contentType: string; content: Buffer }> {
    const invoice = isUuid(id)
      ? await this.dataSource.getRepository(Invoice).createQueryBuilder('i').addSelect('i.xml').where('i.id = :id', { id }).getOne()
      : null;
    const [r] = invoice ? await this.dataSource.query(`SELECT locator, owner_sub FROM reservations WHERE id = $1`, [invoice.reservationId]) : [];
    if (!invoice || !r || (ownerSub !== null && r.owner_sub !== ownerSub)) throw DomainError.notFound('El comprobante no existe');
    // Nombre de archivo en ASCII: Content-Disposition no admite tildes sin codificar.
    const name = `${invoice.docType === SriDocType.CreditNote ? 'nota-de-credito' : 'factura'}-${invoice.number}`;
    if (format === 'xml') return { filename: `${name}.xml`, contentType: 'application/xml; charset=utf-8', content: Buffer.from(invoice.xml, 'utf8') };
    const related = invoice.relatedInvoiceId ? await this.dataSource.getRepository(Invoice).findOneBy({ id: invoice.relatedInvoiceId }) : null;
    const content = await renderInvoicePdf(invoice, { locator: r.locator, related: related ? { number: related.number, issuedAt: related.issuedAt } : null });
    return { filename: `${name}.pdf`, contentType: 'application/pdf', content };
  }

  private async issue(m: EntityManager, r: Reservation, doc: {
    docType: SriDocType; buyer: Buyer; reason: string; lines: InvoiceLine[]; totals: { subtotal: number; vat: number };
  }): Promise<Invoice> {
    const issuedAt = new Date();
    const { sequential, number } = documentNumber(await this.nextSequential(m, doc.docType));
    const key = accessKey({ issuedOn: ecuadorDate(issuedAt), docType: doc.docType, sequential, numericCode: String(randomInt(0, 1e8)).padStart(8, '0') });
    const related = doc.docType === SriDocType.CreditNote
      ? await m.findOne(Invoice, { where: { reservationId: r.id, docType: SriDocType.Invoice }, order: { issuedAt: 'ASC' } })
      : null;
    const total = (cents(doc.totals.subtotal) + cents(doc.totals.vat)) / 100;
    const invoice = m.create(Invoice, {
      reservationId: r.id, docType: doc.docType, number, accessKey: key, issuedAt, reason: doc.reason.slice(0, 300),
      relatedInvoiceId: related?.id ?? null,
      buyerIdType: doc.buyer.idType, buyerId: doc.buyer.idNumber, buyerName: doc.buyer.name, buyerAddress: doc.buyer.address, buyerEmail: doc.buyer.email,
      subtotal: doc.totals.subtotal, vat: doc.totals.vat, total, currency: r.currency, lines: doc.lines, xml: '',
    });
    invoice.xml = buildInvoiceXml(invoice, { locator: r.locator, related: related ? { number: related.number, issuedAt: related.issuedAt } : undefined });
    return m.save(Invoice, invoice);
  }

  /** Reserva el siguiente secuencial con la fila bloqueada (dos emisiones concurrentes esperan su turno). */
  private async nextSequential(m: EntityManager, docType: SriDocType): Promise<number> {
    const [row] = await m.query(
      `INSERT INTO invoice_sequences (doc_type, establishment, emission_point, last_value) VALUES ($1, $2, $3, 1)
       ON CONFLICT (doc_type, establishment, emission_point) DO UPDATE SET last_value = invoice_sequences.last_value + 1
       RETURNING last_value`,
      [docType, SRI_EMITTER.establishment, SRI_EMITTER.emissionPoint],
    );
    return row.last_value;
  }

  /** Los comprobantes posteriores (ajustes, notas de crédito, cargos) van al mismo comprador de la factura original. */
  private async buyerOf(m: EntityManager, r: Reservation): Promise<Buyer> {
    const first = await m.findOne(Invoice, { where: { reservationId: r.id, docType: SriDocType.Invoice }, order: { issuedAt: 'ASC' } });
    return first
      ? { idType: first.buyerIdType, idNumber: first.buyerId, name: first.buyerName, address: first.buyerAddress, email: first.buyerEmail }
      : defaultBuyer(r);
  }
}

/**
 * Comprador por defecto cuando el canal no envía datos de facturación (Booking Hub, contrato v3): el conductor,
 * identificado con su cédula si la licencia es una cédula válida (en Ecuador coinciden); si no, consumidor final.
 */
export function defaultBuyer(r: Reservation): Buyer {
  const license = String((r.partnerData as { license_number?: string } | null)?.license_number ?? '').replace(/\D/g, '');
  const name = `${r.driverFirstName} ${r.driverLastName}`.toUpperCase();
  if (isValidCedula(license)) return { idType: BuyerIdType.Cedula, idNumber: license, name, address: null, email: r.driverEmail };
  return { idType: BuyerIdType.FinalConsumer, idNumber: FINAL_CONSUMER.id, name: FINAL_CONSUMER.name, address: null, email: r.driverEmail };
}

/** Líneas de la factura a partir del desglose de precio; el IVA de las líneas cuadra con el total del desglose. */
function linesFromBreakdown(b: PriceBreakdown): InvoiceLine[] {
  const lines = withVat(b.lines.map((l) => ({ code: l.code, description: l.description, quantity: l.quantity, unitPrice: l.unit_price, subtotal: l.amount })));
  const diff = cents(b.tax) - lines.reduce((s, l) => s + cents(l.vat), 0);
  if (diff !== 0 && lines.length) lines[lines.length - 1].vat = (cents(lines[lines.length - 1].vat) + diff) / 100;
  return lines;
}

function withVat(lines: ChargeLine[]): InvoiceLine[] {
  return lines.map((l) => ({ ...l, vat: Math.round(cents(l.subtotal) * VAT_15.rate / 100) / 100 }));
}
