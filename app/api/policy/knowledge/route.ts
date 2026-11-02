import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  createCozeDocument,
  isCozeKnowledgeConfigured,
  listCozeDocuments,
} from "@/lib/coze-knowledge";
import {
  extractPolicyText,
  guessFileType,
} from "@/lib/policy-file-text";
import {
  createPolicyDocument,
  listPolicyDocuments,
} from "@/lib/repos/policy";

export const runtime = "nodejs";
export const maxDuration = 120;

/** 列表：本地政策原文（含扣子 document_id） */
export async function GET(request: NextRequest) {
  try {
    const withCoze = request.nextUrl.searchParams.get("coze") === "1";
    const data = await listPolicyDocuments();
    let coze: unknown = undefined;
    if (withCoze && isCozeKnowledgeConfigured()) {
      try {
        coze = await listCozeDocuments();
      } catch (e) {
        coze = {
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }
    return NextResponse.json({
      data,
      cozeConfigured: isCozeKnowledgeConfigured(),
      coze,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "读取知识库失败" },
      { status: 500 }
    );
  }
}

/** 仅支持 multipart 上传 .docx → 本地 + 扣子知识库 */
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    if (!isCozeKnowledgeConfigured()) {
      return NextResponse.json(
        {
          error:
            "未配置 POLICY_DATASET_ID / API_TOKEN，无法写入扣子知识库（自定义变量勿用 COZE_ 前缀）",
        },
        { status: 400 }
      );
    }

    const ctype = request.headers.get("content-type") || "";
    if (!ctype.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "请上传 .docx 文件（multipart）" },
        { status: 400 }
      );
    }

    const form = await request.formData();
    const titleOverride = String(form.get("title") || "").trim();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请选择 .docx 文件" }, { status: 400 });
    }

    const fileType = guessFileType(file.name, file.type);
    if (fileType !== "docx" && !/\.docx$/i.test(file.name)) {
      return NextResponse.json({ error: "仅支持 .docx 文件" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (!bytes.length) {
      return NextResponse.json({ error: "文件为空" }, { status: 400 });
    }

    const title =
      titleOverride || file.name.replace(/\.docx$/i, "") || file.name;
    const content =
      (await extractPolicyText(bytes, "docx")) ||
      `（docx 文件 ${file.name}，已上传扣子知识库）`;
    const cozeName = file.name.replace(/[\\/:*?"<>|]/g, "_");

    const coze = await createCozeDocument({
      name: cozeName,
      fileType: "docx",
      bytes,
    });

    const doc = await createPolicyDocument({
      title,
      content,
      sourceFile: cozeName,
      cozeDocumentId: String(coze.document_id),
    });

    return NextResponse.json({
      data: doc,
      coze: {
        documentId: coze.document_id,
        name: coze.name,
        charCount: coze.char_count,
        sliceCount: coze.slice_count,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "上传失败" },
      { status: 500 }
    );
  }
}
