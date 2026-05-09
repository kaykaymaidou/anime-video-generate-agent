import { Controller, Get, Query } from "@nestjs/common";

import { UsageLedgerService } from "./usage-ledger.service";

@Controller("api/usage")
export class UsageController {
  constructor(private readonly usageLedger: UsageLedgerService) {}

  @Get("summary")
  summary() {
    return this.usageLedger.getSummary();
  }

  @Get("ledger")
  getLedger(@Query("limit") limit?: string) {
    const n = limit ? Number.parseInt(limit, 10) : 100;
    return { entries: this.usageLedger.getLedger(Number.isFinite(n) ? n : 100) };
  }
}
