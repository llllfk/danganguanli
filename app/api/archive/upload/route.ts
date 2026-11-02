import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { getSessionUser } from "@/lib/auth";
import {
  groupParsedPages,
  parseArchivePagePath,
} from "@/lib/archive-parse";
import { listPieces, upsertUploadedPieces } from "@/lib/repos/archive";
import {
  archiveObjectKey,
  hasStorage,
  putObject,
  resolveWriteBackend,
} from "@/lib/storage";

export const runtime = "nodejs";

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

    // 本地 → data/uploads；扣子 → 必须 S3（未配置时提前清晰报错，避免 ENOENT）
    const storageBackend = resolveWriteBackend();
    const form = await request.formData();
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
        { error: "未找到 JPG 文件，请上传件文件夹、散页 JPG 或 ZIP" },
        { status: 400 }
      );
    }

    const bytesByPath = new Map<string, Buffer>();
    const parsed = [];
    for (const rf of rawFiles) {
      const meta = parseArchivePagePath(rf.relativePath);
      if (!meta) continue;
      bytesByPath.set(meta.relativePath, rf.bytes);
      parsed.push(meta);
    }

    if (!parsed.length) {
      return NextResponse.json(
        {
          error:
            "无法解析文件名。请使用 人员代码-L流水号-页号.jpg（如 00001-L001-001.jpg）",
        },
        { status: 400 }
      );
    }

    const groups = groupParsedPages(parsed);
    const inputs = [];

    for (const g of groups) {
      const pages = [];
      for (const pg of g.pages) {
        const bytes = bytesByPath.get(pg.relativePath);
        const safeName =
          pg.fileName.replace(/[^\w.\-()-]/g, "_") ||
          `${g.serialNo}-${String(pg.pageNo).padStart(3, "0")}.jpg`;
        if (!bytes) continue;
        const key = archiveObjectKey(g.personCode, g.serialNo, safeName);
        const storedPath = await putObject({
          key,
          body: bytes,
          contentType: "image/jpeg",
        });
        pages.push({
          pageNo: pg.pageNo,
          fileName: safeName,
          publicPath: storedPath,
          absPath: storedPath,
        });
      }
      if (!pages.length) continue;
      inputs.push({
        personCode: g.personCode,
        serialNo: g.serialNo,
        pages,
      });
    }

    if (!inputs.length) {
      return NextResponse.json({ error: "上传写入失败" }, { status: 500 });
    }

    const result = await upsertUploadedPieces(inputs);
    const personCode = result.personCode;
    const data = await listPieces(personCode);
    const pageTotal = data.reduce((s, p) => s + p.pageCount, 0);

    return NextResponse.json({
      data,
      personCode,
      personCodes: result.personCodes,
      stats: { pieces: data.length, pages: pageTotal },
      storage: storageBackend,
      hasStorage: hasStorage(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "上传失败";
    const status =
      /对象存储|扣子运行环境|COZE_STORAGE/i.test(msg) ? 503 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
