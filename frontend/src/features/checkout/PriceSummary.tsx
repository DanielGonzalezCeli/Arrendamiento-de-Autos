import { formatMoney } from '../../lib/format'
import type { PriceBreakdown } from '../../lib/types'

/** Desglose calculado por el backend. El frontend NUNCA calcula precios: solo los muestra. */
export function PriceSummary({ price, updating = false }: { price: PriceBreakdown; updating?: boolean }) {
  const money = (amount: number) => formatMoney(amount, price.currency)
  return (
    <div className={`flex flex-col gap-2 text-sm transition-opacity ${updating ? 'opacity-50' : ''}`} aria-busy={updating}>
      {price.lines.map((line) => (
        <div key={line.code} className="flex justify-between gap-4 text-slate-600">
          <span>
            {line.description}
            {line.quantity > 1 && <span className="text-slate-400"> · {line.quantity} × {money(line.unit_price)}</span>}
          </span>
          <span className="font-medium text-slate-800">{money(line.amount)}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between border-t border-slate-100 pt-2 text-slate-600">
        <span>Subtotal</span>
        <span>{money(price.subtotal)}</span>
      </div>
      <div className="flex justify-between text-slate-600">
        <span>IVA ({Math.round(price.tax_rate * 100)} %)</span>
        <span>{money(price.tax)}</span>
      </div>
      <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
        <span>Total</span>
        <span>{money(price.total)}</span>
      </div>
    </div>
  )
}
