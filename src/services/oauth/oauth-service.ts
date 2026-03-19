import { DataSource, Repository } from 'typeorm';
import { OAuthPendingEntity } from '../../db/entities/index.js';

export class OAuthService {
  private repo: Repository<OAuthPendingEntity>;

  constructor(private readonly ds: DataSource) {
    this.repo = ds.getRepository(OAuthPendingEntity);
  }

  async createPending(state: string, codeVerifier: string, telegramUserId: string): Promise<void> {
    const entity = this.repo.create({ state, codeVerifier, telegramUserId });
    await this.repo.save(entity);
  }

  async getAndDelete(state: string): Promise<{ codeVerifier: string; telegramUserId: string } | null> {
    const entity = await this.repo.findOne({ where: { state } });
    if (!entity) return null;
    await this.repo.delete({ state });
    return { codeVerifier: entity.codeVerifier, telegramUserId: entity.telegramUserId };
  }

  /** Delete entries older than 15 minutes. */
  async cleanupOld(): Promise<number> {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .where('createdAt < :cutoff', { cutoff })
      .execute();
    return result.affected ?? 0;
  }
}
