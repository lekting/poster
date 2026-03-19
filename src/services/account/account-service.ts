import { DataSource, In, Repository } from 'typeorm';
import type { PlatformAccountStatus } from '../../db/entities/platform-account.entity.js';
import { PlatformAccountEntity } from '../../db/entities/index.js';

export interface CreateAccountInput {
  platform: string;
  handle: string;
  username?: string | null;
  personaId?: string | null;
  categoryId?: string | null;
  encryptedTokens?: string | null;
  useCamoufox?: number;
}

export class AccountService {
  private repo: Repository<PlatformAccountEntity>;

  constructor(private readonly ds: DataSource) {
    this.repo = ds.getRepository(PlatformAccountEntity);
  }

  async create(input: CreateAccountInput): Promise<PlatformAccountEntity> {
    const entity = this.repo.create({
      ...input,
      status: input.encryptedTokens ? 'active' : 'pending_oauth'
    });
    return this.repo.save(entity);
  }

  async getAll(platform?: string): Promise<PlatformAccountEntity[]> {
    const where = platform ? { platform } : {};
    return this.repo.find({
      where,
      relations: ['persona', 'category'],
      order: { handle: 'ASC' }
    });
  }

  async getById(id: string): Promise<PlatformAccountEntity | null> {
    return this.repo.findOne({
      where: { id },
      relations: ['persona', 'category']
    });
  }

  async getByCategory(categoryId: string): Promise<PlatformAccountEntity[]> {
    return this.repo.find({
      where: { categoryId, status: 'active' },
      relations: ['persona', 'category'],
      order: { handle: 'ASC' }
    });
  }

  async getByCategoryIds(categoryIds: string[]): Promise<PlatformAccountEntity[]> {
    if (categoryIds.length === 0) return [];
    return this.repo.find({
      where: { categoryId: In(categoryIds), status: 'active' },
      relations: ['persona', 'category'],
      order: { handle: 'ASC' }
    });
  }

  async assignPersona(accountId: string, personaId: string | null): Promise<PlatformAccountEntity | null> {
    const entity = await this.repo.findOne({ where: { id: accountId } });
    if (!entity) return null;
    entity.personaId = personaId;
    return this.repo.save(entity);
  }

  async assignCategory(accountId: string, categoryId: string | null): Promise<PlatformAccountEntity | null> {
    const entity = await this.repo.findOne({ where: { id: accountId } });
    if (!entity) return null;
    entity.categoryId = categoryId;
    return this.repo.save(entity);
  }

  async updateStatus(accountId: string, status: PlatformAccountStatus): Promise<PlatformAccountEntity | null> {
    const entity = await this.repo.findOne({ where: { id: accountId } });
    if (!entity) return null;
    entity.status = status;
    return this.repo.save(entity);
  }

  async setTokens(accountId: string, encryptedTokens: string): Promise<PlatformAccountEntity | null> {
    const entity = await this.repo.findOne({ where: { id: accountId } });
    if (!entity) return null;
    entity.encryptedTokens = encryptedTokens;
    entity.status = 'active';
    return this.repo.save(entity);
  }

  async setCamoufoxCredentials(
    accountId: string,
    encryptedCredentials: string
  ): Promise<PlatformAccountEntity | null> {
    const entity = await this.repo.findOne({ where: { id: accountId } });
    if (!entity) return null;
    entity.encryptedCamoufoxCredentials = encryptedCredentials;
    entity.useCamoufox = 1;
    entity.status = 'active';
    return this.repo.save(entity);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }

  /** Accounts that are active, have persona, can post, and are due for organic post (never or > minAgeMs ago). */
  async getAccountsDueForOrganicPost(
    platform: string,
    minAgeMs: number
  ): Promise<PlatformAccountEntity[]> {
    const cutoff = new Date(Date.now() - minAgeMs);
    return this.repo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.persona', 'persona')
      .where('a.platform = :platform', { platform })
      .andWhere('a.status = :status', { status: 'active' })
      .andWhere('a.personaId IS NOT NULL')
      .andWhere(
        '(a.encryptedTokens IS NOT NULL OR (a.useCamoufox = 1 AND a.encryptedCamoufoxCredentials IS NOT NULL))'
      )
      .andWhere('(a.lastOrganicPostAt IS NULL OR a.lastOrganicPostAt < :cutoff)', { cutoff })
      .orderBy('a.lastOrganicPostAt', 'ASC', 'NULLS FIRST')
      .getMany();
  }

  async setPremium(accountId: string, isPremium: boolean): Promise<PlatformAccountEntity | null> {
    const entity = await this.repo.findOne({ where: { id: accountId } });
    if (!entity) return null;
    entity.isPremium = isPremium ? 1 : 0;
    return this.repo.save(entity);
  }

  async setLastOrganicPostAt(accountId: string, at: Date): Promise<PlatformAccountEntity | null> {
    const entity = await this.repo.findOne({ where: { id: accountId } });
    if (!entity) return null;
    entity.lastOrganicPostAt = at;
    return this.repo.save(entity);
  }
}
