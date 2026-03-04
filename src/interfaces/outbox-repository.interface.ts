import { OutboxEntry } from "./outbox-entry.interface";

/**
 * Interface kontrak untuk penyimpanan data Outbox.
 * Harus diimplementasikan jika ingin menambah dukungan database baru (misal: MongoDB, Redis).
 */
export interface IOutboxRepository {
  /**
   * Menyimpan entri baru ke penyimpanan.
   * @param entry Data outbox tanpa field otomatis (id, status, dll)
   */
  save(
    entry: Omit<OutboxEntry, "id" | "status" | "createdAt" | "attempts">,
  ): Promise<OutboxEntry>;

  /**
   * Mencari pesan yang statusnya masih PENDING atau FAILED untuk dikirim ulang.
   * @param limit Batasan jumlah data yang diambil (batch size)
   */
  findPending(limit: number): Promise<OutboxEntry[]>;

  /**
   * Memperbarui status pengiriman pesan.
   * @param id ID entri outbox
   * @param status Status baru (PROCESSED, FAILED, dsb)
   * @param error Pesan error jika pengiriman gagal
   */
  updateStatus(
    id: string | number,
    status: OutboxEntry["status"],
    error?: string,
  ): Promise<void>;

  /**
   * Menghapus data yang sudah sukses dikirim berdasarkan masa simpan.
   * @param olderThanDays Batas umur data dalam hari (0 = hapus semua yang sukses)
   */
  deleteProcessed(olderThanDays: number): Promise<void>;
}

export const IOutboxRepository = Symbol("IOutboxRepository");
