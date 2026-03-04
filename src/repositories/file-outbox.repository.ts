import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { IOutboxRepository } from "../interfaces/outbox-repository.interface";
import { OutboxEntry } from "../interfaces/outbox-entry.interface";

export class FileSystemOutboxRepository implements IOutboxRepository {
  private readonly filePath: string;

  constructor(storageDir: string = "./outbox-storage") {
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    this.filePath = path.join(storageDir, "outbox.json");
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify([]));
    }
  }

  private readItems(): OutboxEntry[] {
    const content = fs.readFileSync(this.filePath, "utf-8");
    return JSON.parse(content);
  }

  private writeItems(items: OutboxEntry[]): void {
    fs.writeFileSync(this.filePath, JSON.stringify(items, null, 2));
  }

  async save(
    entry: Omit<OutboxEntry, "id" | "status" | "createdAt" | "attempts">,
  ): Promise<OutboxEntry> {
    const items = this.readItems();
    const newEntry: OutboxEntry = {
      ...entry,
      id: uuidv4(),
      status: "PENDING",
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    items.push(newEntry);
    this.writeItems(items);
    return newEntry;
  }

  async findPending(limit: number): Promise<OutboxEntry[]> {
    const items = this.readItems();
    return items
      .filter((i) => i.status === "PENDING" || i.status === "FAILED")
      .slice(0, limit);
  }

  async updateStatus(
    id: string | number,
    status: OutboxEntry["status"],
    error?: string,
  ): Promise<void> {
    const items = this.readItems();
    const index = items.findIndex((i) => i.id === id);
    if (index !== -1) {
      items[index].status = status;
      if (status === "PROCESSED") {
        items[index].processedAt = new Date().toISOString();
      }
      if (error) {
        items[index].lastError = error;
        items[index].attempts += 1;
      }
      this.writeItems(items);
    }
  }

  async deleteProcessed(olderThanDays: number): Promise<void> {
    const items = this.readItems();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const filtered = items.filter((i) => {
      if (i.status !== "PROCESSED" || !i.processedAt) return true;
      return new Date(i.processedAt).getTime() > cutoff.getTime();
    });

    this.writeItems(filtered);
  }
}
