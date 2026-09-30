import { ShieldCheck, UserRound } from 'lucide-react'
import { ErrorAlert } from '../../components/ui/Alert'
import { INPUT_CLASS } from '../../components/ui/Field'
import { LoadingBlock } from '../../components/ui/Spinner'
import { formatDate } from '../../lib/format'
import { useAuth } from '../auth/AuthContext'
import { useAdminMutation, useAdminQuery, type AdminUser } from './admin-api'
import { SectionHeader, TD, Table } from './components'

export function UsersPage() {
  const { user: me } = useAuth()
  const users = useAdminQuery<AdminUser[]>('users')
  const update = useAdminMutation<{ id: string; role?: string; active?: boolean }>('PATCH', (b) => `users/${b.id}`)

  if (users.isLoading) return <LoadingBlock />
  if (users.error) return <ErrorAlert error={users.error} />

  return (
    <div>
      <SectionHeader title="Usuarios" subtitle="Cuentas del marketplace. Un usuario desactivado no puede iniciar sesión. No puedes cambiar tu propio rol ni desactivarte." />
      {update.error && <div className="mb-3"><ErrorAlert error={update.error} /></div>}
      <Table head={['Usuario', 'Teléfono', 'Registro', 'Reservas', 'Rol', 'Activo']} empty={!users.data?.length}>
        {users.data?.map((u) => {
          const self = u.id === me?.id
          return (
            <tr key={u.id} className={u.active ? '' : 'opacity-60'}>
              <td className={TD}>
                <div className="flex items-center gap-2">
                  {u.role === 'ADMIN' ? <ShieldCheck className="h-4 w-4 text-brand-600" /> : <UserRound className="h-4 w-4 text-slate-400" />}
                  <div>
                    <p className="font-medium">{u.firstName} {u.lastName}{self && <span className="text-xs text-slate-400"> (tú)</span>}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </div>
                </div>
              </td>
              <td className={TD}>{u.phone ?? '—'}</td>
              <td className={TD}>{formatDate(u.createdAt)}</td>
              <td className={TD}>{u.reservations}</td>
              <td className={TD}>
                <select
                  aria-label={`Rol de ${u.email}`}
                  className={`${INPUT_CLASS} w-36 py-1.5`}
                  value={u.role}
                  disabled={self || update.isPending}
                  onChange={(e) => update.mutate({ id: u.id, role: e.target.value })}
                >
                  <option value="CUSTOMER">Cliente</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </td>
              <td className={TD}>
                <input
                  type="checkbox"
                  aria-label={`Cuenta activa de ${u.email}`}
                  className="h-4 w-4"
                  checked={u.active}
                  disabled={self || update.isPending}
                  onChange={(e) => update.mutate({ id: u.id, active: e.target.checked })}
                />
              </td>
            </tr>
          )
        })}
      </Table>
    </div>
  )
}
