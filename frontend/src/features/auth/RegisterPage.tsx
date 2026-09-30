import { UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Field'
import { PhoneInput } from '../../components/ui/PhoneInput'
import { ApiError, errorMessage } from '../../lib/api'
import { useFormValidation } from '../../lib/use-form-validation'
import { collectErrors, sanitizeNameInput, validateEmail, validateName, validatePassword, validatePhone } from '../../lib/validation'
import { useAuth, type RegisterInput } from './AuthContext'
import { AuthLayout, safeReturnPath } from './LoginPage'

type FieldName = 'firstName' | 'lastName' | 'email' | 'phone' | 'password'
const EMPTY: RegisterInput = { email: '', password: '', firstName: '', lastName: '', phone: '' }

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [form, setForm] = useState<RegisterInput>(EMPTY)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)

  const localErrors = collectErrors<FieldName>({
    firstName: validateName(form.firstName, 'nombre'),
    lastName: validateName(form.lastName, 'apellido'),
    email: validateEmail(form.email),
    phone: validatePhone(form.phone ?? ''),
    password: validatePassword(form.password),
  })
  const { errorFor, touch, canSubmit } = useFormValidation<FieldName>(localErrors, error)

  const setName = (key: 'firstName' | 'lastName') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: sanitizeNameInput(e.target.value) })

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit()) return
    setLoading(true)
    setError(null)
    try {
      await register({ ...form, firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(), phone: form.phone || undefined })
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
        {error !== null && !(error instanceof ApiError && error.invalidParams.length) && <Alert tone="error">{errorMessage(error)}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre" htmlFor="firstName" error={errorFor('firstName')}>
            <Input id="firstName" autoComplete="given-name" value={form.firstName} onChange={setName('firstName')} onBlur={touch('firstName')} error={errorFor('firstName')} />
          </Field>
          <Field label="Apellido" htmlFor="lastName" error={errorFor('lastName')}>
            <Input id="lastName" autoComplete="family-name" value={form.lastName} onChange={setName('lastName')} onBlur={touch('lastName')} error={errorFor('lastName')} />
          </Field>
        </div>
        <Field label="Correo" htmlFor="email" error={errorFor('email')}>
          <Input id="email" type="email" autoComplete="email" placeholder="nombre@dominio.com" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value.replace(/\s/g, '') })} onBlur={touch('email')} error={errorFor('email')} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Teléfono (opcional)</label>
          <PhoneInput id="phone" value={form.phone ?? ''} onChange={(phone) => setForm({ ...form, phone })} onBlur={touch('phone')} error={errorFor('phone')} />
        </div>
        <Field label="Contraseña" htmlFor="password" error={errorFor('password')} hint="Mínimo 8 caracteres, con letras y números.">
          <Input id="password" type="password" autoComplete="new-password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} onBlur={touch('password')} error={errorFor('password')} />
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
