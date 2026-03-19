import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'oauth_pending' })
export class OAuthPendingEntity {
  @PrimaryColumn({ type: 'text' })
  state!: string;

  @Column({ type: 'text' })
  codeVerifier!: string;

  @Column({ type: 'varchar' })
  telegramUserId!: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;
}
