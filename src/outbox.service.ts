import { Injectable, Inject, Logger } from "@nestjs/common";
import { IOutboxRepository } from "./interfaces/outbox-repository.interface";
import { KAFKA_OUTBOX_OPTIONS, KafkaOutboxModuleOptions } from "./constants";

/**
 * Layanan untuk menyimpan pesan ke dalam sistem Outbox.
 * Pesan yang disimpan di sini nantinya akan dikirim ke Kafka oleh OutboxWorker.
 */
@Injectable()
export class OutboxService {
  constructor(
    @Inject(KAFKA_OUTBOX_OPTIONS)
    public readonly options: KafkaOutboxModuleOptions,
    @Inject(IOutboxRepository)
    private readonly repository: IOutboxRepository,
  ) {}

  /**
   * Menyimpan pesan ke tabel outbox.
   *
   * @param topic Topic Kafka tujuan (opsional jika sudah diset di modul)
   * @param payload Data yang akan dikirim (JSON)
   * @param key Key Kafka untuk partisi (opsional)
   * @returns Data outbox yang berhasil disimpan
   */
  async emit(topic: string | undefined, payload: any, key?: string) {
    const finalTopic = topic || this.options.topic;
    if (!finalTopic) {
      throw new Error(
        "Topic must be provided either in emit() or in KafkaOutboxModule options",
      );
    }

    const entryToSave = {
      topic: finalTopic,
      payload,
      key,
    };
    const savedEntry = await this.repository.save(entryToSave);
    if (this.options.enableLog !== false) {
      Logger.debug(
        `[OutboxService] Entry created: ${savedEntry.id} (status: PENDING)`,
        "OutboxService",
      );
    }
    return savedEntry;
  }
}
