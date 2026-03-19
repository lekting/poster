import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class OrganicPostTracking1700000003000 implements MigrationInterface {
  name = 'OrganicPostTracking1700000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'platform_accounts',
      new TableColumn({
        name: 'lastOrganicPostAt',
        type: 'datetime',
        isNullable: true
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('platform_accounts', 'lastOrganicPostAt');
  }
}
