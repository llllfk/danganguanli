"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { DeletePersonModal } from "@/components/shared/DeletePersonModal";
import { RuleEditorModal } from "@/components/shared/RuleEditorModal";
import { CATEGORY_SHORT, categoryTagColor } from "@/lib/archive-parse";
import { collectDroppedFiles } from "@/lib/collect-dropped-files";
import { compressUploadImage } from "@/lib/compress-upload-image";
import type { ArchiveCategoryCode, ArchivePiece, SortItem } from "@/types";

type Cat = { code: ArchiveCategoryCode; name: string; parent?: string };

/** 类目接口失败时仍保证核定分类下拉有选项（避免空白） */
const FALLBACK_CATEGORIES: Cat[] = (
  Object.keys(CATEGORY_SHORT) as ArchiveCategoryCode[]
).map((code) => ({
  code,
  name: CATEGORY_SHORT[code],
}));

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) {
    throw new Error(
      `接口无响应内容（HTTP ${res.status}），请检查数据库连接后重试`
    );
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      `接口返回非 JSON（HTTP ${res.status}）：${text.slice(0, 120)}`
    );
  }
}

function shortSerial(serialNo: string) {
  const m = serialNo.match(/L\d+/i);
  return m ? m[0].toUpperCase() : serialNo;
}

function formalItemNo(formalNo: string, index: number) {
  const parts = formalNo.split("-");
  const last = parts[parts.length - 1];
  const n = Number(last) || index + 1;
  return String(n).padStart(3, "0");
}

