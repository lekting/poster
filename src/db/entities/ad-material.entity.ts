import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from 'typeorm';
import type { CampaignEntity } from './campaign.entity.js';

@Entity({ name: 'ad_materials' })
export class AdMaterialEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  campaignId!: string;

  @Column({ type: 'text' })
  type!: string;

  @Column({ type: 'text', nullable: true })
  content!: string | null;

  @Column({ type: 'text', nullable: true })
  mediaUrls!: string | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @ManyToOne('CampaignEntity', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaignId' })
  campaign!: CampaignEntity;
}
