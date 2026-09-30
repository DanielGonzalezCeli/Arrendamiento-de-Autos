import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { errorMessage } from '../../lib/api'

type Tone = 'error' | 'success' | 'info'

const TONES: Record<Tone, { box: string; icon: ReactNode }> = {
  error: { box: 'border-rose-200 bg-rose-50 text-rose-800', icon: <AlertTriangle className="h-5 w-5 shrink-0" /> },
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-800', icon: <CheckCircle2 className="h-5 w-5 shrink-0" /> },
  info: { box: 'border-brand-100 bg-brand-50 text-brand-700', icon: <Info className="h-5 w-5 shrink-0" /> },
}

export function Alert({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${TONES[tone].box}`}>
      {TONES[tone].icon}
      <div>{children}</div>
    </div>
  )
}

export function ErrorAlert({ error }: { error: unknown }) {
  return <Alert tone="error">{errorMessage(error)}</Alert>
}
