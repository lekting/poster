import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class ThreadsSupport1700000006000 implements MigrationInterface {
  name = 'ThreadsSupport1700000006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Encrypted browser cookies JSON (for session reuse on Threads, etc.)
    await queryRunner.addColumn(
      'platform_accounts',
      new TableColumn({
        name: 'encryptedCookies',
        type: 'text',
        isNullable: true
      })
    );

    // Encrypted TOTP 2FA secret (base32 key for authenticator-based 2FA)
    await queryRunner.addColumn(
      'platform_accounts',
      new TableColumn({
        name: 'encrypted2faSecret',
        type: 'text',
        isNullable: true
      })
    );

    // Encrypted password (for re-authentication when cookies expire)
    await queryRunner.addColumn(
      'platform_accounts',
      new TableColumn({
        name: 'encryptedPassword',
        type: 'text',
        isNullable: true
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('platform_accounts', 'encryptedPassword');
    await queryRunner.dropColumn('platform_accounts', 'encrypted2faSecret');
    await queryRunner.dropColumn('platform_accounts', 'encryptedCookies');
  }
}
