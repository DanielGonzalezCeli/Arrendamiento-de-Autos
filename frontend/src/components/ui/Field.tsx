import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

export const INPUT_CLASS =
  'w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition duration-200 ' +
  'hover:border-stone-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 disabled:bg-stone-100 ' +
  'aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-100'

interface FieldProps {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  children: ReactNode
}

/** Etiqueta + control + mensaje de error accesible (aria-describedby). */
export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="animate-fade text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-400">{hint}</p>
      ) : null}
    </div>
  )
}

export function Input({ error, ...props }: InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return (
    <input
      className={INPUT_CLASS}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${props.id}-error` : undefined}
      {...props}
    />
  )
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={INPUT_CLASS} {...props}>
      {children}
    </select>
  )
}
