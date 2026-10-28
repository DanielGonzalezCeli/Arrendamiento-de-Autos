import { PAYMENT_CREDIT_CARD, SRI_EMITTER, SriDocType, VAT_15 } from '../../domain/sri';
import { Invoice } from './entities/invoice.entity';

/** Fecha dd/mm/aaaa en hora de Ecuador (formato del SRI). */
export function sriDate(d: Date): string {
  const [y, m, day] = ecuadorDate(d).split('-');
  return `${day}/${m}/${y}`;
}

/** aaaa-mm-dd en hora de Ecuador (para la clave de acceso). */
export function ecuadorDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

const money = (n: number) => n.toFixed(2);
const qty = (n: number) => n.toFixed(6).replace(/0{1,4}$/, '');

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const tag = (name: string, value: string | number) => `<${name}>${typeof value === 'number' ? value : esc(value)}</${name}>`;

type XmlInvoice = Pick<Invoice, 'docType' | 'number' | 'accessKey' | 'issuedAt' | 'reason' | 'buyerIdType' | 'buyerId' | 'buyerName' | 'buyerAddress'
  | 'buyerEmail' | 'subtotal' | 'vat' | 'total' | 'currency' | 'lines'>;

/**
 * XML del comprobante (factura v1.1.0 o nota de crédito v1.1.0), SIN firma XAdES-BES: la firma y el envío
 * a los servicios del SRI requieren el certificado .p12 del emisor. Estructura según la ficha técnica.
 */
export function buildInvoiceXml(inv: XmlInvoice, extra: { locator: string; related?: { number: string; issuedAt: Date } }): string {
  const [establishment, emissionPoint, sequential] = inv.number.split('-');
  const isInvoice = inv.docType === SriDocType.Invoice;
  const root = isInvoice ? 'factura' : 'notaCredito';
  const currencyName = inv.currency === 'USD' ? 'DOLAR' : inv.currency;

  const infoTributaria = [
    tag('ambiente', SRI_EMITTER.environment), tag('tipoEmision', SRI_EMITTER.emissionType), tag('razonSocial', SRI_EMITTER.businessName),
    tag('nombreComercial', SRI_EMITTER.tradeName), tag('ruc', SRI_EMITTER.ruc), tag('claveAcceso', inv.accessKey), tag('codDoc', inv.docType),
    tag('estab', establishment), tag('ptoEmi', emissionPoint), tag('secuencial', sequential), tag('dirMatriz', SRI_EMITTER.headOffice),
  ].join('');

  const totalTax = `<totalConImpuestos><totalImpuesto>${tag('codigo', VAT_15.code)}${tag('codigoPorcentaje', VAT_15.percentageCode)}`
    + `${tag('baseImponible', money(inv.subtotal))}${tag('valor', money(inv.vat))}</totalImpuesto></totalConImpuestos>`;

  const buyer = [
    tag('tipoIdentificacionComprador', inv.buyerIdType), tag('razonSocialComprador', inv.buyerName), tag('identificacionComprador', inv.buyerId),
  ];

  const info = isInvoice
    ? `<infoFactura>${tag('fechaEmision', sriDate(inv.issuedAt))}${tag('dirEstablecimiento', SRI_EMITTER.headOffice)}`
      + `${tag('obligadoContabilidad', SRI_EMITTER.requiredToKeepAccounts)}${buyer.join('')}`
      + `${inv.buyerAddress ? tag('direccionComprador', inv.buyerAddress) : ''}`
      + `${tag('totalSinImpuestos', money(inv.subtotal))}${tag('totalDescuento', '0.00')}${totalTax}`
      + `${tag('propina', '0.00')}${tag('importeTotal', money(inv.total))}${tag('moneda', currencyName)}`
      + `<pagos><pago>${tag('formaPago', PAYMENT_CREDIT_CARD)}${tag('total', money(inv.total))}</pago></pagos></infoFactura>`
    : `<infoNotaCredito>${tag('fechaEmision', sriDate(inv.issuedAt))}${tag('dirEstablecimiento', SRI_EMITTER.headOffice)}${buyer.join('')}`
      + `${tag('obligadoContabilidad', SRI_EMITTER.requiredToKeepAccounts)}${tag('codDocModificado', SriDocType.Invoice)}`
      + `${tag('numDocModificado', extra.related?.number ?? '')}${tag('fechaEmisionDocSustento', extra.related ? sriDate(extra.related.issuedAt) : '')}`
      + `${tag('totalSinImpuestos', money(inv.subtotal))}${tag('valorModificacion', money(inv.total))}${tag('moneda', currencyName)}`
      + `${totalTax}${tag('motivo', inv.reason)}</infoNotaCredito>`;

  const details = inv.lines.map((l) => `<detalle>${tag(isInvoice ? 'codigoPrincipal' : 'codigoInterno', l.code)}${tag('descripcion', l.description)}`
    + `${tag('cantidad', qty(l.quantity))}${tag('precioUnitario', qty(l.unitPrice))}${tag('descuento', '0.00')}`
    + `${tag('precioTotalSinImpuesto', money(l.subtotal))}<impuestos><impuesto>${tag('codigo', VAT_15.code)}`
    + `${tag('codigoPorcentaje', VAT_15.percentageCode)}${tag('tarifa', VAT_15.rate)}${tag('baseImponible', money(l.subtotal))}`
    + `${tag('valor', money(l.vat))}</impuesto></impuestos></detalle>`).join('');

  const additional = [
    `<campoAdicional nombre="Reserva">${esc(extra.locator)}</campoAdicional>`,
    inv.buyerEmail ? `<campoAdicional nombre="Email">${esc(inv.buyerEmail)}</campoAdicional>` : '',
    `<campoAdicional nombre="Observacion">${esc(`${inv.reason}. Ambiente de pruebas: no enviado al SRI.`)}</campoAdicional>`,
  ].join('');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<${root} id="comprobante" version="1.1.0"><infoTributaria>${infoTributaria}</infoTributaria>`
    + `${info}<detalles>${details}</detalles><infoAdicional>${additional}</infoAdicional></${root}>`;
}
