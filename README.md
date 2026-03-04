# talent-insider-nestjs-kafka

[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Kafka](https://img.shields.io/badge/Kafka-231F20?style=for-the-badge&logo=apache-kafka&logoColor=white)](https://kafka.apache.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

**talent-insider-nestjs-kafka** adalah library NestJS untuk mengimplementasikan **Outbox Pattern** dengan Kafka secara handal (reliable). Library ini menjamin pesan tetap terkirim ke Kafka meskipun broker sedang down, dengan cara menyimpannya di penyimpanan lokal (Database atau File System) terlebih dahulu sebagai bagian dari transaksi database utama.

---

## 🌟 Fitur Utama

- ✅ **Reliable Message Delivery**: Menggunakan Outbox Pattern untuk menjamin *at-least-once delivery*.
- 🔄 **Automatic CDC (Change Data Capture)**: Integrasi TypeORM Subscriber untuk mendeteksi perubahan data (`created`, `updated`, `deleted`) secara otomatis.
- 🌍 **Global Subscriber**: Fitur "Catch-All" untuk memantau semua entity hanya dengan satu baris kode.
- 🛡️ **Recursion Guard**: Proteksi bawaan terhadap infinite loop saat data outbox ditulis kembali ke database.
- 🧹 **Auto Cleanup Job**: Pembersihan otomatis data outbox yang sudah sukses terkirim (PROCESSED).
- 🛠️ **CLI Migration Tool**: Memudahkan setup schema database untuk UUID maupun Auto-Increment.
- 📖 **Indonesian JSDoc**: Codebase yang didokumentasikan lengkap dalam Bahasa Indonesia untuk kenyamanan developer lokal.

---

## 📦 Instalasi

```bash
# Via git
npm install https://github.com/azzarnuji/talent-insider-nestjs-kafka

# Via local tarball
npm install ./talent-insider-nestjs-kafka-1.0.0.tgz
```

---

## 🚀 Persiapan Database (Migrations)

Gunakan CLI tool bawaan untuk menyalin file migrasi yang sesuai dengan tipe ID database Anda ke folder project:

```bash
# Jika menggunakan UUID sebagai primary key
npx talent-insider-nestjs-kafka migrations uuid

# Jika menggunakan Auto-Increment (BigInt)
npx talent-insider-nestjs-kafka migrations increment
```

---

## 🛠️ Konfigurasi Cepat

Daftarkan modul di `AppModule` Anda. Berikut adalah contoh konfigurasi level produksi:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { 
  KafkaOutboxModule, 
  IOutboxRepository, 
  TypeORMOutboxRepository, 
  OutboxEntity,
  KafkaOutboxModuleOptions
} from 'talent-insider-nestjs-kafka';

const outboxOptions: KafkaOutboxModuleOptions = {
  kafkaConfig: {
    brokers: ['localhost:9092'],
    clientId: 'my-awesome-service',
  },
  topic: 'app.events',
  appType: 'user-service', // Nama aplikasi/service (Mandatory)
  idType: 'uuid', // Wajib diisi: 'uuid' atau 'increment'
  enableLog: true,
  repository: {
    provide: IOutboxRepository,
    useFactory: (dataSource: DataSource) => {
      const repo = dataSource.getRepository(OutboxEntity);
      return new TypeORMOutboxRepository(repo as any, outboxOptions);
    },
    inject: [DataSource],
  },
  workerOptions: {
    use: 'cron',
    cronExpression: '*/5 * * * * *', // Jalan setiap 5 detik
    batchSize: 20,
  },
  cleanupOptions: {
    enable: true,
    use: 'cron',
    cronExpression: '0 0 * * *', // Setiap tengah malam
    retentionDays: 7,            // Simpan log sukses selama 7 hari
  },
};

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      // ... TypeORM config ...
      entities: [OutboxEntity], // Jangan lupa daftarkan entity library
    }),
    KafkaOutboxModule.register(outboxOptions),
  ],
})
export class AppModule {}
```

---

## 📡 Penggunaan Otomatis (CDC)

### 1. Global Subscriber (Rekomendasi)
Cukup daftarkan `GlobalOutboxSubscriber` untuk memantau **seluruh** entity secara otomatis.

```typescript
import { GlobalOutboxSubscriber } from 'talent-insider-nestjs-kafka';

