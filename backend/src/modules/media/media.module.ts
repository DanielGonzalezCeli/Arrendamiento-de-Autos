import { Module } from '@nestjs/common';
import { MediaService } from './media.service';

/** Imágenes subidas desde el panel: el admin las sube (AdminController) y la web las lee (PublicCatalogController). */
@Module({
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
