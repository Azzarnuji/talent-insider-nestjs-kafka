import { DataSource, EventSubscriber } from "typeorm";
import { AbstractOutboxSubscriber } from "./base-outbox.subscriber";
import { OutboxService } from "../outbox.service";
import { Injectable } from "@nestjs/common";

/**
 * Global Outbox Subscriber yang otomatis memantau seluruh entity dalam DataSource.
 * Developer cukup mendaftarkan subscriber ini di modul untuk mengaktifkan Change Data Capture (CDC)
 * pada semua tabel (kecuali entity yang dikecualikan di konfigurasi).
 */
@Injectable()
@EventSubscriber()
export class GlobalOutboxSubscriber extends AbstractOutboxSubscriber<any> {
  protected readonly isGlobal = true;

  constructor(
    protected readonly dataSource: DataSource,
    protected readonly outboxService: OutboxService,
  ) {
    super(dataSource, outboxService);
  }

  /**
   * Returning nothing in TypeORM subscriber can sometimes work as global,
   * but to be safe and compatible with most NestJS/TypeORM setups,
   * we can either return a common base or rely on the fact that without
   * a specific filter, it might capture all if registered correctly.
   *
   * In NestJS TypeORM, if we want a truly global one, we often don't override listenTo
   * or we return something broad.
   */
  listenTo() {
    return undefined;
  }
}
