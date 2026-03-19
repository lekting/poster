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
import type { PersonaEntity } from './persona.entity.js';
import type { CategoryEntity } from './category.entity.js';
import type { AdPostEntity } from './ad-post.entity.js';

export type PlatformAccountStatus =
  | 'pending_oauth'
  | 'active'
  | 'error'
  | 'suspended';

@Entity({ name: 'platform_accounts' })
export class PlatformAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  platform!: string;

  @Column({ type: 'text' })
  handle!: string;

  @Column({ type: 'text', nullable: true })
  username!: string | null;

  @Column({ type: 'varchar', nullable: true })
  personaId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  categoryId!: string | null;

  @Column({ type: 'text', default: 'pending_oauth' })
  status!: PlatformAccountStatus;

  @Column({ type: 'text', nullable: true })
  encryptedTokens!: string | null;

  @Column({ type: 'integer', default: 0 })
  useCamoufox!: number;

  @Column({ type: 'text', nullable: true })
  encryptedCamoufoxCredentials!: string | null;

  @Column({ type: 'integer', default: 0 })
  isPremium!: number;

  @Column({ type: 'datetime', nullable: true })
  lastOrganicPostAt!: Date | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;

  @ManyToOne('PersonaEntity', { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'personaId' })
  persona!: PersonaEntity | null;

  @ManyToOne('CategoryEntity', { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  category!: CategoryEntity | null;

  @OneToMany('AdPostEntity', (p: AdPostEntity) => p.account)
  adPosts!: AdPostEntity[];
}
