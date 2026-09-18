import { NextResponse } from "next/server";
import { bootApp } from "@/lib/boot";
import { ensureTodayBriefing } from "@/lib/briefing-service";

export const runtime = "nodejs";

export async function GET() {
  await bootApp();
  const briefing = await ensureTodayBriefing(true);
  return NextResponse.json(briefing);
}

export async function POST() {
  return GET();
}
