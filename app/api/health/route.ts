import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { hasStorage } from "@/lib/storage";

export async function GET() {
  return NextResponse.json({
    data: {
      status: "ok",
      database: hasDatabase(),
      storage: hasStorage(),
      time: new Date().toISOString(),
    },
  });
}
