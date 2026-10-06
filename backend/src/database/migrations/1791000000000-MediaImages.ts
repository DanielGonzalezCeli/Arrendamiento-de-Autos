import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Imágenes subidas desde el panel (fotos de modelos). Se guardan en la BD porque el disco de Render
 * (plan gratuito) se borra en cada despliegue; así la foto persiste sin servicios adicionales.
 */
export class MediaImages1791000000000 implements MigrationInterface {
  name = 'MediaImages1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE media_images (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        content_type  text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
        data          bytea NOT NULL,
        size_bytes    integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 2097152),
        original_name text,
        uploaded_by   uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at    timestamptz NOT NULL DEFAULT now()
      )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE media_images`);
  }
}
