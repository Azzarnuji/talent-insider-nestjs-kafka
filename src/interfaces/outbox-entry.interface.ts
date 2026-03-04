export interface OutboxEntry {
  id: string | number;
  topic: string;
  payload: any;
  key?: string;
  status: "PENDING" | "PROCESSED" | "FAILED";
  createdAt: string;
  processedAt?: string;
  attempts: number;
  lastError?: string;
}
