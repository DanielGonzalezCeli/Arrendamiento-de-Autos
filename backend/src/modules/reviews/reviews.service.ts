import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepotReview } from './depot-review.entity';

export interface DepotScore {
  depotId: number;
  /** Promedio 0–10 con un decimal (ej. 8.5). */
  score: number;
  reviews: number;
}

@Injectable()
export class ReviewsService {
  constructor(@InjectRepository(DepotReview) private readonly reviews: Repository<DepotReview>) {}

  /** Puntuación promedio por agencia (POST /depots/reviews/scores). Solo agencias con reseñas. */
  async scoresByDepot(): Promise<DepotScore[]> {
    const rows: { depot_id: number; score: string; reviews: string }[] = await this.reviews.query(
      `SELECT r.depot_id, round(avg(r.score)::numeric, 1) AS score, count(*) AS reviews
         FROM depot_reviews r JOIN depots d ON d.id = r.depot_id AND d.active
        GROUP BY r.depot_id ORDER BY r.depot_id`,
    );
    return rows.map((r) => ({ depotId: Number(r.depot_id), score: Number(r.score), reviews: Number(r.reviews) }));
  }
}
