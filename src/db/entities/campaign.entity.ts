import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import type { TelegramUserEntity } from './telegram-user.entity.js';
import type { AdMaterialEntity } from './ad-material.entity.js';
import type { AdPostEntity } from './ad-post.entity.js';

export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'completed';

@Entity({ name: 'campaigns' })
export class CampaignEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  createdById!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'text', default: 'draft' })
  status!: CampaignStatus;

  /** JSON array of category IDs for targeting. Empty or null = all categories. */
  @Column({ type: 'text', nullable: true })
  targetCategoryIds!: string | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;

  @ManyToOne('TelegramUserEntity', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'createdById' })
  createdBy!: TelegramUserEntity;

  @OneToMany('AdMaterialEntity', (m: AdMaterialEntity) => m.campaign)
  materials!: AdMaterialEntity[];

  @OneToMany('AdPostEntity', (p: AdPostEntity) => p.campaign)
  adPosts!: AdPostEntity[];
}