@Module({
  providers: [GlobalOutboxSubscriber],
})
export class AppModule {}
```

> [!NOTE]
> **Smart Precedence**: Anda tidak perlu khawatir terjadi duplikasi pesan. Jika Anda mendefinisikan `CustomSubscriber` khusus untuk suatu entity, `GlobalOutboxSubscriber` akan secara otomatis mendeteksi hal tersebut dan "mengalah" (skip processing) untuk entity tersebut.

### 2. Mengecualikan Entity
Jika Anda menggunakan `GlobalOutboxSubscriber` tapi ingin mengabaikan entity tertentu (seperti log atau audit):

```typescript
KafkaOutboxModule.register({
  // ...
  excludedEntities: [LogEntity, AuditEntity], // Masukkan Class Entity di sini
})
```

### 3. Custom Subscriber
Untuk kontrol lebih granular, buat subscriber khusus untuk entity tertentu:

```typescript
@EventSubscriber()
export class OrderSubscriber extends AbstractOutboxSubscriber<OrderEntity> {
  listenTo() { return OrderEntity; }

  // Opsional: Custom tipe event
  getEventType(name, entity, action) {
    return `online_store.order.${action}`;
  }

  // Opsional: Transformasi data
  preparePayload(entity, before) {
    return {
      orderId: entity.id,
      status: entity.status,
      isNew: !before
    };
  }

  // Opsional: Tambahkan metadata (IP, Actor, dll)
  getAdditionalMetadata(entity) {
    return {
      actor_id: 'internal-system',
      source: 'web-v1'
    };
  }
}
```

### 4. Custom Metadata Entitas (`@KafkaEventMetadata`)
Gunakan decorator ini jika entitas memiliki logika *affected_type* atau *affected_id* yang berbeda dari default (id sendiri).

```typescript
import { KafkaEventMetadata } from 'talent-insider-nestjs-kafka';

@Entity()
@KafkaEventMetadata({ 
  affectedType: 'user',      // Entitas utama yang terdampak
  affectedIdField: 'user_id' // Field yang menyimpan ID user tersebut
})
export class CertificateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  user_id: string; // ID ini yang akan jadi 'affected_id' di Kafka
}
```

---

## 📝 Penggunaan Manual

Anda juga bisa mengirim pesan ke outbox secara manual dari `Service` Anda:

```typescript
@Injectable()
export class ProductService {
  constructor(private readonly outbox: OutboxService) {}

  async updateStock(productId: string, stock: number) {
    // ... logic update ...
    await this.outbox.emit('stock.updated', { productId, stock }, productId);
  }
}
```

---

## 📊 Skema Event (JSON)

Setiap pesan yang dikirim ke Kafka akan mengikuti struktur standar berikut:

```json
{
  "schema_version": 1,
  "event_id": "8ec5bc6b-e3f9-4672-911e-45037d77b8f0",
  "topic": "app.events",
  "event_type": "certificates.created",
  "event_time": "2026-03-04T06:59:49.134Z",
  "app_type": "users-service",
  "affected_type": "user",
  "affected_id": "61e1711e-0d64-4790-abdb-80d27f2324e2",
  "metadata": {
    "actor_id": "system",
    "ip": "127.0.0.1"
  },
  "event_data": {
    "before": {},
    "after": { "id": "...", "title": "..." }
  }
}
```
```

---

## ⚙️ Referensi Konfigurasi

### `KafkaOutboxModuleOptions`
| Field | Tipe | Deskripsi | Default |
| :--- | :--- | :--- | :--- |
| `kafkaConfig` | `KafkaConfig` | Konfigurasi bawaan KafkaJS | **Required** |
| `topic` | `string` | Topic default untuk seluruh event | **Required** |
| `appType` | `string` | Nama aplikasi/service (id source) | **Required** |
| `idType` | `string` | Tipe data Primary Key (`uuid` / `increment`) | **Required** |
| `schemaVersion` | `number` | Versi skema JSON event | `1` |
| `repository` | `Provider` | Repository provider (TypeORM/FileSystem) | **Required** |
| `workerOptions` | `object` | Penjadwalan pengiriman Kafka | **Required** |
| `enableLog` | `boolean` | Aktifkan log debug di console | `true` |
| `excludedEntities` | `Class[]` | Daftar entity yang diabaikan global subscriber | `[]` |
| `cleanupOptions` | `object` | Konfigurasi pembersihan data lama | `{ enable: false }` |

### `Worker Options`
| Field | Tipe | Deskripsi | Default |
| :--- | :--- | :--- | :--- |
| `use` | `string` | Strategi polling (`interval` / `cron`) | `interval` |
| `interval` | `number` | Jeda polling dalam milidetik | `5000` |
| `cronExpression`| `string` | Ekspresi cron (jika `use: cron`) | - |
| `batchSize` | `number` | Jumlah pesan per batch pengiriman | `10` |

---

## 👤 Author
**Azzarnuji**

## 📄 Lisensi
MIT License - lihat file [LICENSE](LICENSE) untuk detailnya.
