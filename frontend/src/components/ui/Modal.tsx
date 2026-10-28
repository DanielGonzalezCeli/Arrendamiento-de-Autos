import { X } from 'lucide-react'
import { useEffect, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Diálogo modal accesible: cierra con Escape o clic fuera (salvo que `locked` lo impida).
 * Se monta en <body> con un portal: dentro de una sección animada (que crea su propio contexto de
 * apilamiento) el encabezado fijo quedaba por encima del modal.
 */
export function Modal({ title, onClose, children, wide = false, locked = false }: {
  title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; locked?: boolean
}) {
  const titleId = useId()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !locked && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, locked])

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-asphalt-900/50 p-4 backdrop-blur-sm animate-fade sm:p-8" onMouseDown={() => !locked && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`my-auto w-full animate-pop rounded-2xl bg-white shadow-2xl shadow-asphalt-900/20 ${wide ? 'max-w-3xl' : 'max-w-xl'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <h2 id={titleId} className="font-display text-xl font-bold text-asphalt-900">{title}</h2>
          <button type="button" aria-label="Cerrar" disabled={locked} className="rounded-lg p-1.5 text-slate-500 hover:bg-stone-100 disabled:opacity-40" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