export function ArchiveClient() {
  const [personCode, setPersonCode] = useState("00001");
  const [pieces, setPieces] = useState<ArchivePiece[]>([]);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [sorted, setSorted] = useState<SortItem[] | null>(null);
  const [busy, setBusy] = useState("");
  const [preview, setPreview] = useState<ArchivePiece | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [classifyRule, setClassifyRule] = useState("");
  const [sortRule, setSortRule] = useState("");
  const [ruleModal, setRuleModal] = useState<"classify" | "sort" | null>(null);
  const [error, setError] = useState("");
  const [tip, setTip] = useState("");
  const [stubMsg, setStubMsg] = useState("");
  const [classifyProgress, setClassifyProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [presetQuery, setPresetQuery] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const loadPieces = useCallback(async (code: string) => {
    const res = await fetch(`/api/archive/pieces?personCode=${encodeURIComponent(code)}`);
    const json = await readJson(res);
    if (json.error) throw new Error(String(json.error));
    const data = (json.data || []) as ArchivePiece[];
    setPieces(data);
    return data;
  }, []);

  useEffect(() => {
    const el = folderInputRef.current;
    if (el) {
      el.setAttribute("webkitdirectory", "");
      el.setAttribute("directory", "");
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [catsRes, rulesRes] = await Promise.all([
          fetch("/api/archive/categories"),
          fetch("/api/archive/rules"),
        ]);
        const cats = await readJson(catsRes).catch(() => ({ data: [] }));
        const rules = await readJson(rulesRes).catch(() => ({
          data: { classify: "", sort: "" },
        }));
        const list = ((cats.data as Cat[]) || []) as Cat[];
        setCategories(list.length ? list : FALLBACK_CATEGORIES);
        const ruleData = (rules.data || {}) as {
          classify?: string;
          sort?: string;
        };
        setClassifyRule(ruleData.classify || "");
        setSortRule(ruleData.sort || "");
      } catch (e) {
        setCategories(FALLBACK_CATEGORIES);
        setError(e instanceof Error ? e.message : "加载失败");
      }
    })();
  }, []);

  const categoryOptions = useMemo(
    () => (categories.length ? categories : FALLBACK_CATEGORIES),
    [categories]
  );

  const classifiedPieces = useMemo(
    () => pieces.filter((p) => p.suggestedCategory),
    [pieces]
  );
  const pageTotal = useMemo(
    () => pieces.reduce((s, p) => s + (p.pageCount || 0), 0),
    [pieces]
  );

  function showStub(label: string) {
    setStubMsg(`${label}：对接预留`);
    window.setTimeout(() => setStubMsg(""), 2500);
  }

  async function uploadFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((f) => {
      const name =
        (f as File & { webkitRelativePath?: string }).webkitRelativePath ||
        f.name;
      return /\.jpe?g$/i.test(name) || /\.zip$/i.test(name);
    });
    if (!files.length) {
      setError("未选中 JPG/ZIP 文件");
      return;
    }
    setBusy("upload");
    setError("");
    try {
      // 分批上传，避免单次 multipart 过大触发 FormData 解析失败
      const BATCH = 25;
      let code = personCode;
      let lastData: ArchivePiece[] = [];
      let lastStats = { pieces: 0, pages: 0 };
      let savedBytes = 0;
      for (let i = 0; i < files.length; i += BATCH) {
        const slice = files.slice(i, i + BATCH);
        setTip(
          `上传解析中… ${Math.min(i + BATCH, files.length)}/${files.length}`
        );
        const fd = new FormData();
        for (const f of slice) {
          setTip(`压缩并上传中… ${i + slice.indexOf(f) + 1}/${files.length}`);
          const rel =
            (f as File & { webkitRelativePath?: string }).webkitRelativePath ||
            f.name;
          const uploadFile = await compressUploadImage(f);
          savedBytes += f.size - uploadFile.size;
          fd.append("files", uploadFile);
          fd.append("paths", rel);
        }
        const res = await fetch("/api/archive/upload", {
          method: "POST",
          body: fd,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.error) {
          throw new Error(json.error || `上传失败（HTTP ${res.status}）`);
        }
        code = json.personCode || code;
        lastData = json.data || [];
        lastStats = json.stats || lastStats;
      }
      setPersonCode(code);
      setPieces(lastData);
      setSorted(null);
      setTip(
        `已读取 ${lastStats.pieces || lastData.length} 件 · ${lastStats.pages || 0} 页（人员 ${code}）${savedBytes > 0 ? `；压缩节省 ${(savedBytes / 1024 / 1024).toFixed(1)} MB` : ""}`
      );
    } catch (e) {
      let msg = e instanceof Error ? e.message : "上传失败";
      if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) {
        msg =
          "上传请求失败（网络中断、超时或单次体积过大）。请改用较小 ZIP / 分批上传；扣子请确认已开通对象存储（COZE_BUCKET_ENDPOINT_URL / COZE_BUCKET_NAME）。";
      }
      setError(msg);
    } finally {
      setBusy("");
    }
  }

  async function onClassify() {
    if (!pieces.length) return;
    setBusy("classify");
    setError("");
    setSorted(null);
    setClassifyProgress({ done: 0, total: pieces.length });
    setTip(`分类中 0/${pieces.length}…`);
    try {
      const res = await fetch("/api/archive/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personCode }),
      });
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `分类失败（HTTP ${res.status}）`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let lastExtracted = 0;
      let lastFailed = 0;
      let visionEnabled = true;
      let visionReason = "";
      const skippedVision: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          const raw = line.trim();
          if (!raw) continue;
          let ev: {
            type: string;
            total?: number;
            done?: number;
            piece?: ArchivePiece;
            vision?: "ok" | "skip" | "fail" | "none";
            visionEnabled?: boolean;
            visionTargets?: number;
            reason?: string;
            extracted?: number;
            failed?: number;
            failedSerials?: string[];
            data?: ArchivePiece[];
            error?: string;
          };
          try {
            ev = JSON.parse(raw);
          } catch {
            continue;
          }
          if (ev.type === "error") {
            throw new Error(ev.error || "分类失败");
          }
          if (ev.type === "start") {
            visionEnabled = !!ev.visionEnabled;
            visionReason = ev.reason || "";
            const total = ev.total || pieces.length;
            setClassifyProgress({ done: 0, total });
            setTip(
              visionEnabled
                ? `分类中 0/${total}（需视觉约 ${ev.visionTargets || 0} 件）…`
                : `分类中 0/${total}（未跑视觉：${visionReason}）…`
            );
          } else if (ev.type === "piece" && ev.piece) {
            const doneN = ev.done || 0;
            const totalN = ev.total || pieces.length;
            setClassifyProgress({ done: doneN, total: totalN });
            setPieces((prev) => {
              const idx = prev.findIndex(
                (p) => p.serialNo === ev.piece!.serialNo
              );
              if (idx < 0) return [...prev, ev.piece!];
              const next = prev.slice();
              next[idx] = { ...prev[idx], ...ev.piece! };
              return next;
            });
            if (ev.vision === "fail" && ev.piece.serialNo) {
              skippedVision.push(ev.piece.serialNo);
            }
            // 单件视觉失败只跳过，不打断、不弹红错；进度里轻提示
            setTip(
              skippedVision.length
                ? `分类中 ${doneN}/${totalN}（已跳过视觉 ${skippedVision.length} 件）…`
                : `分类中 ${doneN}/${totalN}…`
            );
          } else if (ev.type === "done") {
            lastExtracted = ev.extracted || 0;
            lastFailed = ev.failed || 0;
            if (ev.data?.length) setPieces(ev.data);
            const totalN = ev.total || pieces.length;
            setClassifyProgress({ done: totalN, total: totalN });
            const failList =
              ev.failedSerials?.length
                ? ev.failedSerials
                : skippedVision;
            const visionTip = visionEnabled
              ? `（视觉成功 ${lastExtracted} 件${
                  lastFailed
                    ? `，跳过 ${lastFailed} 件：${failList.slice(0, 8).join("、")}${
                        failList.length > 8 ? "…" : ""
                      }`
                    : ""
                }）`
              : `（未跑视觉：${visionReason}）`;
            setTip(
              `智能分类完成 ${totalN} 件${visionTip}，可修改核定分类后排序`
            );
            // 仅结束时汇总提示，不设为阻断性 error
            if (lastFailed > 0) {
              setError("");
            }
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "分类失败");
    } finally {
      setBusy("");
      setClassifyProgress(null);
    }
  }

  async function onConfirmCategory(
    piece: ArchivePiece,
    code: ArchiveCategoryCode
  ) {
    setError("");
    try {
      const res = await fetch("/api/archive/pieces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personCode,
          serialNo: piece.serialNo,
          confirmedCategory: code,
        }),
      });
      const json = await readJson(res);
      if (json.error) throw new Error(String(json.error));
      setPieces((json.data as ArchivePiece[]) || []);
      setSorted(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "核定失败");
    }
  }

  async function onSavePieceMeta(
    piece: ArchivePiece,
    patch: { materialName?: string; formDate?: string }
  ) {
    const nextName =
      patch.materialName !== undefined
        ? patch.materialName.trim()
        : (piece.materialName || "").trim();
    const nextDate =
      patch.formDate !== undefined
        ? patch.formDate.trim()
        : (piece.formDate || "").trim();
    const sameName = nextName === (piece.materialName || "").trim();
    const sameDate = nextDate === (piece.formDate || "").trim();
    if (
      (patch.materialName === undefined || sameName) &&
      (patch.formDate === undefined || sameDate)
    ) {
      return;
    }
    setError("");
    try {
      const body: Record<string, string> = {
        personCode,
        serialNo: piece.serialNo,
      };
      if (patch.materialName !== undefined && !sameName) {
        body.materialName = nextName;
      }
      if (patch.formDate !== undefined && !sameDate) {
        body.formDate = nextDate;
      }
      const res = await fetch("/api/archive/pieces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await readJson(res);
      if (json.error) throw new Error(String(json.error));
      const list = (json.data as ArchivePiece[]) || [];
      setPieces(list);
      setSorted(null);
      if (preview?.serialNo === piece.serialNo) {
        setPreview(list.find((x) => x.serialNo === piece.serialNo) || null);
      }
      setTip(`已保存 ${piece.serialNo} 的材料信息`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    }
  }

  async function onSort() {
    if (!classifiedPieces.length) return;
    setBusy("sort");
    setError("");
    try {
      const res = await fetch("/api/archive/sort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personCode }),
      });
      const json = await readJson(res);
      if (json.error) throw new Error(String(json.error));
      const sortedData = (json.data || []) as SortItem[];
      setSorted(sortedData);
      await loadPieces(personCode);
      const total = sortedData.reduce(
        (s: number, g: SortItem) => s + g.items.length,
        0
      );
      setTip(`排序完成：${sortedData.length || 0} 个类目，共 ${total} 件`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "排序失败");
    } finally {
      setBusy("");
    }
  }

  async function onExport() {
    if (!sorted?.length) {
      setError("请先完成智能分类与智能排序后再导出目录");
      return;
    }
    setBusy("export");
    setError("");
    try {
      const res = await fetch("/api/archive/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personCode }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "导出失败");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `人事档案目录_${personCode}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setTip("已导出制式《人事档案目录》Excel");
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败");
    } finally {
      setBusy("");
    }
  }

  function pageSrc(piece: ArchivePiece, page: number) {
    return `/api/archive/page-image?personCode=${encodeURIComponent(
      piece.personCode || personCode
    )}&serialNo=${encodeURIComponent(piece.serialNo)}&page=${page}`;
  }

  const sortedByCat = useMemo(() => {
    const map = new Map<string, SortItem["items"]>();
    if (sorted) {
      for (const g of sorted) map.set(g.category, g.items);
    }
    return map;
  }, [sorted]);

  return (
    <div className="h-[calc(100vh-110px)] flex flex-col gap-2 min-h-0">
      {(error || tip || stubMsg) && (
        <div className="shrink-0 space-y-1">
          {stubMsg ? (
            <div className="rounded-lg border border-[#cfe0f5] bg-[#eef6fe] px-3 py-1.5 text-sm text-[#2f6fc0]">
              {stubMsg}
            </div>
          ) : null}
          {tip ? (
            <div className="rounded-lg border border-[#cfe0f5] bg-[#eef6fe] px-3 py-1.5 text-sm text-[#1a4b7a]">
              {tip}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(220px,0.75fr)_minmax(560px,1.9fr)_minmax(300px,1.1fr)] gap-3 flex-1 min-h-0">
        {/* 左：选择数据源 */}
        <section className="rounded-[10px] bg-white shadow-[0_6px_20px_rgba(26,74,122,0.12)] flex flex-col min-h-0 overflow-hidden">
          <header className="flex items-center gap-2 px-4 py-3 border-b border-[#e4ebf3]">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded border-2 border-[#4a9eff] text-[#4a9eff]">
              ↑
            </span>
            <h3 className="text-lg font-semibold text-[#243b53]">选择数据源</h3>
          </header>

          <div className="flex-1 min-h-0 flex flex-col px-4 py-3 gap-3">
            <div
              className={`rounded-xl border-2 border-dashed px-4 py-8 text-center cursor-pointer transition ${
                dragOver
                  ? "border-[#4a9eff] bg-[#eef6fe]"
                  : "border-[#d4dce6] bg-[#fbfdff]"
              }`}
              onClick={() => folderInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void (async () => {
                  try {
                    const files = await collectDroppedFiles(e.dataTransfer);
                    if (files.length) await uploadFiles(files);
                    else setError("未识别到可上传文件，请拖入文件夹、JPG 或 ZIP");
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : "拖拽解析失败"
                    );
                  }
                })();
              }}
            >
              <div className="text-[#4a9eff] text-2xl mb-2">⬆</div>
              <p className="text-[15px] text-[#334155]">
                {busy === "upload"
                  ? "上传解析中..."
                  : "点击或拖拽上传 JPG / 文件夹 / ZIP"}
              </p>
              <p className="text-xs text-[#7b8da0] mt-2">
                支持件文件夹 / 散页 JPG / ZIP · 命名如 00001-L001-001.jpg
              </p>
              <div className="mt-3 flex justify-center gap-2">
                <button
                  type="button"
                  className="text-xs text-[#2f6fc0] underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    folderInputRef.current?.click();
                  }}
                >
                  选择文件夹
                </button>
                <button
                  type="button"
                  className="text-xs text-[#2f6fc0] underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  选择文件
                </button>
              </div>
            </div>

            <input
              ref={folderInputRef}
              type="file"
              className="hidden"
              multiple
              onChange={(e) => {
                if (e.target.files?.length) uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".jpg,.jpeg,.zip,image/jpeg,application/zip"
              multiple
              onChange={(e) => {
                if (e.target.files?.length) uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />

            <button
              type="button"
              onClick={() => showStub("系统读取")}
              className="w-full h-12 rounded-[10px] border-2 border-[#a9cdf5] bg-[#eef6fe] text-[#2f6fc0] font-semibold text-[15px] hover:bg-[#e0edfb]"
            >
              系统读取
            </button>

            <div className="rounded-xl border border-[#e4ebf3] bg-[#f7fafd] px-3 py-2.5 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[12px] text-[#7b8da0]">当前人员</div>
                <div className="text-[14px] font-semibold text-[#1f2937] truncate">
                  {personCode || "未选择人员"}
                  {pieces.length > 0 ? (
                    <span className="ml-1.5 font-normal text-[#7b8da0]">
                      · {pieces.length} 件 / {pageTotal} 页
                    </span>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                disabled={!!busy}
                title="选择人员并删除其全部档案信息"
                onClick={() => setClearOpen(true)}
                className="shrink-0 h-9 px-3 rounded-lg border border-rose-200 bg-white text-[12px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              >
                删除人员
              </button>
            </div>

            <div className="text-[15px] font-semibold text-[#334155]">
              已读取文件（{pieces.length} 件 · {pageTotal} 页）
            </div>

            <div className="flex-1 min-h-0 overflow-auto rounded-[10px] border border-[#e0e9f2] bg-[#f7fafd]">
              {pieces.length === 0 ? (
                <p className="text-sm text-[#7b8da0] p-6 text-center">
                  上传材料后，将按件列出流水号与页数
                </p>
              ) : (
                <ul>
                  {pieces.map((p) => (
                    <li
                      key={p.serialNo}
                      className="flex items-center gap-3 px-3 py-2.5 border-b border-[#e6edf5] last:border-0"
                    >
                      <span className="h-9 w-9 rounded bg-[#dde9f6] shrink-0" />
                      <span className="flex-1 text-[14px] text-[#1f2937] font-medium truncate">
                        {p.serialNo}
                      </span>
                      <span className="text-[13px] text-[#6b7a8f] shrink-0">
                        {p.pageCount} 页
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="p-4 pt-0">
            <button
              type="button"
              disabled={!pieces.length || !!busy}
              onClick={onClassify}
              className="w-full h-12 rounded-[10px] bg-[#4a9eff] text-white font-semibold text-[15px] disabled:opacity-50 hover:bg-[#3b8fe8]"
            >
              {busy === "classify" && classifyProgress
                ? `分类中 ${classifyProgress.done}/${classifyProgress.total}`
                : busy === "classify"
                  ? "分类中..."
                  : "开始分类"}
            </button>
          </div>
        </section>

        {/* 中：智能分类 */}
        <section className="rounded-[10px] bg-white shadow-[0_6px_20px_rgba(26,74,122,0.12)] flex flex-col min-h-0 overflow-hidden">
          <header className="flex items-center gap-2 px-4 py-3 border-b border-[#e4ebf3]">
            <span className="text-[#4a9eff] text-lg">▣</span>
            <h3 className="text-lg font-semibold text-[#243b53]">
              智能分类
              {pieces.length > 0 && (
                <span className="ml-2 text-[14px] font-medium text-[#5b6f88]">
                  {classifyProgress
                    ? `${classifyProgress.done}/${classifyProgress.total}`
                    : `${classifiedPieces.length}/${pieces.length}`}
                </span>
              )}
            </h3>
          </header>

          <div className="flex-1 min-h-0 overflow-auto mx-3 mt-3 mb-2 rounded-lg border border-[#d4e3f5]">
            <table className="w-full text-[13px] border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#e0edfb] text-[#1e3a5f]">
                  <th className="px-2 py-3 font-semibold w-[100px]">流水号</th>
                  <th className="px-2 py-3 font-semibold text-left">材料名称</th>
                  <th className="px-2 py-3 font-semibold w-[100px]">材料形成日期</th>
                  <th className="px-2 py-3 font-semibold w-12">页数</th>
                  <th className="px-2 py-3 font-semibold w-12">查看</th>
                  <th className="px-2 py-3 font-semibold w-[88px]">智能分类</th>
                  <th className="px-2 py-3 font-semibold w-[100px]">核定分类</th>
                </tr>
              </thead>
              <tbody>
                {classifiedPieces.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-16 text-center text-[#7b8da0]"
                    >
                      点击左侧「开始分类」后在此展示分类建议
                    </td>
                  </tr>
                ) : (
                  classifiedPieces.map((p, idx) => {
                    const short =
                      CATEGORY_SHORT[p.suggestedCategory || ""] ||
                      p.suggestedCategory;
                    const confirmed =
                      (p.confirmedCategory ||
                        p.suggestedCategory ||
                        "") as ArchiveCategoryCode;
                    return (
                      <tr
                        key={p.serialNo}
                        className={
                          idx % 2 === 0 ? "bg-white" : "bg-[#f5f8fc]"
                        }
                      >
                        <td className="px-2 py-3 text-center text-[#1f2937]">
                          {p.serialNo}
                        </td>
                        <td className="px-2 py-2 text-[#1f2937]">
                          <input
                            type="text"
                            defaultValue={p.materialName || ""}
                            key={`${p.serialNo}-name-${p.materialName || ""}`}
                            disabled={!!busy}
                            placeholder="材料名称"
                            title="修改后失焦保存"
                            className="w-full min-w-[8rem] h-8 rounded border border-[#c5d8ef] bg-white px-2 text-[13px] text-[#1f2937] outline-none focus:border-[#4a9eff] disabled:opacity-50"
                            onBlur={(e) =>
                              void onSavePieceMeta(p, {
                                materialName: e.target.value,
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                          />
                        </td>
                        <td className="px-2 py-2 text-center text-[#475569]">
                          <input
                            type="text"
                            defaultValue={p.formDate || ""}
                            key={`${p.serialNo}-date-${p.formDate || ""}`}
                            disabled={!!busy}
                            placeholder="YYYY-MM-DD"
                            title="形成日期，失焦保存"
                            className="w-full h-8 rounded border border-[#c5d8ef] bg-white px-1 text-center text-[12px] text-[#334155] outline-none focus:border-[#4a9eff] disabled:opacity-50"
                            onBlur={(e) =>
                              void onSavePieceMeta(p, {
                                formDate: e.target.value,
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                          />
                        </td>
                        <td className="px-2 py-3 text-center text-[#475569]">
                          {p.pageCount}
                        </td>
                        <td className="px-2 py-3 text-center">
                          <button
                            type="button"
                            className="text-[#3b8fe8] hover:underline"
                            onClick={() => {
                              setPreview(p);
                              setPreviewPage(1);
                            }}
                          >
                            查看
                          </button>
                        </td>
                        <td className="px-2 py-3 text-center">
                          <span
                            className={`inline-flex min-w-[70px] justify-center rounded-md px-2 py-1.5 text-white font-medium ${categoryTagColor(
                              p.suggestedCategory
                            )}`}
                          >
                            {short}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-center">
                          <select
                            className="w-[110px] h-9 rounded-md border-2 border-[#a9cdf5] bg-white text-[#2f6fc0] text-center outline-none"
                            value={confirmed || "1000"}
                            onChange={(e) =>
                              onConfirmCategory(
                                p,
                                e.target.value as ArchiveCategoryCode
                              )
                            }
                          >
                            {categoryOptions.map((c) => (
                              <option key={c.code} value={c.code}>
                                {CATEGORY_SHORT[c.code] || c.code}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 pt-0 flex gap-3">
            <button
              type="button"
              onClick={() => setRuleModal("classify")}
              className="h-12 px-6 rounded-[10px] border-2 border-[#4a9eff] bg-white text-[#2f6fc0] font-semibold shrink-0"
            >
              修正规则
            </button>
            <button
              type="button"
              disabled={!classifiedPieces.length || !!busy}
              onClick={onSort}
              className="flex-1 h-12 rounded-[10px] bg-[#4a9eff] text-white font-semibold disabled:opacity-50 hover:bg-[#3b8fe8]"
            >
              {busy === "sort" ? "排序中..." : "开始排序"}
            </button>
          </div>
        </section>

        {/* 右：智能排序 */}
        <section className="rounded-[10px] bg-white shadow-[0_6px_20px_rgba(26,74,122,0.12)] flex flex-col min-h-0 overflow-hidden">
          <header className="flex items-center gap-2 px-4 py-3 border-b border-[#e4ebf3]">
            <span className="text-[#4a9eff] text-lg">☰</span>
            <h3 className="text-lg font-semibold text-[#243b53]">智能排序</h3>
          </header>

          <div className="px-3 pt-3">
            <div className="flex flex-wrap items-center gap-2 rounded-[10px] border-2 border-[#a9cdf5] px-3 py-2">
              <span className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#1f2937] shrink-0">
                <span className="h-8 w-8 rounded-full bg-[#e0edfb] inline-flex items-center justify-center text-[#6b9bd0] text-xs">
                  人
                </span>
                读取预存目录
              </span>
              <input
                value={presetQuery}
                onChange={(e) => setPresetQuery(e.target.value)}
                placeholder="输入姓名 / 员工代码"
                className="flex-1 min-w-[120px] h-9 rounded-md border border-[#cdddf0] px-3 text-[13px] outline-none focus:border-[#4a9eff]"
              />
              <button
                type="button"
                onClick={() => showStub("读取")}
                className="h-9 px-5 rounded-md bg-[#4a9eff] text-white text-[13px] font-semibold shrink-0"
              >
                读取
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto mx-3 mt-3 mb-2 rounded-lg border border-[#d4e3f5]">
            <table className="w-full text-[13px] border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#e0edfb] text-[#1e3a5f]">
                  <th className="px-2 py-3 font-semibold w-[72px]">流水号</th>
                  <th className="px-2 py-3 font-semibold text-left">材料名称</th>
                  <th className="px-2 py-3 font-semibold w-[72px]">分类号</th>
                  <th className="px-2 py-3 font-semibold w-[64px]">件号</th>
                </tr>
              </thead>
              <tbody>
                {categoryOptions.map((cat) => {
                  const items = sortedByCat.get(cat.code) || [];
                  return (
                    <FragmentCat
                      key={cat.code}
                      name={cat.name}
                      categoryCode={cat.code}
                      items={items}
                      showItems={!!sorted}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-4 pt-0 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRuleModal("sort")}
              className="h-12 px-5 rounded-[10px] border-2 border-[#4a9eff] bg-white text-[#2f6fc0] font-semibold"
            >
              修正规则
            </button>
            <button
              type="button"
              disabled={!!busy || !sorted?.length}
              title={
                sorted?.length
                  ? "导出制式人事档案目录"
                  : "请先完成智能分类与智能排序"
              }
              onClick={onExport}
              className="h-12 px-5 rounded-[10px] border-2 border-[#4a9eff] bg-white text-[#2f6fc0] font-semibold disabled:opacity-50"
            >
              {busy === "export" ? "导出中..." : "导出目录"}
            </button>
            <button
              type="button"
              onClick={() => showStub("确认并返回主系统")}
              className="flex-1 min-w-[140px] h-12 rounded-[10px] bg-[#4a9eff] text-white font-semibold hover:bg-[#3b8fe8]"
            >
              确认并返回主系统
            </button>
          </div>
        </section>
      </div>

      <Modal
        open={!!preview}
        title={`材料详情 · ${preview?.serialNo || ""}`}
        onClose={() => setPreview(null)}
        width="lg"
      >
        {preview ? (
          <div className="space-y-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="shrink-0 text-[#64748b] w-[4.5rem]">材料名称</span>
              <input
                type="text"
                key={`prev-name-${preview.serialNo}-${preview.materialName || ""}`}
                defaultValue={preview.materialName || ""}
                disabled={!!busy}
                className="flex-1 h-9 rounded-md border border-[#c5d8ef] px-2 outline-none focus:border-[#4a9eff]"
                onBlur={(e) =>
                  void onSavePieceMeta(preview, {
                    materialName: e.target.value,
                  })
                }
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="shrink-0 text-[#64748b] w-[4.5rem]">形成日期</span>
              <input
                type="text"
                key={`prev-date-${preview.serialNo}-${preview.formDate || ""}`}
                defaultValue={preview.formDate || ""}
                disabled={!!busy}
                placeholder="YYYY-MM-DD"
                className="flex-1 h-9 rounded-md border border-[#c5d8ef] px-2 outline-none focus:border-[#4a9eff]"
                onBlur={(e) =>
                  void onSavePieceMeta(preview, { formDate: e.target.value })
                }
              />
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[#7b8da0]">页：</span>
              {Array.from({ length: preview.pageCount || 1 }, (_, i) => i + 1).map(
                (n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPreviewPage(n)}
                    className={`h-8 min-w-8 px-2 rounded-md border text-xs ${
                      previewPage === n
                        ? "border-[#4a9eff] bg-[#eef6fe] text-[#2f6fc0]"
                        : "border-[#e4ebf3] text-[#7b8da0]"
                    }`}
                  >
                    {n}
                  </button>
                )
              )}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pageSrc(preview, previewPage)}
              alt={`${preview.serialNo}-${previewPage}`}
              className="w-full max-h-[55vh] object-contain rounded-lg border border-[#e4ebf3] bg-[#f7fafd]"
            />
          </div>
        ) : null}
      </Modal>

      <RuleEditorModal
        open={ruleModal === "classify"}
        title="分类规则"
        value={classifyRule}
        hint="此处保存的分类规则文案会传给分类智能体（开始分类时）。智能体失败时仍回退 classify_keywords 关键词表。改完后请重新「开始分类」。"
        onClose={() => setRuleModal(null)}
        onSave={async (next) => {
          const res = await fetch("/api/archive/rules", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ classify: next }),
          });
          const j = await readJson(res);
          if (j.error) throw new Error(String(j.error));
          const data = (j.data || {}) as { classify?: string };
          setClassifyRule(data.classify || next);
          setTip("分类规则文案已保存（下次「开始分类」将传给智能体；失败仍走关键词）");
        }}
      />
      <RuleEditorModal
        open={ruleModal === "sort"}
        title="排序规则"
        value={sortRule}
        hint="此处保存规则说明文案。当前排序仍按系统内置类目与件号规则执行；改文案不会立刻改变结果，需重新点击「开始排序」。"
        onClose={() => setRuleModal(null)}
        onSave={async (next) => {
          const res = await fetch("/api/archive/rules", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sort: next }),
          });
          const j = await readJson(res);
          if (j.error) throw new Error(String(j.error));
          const data = (j.data || {}) as { sort?: string };
          setSortRule(data.sort || next);
          setTip("排序规则文案已保存；重新「开始排序」按内置引擎生效");
        }}
      />

      <DeletePersonModal
        open={clearOpen}
        initialCode={personCode}
        onClose={() => setClearOpen(false)}
        onDeleted={(result) => {
          if (result.personCode === personCode) {
            setPersonCode("");
            setPieces([]);
            setSorted(null);
            setClassifyProgress(null);
            setPreview(null);
          }
          setTip(result.filesPending
            ? `人员信息已删除，${result.filesPending} 个上传文件待清理`
            : `已删除 ${result.personName}（${result.personCode}）的全部人员信息`);
        }}
      />
    </div>
  );
}

function FragmentCat({
  name,
  categoryCode,
  items,
  showItems,
}: {
  name: string;
  categoryCode: string;
  items: SortItem["items"];
  showItems: boolean;
}) {
  return (
    <>
      <tr className="bg-[#d6e6f7]">
        <td
          colSpan={4}
          className="px-3 py-2.5 text-[14px] font-semibold text-[#1e3a5f]"
        >
          {name}
        </td>
      </tr>
      {showItems
        ? items.map((it, i) => (
            <tr
              key={`${it.formalNo}-${it.serialNo}`}
              className={i % 2 === 0 ? "bg-white" : "bg-[#f5f8fc]"}
            >
              <td className="px-2 py-2 text-center text-[#1f2937]">
                {shortSerial(it.serialNo)}
              </td>
              <td className="px-2 py-2 text-[#1f2937]">{it.materialName}</td>
              <td className="px-2 py-2 text-center text-[#475569]">
                {categoryCode}
              </td>
              <td className="px-2 py-2 text-center text-[#475569]">
                {formalItemNo(it.formalNo, i)}
              </td>
            </tr>
          ))
        : null}
    </>
  );
}
