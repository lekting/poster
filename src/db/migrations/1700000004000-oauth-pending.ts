import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex
} from 'typeorm';

export class OAuthPending1700000004000 implements MigrationInterface {
  name = 'OAuthPending1700000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'oauth_pending',
        columns: [
          { name: 'state', type: 'text', isPrimary: true },
          { name: 'codeVerifier', type: 'text' },
          { name: 'telegramUserId', type: 'varchar' },
          {
            name: 'createdAt',
            type: 'datetime',
            default: "datetime('now')"
          }
        ]
      })
    );
    await queryRunner.createIndex(
      'oauth_pending',
      new TableIndex({ name: 'idx_oauth_pending_created', columnNames: ['createdAt'] })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('oauth_pending');
  }
}
