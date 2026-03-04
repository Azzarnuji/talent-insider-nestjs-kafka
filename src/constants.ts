import { Provider } from "@nestjs/common";
import { EntityClassOrSchema } from "@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type";
import { KafkaConfig } from "kafkajs";

/**
 * Opsi konfigurasi untuk KafkaOutboxModule.
 * Digunakan saat mendaftarkan modul di AppModule.
 */
export interface KafkaOutboxModuleOptions {
  /** Konfigurasi koneksi KafkaJS (brokers, clientId, dll) */
  kafkaConfig: KafkaConfig;

  /** Topic default yang digunakan untuk mengirim pesan Kafka */
  topic: string;

  /** Provider repository untuk penyimpanan outbox (FileSystem atau TypeORM) */
  repository: Provider;

  /** Mengaktifkan atau menonaktifkan log debug dari library (default: true) */
  enableLog?: boolean;

  /** Tipe ID yang digunakan untuk tabel outbox ('uuid' atau 'increment') */
  idType: "uuid" | "increment";

  /** List Class Entity yang ingin dikecualikan dari pemantauan GlobalOutboxSubscriber */
  excludedEntities?: EntityClassOrSchema[];

  /** Konfigurasi untuk worker yang mengirim pesan ke Kafka */
  workerOptions: {
    /** Strategi polling: 'interval' (berdasarkan waktu) atau 'cron' (berdasarkan jadwal) */
    use: "interval" | "cron";
    /** Waktu tunggu antar polling dalam milidetik (jika menggunakan 'interval') */
    interval?: number;
    /** Ekspresi cron (jika menggunakan 'cron') */
    cronExpression?: string;
    /** Jumlah pesan yang diproses dalam satu kali polling (default: 10) */
    batchSize?: number;
  };

  /** Konfigurasi untuk pembersihan data outbox yang sudah sukses terkirim */
  cleanupOptions?: {
    /** Mengaktifkan fitur pembersihan otomatis */
    enable?: boolean;
    /** Strategi pembersihan: 'interval' atau 'cron' */
    use: "interval" | "cron";
    /** Waktu tunggu antar pembersihan dalam milidetik */
    interval?: number;
    /** Ekspresi cron untuk jadwal pembersihan */
    cronExpression?: string;
    /** Berapa hari data PROCESSED disimpan sebelum dihapus (0 = langsung hapus) */
    retentionDays?: number;
  };
}

/** Injection token untuk opsi KafkaOutboxModule */
export const KAFKA_OUTBOX_OPTIONS = "KAFKA_OUTBOX_OPTIONS";
