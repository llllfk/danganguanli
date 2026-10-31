import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function policyDir() {
  const candidates = [
    // npm run dev 在「代码」目录
    path.resolve(process.cwd(), "..", "需求", "附件1-8", "附件1-档案政策知识库"),
    // cwd 已是项目根
    path.resolve(process.cwd(), "需求", "附件1-8", "附件1-档案政策知识库"),
    // 相对本文件（app/api/policy/file → 上溯到项目根）
    path.resolve(
      process.cwd(),
      "需求",
      "附件1-8",
      "附件1-档案政策知识库"
    ),
  ];
  return candidates.find((d) => fs.existsSync(d)) || candidates[0];
}

/** 下载附件1 原始 docx（仅允许知识库目录内文件） */
export async function GET(request: NextRequest) {
  try {
    const name = (request.nextUrl.searchParams.get("name") || "").trim();
    if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) {
      return NextResponse.json({ error: "非法文件名" }, { status: 400 });
    }
    if (!name.toLowerCase().endsWith(".docx")) {
      return NextResponse.json({ error: "仅支持 docx" }, { status: 400 });
    }

    const dir = policyDir();
    const full = path.join(dir, name);
    if (!full.startsWith(dir) || !fs.existsSync(full)) {
      // 再按标题模糊找
      const files = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".docx"))
        : [];
      const stem = name.replace(/\.docx$/i, "");
      const hit =
        files.find((f) => f === name) ||
        files.find((f) => f.includes(stem) || stem.includes(f.replace(/\.docx$/i, "")));
      if (!hit) {
        return NextResponse.json(
          { error: `未找到文件：${name}` },
          { status: 404 }
        );
      }
      const buf = fs.readFileSync(path.join(dir, hit));
      return new NextResponse(buf, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(hit)}`,
        },
      });
    }

    const buf = fs.readFileSync(full);
    return new NextResponse(buf, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "下载失败" },
      { status: 500 }
    );
  }
}
