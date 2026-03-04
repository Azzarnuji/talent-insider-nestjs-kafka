import { DynamicModule, Module, Global, Provider } from "@nestjs/common";
import { Kafka, KafkaConfig } from "kafkajs";
import { OutboxService } from "./outbox.service";
import { OutboxWorker } from "./outbox.worker";
import { IOutboxRepository } from "./interfaces/outbox-repository.interface";

import { KafkaOutboxModuleOptions, KAFKA_OUTBOX_OPTIONS } from "./constants";

/**
 * Modul utama untuk implementasi Kafka Outbox Pattern di NestJS.
 * Modul ini bersifat Global dan menangani registrasi layanan, worker, dan repository.
 */
@Global()
@Module({})
export class KafkaOutboxModule {
  /**
   * Mendaftarkan modul Kafka Outbox secara dinamis.
   *
   * @param options Opsi konfigurasi modul (kafkaConfig, topic, repository, dll)
   * @returns DynamicModule NestJS
   */
  static register(options: KafkaOutboxModuleOptions): DynamicModule {
    if (!options.topic) {
      throw new Error(KafkaOutboxModule.name + " topic is required");
    }
    const optionsProvider: Provider = {
      provide: KAFKA_OUTBOX_OPTIONS,
      useValue: options,
    };

    const kafkaProvider: Provider = {
      provide: "KAFKA_INSTANCE",
      useValue: new Kafka(options.kafkaConfig),
    };

    const repositoryProvider: Provider = options.repository;

    return {
      module: KafkaOutboxModule,
      providers: [
        optionsProvider,
        kafkaProvider,
        repositoryProvider,
        OutboxService,
        OutboxWorker,
      ],
      exports: [OutboxService, KAFKA_OUTBOX_OPTIONS],
    };
  }
}
