import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

export type UsageLedgerEntry = {
  id: string;
  ts: number;
  taskId: string;
  shotId: string;
  cost: number;
  modelType: string;
  videoUrl?: string;
};

const MAX_ENTRIES = 2500;

@Injectable()
export class UsageLedgerService {
  private readonly entries: UsageLedgerEntry[] = [];

  recordShot(opts: {
    taskId: string;
    shotId: string;
    cost: number;
    modelType: string;
    videoUrl?: string;
  }): UsageLedgerEntry {
    const row: UsageLedgerEntry = {
      id: randomUUID(),
      ts: Date.now(),
      taskId: opts.taskId,
      shotId: opts.shotId,
      cost: Number.isFinite(opts.cost) ? opts.cost : 0,
      modelType: opts.modelType || "seedance1.5pro",
      ...(opts.videoUrl ? { videoUrl: opts.videoUrl } : {}),
    };
    this.entries.push(row);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }
    return row;
  }

  getSummary(): { totalCost: number; entryCount: number; lastEntryAt: number | null } {
    let total = 0;
    for (const e of this.entries) total += e.cost;
    const last = this.entries.length ? this.entries[this.entries.length - 1]!.ts : null;
    return { totalCost: total, entryCount: this.entries.length, lastEntryAt: last };
  }

  getLedger(limit: number): UsageLedgerEntry[] {
    const n = Math.min(Math.max(1, limit), 500);
    return this.entries.slice(-n).reverse();
  }
}
