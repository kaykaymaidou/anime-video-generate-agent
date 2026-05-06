import { NextResponse } from "next/server";

import { getProgressEmitter } from "@/lib/io-registry";
import { handleTaskSubmit } from "@/lib/submit-tasks";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const io = getProgressEmitter();

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ message: "invalid JSON" }, { status: 400 });
  }

  return handleTaskSubmit(json, { io });
}
