import { MigrationInterface, QueryRunner } from 'typeorm';

/** Fotos de los modelos de demostración (servidas por el frontend en /cars/*.jpg; créditos en /creditos). */
const MODEL_PHOTOS: [make: string, model: string, file: string][] = [
  ['Kia', 'Picanto', 'kia-picanto'],
  ['Chevrolet', 'Onix', 'chevrolet-onix'],
  ['Toyota', 'Corolla Hybrid', 'toyota-corolla-hybrid'],
  ['Kia', 'Sportage', 'kia-sportage'],
  ['Toyota', 'Hilux 4x4', 'toyota-hilux'],
  ['Hyundai', 'Accent', 'hyundai-accent'],
  ['Nissan', 'Sentra', 'nissan-sentra'],
  ['Hyundai', 'Tucson', 'hyundai-tucson'],
  ['Toyota', 'Fortuner', 'toyota-fortuner'],
  ['Hyundai', 'H-1', 'hyundai-h1'],
];

/**
 * Migración de DATOS (no de esquema):
 * 1. Asigna foto a los modelos de demo que aún no tienen (no pisa fotos cargadas por el admin).
 * 2. Pasa teléfonos ecuatorianos locales (0991234567 / 022345678) a formato internacional E.164,
 *    que es el que exige ahora la validación (+593991234567).
 */
export class PhotosAndInternationalPhones1790800000000 implements MigrationInterface {
  name = 'PhotosAndInternationalPhones1790800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [make, model, file] of MODEL_PHOTOS) {
      await queryRunner.query(
        `UPDATE vehicle_models SET image_url = $3, updated_at = now() WHERE make = $1 AND model = $2 AND image_url IS NULL`,
        [make, model, `/cars/${file}.jpg`],
      );
    }
    const ecuadorLocal = `'^0[2-9][0-9]{7,8}$'`;
    await queryRunner.query(`UPDATE users SET phone = '+593' || substring(phone FROM 2) WHERE phone ~ ${ecuadorLocal}`);
    await queryRunner.query(
      `UPDATE reservations SET driver_phone = '+593' || substring(driver_phone FROM 2) WHERE driver_phone ~ ${ecuadorLocal}`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE vehicle_models SET image_url = NULL WHERE image_url LIKE '/cars/%'`);
    // Los teléfonos quedan en E.164: es un formato válido también para la versión anterior.
  }
}
