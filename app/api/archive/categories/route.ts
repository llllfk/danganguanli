import { NextResponse } from "next/server";
import { listCategories } from "@/lib/repos/archive";

export async function GET() {
  try {
    const data = await listCategories();
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "读取类目失败" },
      { status: 500 }
    );
  }
}
