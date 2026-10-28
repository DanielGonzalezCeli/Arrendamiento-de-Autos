import { FileCode2, FileText, Search } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorAlert } from '../../components/ui/Alert'
import { INPUT_CLASS } from '../../components/ui/Field'
import { Skeleton } from '../../components/ui/Spinner'
import { downloadFile } from '../../lib/api'
import { formatDateTime, formatMoney } from '../../lib/format'
import { useAdminQuery } from './admin-api'
import { Pill, SectionHeader, StatCard, TD, Table } from './components'

interface InvoiceRow {
  id: string
  docType: '01' | '04'
  number: string
  issuedAt: string
  reason: string
  buyerId: string
  buyerName: string
  subtotal: number
  vat: number
  total: number
  currency: string
  reservationId: string
  locator: string
}

/** Comprobantes electrónicos emitidos (RN27): facturas y notas de crédito, con descarga del RIDE y del XML. */
export function InvoicesPage() {
  const [q, setQ] = useState('')
  const term = useDeferredValue(q.trim())
  const data = useAdminQuery<InvoiceRow[]>(`invoices${term ? `?q=${encodeURIComponent(term)}` : ''}`)
  const [error, setError] = useState<unknown>(null)

  const rows = data.data ?? []
  const sum = (type: '01' | '04') => rows.filter((r) => r.docType === type).reduce((s, r) => s + Math.round(r.total * 100), 0) / 100
  const download = (r: InvoiceRow, format: 'pdf' | 'xml') => {
    setError(null)
    downloadFile(`/api/admin/invoices/${r.id}/${format}`, `${r.number}.${format}`).catch(setError)
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Facturación"
        subtitle="Facturas y notas de crédito con el formato del SRI (ambiente de pruebas, sin validez tributaria). Se emiten solas al pagar, modificar, cancelar o cobrar cargos de devolución."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Comprobantes (últimos 100)" value={rows.length} icon={<FileText className="h-5 w-5" />} />
        <StatCard label="Facturado" value={formatMoney(sum('01'), 'USD')} icon={<FileText className="h-5 w-5" />} />
        <StatCard label="Notas de crédito" value={formatMoney(sum('04'), 'USD')} icon={<FileText className="h-5 w-5" />} tone="text-amber-600" />
      </div>

      <label className="relative block max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <span className="sr-only">Buscar comprobantes</span>
        <input className={`${INPUT_CLASS} pl-9`} placeholder="Número, comprador, cédula/RUC o localizador" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {error !== null && <ErrorAlert error={error} />}
      {data.error && <ErrorAlert error={data.error} />}

      {data.isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <Table head={['Comprobante', 'Fecha', 'Comprador', 'Reserva', 'Subtotal', 'IVA', 'Total', '']} empty={!rows.length}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className={TD}>
                <Pill tone={r.docType === '04' ? 'amber' : 'blue'}>{r.docType === '04' ? 'Nota de crédito' : 'Factura'}</Pill>
                <p className="mt-1 font-mono text-xs text-slate-500">{r.number}</p>
              </td>
              <td className={`${TD} whitespace-nowrap text-xs`}>{formatDateTime(r.issuedAt)}</td>
              <td className={TD}><p className="font-medium">{r.buyerName}</p><p className="font-mono text-xs text-slate-500">{r.buyerId}</p></td>
              <td className={TD}><Link to={`/admin/reservas/${r.reservationId}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">{r.locator}</Link></td>
              <td className={`${TD} text-right`}>{formatMoney(r.subtotal, r.currency)}</td>
              <td className={`${TD} text-right`}>{formatMoney(r.vat, r.currency)}</td>
              <td className={`${TD} text-right font-semibold`}>{r.docType === '04' ? '−' : ''}{formatMoney(r.total, r.currency)}</td>
              <td className={`${TD} whitespace-nowrap text-right`}>
                <button type="button" aria-label={`PDF de ${r.number}`} title="RIDE (PDF)" className="rounded-lg p-2 text-slate-500 hover:bg-stone-100" onClick={() => download(r, 'pdf')}><FileText className="h-4 w-4" /></button>
                <button type="button" aria-label={`XML de ${r.number}`} title="XML" className="rounded-lg p-2 text-slate-500 hover:bg-stone-100" onClick={() => download(r, 'xml')}><FileCode2 className="h-4 w-4" /></button>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  )
}
