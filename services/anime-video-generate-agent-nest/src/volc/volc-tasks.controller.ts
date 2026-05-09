import { Body, Controller, Delete, Get, HttpCode, Param, Post } from "@nestjs/common";

import { VolcArkService } from "./volc-ark.service";
import type { WorkerTaskInput } from "./seedance-body.builder";

/**
 * 与 Python FastAPI http_gateway 同契约：POST/GET/DELETE /api/v1/tasks
 */
@Controller("api/v1")
export class VolcTasksController {
  constructor(private readonly volc: VolcArkService) {}

  @Post("tasks")
  async create(@Body() body: WorkerTaskInput & Record<string, unknown>) {
    const ark_task_id = await this.volc.createFromWorkerPayload(body);
    return { ark_task_id };
  }

  @Get("tasks/:arkTaskId")
  async get(@Param("arkTaskId") arkTaskId: string) {
    return this.volc.getGenerationTask(arkTaskId);
  }

  @Delete("tasks/:arkTaskId")
  @HttpCode(200)
  async remove(@Param("arkTaskId") arkTaskId: string) {
    await this.volc.deleteGenerationTask(arkTaskId);
    return { ok: true, ark_task_id: arkTaskId };
  }
}
