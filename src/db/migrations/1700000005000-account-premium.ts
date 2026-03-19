import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AccountPremium1700000005000 implements MigrationInterface {
  name = 'AccountPremium1700000005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'platform_accounts',
      new TableColumn({
        name: 'isPremium',
        type: 'integer',
        default: 0,
        isNullable: false
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('platform_accounts', 'isPremium');
  }
}
