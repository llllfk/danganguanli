import { NextResponse } from "next/server";
import { listPolicyHistory } from "@/lib/store";

export async function GET() {
  return NextResponse.json({ data: listPolicyHistory() });
}
