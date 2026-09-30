import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepotReview } from './depot-review.entity';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [TypeOrmModule.forFeature([DepotReview])],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
