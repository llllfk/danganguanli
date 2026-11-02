import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { getSessionUser } from "@/lib/auth";
import {
  groupOrderedPages,
  parseOrderedPagePath,
} from "@/lib/audit-parse";
import {
  replaceOrderedPieces,
  type OrderedUploadPiece,
} from "@/lib/repos/audit-upload";
import { getPersonMaterials } from "@/lib/repos/audit";
import { listCategories } from "@/lib/repos/archive";
import {
  auditObjectKey,
  hasStorage,
  putObject,
  resolveWriteBackend,
} from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

type RawFile = { relativePath: string; bytes: Buffer };

async function collectFromZip(buf: Buffer): Promise<RawFile[]> {
  const zip = await JSZip.loadAsync(buf);
  const out: RawFile[] = [];
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (entry.dir) continue;
    if (!/\.jpe?g$/i.test(name)) continue;
    out.push({
      relativePath: name,
      bytes: Buffer.from(await entry.async("uint8array")),
    });
  }
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const storageBackend = resolveWriteBackend();
    const form = await request.formData();
    const clearFirst = String(form.get("clearFirst") || "1") !== "0";
    const sortStart = parseInt(String(form.get("sortStart") || "0"), 10) || 0;
    let rawFiles: RawFile[] = [];

    const filesOnly = form
      .getAll("files")
      .filter((v): v is File => v instanceof File);
    const pathsOnly = form.getAll("paths").map(String);

    if (filesOnly.length) {
      for (let i = 0; i < filesOnly.length; i++) {
        const f = filesOnly[i];
        const buf = Buffer.from(await f.arrayBuffer());
        const rel = pathsOnly[i] || f.name;
        if (/\.zip$/i.test(f.name) || /\.zip$/i.test(rel)) {
          rawFiles.push(...(await collectFromZip(buf)));
        } else if (/\.jpe?g$/i.test(f.name) || /\.jpe?g$/i.test(rel)) {
          rawFiles.push({ relativePath: rel, bytes: buf });
        }
      }
    } else {
      for (const value of form.values()) {
        if (!(value instanceof File)) continue;
        const buf = Buffer.from(await value.arrayBuffer());
        if (/\.zip$/i.test(value.name)) {
          rawFiles.push(...(await collectFromZip(buf)));
        } else if (/\.jpe?g$/i.test(value.name)) {
          rawFiles.push({ relativePath: value.name, bytes: buf });
        }
      }
    }

    if (!rawFiles.length) {
      return NextResponse.json(
        { error: "未找到 JPG，请上传有序档案页或 ZIP" },
        { status: 400 }
      );
    }

    const bytesByPath = new Map<string, Buffer>();
    const parsed = [];
    for (const rf of rawFiles) {
      const meta = parseOrderedPagePath(rf.relativePath);
      if (!meta) continue;
      bytesByPath.set(meta.relativePath, rf.bytes);
      parsed.push(meta);
    }

    if (!parsed.length) {
      return NextResponse.json(
        {
          error:
            "无法解析文件名。请使用 人员代码-分类号-件号-页号.jpg（如 00001-0401-001-001.jpg）",
        },
        { status: 400 }
      );
    }

    const personCodes = [...new Set(parsed.map((p) => p.personCode))];
    if (personCodes.length > 1) {
      return NextResponse.json(
        {
          error: `一次仅支持同一人档案，检测到：${personCodes.join("、")}`,
        },
        { status: 400 }
      );
    }
    const personCode = personCodes[0];
    const groups = groupOrderedPages(parsed);

    const inputs: OrderedUploadPiece[] = [];
    for (const g of groups) {
      const pages = [];
      for (const page of g.pages) {
        const bytes = bytesByPath.get(page.relativePath);
        if (!bytes) continue;
        const key = auditObjectKey(personCode, g.formalNo, page.fileName);
        const filePath = await putObject({
          key,
          body: bytes,
          contentType: "image/jpeg",
        });
        pages.push({
          pageNo: page.pageNo,
          fileName: page.fileName,
          filePath,
        });
      }
      if (!pages.length) continue;
      inputs.push({
        personCode,
        categoryCode: g.categoryCode,
        formalNo: g.formalNo,
        pages,
      });
    }

    if (!inputs.length) {
      return NextResponse.json({ error: "上传写入失败" }, { status: 500 });
    }

    await replaceOrderedPieces(personCode, inputs, {
      clearFirst: clearFirst,
      sortStart,
    });
    const [materials, categories] = await Promise.all([
      getPersonMaterials(personCode),
      listCategories(),
    ]);

    return NextResponse.json({
      data: {
        personCode,
        pieceCount: materials.length,
        batchPieces: inputs.length,
        pageCount: materials.reduce((s, m) => s + (m.pageCount || 0), 0),
        batchPages: inputs.reduce((s, p) => s + p.pages.length, 0),
        sortEnd: sortStart + inputs.length,
        storage: storageBackend,
        hasStorage: hasStorage(),
        materials,
        categories,
      },
    });
  } catch (e) {
    console.error("audit upload failed", e);
    const msg = e instanceof Error ? e.message : "上传失败";
    const status =
      /对象存储|扣子运行环境|COZE_STORAGE/i.test(msg) ? 503 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
