import { DataSource, Repository } from 'typeorm';
import type { CampaignStatus } from '../../db/entities/campaign.entity.js';
import { AdMaterialEntity, CampaignEntity } from '../../db/entities/index.js';

export interface CreateCampaignInput {
  createdById: string;
  name: string;
  description?: string | null;
  targetCategoryIds?: string[] | null;
}

export interface CreateAdMaterialInput {
  campaignId: string;
  type: string;
  content?: string | null;
  mediaUrls?: string | null;
}

export class CampaignService {
  private campaignRepo: Repository<CampaignEntity>;
  private materialRepo: Repository<AdMaterialEntity>;

  constructor(private readonly ds: DataSource) {
    this.campaignRepo = ds.getRepository(CampaignEntity);
    this.materialRepo = ds.getRepository(AdMaterialEntity);
  }

  async createCampaign(input: CreateCampaignInput): Promise<CampaignEntity> {
    const entity = this.campaignRepo.create({
      ...input,
      targetCategoryIds:
        input.targetCategoryIds && input.targetCategoryIds.length > 0
          ? JSON.stringify(input.targetCategoryIds)
          : null
    });
    return this.campaignRepo.save(entity);
  }

  getTargetCategoryIds(campaign: CampaignEntity): string[] {
    if (!campaign.targetCategoryIds) return [];
    try {
      const arr = JSON.parse(campaign.targetCategoryIds) as unknown;
      return Array.isArray(arr) ? arr.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }

  async setTargetCategories(campaignId: string, categoryIds: string[]): Promise<CampaignEntity | null> {
    const entity = await this.campaignRepo.findOne({ where: { id: campaignId } });
    if (!entity) return null;
    entity.targetCategoryIds =
      categoryIds.length > 0 ? JSON.stringify(categoryIds) : null;
    return this.campaignRepo.save(entity);
  }

  async getCampaignsByUser(userId: string): Promise<CampaignEntity[]> {
    return this.campaignRepo.find({
      where: { createdById: userId },
      relations: ['materials'],
      order: { createdAt: 'DESC' }
    });
  }

  async getCampaignById(id: string): Promise<CampaignEntity | null> {
    return this.campaignRepo.findOne({
      where: { id },
      relations: ['materials']
    });
  }

  async updateCampaignStatus(id: string, status: CampaignStatus): Promise<CampaignEntity | null> {
    const entity = await this.campaignRepo.findOne({ where: { id } });
    if (!entity) return null;
    entity.status = status;
    return this.campaignRepo.save(entity);
  }

  async addMaterial(input: CreateAdMaterialInput): Promise<AdMaterialEntity> {
    const entity = this.materialRepo.create(input);
    return this.materialRepo.save(entity);
  }

  async getMaterials(campaignId: string): Promise<AdMaterialEntity[]> {
    return this.materialRepo.find({
      where: { campaignId },
      order: { createdAt: 'ASC' }
    });
  }

  async deleteCampaign(id: string): Promise<boolean> {
    const result = await this.campaignRepo.delete(id);
    return (result.affected ?? 0) > 0;
  }
}
