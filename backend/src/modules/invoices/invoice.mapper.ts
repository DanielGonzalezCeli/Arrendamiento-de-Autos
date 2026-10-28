import { SriDocType } from '../../domain/sri';
import { Invoice } from './entities/invoice.entity';

/** Vista de un comprobante (sin el XML). */
export function toInvoiceView(i: Invoice) {
  return {
    id: i.id,
    type: i.docType === SriDocType.CreditNote ? 'CREDIT_NOTE' : 'INVOICE',
    number: i.number,
    accessKey: i.accessKey,
    issuedAt: i.issuedAt,
    reason: i.reason,
    buyer: { idType: i.buyerIdType, id: i.buyerId, name: i.buyerName },
    subtotal: i.subtotal,
    vat: i.vat,
    total: i.total,
    currency: i.currency,
    lines: i.lines,
  };
}
