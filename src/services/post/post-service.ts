import { DataSource, Repository } from 'typeorm';
import type { AdPostStatus } from '../../db/entities/ad-post.entity.js';
import { AdPostEntity } from '../../db/entities/index.js';

export interface CreateAdPostInput {
  campaignId: string;
  accountId: string;
}

export class PostService {
  private repo: Repository<AdPostEntity>;

  constructor(private readonly ds: DataSource) {
    this.repo = ds.getRepository(AdPostEntity);
  }

  async create(input: CreateAdPostInput): Promise<AdPostEntity> {
    const entity = this.repo.create(input);
    return this.repo.save(entity);
  }

  async createMany(inputs: CreateAdPostInput[]): Promise<AdPostEntity[]> {
    const entities = inputs.map((i) => this.repo.create(i));
    return this.repo.save(entities);
  }

  async getByCampaign(campaignId: string): Promise<AdPostEntity[]> {
    return this.repo.find({
      where: { campaignId },
      relations: ['account', 'account.persona'],
      order: { createdAt: 'ASC' }
    });
  }

  async getPending(): Promise<AdPostEntity[]> {
    return this.repo.find({
      where: { status: 'pending' },
      relations: ['campaign', 'campaign.materials', 'account', 'account.persona'],
      order: { createdAt: 'ASC' }
    });
  }

  async updateStatus(
    id: string,
    status: AdPostStatus,
    data?: { generatedText?: string; mediaIds?: string; postedAt?: Date; externalId?: string; errorMessage?: string }
  ): Promise<AdPostEntity | null> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) return null;
    entity.status = status;
    if (data) {
      if (data.generatedText !== undefined) entity.generatedText = data.generatedText;
      if (data.mediaIds !== undefined) entity.mediaIds = data.mediaIds;
      if (data.postedAt !== undefined) entity.postedAt = data.postedAt;
      if (data.externalId !== undefined) entity.externalId = data.externalId;
      if (data.errorMessage !== undefined) entity.errorMessage = data.errorMessage;
    }
    return this.repo.save(entity);
  }

  async getById(id: string): Promise<AdPostEntity | null> {
    return this.repo.findOne({
      where: { id },
      relations: ['campaign', 'account']
    });
  }
}
