import { FileCode2, FileText, ReceiptText } from 'lucide-react'
import { useState } from 'react'
import { ErrorAlert } from '../../components/ui/Alert'
import { downloadFile } from '../../lib/api'
import { formatDateTime, formatMoney } from '../../lib/format'

export interface InvoiceView {
  id: string
  type: 'INVOICE' | 'CREDIT_NOTE'
  number: string
  accessKey: string
  issuedAt: string
  reason: string
  buyer: { idType: string; id: string; name: string }
  subtotal: number
  vat: number
  total: number
  currency: string
}

/**
 * Comprobantes de una reserva (RN27): factura del pago, ajustes y notas de crédito. `basePath` es el prefijo
 * de descarga: /api/me/invoices (cliente) o /api/admin/invoices (panel).
 */
export function InvoiceList({ invoices, basePath }: { invoices: InvoiceView[]; basePath: string }) {
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const download = async (inv: InvoiceView, format: 'pdf' | 'xml') => {
    setError(null)
    setBusy(`${inv.id}-${format}`)
    try {
      await downloadFile(`${basePath}/${inv.id}/${format}`, `${inv.number}.${format}`)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  if (!invoices.length) return <p className="text-sm text-slate-500">Aún no hay comprobantes emitidos.</p>

  return (
    <div className="flex flex-col gap-2">
      {error !== null && <ErrorAlert error={error} />}
      <ul className="flex flex-col divide-y divide-stone-100">
        {invoices.map((inv) => {
          const credit = inv.type === 'CREDIT_NOTE'
          return (
            <li key={inv.id} className="py-3">
              <div className="flex items-start gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${credit ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand-700'}`}>
                  <ReceiptText className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-asphalt-900">{credit ? 'Nota de crédito' : 'Factura'}</p>
                  <p className="font-mono text-xs text-slate-500">{inv.number}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(inv.issuedAt)}</p>
                  <p className="truncate text-xs text-slate-400" title={inv.reason}>{inv.reason}</p>
                </div>
                <p className={`font-display text-sm font-bold whitespace-nowrap ${credit ? 'text-amber-700' : 'text-asphalt-900'}`}>
                  {credit ? '−' : ''}{formatMoney(inv.total, inv.currency)}
                </p>
              </div>
              <div className="mt-2 flex gap-1 pl-12">
                <DownloadButton label={`PDF de ${inv.number}`} busy={busy === `${inv.id}-pdf`} onClick={() => download(inv, 'pdf')}><FileText className="h-3.5 w-3.5" /> PDF</DownloadButton>
                <DownloadButton label={`XML de ${inv.number}`} busy={busy === `${inv.id}-xml`} onClick={() => download(inv, 'xml')}><FileCode2 className="h-3.5 w-3.5" /> XML</DownloadButton>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-slate-400">Formato del SRI en ambiente de pruebas: sin validez tributaria.</p>
    </div>
  )
}

function DownloadButton({ label, busy, onClick, children }: { label: string; busy: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={busy} onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:border-stone-300 hover:bg-stone-50 disabled:opacity-50">
      {children}
    </button>
  )
}
