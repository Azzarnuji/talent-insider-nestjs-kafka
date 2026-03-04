import { Repository, MoreThan, In } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { Inject } from "@nestjs/common";
import { KAFKA_OUTBOX_OPTIONS, KafkaOutboxModuleOptions } from "../constants";
import { IOutboxRepository } from "../interfaces/outbox-repository.interface";
import { OutboxEntry } from "../interfaces/outbox-entry.interface";
import { OutboxEntity, OutboxStatus } from "../entities/outbox.entity";

export class TypeORMOutboxRepository implements IOutboxRepository {
  constructor(
    private readonly repo: Repository<any>,
    @Inject(KAFKA_OUTBOX_OPTIONS)
    private readonly options: KafkaOutboxModuleOptions,
  ) {}

  async save(
    entry: Omit<OutboxEntry, "id" | "status" | "createdAt" | "attempts">,
  ): Promise<OutboxEntry> {
    const data: any = {
      topic: entry.topic,
      payload: entry.payload,
      key: entry.key,
      status: OutboxStatus.PENDING,
      attempts: 0,
    };

    if (this.options.idType !== "increment") {
      data.id = uuidv4();
    }

    const outbox = this.repo.create(data);
    return (await this.repo.save(outbox)) as any;
  }

  async findPending(limit: number): Promise<OutboxEntry[]> {
    const entries = await this.repo.find({
      where: [
        { status: OutboxStatus.PENDING },
        { status: OutboxStatus.FAILED, attempts: MoreThan(0) }, // Simple retry logic check
      ],
      take: limit,
      order: { createdAt: "ASC" },
    });
    return entries as any;
  }

  async updateStatus(
    id: string | number,
    status: OutboxStatus,
    error?: string,
  ): Promise<void> {
    const updateData: any = {
      status,
      processedAt: status === OutboxStatus.PROCESSED ? new Date() : undefined,
    };

    if (error) {
      updateData.lastError = error;
      await this.repo.increment({ id }, "attempts", 1);
    }

    await this.repo.update(id, updateData);
  }

  async deleteProcessed(olderThanDays: number): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    await this.repo
      .createQueryBuilder()
      .delete()
      .where("status = :status", { status: OutboxStatus.PROCESSED })
      .andWhere("processedAt <= :cutoff", { cutoff })
      .execute();
  }

  private mapToEntry(entity: OutboxEntity): OutboxEntry {
    return {
      id: entity.id,
      topic: entity.topic,
      payload: entity.payload,
      key: entity.key,
      status: entity.status,
      createdAt: entity.createdAt.toISOString(),
      processedAt: entity.processedAt?.toISOString(),
      attempts: entity.attempts,
      lastError: entity.lastError,
    };
  }
}
