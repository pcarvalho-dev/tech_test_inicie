import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateScreenshots1775865914294 implements MigrationInterface {
    name = 'CreateScreenshots1775865914294'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "screenshots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "professorId" uuid NOT NULL, "alunoId" uuid NOT NULL, "filePath" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_97dd05f8da66717af0d97be00ff" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_screenshots_created" ON "screenshots" ("createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_screenshots_aluno" ON "screenshots" ("alunoId") `);
        await queryRunner.query(`CREATE INDEX "IDX_screenshots_professor" ON "screenshots" ("professorId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_screenshots_professor"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_screenshots_aluno"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_screenshots_created"`);
        await queryRunner.query(`DROP TABLE "screenshots"`);
    }

}
