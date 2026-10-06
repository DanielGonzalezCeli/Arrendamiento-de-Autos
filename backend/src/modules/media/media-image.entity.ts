import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Imagen subida desde el panel (ver migración MediaImages). */
@Entity('media_images')
export class MediaImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  contentType: string;

  @Column({ type: 'bytea', select: false })
  data: Buffer;

  @Column({ type: 'integer' })
  sizeBytes: number;

  @Column({ type: 'text', nullable: true })
  originalName: string | null;

  @Column({ type: 'uuid', nullable: true })
  uploadedBy: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
