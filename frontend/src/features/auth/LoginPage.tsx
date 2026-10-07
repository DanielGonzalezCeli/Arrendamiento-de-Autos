import { LogIn } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ErrorAlert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
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
        <Button type="submit" loading={loading}>
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
    <div className="mx-auto flex w-full max-w-md flex-col px-4 py-12">
      <Card className="p-8">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">{subtitle}</p>
        {children}
      </Card>
    </div>
  )
}
