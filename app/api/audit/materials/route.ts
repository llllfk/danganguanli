import { NextRequest, NextResponse } from "next/server";
import { repairPlaceholderTitles } from "@/lib/audit-vision";
import { getPersonMaterials, listPersons } from "@/lib/repos/audit";
import { listCategories } from "@/lib/repos/archive";

export async function GET(request: NextRequest) {
  try {
    const personCode = request.nextUrl.searchParams.get("personCode") || "";
    // 右侧出处已有真题名、左侧仍占位时，加载材料即回写件表
    if (personCode) {
      await repairPlaceholderTitles(personCode).catch(() => 0);
    }
    const [persons, categories] = await Promise.all([
      listPersons(),
      listCategories(),
    ]);
    const materials = personCode
      ? await getPersonMaterials(personCode)
      : [];
    return NextResponse.json({
      data: { persons, categories, materials, personCode },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "读取数据源失败" },
      { status: 500 }
    );
  }
}
