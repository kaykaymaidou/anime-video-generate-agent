import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CostTransaction } from "@/types";

interface CostState {
  budget: number;
  transactions: CostTransaction[];
  addTransaction: (description: string, cost: number) => void;
  totalCost: () => number;
}

export const useCostStore = create<CostState>()(
  persist(
    (set, get) => ({
      budget: 50,
      transactions: [],
      addTransaction: (description, cost) =>
        set((s) => ({
          transactions: [
            ...s.transactions,
            { id: crypto.randomUUID(), ts: Date.now(), description, cost }
          ].slice(-500)
        })),
      totalCost: () => get().transactions.reduce((acc, t) => acc + t.cost, 0)
    }),
    { name: "auto-drama-cost" }
  )
);

