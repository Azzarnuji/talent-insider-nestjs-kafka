import {
  EntitySubscriberInterface,
  InsertEvent,
  UpdateEvent,
  DataSource,
  EventSubscriber,
} from "typeorm";
import { OutboxService } from "../outbox.service";
import { Logger } from "@nestjs/common";
import {
  KAFKA_EVENT_METADATA_KEY,
  KafkaEventMetadataOptions,
} from "../constants";

/**
 * Kelas abstrak dasar untuk Entity Subscriber yang terintegrasi dengan Kafka Outbox.
 * Menggunakan decorator @EventSubscriber() dari TypeORM untuk memantau siklus hidup entity.
 *
 * Developer harus meng-override listenTo() untuk menentukan entity mana yang dipantau.
 */
@EventSubscriber()
export abstract class AbstractOutboxSubscriber<
  T,
> implements EntitySubscriberInterface<T> {
  protected readonly logger = new Logger(AbstractOutboxSubscriber.name);

  constructor(
    protected readonly dataSource: DataSource,
    protected readonly outboxService: OutboxService,
  ) {
    // Manually register if not handled by NestJS TypeOrmModule automatically
    if (this.dataSource && this.dataSource.subscribers) {
      const isAlreadyRegistered = this.dataSource.subscribers.some(
        (s) => s.constructor === this.constructor,
      );
      if (!isAlreadyRegistered) {
        this.dataSource.subscribers.push(this);
      }
    }
  }

  /**
   * Menentukan entity yang akan dipantau oleh subscriber ini.
   * @example return OrderEntity;
   */
  abstract listenTo(): any;

  /**
   * Mendefinisikan tipe event yang akan dikirim ke Kafka.
   * Default implementasi mengembalikan format 'nama_entity.aksi' (misal: user.created).
   *
   * @param entityName Nama entity yang terdeteksi
   * @param entity Data entity saat ini
   * @param action Aksi yang dilakukan (created, updated, deleted)
   */
  getEventType(
    entityName: string,
    entity: T,
    action: "created" | "updated" | "deleted",
  ): string {
    return `${entityName.toLowerCase()}.${action}`;
  }

  /**
   * Menentukan key untuk pesan Kafka (opsional).
   * Berguna untuk menjamin urutan pesan (Order Guarantee) di Kafka Partition.
   */
  getKey(entity: T): string | undefined {
    return (entity as any).id?.toString() || (entity as any).uuid?.toString();
  }

  /**
   * Menambahkan metadata tambahan ke dalam event (misal: actor_id, ip).
   * Developer bisa meng-override ini untuk mengambil data dari context (misal: nestjs-cls).
   */
  getAdditionalMetadata(entity: T): any {
    return {};
  }

  /**
   * Mentransformasi data entity sebelum disimpan ke Outbox.
   * Memberikan akses penuh terhadap state sebelum (before) dan sesudah (after).
   *
   * @param entity Data entity saat ini
   * @param before Data entity sebelum perubahan (null jika insert)
   */
  preparePayload(entity: T, before?: T | null): any {
    return {
      before: before || {},
      after: entity || {},
    };
  }

  async afterInsert(event: InsertEvent<T>) {
    await this.handleEvent(event, null, event.entity, "created");
  }

  async afterUpdate(event: UpdateEvent<T>) {
    if (event.entity) {
      await this.handleEvent(
        event,
        event.databaseEntity,
        event.entity as T,
        "updated",
      );
    }
  }

  async afterRemove(event: any) {
    if (event.entity) {
      await this.handleEvent(event, event.entity, null, "deleted");
    }
  }

  async afterSoftRemove(event: any) {
    if (event.entity) {
      await this.handleEvent(
        event,
        event.databaseEntity,
        event.entity,
        "deleted",
      );
    }
  }

  private async handleEvent(
    event: any,
    before: T | null,
    after: T | null,
    action: "created" | "updated" | "deleted",
  ) {
    const entityName = event.metadata.name;
    const targetEntity = (after || before) as any;

    // Recursion Guard: Ignore outbox transitions to avoid infinite loops
    if (entityName === "OutboxEntity" || entityName === "OutboxIntEntity") {
      return;
    }

    // Dynamic Guard: Ignore entities explicitly excluded in configuration
    const options = (this.outboxService as any).options;
    const isExcluded = options?.excludedEntities?.some((excluded: any) => {
      if (typeof excluded === "string") return excluded === entityName;
      if (typeof excluded === "function") return excluded.name === entityName;
      return false;
    });

    if (isExcluded) {
      return;
    }

    if (!targetEntity) return;

    const topic = options?.topic;
    if (!topic) {
      this.logger.error(
        "Kafka topic is not defined in KafkaOutboxModule options",
      );
      return;
    }

    // --- Start Building Advanced Event Schema ---
    const schema_version = options?.schemaVersion || 1;
    const eventType = this.getEventType(entityName, targetEntity as T, action);
    const key = this.getKey(targetEntity as T);
    const eventData = this.preparePayload(after as T, before);
    const metadata = this.getAdditionalMetadata(targetEntity as T);

    // Automatic detection for affected_type & affected_id
    let affected_type = entityName.toLowerCase();
    let affected_id = targetEntity.id || targetEntity.uuid || targetEntity.guid;

    // Check for @KafkaEventMetadata decorator
    const decoratorMetadata: KafkaEventMetadataOptions = Reflect.getMetadata(
      KAFKA_EVENT_METADATA_KEY,
      event.metadata.target,
    );

    if (decoratorMetadata) {
      if (decoratorMetadata.affectedType) {
        affected_type = decoratorMetadata.affectedType;
      }
      if (decoratorMetadata.affectedIdField) {
        affected_id = targetEntity[decoratorMetadata.affectedIdField];
      }
    }

    const finalPayload = {
      schema_version,
      topic,
      event_type: eventType,
      event_time: new Date().toISOString(),
      app_type: options?.appType,
      affected_type,
      affected_id,
      metadata,
      event_data: eventData,
    };

    if (this.outboxService["options"]?.enableLog !== false) {
      this.logger.debug(
        `Relaying entity change to outbox: topic=${topic}, eventType=${eventType}, affected=${affected_type}:${affected_id}`,
      );
    }
    await this.outboxService.emit(topic, finalPayload, key);
  }
}
