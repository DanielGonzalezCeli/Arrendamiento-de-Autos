import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DomainError } from '../../domain/domain-error';
import { isUuid } from '../orders/uuid';
import { MediaImage } from './media-image.entity';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Archivo recibido por multer (memoria). */
export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

/**
 * Fotos de los modelos. El tipo se decide por la FIRMA del archivo (magic bytes), no por la extensión
 * ni por el Content-Type que manda el navegador: así no se puede subir un HTML o un SVG con scripts
 * disfrazado de imagen.
 */
@Injectable()
export class MediaService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async upload(file: UploadedImage | undefined, userId: string) {
    if (!file?.buffer?.length) {
      throw DomainError.validation('Adjunta una imagen', [{ name: 'file', reason: 'obligatorio' }]);
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw DomainError.validation('La imagen supera 2 MB', [{ name: 'file', reason: 'máximo 2 MB' }]);
    }
    const contentType = detectImageType(file.buffer);
    if (!contentType) {
      throw DomainError.validation('Formato no admitido: usa JPG, PNG o WebP', [{ name: 'file', reason: 'formato no admitido' }]);
    }
    const saved = await this.dataSource.getRepository(MediaImage).save({
      contentType,
      data: file.buffer,
      sizeBytes: file.size,
      originalName: file.originalname?.slice(0, 200) ?? null,
      uploadedBy: userId,
    });
    return { id: saved.id, url: `/api/images/${saved.id}`, contentType, sizeBytes: saved.sizeBytes };
  }

  async find(id: string): Promise<{ contentType: string; data: Buffer }> {
    const image = isUuid(id)
      ? await this.dataSource.getRepository(MediaImage).findOne({ where: { id }, select: { id: true, contentType: true, data: true } })
      : null;
    if (!image) throw DomainError.notFound('La imagen no existe');
    return image;
  }
}

export function detectImageType(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
