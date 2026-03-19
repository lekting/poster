import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from 'typeorm';
import type { CampaignEntity } from './campaign.entity.js';
import type { PlatformAccountEntity } from './platform-account.entity.js';

export type AdPostStatus = 'pending' | 'in_progress' | 'posted' | 'failed';

@Entity({ name: 'ad_posts' })
export class AdPostEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  campaignId!: string;

  @Column({ type: 'varchar' })
  accountId!: string;

  @Column({ type: 'text', default: 'pending' })
  status!: AdPostStatus;

  @Column({ type: 'text', nullable: true })
  generatedText!: string | null;

  @Column({ type: 'text', nullable: true })
  mediaIds!: string | null;

  @Column({ type: 'datetime', nullable: true })
  postedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  externalId!: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @ManyToOne('CampaignEntity', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaignId' })
  campaign!: CampaignEntity;

  @ManyToOne('PlatformAccountEntity', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'accountId' })
  account!: PlatformAccountEntity;
}
