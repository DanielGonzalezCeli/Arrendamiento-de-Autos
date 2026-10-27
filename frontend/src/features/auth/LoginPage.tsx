import { LogIn } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ErrorAlert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { LogoMark } from '../../components/Logo'
import { Field, Input } from '../../components/ui/Field'
import { useFormValidation } from '../../lib/use-form-validation'
import { collectErrors, validateEmail } from '../../lib/validation'
import { useAuth } from './AuthContext'

/** Solo se permite volver a rutas internas (evita redirecciones abiertas a otros dominios). */
export function safeReturnPath(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)

  const localErrors = collectErrors<'email' | 'password'>({
    email: validateEmail(email, false),
    password: password ? null : 'Ingresa tu contraseña.',
  })
  const { errorFor, touch, canSubmit } = useFormValidation(localErrors, null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit()) return
    setLoading(true)
    setError(null)
    try {
      const user = await login(email, password)
      const back = params.get('volver')
      navigate(back ? safeReturnPath(back) : user.role === 'ADMIN' ? '/admin' : '/', { replace: true })
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Inicia sesión" subtitle="Para reservar y ver tus reservas.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {error !== null && <ErrorAlert error={error} />}
        <Field label="Correo" htmlFor="email" error={errorFor('email')}>
          <Input id="email" type="email" autoComplete="email" placeholder="nombre@dominio.com" value={email}
            onChange={(e) => setEmail(e.target.value.replace(/\s/g, ''))} onBlur={touch('email')} error={errorFor('email')} />
        </Field>
        <Field label="Contraseña" htmlFor="password" error={errorFor('password')}>
          <Input id="password" type="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} onBlur={touch('password')} error={errorFor('password')} />
        </Field>
        <Button type="submit" loading={loading} className="py-3">
          <LogIn className="h-4 w-4" /> Ingresar
        </Button>
        <p className="text-center text-sm text-slate-500">
          ¿No tienes cuenta?{' '}
          <Link to={`/registro${params.get('volver') ? `?volver=${encodeURIComponent(params.get('volver')!)}` : ''}`} className="font-semibold text-brand-600 hover:underline">
            Regístrate
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-5xl animate-fade px-4 py-10 md:py-14 lg:grid-cols-2">
      {/* Panel de marca (solo escritorio) */}
      <div className="topo relative hidden overflow-hidden rounded-l-3xl bg-asphalt-900 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-20 -bottom-24 h-72 w-72 rounded-full bg-brand-500/30 blur-3xl" aria-hidden="true" />
        <LogoMark className="h-12 w-12" />
        <div className="relative">
          <p className="font-display text-3xl leading-tight font-extrabold">Tu próxima ruta <span className="text-accent-400">te espera</span>.</p>
          <ul className="mt-6 space-y-2 text-sm text-stone-300">
            <li>· Precio final con IVA antes de confirmar</li>
            <li>· Cancelación gratuita hasta 24 h antes</li>
            <li>· Tus reservas y vouchers en un solo lugar</li>
          </ul>
        </div>
      </div>
      <div className="rounded-3xl border border-stone-200 bg-white p-8 shadow-xl shadow-asphalt-900/5 sm:p-10 lg:rounded-l-none">
        <h1 className="text-3xl font-extrabold text-asphalt-900">{title}</h1>
        <p className="mt-1 mb-7 text-sm text-slate-500">{subtitle}</p>
        {children}
      </div>
    </div>
  )
}
