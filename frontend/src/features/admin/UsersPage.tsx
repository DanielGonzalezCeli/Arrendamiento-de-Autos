import { KeyRound, Pencil, Plus, Search, ShieldCheck, Trash2, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Alert, ErrorAlert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { INPUT_CLASS } from '../../components/ui/Field'
import { LoadingBlock } from '../../components/ui/Spinner'
import { formatDate } from '../../lib/format'
import { validateEmail, validateName, validatePassword, validatePhone } from '../../lib/validation'
import { useAuth } from '../auth/AuthContext'
import { useAdminMutation, useAdminQuery, type AdminUser } from './admin-api'
import { EntityForm, Modal, SectionHeader, TD, Table, type FieldSpec } from './components'

const ROLE_OPTIONS = [
  { value: 'CUSTOMER', label: 'Cliente' },
  { value: 'ADMIN', label: 'Administrador' },
]

/** Adapta los validadores compartidos (null = válido) al formato del formulario (undefined = válido). */
const check = (fn: (v: string) => string | null) => (value: unknown) => fn(String(value ?? '')) ?? undefined

const PERSON_FIELDS: FieldSpec[] = [
  { name: 'firstName', label: 'Nombre', required: true, validate: check((v) => validateName(v, 'nombre')) },
  { name: 'lastName', label: 'Apellido', required: true, validate: check((v) => validateName(v, 'apellido')) },
  { name: 'email', label: 'Correo', required: true, full: true, placeholder: 'nombre@dominio.com', validate: check((v) => validateEmail(v)) },
  { name: 'phone', label: 'Teléfono (opcional)', type: 'phone', validate: check((v) => validatePhone(v)) },
]

type Dialog = { kind: 'create' } | { kind: 'edit'; user: AdminUser } | { kind: 'password'; user: AdminUser } | { kind: 'delete'; user: AdminUser }

export function UsersPage() {
  const { user: me } = useAuth()
  const users = useAdminQuery<AdminUser[]>('users')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const create = useAdminMutation<Record<string, unknown>>('POST', 'users')
  const update = useAdminMutation<Record<string, unknown>>('PATCH', (b) => `users/${b.id}`)
  const resetPassword = useAdminMutation<{ id: string; password: string }>('POST', (b) => `users/${b.id}/password`)
  const remove = useAdminMutation<{ id: string }>('DELETE', (b) => `users/${b.id}`)

  if (users.isLoading) return <LoadingBlock />
  if (users.error) return <ErrorAlert error={users.error} />

  const done = (message: string) => {
    setDialog(null)
    setNotice(message)
  }

  const term = search.trim().toLowerCase()
  const visible = users.data?.filter((u) => !term || `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(term)) ?? []

  return (
    <div>
      <SectionHeader
        title="Usuarios"
        subtitle="Crea cuentas de clientes o administradores, edita sus datos, restablece contraseñas y desactiva o elimina cuentas. Los cambios de rol y de estado se aplican al instante."
        action={<Button onClick={() => { setNotice(null); setDialog({ kind: 'create' }) }}><Plus className="h-4 w-4" /> Nuevo usuario</Button>}
      />
      {notice && <div className="mb-3"><Alert tone="success">{notice}</Alert></div>}
      {update.error && !dialog && <div className="mb-3"><ErrorAlert error={update.error} /></div>}

      <label className="relative mb-4 block max-w-md">
        <span className="sr-only">Buscar usuario</span>
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <input className={`${INPUT_CLASS} pl-9`} placeholder="Buscar por nombre o correo" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>

      <Table head={['Usuario', 'Teléfono', 'Registro', 'Reservas', 'Rol', 'Activo', '']} empty={!visible.length}>
        {visible.map((u) => {
          const self = u.id === me?.id
          return (
            <tr key={u.id} className={u.active ? '' : 'opacity-60'}>
              <td className={TD}>
                <div className="flex items-center gap-2">
                  {u.role === 'ADMIN' ? <ShieldCheck className="h-4 w-4 shrink-0 text-brand-600" /> : <UserRound className="h-4 w-4 shrink-0 text-slate-400" />}
                  <div className="min-w-0">
                    <p className="font-medium">{u.firstName} {u.lastName}{self && <span className="text-xs text-slate-400"> (tú)</span>}</p>
                    <p className="truncate text-xs text-slate-500" title={u.email}>{u.email}</p>
                  </div>
                </div>
              </td>
              <td className={`${TD} whitespace-nowrap`}>{u.phone ?? '—'}</td>
              <td className={`${TD} whitespace-nowrap`}>{formatDate(u.createdAt)}</td>
              <td className={TD}>{u.reservations}</td>
              <td className={TD}>
                <select
                  aria-label={`Rol de ${u.email}`}
                  className={`${INPUT_CLASS} w-36 py-1.5`}
                  value={u.role}
                  disabled={self || update.isPending}
                  onChange={(e) => update.mutate({ id: u.id, role: e.target.value }, { onSuccess: () => setNotice(`Rol de ${u.email} actualizado.`) })}
                >
                  {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </td>
              <td className={TD}>
                <input
                  type="checkbox"
                  aria-label={`Cuenta activa de ${u.email}`}
                  className="h-4 w-4"
                  checked={u.active}
                  disabled={self || update.isPending}
                  onChange={(e) => update.mutate({ id: u.id, active: e.target.checked }, {
                    onSuccess: () => setNotice(`Cuenta de ${u.email} ${e.target.checked ? 'activada' : 'desactivada'}.`),
                  })}
                />
              </td>
              <td className={`${TD} whitespace-nowrap text-right`}>
                <button type="button" title="Editar datos" aria-label={`Editar ${u.email}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                  onClick={() => { setNotice(null); setDialog({ kind: 'edit', user: u }) }}>
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" title="Restablecer contraseña" aria-label={`Restablecer la contraseña de ${u.email}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                  onClick={() => { setNotice(null); setDialog({ kind: 'password', user: u }) }}>
                  <KeyRound className="h-4 w-4" />
                </button>
                <button type="button" title={self ? 'No puedes eliminar tu propia cuenta' : 'Eliminar'} aria-label={`Eliminar ${u.email}`} disabled={self}
                  className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-30"
                  onClick={() => { setNotice(null); remove.reset(); setDialog({ kind: 'delete', user: u }) }}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          )
        })}
      </Table>

      {dialog?.kind === 'create' && (
        <Modal title="Nuevo usuario" onClose={() => setDialog(null)}>
          <EntityForm
            submitLabel="Crear usuario"
            fields={[
              ...PERSON_FIELDS,
              { name: 'role', label: 'Rol', type: 'select', required: true, options: ROLE_OPTIONS },
              { name: 'password', label: 'Contraseña inicial', type: 'password', required: true, hint: 'Mínimo 8 caracteres, con letras y números. Comunícasela al usuario.', validate: check(validatePassword) },
            ]}
            initial={{ firstName: '', lastName: '', email: '', phone: '', role: 'CUSTOMER', password: '' }}
            onSubmit={async (values) => {
              await create.mutateAsync(values)
              done(`Cuenta de ${String(values.email)} creada. Ya puede iniciar sesión con la contraseña inicial.`)
            }}
            onCancel={() => setDialog(null)}
          />
        </Modal>
      )}

      {dialog?.kind === 'edit' && (
        <Modal title={`Editar ${dialog.user.firstName} ${dialog.user.lastName}`} onClose={() => setDialog(null)}>
          <EntityForm
            fields={PERSON_FIELDS}
            initial={{ firstName: dialog.user.firstName, lastName: dialog.user.lastName, email: dialog.user.email, phone: dialog.user.phone ?? '' }}
            onSubmit={async (values) => {
              await update.mutateAsync({ ...values, id: dialog.user.id })
              done('Datos del usuario actualizados.')
            }}
            onCancel={() => setDialog(null)}
          />
        </Modal>
      )}

      {dialog?.kind === 'password' && (
        <Modal title={`Restablecer la contraseña de ${dialog.user.email}`} onClose={() => setDialog(null)}>
          <EntityForm
            submitLabel="Guardar contraseña"
            fields={[{ name: 'password', label: 'Nueva contraseña', type: 'password', required: true, full: true, hint: 'Mínimo 8 caracteres, con letras y números.', validate: check(validatePassword) }]}
            initial={{ password: '' }}
            onSubmit={async (values) => {
              await resetPassword.mutateAsync({ id: dialog.user.id, password: String(values.password) })
              done(`Contraseña de ${dialog.user.email} restablecida. Comunícale la nueva contraseña.`)
            }}
            onCancel={() => setDialog(null)}
          />
        </Modal>
      )}

      {dialog?.kind === 'delete' && (
        <Modal title="Eliminar usuario" onClose={() => setDialog(null)}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">
              ¿Eliminar definitivamente la cuenta de <strong>{dialog.user.email}</strong>? Solo se pueden eliminar cuentas sin historial
              (reservas, reseñas o bloqueos). Si tiene historial, desactívala para conservarlo.
            </p>
            {dialog.user.reservations > 0 && (
              <Alert tone="info">Esta cuenta tiene {dialog.user.reservations} reserva(s): no se podrá eliminar, pero puedes desactivarla.</Alert>
            )}
            {remove.error && <ErrorAlert error={remove.error} />}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setDialog(null)}>Cancelar</Button>
              {dialog.user.active && dialog.user.id !== me?.id && (
                <Button variant="secondary" loading={update.isPending}
                  onClick={() => update.mutate({ id: dialog.user.id, active: false }, { onSuccess: () => done(`Cuenta de ${dialog.user.email} desactivada.`) })}>
                  Solo desactivar
                </Button>
              )}
              <Button variant="danger" loading={remove.isPending}
                onClick={() => remove.mutate({ id: dialog.user.id }, { onSuccess: () => done(`Cuenta de ${dialog.user.email} eliminada.`) })}>
                <Trash2 className="h-4 w-4" /> Eliminar
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
