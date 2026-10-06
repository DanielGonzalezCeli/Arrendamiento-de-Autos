import { ImagePlus, Link2, Trash2, UploadCloud } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { apiUpload, assetUrl, errorMessage } from '../../lib/api'
import { Spinner } from './Spinner'
import { INPUT_CLASS } from './Field'

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SOURCE_BYTES = 15 * 1024 * 1024
const MAX_SIDE = 1280

interface ImageDropzoneProps {
  id: string
  value: string
  onChange: (url: string) => void
  error?: string
}

/**
 * Foto del modelo: arrastrar y soltar (o elegir) un archivo del computador. Antes de subirla se reduce en
 * el navegador a 1280 px como máximo, así pesa poco aunque la foto original sea enorme. También acepta
 * una URL pública como alternativa.
 */
export function ImageDropzone({ id, value, onChange, error }: ImageDropzoneProps) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [showUrl, setShowUrl] = useState(false)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setUploadError(null)
    if (!ACCEPTED.includes(file.type)) {
      setUploadError('Formato no admitido: usa una imagen JPG, PNG o WebP.')
      return
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setUploadError('La imagen es demasiado grande (máximo 15 MB).')
      return
    }
    setUploading(true)
    try {
      const blob = await resizeImage(file)
      const form = new FormData()
      form.append('file', blob, file.name.replace(/\.\w+$/, '') + (blob.type === 'image/webp' ? '.webp' : '.jpg'))
      const uploaded = await apiUpload<{ url: string }>('/api/admin/images', form)
      onChange(uploaded.url)
    } catch (e) {
      setUploadError(errorMessage(e))
    } finally {
      setUploading(false)
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  const invalid = Boolean(error || uploadError)

  return (
    <div className="flex flex-col gap-2">
      {value ? (
        <div className="flex items-center gap-4 rounded-xl border border-slate-200 p-3">
          <img src={assetUrl(value)} alt="Foto del modelo" className="h-20 w-32 rounded-lg object-cover" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="truncate font-mono text-xs text-slate-500" title={value}>{value}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => input.current?.click()}>
                <ImagePlus className="h-3.5 w-3.5" /> Cambiar
              </button>
              <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50" onClick={() => onChange('')}>
                <Trash2 className="h-3.5 w-3.5" /> Quitar
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          id={id}
          role="button"
          tabIndex={0}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onClick={() => !uploading && input.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !uploading && input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
            dragging ? 'border-brand-500 bg-brand-50' : invalid ? 'border-rose-300 bg-rose-50/40' : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50'
          }`}
        >
          {uploading ? (
            <>
              <Spinner />
              <p className="text-sm text-slate-600">Optimizando y subiendo la foto…</p>
            </>
          ) : (
            <>
              <UploadCloud className={`h-9 w-9 ${dragging ? 'text-brand-600' : 'text-slate-400'}`} />
              <p className="text-sm text-slate-700"><strong>Arrastra aquí la foto</strong> o haz clic para elegirla</p>
              <p className="text-xs text-slate-500">JPG, PNG o WebP · se ajusta automáticamente a 1280 px</p>
            </>
          )}
        </div>
      )}

      <input
        ref={input}
        type="file"
        accept={ACCEPTED.join(',')}
        className="hidden"
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = '' }}
      />

      {(uploadError || error) && <p id={`${id}-error`} className="text-xs text-rose-600">{uploadError ?? error}</p>}

      {!value && (
        showUrl ? (
          <input
            className={INPUT_CLASS}
            placeholder="https://… (enlace directo a una imagen)"
            aria-label="URL de la foto"
            onBlur={(e) => e.target.value.trim() && onChange(e.target.value.trim())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); const v = e.currentTarget.value.trim(); if (v) onChange(v) }
            }}
          />
        ) : (
          <button type="button" className="inline-flex items-center gap-1 self-start text-xs font-medium text-brand-600 hover:underline" onClick={() => setShowUrl(true)}>
            <Link2 className="h-3.5 w-3.5" /> Prefiero pegar una URL
          </button>
        )
      )}
    </div>
  )
}

/** Reduce la imagen a MAX_SIDE px (lado mayor) y la convierte a WebP (o JPEG si el navegador no soporta WebP). */
async function resizeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85))
  const webp = await toBlob('image/webp')
  const blob = webp?.type === 'image/webp' ? webp : await toBlob('image/jpeg')
  if (!blob) throw new Error('No se pudo procesar la imagen')
  return blob
}
