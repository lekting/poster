import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class CampaignTargetCategories1700000002000 implements MigrationInterface {
  name = 'CampaignTargetCategories1700000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'campaigns',
      new TableColumn({
        name: 'targetCategoryIds',
        type: 'text',
        isNullable: true
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('campaigns', 'targetCategoryIds');
  }
}
