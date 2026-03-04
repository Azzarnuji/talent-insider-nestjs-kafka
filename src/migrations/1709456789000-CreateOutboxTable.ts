import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateOutboxTable1709456789000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "outbox",
        columns: [
          { name: "id", type: "char", length: "36", isPrimary: true },
          { name: "topic", type: "varchar" },
          { name: "payload", type: "text" },
          { name: "key", type: "varchar", isNullable: true },
          { name: "status", type: "varchar", default: "'PENDING'" },
          { name: "attempts", type: "int", default: 0 },
          { name: "lastError", type: "text", isNullable: true },
          { name: "createdAt", type: "datetime", default: "CURRENT_TIMESTAMP" },
          { name: "processedAt", type: "datetime", isNullable: true },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("outbox");
  }
}
