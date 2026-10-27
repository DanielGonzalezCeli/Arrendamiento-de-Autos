import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'accent' | 'secondary' | 'danger' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white shadow-sm shadow-brand-900/20 hover:bg-brand-800 disabled:bg-brand-700/50',
  // CTA principal del embudo de venta (buscar, reservar, pagar).
  accent: 'bg-accent-500 text-asphalt-900 shadow-sm shadow-accent-600/30 hover:bg-accent-400 disabled:bg-accent-500/50',
  secondary: 'border border-stone-300 bg-white text-slate-700 hover:border-stone-400 hover:bg-stone-50 disabled:opacity-50',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-600/50',
  ghost: 'text-slate-600 hover:bg-stone-200/60',
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition duration-200 ease-out ' +
  'active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  children: ReactNode
}

export function Button({ variant = 'primary', loading = false, className = '', children, disabled, ...props }: ButtonProps) {
  return (
    <button className={`${BASE} ${VARIANTS[variant]} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  )
}

export function ButtonLink({ to, variant = 'primary', className = '', children }: { to: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link to={to} viewTransition className={`${BASE} ${VARIANTS[variant]} ${className}`}>
      {children}
    </Link>
  )
}
