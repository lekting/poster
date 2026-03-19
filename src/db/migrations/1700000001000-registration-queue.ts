import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex
} from 'typeorm';

export class RegistrationQueue1700000001000 implements MigrationInterface {
  name = 'RegistrationQueue1700000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'registration_queue',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'email', type: 'text' },
          { name: 'encryptedPassword', type: 'text' },
          { name: 'desiredHandle', type: 'text' },
          { name: 'proxyUrl', type: 'text', isNullable: true },
          { name: 'status', type: 'text', default: "'pending'" },
          { name: 'verificationCode', type: 'text', isNullable: true },
          { name: 'errorMessage', type: 'text', isNullable: true },
          { name: 'accountId', type: 'varchar', isNullable: true },
          { name: 'createdByUserId', type: 'varchar', isNullable: true },
          {
            name: 'createdAt',
            type: 'datetime',
            default: "datetime('now')"
          }
        ]
      })
    );

    await queryRunner.createIndex(
      'registration_queue',
      new TableIndex({
        name: 'idx_registration_queue_status',
        columnNames: ['status']
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('registration_queue');
  }
}
