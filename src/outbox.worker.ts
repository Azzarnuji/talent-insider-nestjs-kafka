import {
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { Kafka, Producer } from "kafkajs";
import { CronJob } from "cron";
import { IOutboxRepository } from "./interfaces/outbox-repository.interface";
import { OutboxStatus } from "./entities/outbox.entity";
import { KAFKA_OUTBOX_OPTIONS, KafkaOutboxModuleOptions } from "./constants";

/**
 * Worker latar belakang (background worker) yang bertugas mengambil pesan
 * dari penyimpanan outbox dan mengirimkannya ke broker Kafka.
 *
 * Mendukung strategi penjadwalan berbasis Interval atau Cron.
 */
@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorker.name);
  private kafka: Kafka;
  private producer: Producer;
  private isProcessing = false;
  private intervalId: NodeJS.Timeout | null = null;
  private cronJob: CronJob | null = null;
  private cleanupIntervalId: NodeJS.Timeout | null = null;
  private cleanupCronJob: CronJob | null = null;

  constructor(
    @Inject(KAFKA_OUTBOX_OPTIONS)
    private readonly options: KafkaOutboxModuleOptions,
    @Inject(IOutboxRepository) private readonly repository: IOutboxRepository,
  ) {
    this.kafka = new Kafka(this.options.kafkaConfig);
    this.producer = this.kafka.producer();
  }

  async onModuleInit() {
    await this.producer.connect();
    this.logger.log(
      `Outbox Worker connected to Kafka (Mode: ${this.options.workerOptions.use})`,
    );

    // Main Outbox Relay Job
    if (this.options.workerOptions.use === "cron") {
      if (!this.options.workerOptions.cronExpression) {
        throw new Error('cronExpression is required when use is "cron"');
      }
      this.cronJob = new CronJob(
        this.options.workerOptions.cronExpression,
        () => this.processOutbox(),
      );
      this.cronJob.start();
      this.logger.log(
        `Outbox Worker scheduled with cron: ${this.options.workerOptions.cronExpression}`,
      );
    } else {
      const interval = this.options.workerOptions.interval || 5000;
      this.intervalId = setInterval(() => this.processOutbox(), interval);
      this.logger.log(`Outbox Worker scheduled with interval: ${interval}ms`);
    }

    // Optional Cleanup Job
    if (this.options.cleanupOptions?.enable) {
      const cleanup = this.options.cleanupOptions;
      if (cleanup.use === "cron") {
        if (!cleanup.cronExpression) {
          throw new Error(
            'cronExpression is required for cleanup when use is "cron"',
          );
        }
        this.cleanupCronJob = new CronJob(cleanup.cronExpression, () =>
          this.processCleanup(),
        );
        this.cleanupCronJob.start();
        this.logger.log(
          `Outbox Cleanup scheduled with cron: ${cleanup.cronExpression}`,
        );
      } else {
        const interval = cleanup.interval || 3600000; // Default 1 hour
        this.cleanupIntervalId = setInterval(
          () => this.processCleanup(),
          interval,
        );
        this.logger.log(
          `Outbox Cleanup scheduled with interval: ${interval}ms`,
        );
      }
    }
  }

  async onModuleDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.cronJob) this.cronJob.stop();
    if (this.cleanupIntervalId) clearInterval(this.cleanupIntervalId);
    if (this.cleanupCronJob) this.cleanupCronJob.stop();
    await this.producer.disconnect();
  }

  /**
   * Fungsi utama untuk memproses pengiriman pesan dari outbox ke Kafka.
   * Mengambil data dengan status PENDING/FAILED dan mengirimkannya secara batch.
   */
  private async processOutbox() {
    if (this.options.enableLog !== false) {
      this.logger.debug("Process Outbox triggered...");
    }
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const pending = await this.repository.findPending(
        this.options.workerOptions.batchSize || 10,
      );

      for (const entry of pending) {
        try {
          await this.producer.send({
            topic: entry.topic,
            messages: [
              { key: entry.key, value: JSON.stringify(entry.payload) },
            ],
          });

          await this.repository.updateStatus(entry.id, OutboxStatus.PROCESSED);
          if (this.options.enableLog !== false) {
            this.logger.debug(
              `Relayed message ${entry.id} to Kafka topic ${entry.topic}`,
            );
          }
        } catch (error: any) {
          this.logger.error(
            `Failed to relay message ${entry.id}: ${error.message}`,
          );
          await this.repository.updateStatus(
            entry.id,
            OutboxStatus.FAILED,
            error.message,
          ); // Changed "FAILED" to OutboxStatus.FAILED
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Fungsi untuk membersihkan data outbox yang sudah sukses terkirim (PROCESSED).
   * Menghapus data berdasarkan masa simpan (retentionDays) yang dikonfigurasi.
   */
  private async processCleanup() {
    const retentionDays = this.options.cleanupOptions?.retentionDays || 0;
    try {
      if (this.options.enableLog !== false) {
        this.logger.debug(
          `Starting outbox cleanup (retention: ${retentionDays} days)...`,
        );
      }
      await this.repository.deleteProcessed(retentionDays);
      if (this.options.enableLog !== false) {
        this.logger.debug("Outbox cleanup completed.");
      }
    } catch (error: any) {
      this.logger.error(`Failed to cleanup outbox: ${error.message}`);
    }
  }
}
