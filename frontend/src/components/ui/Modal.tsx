import { X } from 'lucide-react'
import { useEffect, useId, type ReactNode } from 'react'

/** Diálogo modal accesible: cierra con Escape o clic fuera (salvo que `locked` lo impida). */
export function Modal({ title, onClose, children, wide = false, locked = false }: {
  title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; locked?: boolean
}) {
  const titleId = useId()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !locked && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, locked])

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center" onMouseDown={() => !locked && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`my-8 w-full rounded-2xl bg-white shadow-xl ${wide ? 'max-w-3xl' : 'max-w-xl'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">{title}</h2>
          <button type="button" aria-label="Cerrar" disabled={locked} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
