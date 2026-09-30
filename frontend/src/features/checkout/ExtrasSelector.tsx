import { Baby, MapPinned, ShieldPlus, UserPlus, Wifi, type LucideIcon } from 'lucide-react'
import { formatMoney } from '../../lib/format'
import type { Extra } from '../../lib/types'

const ICONS: Record<string, LucideIcon> = { GPS: MapPinned, CHILD_SEAT: Baby, ADDITIONAL_DRIVER: UserPlus, CDW: ShieldPlus, WIFI: Wifi }

/** Selección de extras. Los precios mostrados son USD/día de referencia; el total real lo calcula la preview. */
export function ExtrasSelector({ extras, selected, onToggle, disabled }: {
  extras: Extra[]; selected: Set<string>; onToggle: (code: string) => void; disabled?: boolean
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {extras.map((extra) => {
        const Icon = ICONS[extra.code] ?? ShieldPlus
        const checked = selected.has(extra.code)
        return (
          <label
            key={extra.code}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${checked ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}
          >
            <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-600" checked={checked} disabled={disabled} onChange={() => onToggle(extra.code)} />
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
            <span className="flex-1">
              <span className="block text-sm font-semibold text-slate-800">{extra.name}</span>
              {extra.description && <span className="block text-xs text-slate-500">{extra.description}</span>}
              <span className="mt-1 block text-xs font-medium text-slate-700">
                {formatMoney(extra.pricePerDay, 'USD')}/día{extra.maxPrice !== null && ` · máx. ${formatMoney(extra.maxPrice, 'USD')}`}
              </span>
            </span>
          </label>
        )
      })}
    </div>
  )
}
