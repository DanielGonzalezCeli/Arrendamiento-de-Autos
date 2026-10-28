import PDFDocument from 'pdfkit';
import { BuyerIdType, SRI_EMITTER, SriDocType, VAT_15 } from '../../domain/sri';
import { Invoice } from './entities/invoice.entity';
import { sriDate } from './invoice-xml';

const ID_TYPE_LABEL: Record<string, string> = {
  [BuyerIdType.Ruc]: 'RUC', [BuyerIdType.Cedula]: 'Cédula', [BuyerIdType.Passport]: 'Pasaporte', [BuyerIdType.FinalConsumer]: 'Consumidor final',
};

/**
 * RIDE (Representación Impresa del Documento Electrónico). Mismo esquema visual que los RIDE del SRI:
 * emisor a la izquierda, recuadro con RUC, tipo, número y clave de acceso a la derecha, comprador,
 * detalle y totales. Lleva la marca "AMBIENTE DE PRUEBAS — SIN VALIDEZ TRIBUTARIA".
 */
export function renderInvoicePdf(inv: Invoice, ctx: { locator: string; related?: { number: string; issuedAt: Date } | null }): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 36, info: { Title: `${docLabel(inv.docType)} ${inv.number}`, Author: SRI_EMITTER.businessName } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((ok) => doc.on('end', () => ok(Buffer.concat(chunks))));

  const INK = '#0c1518', MUTED = '#475569', LINE = '#cbd5e1', BRAND = '#0d564f';
  const left = 36, width = doc.page.width - 72, half = (width - 12) / 2;
  const money = (n: number) => n.toFixed(2);

  // Marca de agua
  doc.save().rotate(-30, { origin: [doc.page.width / 2, doc.page.height / 2] })
    .fillColor('#e11d48').opacity(0.07).font('Helvetica-Bold').fontSize(54)
    .text('SIN VALIDEZ TRIBUTARIA', 0, doc.page.height / 2 - 30, { width: doc.page.width, align: 'center' }).restore();

  // Emisor (izquierda)
  let y = 36;
  doc.roundedRect(left, y, half, 170, 6).lineWidth(0.8).strokeColor(LINE).stroke();
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(20).text('Ruta', left + 14, y + 16, { continued: true }).fillColor('#d27a0c').text('Libre');
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(9.5).text(SRI_EMITTER.businessName, left + 14, y + 50, { width: half - 28 });
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
  const emitterRows = [
    ['Dirección matriz', SRI_EMITTER.headOffice], ['Dirección sucursal', SRI_EMITTER.headOffice],
    ['Obligado a llevar contabilidad', SRI_EMITTER.requiredToKeepAccounts],
  ];
  let ey = y + 70;
  for (const [k, v] of emitterRows) {
    doc.font('Helvetica-Bold').fillColor(INK).text(`${k}: `, left + 14, ey, { continued: true, width: half - 28 }).font('Helvetica').fillColor(MUTED).text(v);
    ey = doc.y + 4;
  }

  // Recuadro tributario (derecha)
  const rx = left + half + 12;
  doc.roundedRect(rx, y, half, 170, 6).lineWidth(0.8).strokeColor(LINE).stroke();
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(`R.U.C.: ${SRI_EMITTER.ruc}`, rx + 14, y + 14);
  doc.fontSize(15).text(docLabel(inv.docType).toUpperCase(), rx + 14, y + 32);
  doc.fontSize(10).text(`No. ${inv.number}`, rx + 14, y + 52);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text('NÚMERO DE AUTORIZACIÓN', rx + 14, y + 72);
  doc.font('Courier').fontSize(7.6).text(inv.accessKey, rx + 14, y + 84, { width: half - 28 });
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
    .text(`Fecha de emisión: ${sriDate(inv.issuedAt)}`, rx + 14, y + 104)
    .text('Ambiente: PRUEBAS     Emisión: NORMAL', rx + 14, y + 118);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(INK).text('CLAVE DE ACCESO', rx + 14, y + 134);
  doc.font('Courier').fontSize(7.6).text(inv.accessKey, rx + 14, y + 146, { width: half - 28 });

  // Comprador
  y += 184;
  doc.roundedRect(left, y, width, inv.docType === SriDocType.CreditNote ? 76 : 56, 6).lineWidth(0.8).strokeColor(LINE).stroke();
  const field = (label: string, value: string, x: number, yy: number, w: number) => {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK).text(`${label}: `, x, yy, { continued: true, width: w }).font('Helvetica').fillColor(MUTED).text(value);
  };
  field('Razón social / Nombres', inv.buyerName, left + 12, y + 10, width * 0.62);
  field('Identificación', `${inv.buyerId} (${ID_TYPE_LABEL[inv.buyerIdType] ?? inv.buyerIdType})`, left + width * 0.62, y + 10, width * 0.38 - 12);
  field('Fecha de emisión', sriDate(inv.issuedAt), left + 12, y + 26, width * 0.4);
  field('Dirección', inv.buyerAddress ?? '—', left + width * 0.4, y + 26, width * 0.6 - 12);
  field('Reserva', ctx.locator, left + 12, y + 40, width * 0.4);
  if (inv.docType === SriDocType.CreditNote) {
    field('Comprobante que se modifica', `FACTURA ${ctx.related?.number ?? '—'}`, left + 12, y + 54, width * 0.55);
    field('Fecha de emisión (comprobante a modificar)', ctx.related ? sriDate(ctx.related.issuedAt) : '—', left + width * 0.55, y + 54, width * 0.45 - 12);
  }
  y += inv.docType === SriDocType.CreditNote ? 90 : 70;

  // Detalle
  const cols = [
    { title: 'Cód.', w: 52, align: 'left' as const }, { title: 'Cant.', w: 40, align: 'right' as const },
    { title: 'Descripción', w: width - 52 - 40 - 74 - 50 - 74, align: 'left' as const }, { title: 'P. unitario', w: 74, align: 'right' as const },
    { title: 'Desc.', w: 50, align: 'right' as const }, { title: 'P. total', w: 74, align: 'right' as const },
  ];
  doc.rect(left, y, width, 18).fill('#0c1518');
  let x = left;
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
  for (const c of cols) { doc.text(c.title, x + 4, y + 5, { width: c.w - 8, align: c.align }); x += c.w; }
  y += 18;
  doc.font('Helvetica').fontSize(8.5).fillColor(INK);
  for (const l of inv.lines) {
    const values = [l.code, String(l.quantity), l.description, money(l.unitPrice), '0.00', money(l.subtotal)];
    const h = Math.max(18, doc.heightOfString(l.description, { width: cols[2].w - 8 }) + 8);
    x = left;
    values.forEach((v, i) => { doc.text(v, x + 4, y + 5, { width: cols[i].w - 8, align: cols[i].align }); x += cols[i].w; });
    y += h;
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.5).strokeColor(LINE).stroke();
  }

  // Información adicional + totales
  y += 12;
  const infoW = width * 0.55;
  doc.roundedRect(left, y, infoW, 92, 6).lineWidth(0.8).strokeColor(LINE).stroke();
  doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text('Información adicional', left + 12, y + 10);
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
    .text(`Motivo: ${inv.reason}`, left + 12, y + 26, { width: infoW - 24 })
    .text(`Email: ${inv.buyerEmail ?? '—'}`, left + 12, doc.y + 2, { width: infoW - 24 })
    .text(`Forma de pago: ${inv.docType === SriDocType.Invoice ? '19 - Tarjeta de crédito' : 'Reverso a la tarjeta de crédito'}`, left + 12, doc.y + 2, { width: infoW - 24 })
    .text(`Moneda: ${inv.currency === 'USD' ? 'Dólar (USD)' : inv.currency}`, left + 12, doc.y + 2, { width: infoW - 24 });

  const tx = left + infoW + 12, tw = width - infoW - 12;
  const totals: [string, string, boolean?][] = [
    [`Subtotal ${VAT_15.rate} %`, money(inv.subtotal)], ['Subtotal 0 %', '0.00'], ['Subtotal sin impuestos', money(inv.subtotal)],
    ['Total descuento', '0.00'], [`IVA ${VAT_15.rate} %`, money(inv.vat)], [inv.docType === SriDocType.Invoice ? 'VALOR TOTAL' : 'VALOR MODIFICACIÓN', money(inv.total), true],
  ];
  let ty = y;
  for (const [k, v, strong] of totals) {
    if (strong) doc.rect(tx, ty, tw, 17).fill('#ecf7f5');
    doc.font(strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor(INK).text(k, tx + 8, ty + 5, { width: tw * 0.6 });
    doc.text(v, tx + tw * 0.6, ty + 5, { width: tw * 0.4 - 8, align: 'right' });
    ty += 17;
    doc.moveTo(tx, ty).lineTo(tx + tw, ty).lineWidth(0.5).strokeColor(LINE).stroke();
  }

  doc.page.margins.bottom = 0;
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#e11d48')
    .text('AMBIENTE DE PRUEBAS — Comprobante generado con el formato del SRI pero NO enviado ni autorizado: sin validez tributaria.', left, doc.page.height - 56, { width, align: 'center', lineBreak: false });
  doc.font('Helvetica').fillColor(MUTED).text('RutaLibre · Proyecto académico de Integración de Sistemas (PUCE).', left, doc.page.height - 42, { width, align: 'center', lineBreak: false });
  doc.end();
  return done;
}

export function docLabel(type: string): string {
  return type === SriDocType.CreditNote ? 'Nota de crédito' : 'Factura';
}
