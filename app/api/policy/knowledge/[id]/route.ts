import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  deleteCozeDocuments,
  isCozeKnowledgeConfigured,
} from "@/lib/coze-knowledge";
import {
  deletePolicyDocument,
  getPolicyDocument,
} from "@/lib/repos/policy";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const doc = await getPolicyDocument(id);
    if (!doc) {
      return NextResponse.json({ error: "未找到文档" }, { status: 404 });
    }
    return NextResponse.json({ data: doc });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "读取失败" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const { id } = await ctx.params;
    const cur = await getPolicyDocument(id);
    if (!cur) {
      return NextResponse.json({ error: "未找到文档" }, { status: 404 });
    }

    if (cur.cozeDocumentId && isCozeKnowledgeConfigured()) {
      try {
        await deleteCozeDocuments([cur.cozeDocumentId]);
      } catch (e) {
        console.warn("coze delete failed", cur.cozeDocumentId, e);
      }
    }

    await deletePolicyDocument(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "删除失败" },
      { status: 500 }
    );
  }
}
