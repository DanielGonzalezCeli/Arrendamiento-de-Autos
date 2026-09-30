import { UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Field'
import { ApiError, errorMessage } from '../../lib/api'
import { useAuth, type RegisterInput } from './AuthContext'
import { AuthLayout, safeReturnPath } from './LoginPage'

const EMPTY: RegisterInput = { email: '', password: '', firstName: '', lastName: '', phone: '' }

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [form, setForm] = useState<RegisterInput>(EMPTY)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)

  const set = (key: keyof RegisterInput) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value })
  // Errores por campo que devuelve el backend (ProblemDetails.invalidParams).
  const fieldError = (name: string) => (error instanceof ApiError ? error.fieldError(name) : undefined)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await register({ ...form, phone: form.phone?.trim() || undefined })
      navigate(safeReturnPath(params.get('volver')), { replace: true })
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Crea tu cuenta" subtitle="Reserva en minutos y gestiona tus alquileres.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {error !== null && <Alert tone="error">{errorMessage(error)}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre" htmlFor="firstName" error={fieldError('firstName')}>
            <Input id="firstName" autoComplete="given-name" value={form.firstName} onChange={set('firstName')} error={fieldError('firstName')} />
          </Field>
          <Field label="Apellido" htmlFor="lastName" error={fieldError('lastName')}>
            <Input id="lastName" autoComplete="family-name" value={form.lastName} onChange={set('lastName')} error={fieldError('lastName')} />
          </Field>
        </div>
        <Field label="Correo" htmlFor="email" error={fieldError('email')}>
          <Input id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={fieldError('email')} />
        </Field>
        <Field label="Teléfono (opcional)" htmlFor="phone" error={fieldError('phone')}>
          <Input id="phone" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} error={fieldError('phone')} />
        </Field>
        <Field label="Contraseña" htmlFor="password" error={fieldError('password')} hint="Mínimo 8 caracteres, con letras y números.">
          <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={fieldError('password')} />
        </Field>
        <Button type="submit" loading={loading}>
          <UserPlus className="h-4 w-4" /> Crear cuenta
        </Button>
        <p className="text-center text-sm text-slate-500">
          ¿Ya tienes cuenta?{' '}
          <Link to="/ingresar" className="font-semibold text-brand-600 hover:underline">
            Inicia sesión
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
