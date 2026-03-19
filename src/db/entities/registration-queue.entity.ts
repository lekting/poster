import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn
} from 'typeorm';

export type RegistrationStatus = 'pending' | 'in_progress' | 'awaiting_code' | 'completed' | 'failed';

@Entity({ name: 'registration_queue' })
export class RegistrationQueueEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  email!: string;

  @Column({ type: 'text' })
  encryptedPassword!: string;

  @Column({ type: 'text' })
  desiredHandle!: string;

  @Column({ type: 'text', nullable: true })
  proxyUrl!: string | null;

  @Column({ type: 'text', default: 'pending' })
  status!: RegistrationStatus;

  @Column({ type: 'text', nullable: true })
  verificationCode!: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'varchar', nullable: true })
  accountId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  createdByUserId!: string | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;
}
