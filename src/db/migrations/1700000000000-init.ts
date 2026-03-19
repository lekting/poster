import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
  TableUnique
} from 'typeorm';

export class Init1700000000000 implements MigrationInterface {
  name = 'Init1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'telegram_users',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'telegramId', type: 'text', isUnique: true },
          { name: 'username', type: 'text', isNullable: true },
          { name: 'firstName', type: 'text', isNullable: true },
          { name: 'lastName', type: 'text', isNullable: true },
          { name: 'isAdmin', type: 'integer', default: 0 },
          {
            name: 'createdAt',
            type: 'datetime',
            default: "datetime('now')"
          },
          {
            name: 'updatedAt',
            type: 'datetime',
            default: "datetime('now')"
          }
        ]
      })
    );

    await queryRunner.createTable(
      new Table({
        name: 'personas',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'name', type: 'text' },
          { name: 'slug', type: 'text', isUnique: true },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'systemPrompt', type: 'text', isNullable: true },
          {
            name: 'createdAt',
            type: 'datetime',
            default: "datetime('now')"
          },
          {
            name: 'updatedAt',
            type: 'datetime',
            default: "datetime('now')"
          }
        ]
      })
    );

    await queryRunner.createTable(
      new Table({
        name: 'categories',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'name', type: 'text' },
          { name: 'slug', type: 'text', isUnique: true },
          {
            name: 'createdAt',
            type: 'datetime',
            default: "datetime('now')"
          },
          {
            name: 'updatedAt',
            type: 'datetime',
            default: "datetime('now')"
          }
        ]
      })
    );

    await queryRunner.createTable(
      new Table({
        name: 'platform_accounts',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'platform', type: 'text' },
          { name: 'handle', type: 'text' },
          { name: 'username', type: 'text', isNullable: true },
          { name: 'personaId', type: 'varchar', isNullable: true },
          { name: 'categoryId', type: 'varchar', isNullable: true },
          { name: 'status', type: 'text', default: "'pending_oauth'" },
          { name: 'encryptedTokens', type: 'text', isNullable: true },
          { name: 'useCamoufox', type: 'integer', default: 0 },
          { name: 'encryptedCamoufoxCredentials', type: 'text', isNullable: true },
          {
            name: 'createdAt',
            type: 'datetime',
            default: "datetime('now')"
          },
          {
            name: 'updatedAt',
            type: 'datetime',
            default: "datetime('now')"
          }
        ]
      })
    );

    await queryRunner.createIndex(
      'platform_accounts',
      new TableIndex({
        name: 'idx_platform_accounts_platform',
        columnNames: ['platform']
      })
    );

    await queryRunner.createIndex(
      'platform_accounts',
      new TableIndex({
        name: 'idx_platform_accounts_category',
        columnNames: ['categoryId']
      })
    );

    await queryRunner.createForeignKey(
      'platform_accounts',
      new TableForeignKey({
        columnNames: ['personaId'],
        referencedTableName: 'personas',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL'
      })
    );

    await queryRunner.createForeignKey(
      'platform_accounts',
      new TableForeignKey({
        columnNames: ['categoryId'],
        referencedTableName: 'categories',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL'
      })
    );

    await queryRunner.createTable(
      new Table({
        name: 'campaigns',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'createdById', type: 'varchar' },
          { name: 'name', type: 'text' },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'status', type: 'text', default: "'draft'" },
          {
            name: 'createdAt',
            type: 'datetime',
            default: "datetime('now')"
          },
          {
            name: 'updatedAt',
            type: 'datetime',
            default: "datetime('now')"
          }
        ]
      })
    );

    await queryRunner.createForeignKey(
      'campaigns',
      new TableForeignKey({
        columnNames: ['createdById'],
        referencedTableName: 'telegram_users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE'
      })
    );

    await queryRunner.createTable(
      new Table({
        name: 'ad_materials',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'campaignId', type: 'varchar' },
          { name: 'type', type: 'text' },
          { name: 'content', type: 'text', isNullable: true },
          { name: 'mediaUrls', type: 'text', isNullable: true },
          {
            name: 'createdAt',
            type: 'datetime',
            default: "datetime('now')"
          }
        ]
      })
    );

    await queryRunner.createForeignKey(
      'ad_materials',
      new TableForeignKey({
        columnNames: ['campaignId'],
        referencedTableName: 'campaigns',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE'
      })
    );

    await queryRunner.createTable(
      new Table({
        name: 'ad_posts',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'campaignId', type: 'varchar' },
          { name: 'accountId', type: 'varchar' },
          { name: 'status', type: 'text', default: "'pending'" },
          { name: 'generatedText', type: 'text', isNullable: true },
          { name: 'mediaIds', type: 'text', isNullable: true },
          { name: 'postedAt', type: 'datetime', isNullable: true },
          { name: 'externalId', type: 'text', isNullable: true },
          { name: 'errorMessage', type: 'text', isNullable: true },
          {
            name: 'createdAt',
            type: 'datetime',
            default: "datetime('now')"
          }
        ]
      })
    );

    await queryRunner.createIndex(
      'ad_posts',
      new TableIndex({
        name: 'idx_ad_posts_campaign',
        columnNames: ['campaignId']
      })
    );

    await queryRunner.createIndex(
      'ad_posts',
      new TableIndex({
        name: 'idx_ad_posts_status',
        columnNames: ['status']
      })
    );

    await queryRunner.createForeignKey(
      'ad_posts',
      new TableForeignKey({
        columnNames: ['campaignId'],
        referencedTableName: 'campaigns',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE'
      })
    );

    await queryRunner.createForeignKey(
      'ad_posts',
      new TableForeignKey({
        columnNames: ['accountId'],
        referencedTableName: 'platform_accounts',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE'
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('ad_posts');
    await queryRunner.dropTable('ad_materials');
    await queryRunner.dropTable('campaigns');
    await queryRunner.dropTable('platform_accounts');
    await queryRunner.dropTable('categories');
    await queryRunner.dropTable('personas');
    await queryRunner.dropTable('telegram_users');
  }
}
