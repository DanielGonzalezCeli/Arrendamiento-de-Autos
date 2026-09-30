import { useState } from 'react'
import { ApiError } from './api'

/**
 * Muestra el error de un campo cuando el usuario salió de él (blur) o intentó enviar el formulario,
 * y combina los errores locales con los que devuelve el backend (ProblemDetails.invalidParams).
 */
export function useFormValidation<T extends string>(localErrors: Partial<Record<T, string>>, serverError: unknown, serverPrefix = '') {
  const [touched, setTouched] = useState<Partial<Record<T, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)

  const errorFor = (field: T): string | undefined => {
    const local = touched[field] || submitted ? localErrors[field] : undefined
    const server = serverError instanceof ApiError ? serverError.fieldError(`${serverPrefix}${field}`) : undefined
    return local ?? server
  }

  return {
    errorFor,
    touch: (field: T) => () => setTouched((t) => ({ ...t, [field]: true })),
    /** Marca el intento de envío; devuelve true si no hay errores locales. */
    canSubmit: () => {
      setSubmitted(true)
      return Object.keys(localErrors).length === 0
    },
  }
}
