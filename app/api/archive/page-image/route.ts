import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getPageFile } from "@/lib/repos/archive";
import { getObjectBytes, hasStorage, isS3Path } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const personCode = sp.get("personCode") || "";
    const serialNo = sp.get("serialNo") || "";
    const pageNo = Number(sp.get("page") || "1");
    if (!personCode || !serialNo || !pageNo) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const row = await getPageFile(personCode, serialNo, pageNo);
    if (!row) {
      return NextResponse.json({ error: "页不存在" }, { status: 404 });
    }

    let bytes: Buffer | null = null;

    // 对象存储 / 本地上传绝对路径
    if (row.file_path && isS3Path(row.file_path)) {
      if (!hasStorage()) {
        return NextResponse.json(
          { error: "文件在对象存储中，但当前环境未注入存储凭证" },
          { status: 503 }
        );
      }
      bytes = await getObjectBytes(row.file_path);
    } else if (row.file_path) {
      try {
        bytes = await getObjectBytes(row.file_path);
      } catch {
        /* 再尝试 public 种子路径 */
      }
    }
    if (!bytes) {
      // 兼容种子数据：public/archive
      const candidates: string[] = [];
      if (row.file_name?.startsWith("/archive/")) {
        candidates.push(path.join(process.cwd(), "public", row.file_name));
      } else if (row.file_name) {
        candidates.push(
          path.join(
            process.cwd(),
            "public",
            "archive",
            personCode,
            serialNo,
            row.file_name
          )
        );
      }
      for (const c of candidates) {
        try {
          bytes = await fs.readFile(c);
          break;
        } catch {
          /* try next */
        }
      }
    }

    if (!bytes) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "读取失败" },
      { status: 500 }
    );
  }
}
