import { Timer } from 'lucide-react'
import { useEffect, useState } from 'react'

/** Cuenta regresiva del bloqueo (hold). Avisa al llegar a cero. */
export function HoldCountdown({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
  const remaining = useRemainingSeconds(expiresAt)

  useEffect(() => {
    if (remaining === 0) onExpire()
  }, [remaining, onExpire])

  const minutes = Math.floor(remaining / 60)
  const seconds = String(remaining % 60).padStart(2, '0')
  const urgent = remaining < 120

  return (
    <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${urgent ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
      <Timer className="h-5 w-5" />
      <span>
        Vehículo reservado para ti durante <strong className="tabular-nums">{minutes}:{seconds}</strong>
      </span>
    </div>
  )
}

function useRemainingSeconds(expiresAt: string): number {
  const compute = () => Math.max(0, Math.round((Date.parse(expiresAt) - Date.now()) / 1000))
  const [remaining, setRemaining] = useState(compute)
  useEffect(() => {
    setRemaining(compute())
    const timer = setInterval(() => setRemaining(compute()), 1000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt])
  return remaining
}
