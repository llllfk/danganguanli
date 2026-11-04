"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { RuleEditorModal } from "@/components/shared/RuleEditorModal";
import { DeletePersonModal } from "@/components/shared/DeletePersonModal";
import { readAuditResponse } from "@/lib/audit-response";
import { collectDroppedFiles } from "@/lib/collect-dropped-files";
import { compressUploadImage } from "@/lib/compress-upload-image";
import { auditMaterialLabel } from "@/lib/audit-label";
import type { AuditFieldResult, AuditReport, AuditSource, AuditRecord } from "@/types";

type Cat = { code: string; name: string };
type Mat = {
  category: string;
  materialName: string;
  imageNames?: string[];
  serialNo: string;
  pageCount: number;
  formalNo: string | null;
  source?: "ordered" | "unordered";
};
type PersonOpt = { personCode: string; personName: string };

export function AuditClient() {
  const [categories, setCategories] = useState<Cat[]>([]);
  const [materials, setMaterials] = useState<Mat[]>([]);
  const [persons, setPersons] = useState<PersonOpt[]>([]);
  const [personCode, setPersonCode] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [busy, setBusy] = useState("");
  const [tip, setTip] = useState("");
  const [stubMsg, setStubMsg] = useState("");
  const [sourceField, setSourceField] = useState<AuditFieldResult | null>(null);
  const [opinionField, setOpinionField] = useState<AuditFieldResult | null>(null);
  const [auditRule, setAuditRule] = useState("");
  const [compRule, setCompRule] = useState("");
  const [ruleOpen, setRuleOpen] = useState(false);
  const [deletePersonOpen, setDeletePersonOpen] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<Mat | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewErr, setPreviewErr] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  function sourceLabel(source: AuditSource) {
    // 来源只显示题名；旧报告优先使用当前已加载材料的最新题名。
    const material = materials.find((m) =>
      m.formalNo === source.materialNo || m.serialNo === source.materialNo
    );
    return material?.materialName || source.materialName || "未命名材料";
  }

  useEffect(() => {
    const el = folderInputRef.current;
    if (el) {
      el.setAttribute("webkitdirectory", "");
      el.setAttribute("directory", "");
    }
  }, []);

  useEffect(() => {
    fetch("/api/audit/rules")
      .then((r) => r.json())
      .then((j) => {
        setAuditRule(j.data?.audit || "");
        setCompRule(j.data?.completeness || "");
      });
    fetch("/api/audit/materials")
      .then((r) => r.json())
      .then((j) => {
        if (j.data?.categories) setCategories(j.data.categories);
        const list = (j.data?.persons || []) as PersonOpt[];
        setPersons(list);
      })
      .catch(() => {});
  }, []);

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
      setError(
        "请上传整个有序档案文件夹、散页 JPG 或 ZIP（命名：00001-0401-001-001.jpg）"
      );
      return;
    }
    setBusy("upload");
    setError("");
    try {
      const BATCH = 25;
      let last: {
        personCode: string;
        pieceCount: number;
        pageCount: number;
        storage: string;
        materials: Mat[];
        categories: Cat[];
      } | null = null;
      let sortStart = 0;
      let savedBytes = 0;
      for (let i = 0; i < files.length; i += BATCH) {
        const slice = files.slice(i, i + BATCH);
        setTip(
          `上传解析中… ${Math.min(i + BATCH, files.length)}/${files.length}`
        );
        const form = new FormData();
        form.append("clearFirst", i === 0 ? "1" : "0");
        form.append("sortStart", String(sortStart));
        for (const f of slice) {
          setTip(`压缩并上传中… ${i + slice.indexOf(f) + 1}/${files.length}`);
          const rel =
            (f as File & { webkitRelativePath?: string }).webkitRelativePath ||
            f.name;
          const uploadFile = await compressUploadImage(f);
          savedBytes += f.size - uploadFile.size;
          form.append("files", uploadFile);
          form.append("paths", rel);
        }
        const res = await fetch("/api/audit/upload", {
          method: "POST",
          body: form,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.error) {
          throw new Error(json.error || `上传失败（HTTP ${res.status}）`);
        }
        last = json.data;
        sortStart = json.data?.sortEnd ?? sortStart + slice.length;
      }
      if (!last) throw new Error("上传无结果");
      setPersonCode(last.personCode);
      setCategories(last.categories || categories);
      setMaterials(last.materials || []);
      setLoaded(true);
      setReport(null);
      setTip(
        `已上传人员 ${last.personCode}：${last.pieceCount} 件 / ${last.pageCount} 页（存储：${last.storage === "s3" ? "Coze S3" : "本地"}）${savedBytes > 0 ? `；压缩节省 ${(savedBytes / 1024 / 1024).toFixed(1)} MB` : ""}`
      );
      // 刷新已入库人员列表
      try {
        const j = await fetch("/api/audit/materials").then((r) => r.json());
        if (j.data?.persons) setPersons(j.data.persons);
      } catch {
        /* ignore */
      }
    } catch (e) {
      let msg = e instanceof Error ? e.message : "上传失败";
      if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) {
        msg =
          "上传请求失败（网络中断、超时或单次体积过大）。请改用较小 ZIP / 分批上传；扣子请确认已开通对象存储（COZE_BUCKET_ENDPOINT_URL / COZE_BUCKET_NAME）。";
      }
      setError(msg);
      setTip("");
    } finally {
      setBusy("");
    }
  }

  async function loadLatestReport(code: string) {
    const res = await fetch(
      `/api/audit/latest?personCode=${encodeURIComponent(code)}`
    );
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    const report = json.data?.report as AuditReport | null;
    const rec = json.data?.record as
      | { createdAt?: string; summary?: string; issueCount?: number }
      | null;
    if (report) {
      setReport(report);
      return {
        hasReport: true as const,
        createdAt: rec?.createdAt,
        summary: rec?.summary,
        issueCount: rec?.issueCount,
        sourceCount: json.data?.sourceCount as number | undefined,
        textCount: json.data?.textCount as number | undefined,
      };
    }
    setReport(null);
    return {
      hasReport: false as const,
      sourceCount: json.data?.sourceCount as number | undefined,
      textCount: json.data?.textCount as number | undefined,
    };
  }

  async function loadMaterials(
    code: string,
    opts?: { keepReport?: boolean; loadReport?: boolean }
  ) {
    const res = await fetch(
      `/api/audit/materials?personCode=${encodeURIComponent(code)}`
    );
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    if (json.data?.persons) setPersons(json.data.persons);
    setCategories(json.data.categories || []);
    setMaterials(json.data.materials || []);
    setPersonCode(json.data.personCode || code);
    setLoaded(true);
    let latest: Awaited<ReturnType<typeof loadLatestReport>> | null = null;
    if (opts?.loadReport) {
      latest = await loadLatestReport(code);
    } else if (!opts?.keepReport) {
      setReport(null);
    }
    return {
      ...(json.data as {
        materials: Mat[];
        categories: Cat[];
        personCode: string;
        persons?: PersonOpt[];
      }),
      latest,
    };
  }

  async function onLoadStored() {
    if (!personCode) {
      setError("请先选择已入库人员");
      return;
    }
    setBusy("load");
    setError("");
    try {
      const data = await loadMaterials(personCode, { loadReport: true });
      const src =
        data.materials?.[0]?.source === "unordered" ? "整编乱序件" : "有序档案件";
      const latest = data.latest;
      if (latest?.hasReport) {
        setTip(
          `已加载人员 ${data.personCode || personCode}：${data.materials?.length || 0} 件（${src}）；已带入最近核验（${latest.createdAt ? new Date(latest.createdAt).toLocaleString("zh-CN") : ""}）`
        );
      } else {
        setTip(
          `已加载人员 ${data.personCode || personCode}：${data.materials?.length || 0} 件（${src}）；尚无核验报告，请点「开始检验」`
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      setTip("");
    } finally {
      setBusy("");
    }
  }

  async function onVerify(opts?: { forceVision?: boolean; rulesOnly?: boolean }) {
    setBusy("verify");
    setError("");
    try {
      const code = personCode;
      if (!code) {
        throw new Error("请先选择已入库人员，或上传有序档案");
      }
      if (!loaded) {
        const data = await loadMaterials(code, { keepReport: true });
        setTip(
          `已加载人员 ${data.personCode || code} 档案 ${data.materials?.length || 0} 件，正在检验…`
        );
      } else if (opts?.forceVision) {
        setTip(`正在强制重读影像并核验 ${code}（较慢）…`);
      } else {
        setTip(`正在检验人员 ${code}（逐件检查题名，补识别未完成材料）…`);
      }
      type BatchResult = {
        nextCursor: number | null;
        report: AuditReport | null;
        record: AuditRecord | null;
        visionNote: string;
        textCount?: number;
        failures: Array<{ materialNo: string; error: string }>;
      };
      let cursor = 0;
      let result: BatchResult;
      const failures: BatchResult["failures"] = [];
      for (;;) {
        const res = await fetch("/api/audit/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
          body: JSON.stringify({ personCode: code, cursor,
            forceVision: !!opts?.forceVision, rulesOnly: !!opts?.rulesOnly }),
        });
        result = await readAuditResponse<BatchResult>(res, (progress) => {
          setTip(`正在核验 ${code}：${progress.done}/${progress.total} 件（${progress.materialNo}）`);
        });
        failures.push(...(result.failures || []));
        await loadMaterials(code, { keepReport: true });
        if (result.nextCursor === null) break;
        if (!Number.isInteger(result.nextCursor) || result.nextCursor <= cursor) {
          throw new Error("核验进度异常，请再次开始检验继续");
        }
        cursor = result.nextCursor;
      }
      if (!result.report) throw new Error("未生成核验报告，请再次开始检验");
      setReport(result.report);
      setLoaded(true);
      // 核验可能已把视觉题名写回件表，刷新左侧列表
      await loadMaterials(code, { keepReport: true });
      const rec = result.record;
      const note = failures.length
        ? `有 ${failures.length} 件未完成：${failures.map((f) => f.materialNo).join("、")}；再次检验可重试。`
        : result.visionNote || "";
      const texts = result.textCount;
      setTip(
        `${note}核验已写入记录：${rec?.summary || ""}（问题 ${rec?.issueCount ?? "-"}${
          texts != null ? `；页文本缓存 ${texts}` : ""
        }）`
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "核验失败";
      setError(/Failed to fetch|NetworkError|Load failed|network|Unexpected token|not valid JSON|Unexpected end of JSON/i.test(message)
        ? "核验连接已中断，已完成的识别会保留，请再次开始检验继续。"
        : message);
      setTip("");
    } finally {
      setBusy("");
    }
  }

  const pageTotal = useMemo(
    () => materials.reduce((s, m) => s + (m.pageCount || 0), 0),
    [materials]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Mat[]>();
    for (const m of materials) {
      const key = m.category || "未分类";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return map;
  }, [materials]);

  const displayCats = useMemo(() => {
    if (categories.length) return categories;
    return [...grouped.keys()].map((code) => ({ code, name: code }));
  }, [categories, grouped]);

  const catName = (code: string) =>
    categories.find((c) => c.code === code)?.name || code;

  function pieceRefOf(m: Mat) {
    return m.formalNo || m.serialNo;
  }

  function pageSrc(m: Mat, page: number) {
    const ref = pieceRefOf(m);
    const qs = new URLSearchParams({
      personCode,
      pieceRef: ref,
      page: String(page),
    });
    if (m.source) qs.set("source", m.source);
    return `/api/audit/page-image?${qs.toString()}`;
  }

  function openPreview(m: Mat) {
    setPreview(m);
    setPreviewPage(1);
    setPreviewErr("");
  }

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

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(280px,0.85fr)_minmax(640px,1.8fr)] gap-3 flex-1 min-h-0">
        {/* 左：选择数据源 */}
        <section className="rounded-[10px] bg-white shadow-[0_6px_20px_rgba(26,74,122,0.12)] flex flex-col min-h-0 overflow-hidden">
          <header className="flex items-center gap-2 px-4 py-3 border-b border-[#e4ebf3]">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded border-2 border-[#4a9eff] text-[#4a9eff]">
              ↑
            </span>
            <h3 className="text-lg font-semibold text-[#243b53]">选择数据源</h3>
          </header>

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-4 pt-3 pb-2 gap-2.5">
            <div className="shrink-0 rounded-xl border border-[#d4e3f5] bg-[#f7fafd] px-3 py-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-[13px] font-semibold text-[#334155]">已入库人员</label>
                <button type="button" disabled={!!busy} onClick={() => setDeletePersonOpen(true)}
                  className="rounded-md border border-rose-200 bg-white px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                  删除人员
                </button>
              </div>
              <div className="flex gap-2">
                <select
                  value={personCode}
                  disabled={!!busy}
                  onChange={(e) => {
                    const code = e.target.value;
                    setPersonCode(code);
                    if (code) {
                      void (async () => {
                        setBusy("load");
                        setError("");
                        try {
                          const data = await loadMaterials(code, {
                            loadReport: true,
                          });
                          const src =
                            data.materials?.[0]?.source === "unordered"
                              ? "整编乱序件"
                              : "有序档案件";
                          const latest = data.latest;
                          if (latest?.hasReport) {
                            setTip(
                              `已加载 ${data.personCode || code}：${data.materials?.length || 0} 件（${src}）；已带入最近核验报告`
                            );
                          } else {
                            setTip(
                              `已加载 ${data.personCode || code}：${data.materials?.length || 0} 件（${src}）；尚无报告，请「开始检验」`
                            );
                          }
                        } catch (err) {
                          setLoaded(false);
                          setMaterials([]);
                          setReport(null);
                          setError(
                            err instanceof Error ? err.message : "加载失败"
                          );
                        } finally {
                          setBusy("");
                        }
                      })();
                    } else {
                      setLoaded(false);
                      setMaterials([]);
                      setReport(null);
                    }
                  }}
                  className="flex-1 min-w-0 h-10 rounded-lg border border-[#c5daf5] bg-white px-2 text-[14px] text-[#1f2937] outline-none focus:border-[#4a9eff]"
                >
                  {persons.length === 0 ? (
                    <option value="">暂无已入库人员</option>
                  ) : (
                    <>
                      <option value="">请选择人员</option>
                      {persons.map((p) => (
                        <option key={p.personCode} value={p.personCode}>
                          {p.personCode} · {p.personName}
                        </option>
                      ))}
                    </>
                  )}
                </select>
                <button
                  type="button"
                  disabled={!personCode || !!busy}
                  onClick={onLoadStored}
                  className="h-10 shrink-0 rounded-lg border-2 border-[#a9cdf5] bg-[#eef6fe] px-3 text-[13px] font-semibold text-[#2f6fc0] hover:bg-[#e0edfb] disabled:opacity-50"
                >
                  {busy === "load" ? "加载中…" : "加载材料"}
                </button>
              </div>
              <p className="text-[11px] text-[#7b8da0]">
                优先读有序件；无则回退整编乱序件。也可下方重新上传有序扫描件。
              </p>
            </div>

            <div
              className={`shrink-0 rounded-xl border-2 border-dashed px-3 py-3 text-center cursor-pointer transition ${
                dragOver
                  ? "border-[#4a9eff] bg-[#eef6fe]"
                  : "border-[#d4dce6] bg-[#fbfdff]"
              }`}
              onClick={() => fileInputRef.current?.click()}
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
                    else
                      setError(
                        "未识别到可上传文件，请拖入有序档案文件夹、JPG 或 ZIP（命名：00001-0401-001-001.jpg）"
                      );
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : "拖拽解析失败"
                    );
                  }
                })();
              }}
            >
              <p className="text-[14px] text-[#334155]">
                {busy === "upload"
                  ? "上传中…"
                  : loaded
                    ? `当前人员 ${personCode} · 可重新上传`
                    : "或拖拽 / 选择有序档案文件夹、JPG、ZIP"}
              </p>
              <p className="text-[11px] text-[#7b8da0] mt-1">
                命名：人员代码-分类号-件号-页号.jpg（如 00001-0401-001-001.jpg）
              </p>
              <div className="mt-2 flex justify-center gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-[#b6d4f5] bg-white px-3 py-1.5 text-xs text-[#2f6fc0] hover:bg-[#eef6fe]"
                  onClick={(e) => {
                    e.stopPropagation();
                    folderInputRef.current?.click();
                  }}
                >
                  选择文件夹
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-[#b6d4f5] bg-white px-3 py-1.5 text-xs text-[#2f6fc0] hover:bg-[#eef6fe]"
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
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".jpg,.jpeg,image/jpeg,.zip"
              multiple
              onChange={(e) => {
                if (e.target.files?.length) uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
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

            <div className="shrink-0 flex items-center justify-between gap-2">
              <div className="text-[15px] font-semibold text-[#334155]">已读取文件</div>
              {loaded ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f5ee] text-[#1f7a4d] text-xs font-medium px-2.5 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#22a06b]" />
                  {materials.length}件 · {pageTotal}页
                </span>
              ) : (
                <span className="text-xs text-[#7b8da0]">未加载</span>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-auto rounded-[10px] border border-[#e0e9f2] bg-[#f7fafd]">
              {!loaded && !displayCats.length ? (
                <p className="text-sm text-[#7b8da0] p-6 text-center">
                  选择已入库人员并「加载材料」，或上传有序档案
                </p>
              ) : (
                <div className="py-1">
                  {displayCats.map((c) => {
                    const list = grouped.get(c.code) || [];
                    return (
                      <div key={c.code} className="border-b border-[#e6edf5] last:border-0">
                        <div className="px-3 py-2 text-[13px] font-semibold text-[#1e3a5f] bg-[#eef4fa]">
                          {c.name}
                          {loaded ? (
                            <span className="ml-2 font-normal text-[#7b8da0]">
                              {list.length}件
                            </span>
                          ) : null}
                        </div>
                        {loaded && list.length > 0 ? (
                          <ul>
                            {list.map((x) => (
                              <li key={x.formalNo || x.serialNo}>
                                <button
                                  type="button"
                                  onClick={() => openPreview(x)}
                                  className="w-full flex items-center gap-2 px-3 py-2 border-b border-[#eef2f7] last:border-0 text-left hover:bg-[#eef6fe] transition"
                                  title={auditMaterialLabel(x.materialName, pieceRefOf(x))}
                                >
                                  <span className="flex-1 min-w-0 text-[13px] text-[#1f2937] break-words whitespace-normal">
                                    {auditMaterialLabel(x.materialName, pieceRefOf(x))}
                                  </span>
                                  <span className="text-[12px] text-[#6b7a8f] shrink-0">
                                    {x.pageCount}页
                                  </span>
                                  <span className="text-[11px] text-[#4a9eff] shrink-0">
                                    预览
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : loaded ? (
                          <p className="px-3 py-2 text-xs text-[#9aa8b8]">该类暂无材料</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-[#e4ebf3] bg-white px-4 py-3 space-y-2">
            <button
              type="button"
              disabled={!!busy || !personCode}
              onClick={() => onVerify()}
              className="w-full h-12 rounded-[10px] bg-[#4a9eff] text-white font-semibold text-[15px] disabled:opacity-50 hover:bg-[#3b8fe8]"
            >
              {busy === "verify"
                ? "检验中..."
                : busy === "load"
                  ? "加载中..."
                  : "开始检验"}
            </button>
            <p className="text-[11px] text-[#7b8da0] text-center leading-relaxed">
              {report
                ? "再次检验将复用已完成识别，重试缺失题名和未完成材料"
                : "首次会识别材料并生成报告；之后选人自动带出上次结果"}
            </p>
          </div>
        </section>

        {/* 右：档案审核查验 */}
        <section className="rounded-[10px] bg-white shadow-[0_6px_20px_rgba(26,74,122,0.12)] flex flex-col min-h-0 overflow-hidden">
          <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#e4ebf3]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[#4a9eff] text-lg">▣</span>
              <h3 className="text-lg font-semibold text-[#243b53] truncate">
                档案审核查验
              </h3>
            </div>
            <div className="inline-flex rounded-lg border border-[#c5daf5] overflow-hidden shrink-0">
              <span className="px-3 py-1.5 text-sm font-medium bg-[#4a9eff] text-white">
                核验报告
              </span>
              <Link
                href="/audit/records"
                className="px-3 py-1.5 text-sm font-medium text-[#2f6fc0] bg-white hover:bg-[#eef6fe]"
              >
                核验记录
              </Link>
            </div>
          </header>

          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-0">
            {/* 信息比对 */}
            <div className="flex flex-col min-h-0 border-r border-[#e4ebf3]">
              <div className="px-4 py-2.5 border-b border-[#e4ebf3] bg-[#f7fbff]">
                <h4 className="text-[15px] font-semibold text-[#1a4b7a]">
                  材料信息比对
                </h4>
              </div>
              <div className="flex-1 min-h-0 overflow-auto px-3 py-3">
                {!report ? (
                  <p className="text-sm text-[#7b8da0] leading-7 px-1">
                    请点击左侧「开始检验」
                  </p>
                ) : (
                  <div className="space-y-2 anim-fade-up">
                    {report.fields.map((f) => {
                      const bad = f.status !== "ok";
                      const multi =
                        bad &&
                        f.sources.length > 1 &&
                        new Set(f.sources.map((s) => s.value)).size > 1;
                      return (
                        <div
                          key={f.field}
                          className={`rounded-xl border px-3 py-2.5 ${
                            bad
                              ? "border-rose-200 bg-rose-50/60"
                              : "border-[#e4ebf3] bg-white"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[14px] font-semibold text-[#1f2937]">
                                <span className="text-[#5b6b7c] font-medium">
                                  {f.label}：
                                </span>
                                {multi ? null : f.value || "未检出"}
                              </div>
                              {multi ? (
                                <ol className="mt-1.5 space-y-1 text-[13px] text-[#334155]">
                                  {f.sources.map((s, i) => (
                                    <li key={i}>
                                      {i + 1}. {s.value}
                                      <span className="text-[#7b8da0]">
                                        {" "}
                                        （{sourceLabel(s)}）
                                      </span>
                                    </li>
                                  ))}
                                </ol>
                              ) : f.sources[0] ? (
                                <div className="mt-1 text-xs text-[#7b8da0] break-words">
                                  来源：{sourceLabel(f.sources[0])}
                                </div>
                              ) : (
                                <div className="mt-1 text-xs text-[#7b8da0]">
                                  来源：未检出
                                </div>
                              )}
                              {bad ? (
                                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                                  <span className="inline-flex items-center gap-1 text-[13px] text-rose-600 font-medium">
                                    <span aria-hidden>⚠</span>
                                    {f.statusText}
                                  </span>
                                  {f.aiOpinion ? (
                                    <button
                                      type="button"
                                      className="text-[13px] text-[#4a9eff] hover:underline"
                                      onClick={() => setOpinionField(f)}
                                    >
                                      查看AI意见
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              className="shrink-0 text-[12px] text-[#4a9eff] hover:underline"
                              onClick={() => setSourceField(f)}
                            >
                              [查看全部来源]
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* 材料完整性筛查 */}
            <div className="flex flex-col min-h-0">
              <div className="px-4 py-2.5 border-b border-[#e4ebf3] bg-[#f7fbff] flex items-center justify-between gap-2">
                <h4 className="text-[15px] font-semibold text-[#1a4b7a]">
                  材料完整性筛查
                </h4>
                {report ? (
                  <span className="text-xs text-[#5b6b7c]">
                    姓名：{report.personName}
                  </span>
                ) : null}
              </div>
              <div className="flex-1 min-h-0 overflow-auto px-3 py-3">
                {!report ? (
                  <p className="text-sm text-[#7b8da0] leading-7 px-1">
                    请点击左侧「开始检验」
                  </p>
                ) : report.completeness.length === 0 ? (
                  <p className="text-sm text-emerald-600">未发现必要材料缺失</p>
                ) : (
                  <ul className="space-y-2 anim-fade-up">
                    {report.completeness.map((c, i) => (
                      <li
                        key={i}
                        className="rounded-xl border border-rose-200 bg-[#fff1f0] px-3 py-3 text-sm text-[#b42318] flex gap-2"
                      >
                        <span className="shrink-0 mt-0.5" aria-hidden>
                          ⚠
                        </span>
                        <span>
                          {c.message?.startsWith("缺少")
                            ? c.message
                            : `缺少${c.message || c.category}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-[#e4ebf3] bg-[#fafcfe]">
            <button
              type="button"
              disabled={!!busy || !personCode}
              onClick={() => {
                if (
                  !window.confirm(
                    "将重新识别扫描件并更新出处（较慢）。材料未变更时不必使用。"
                  )
                ) {
                  return;
                }
                void onVerify({ forceVision: true });
              }}
              className="text-[13px] text-[#7b8da0] underline-offset-2 hover:text-[#a85a20] hover:underline disabled:opacity-40"
            >
              材料有更新？重新识别
            </button>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setRuleOpen(true)}
                className="h-10 px-4 rounded-[8px] border border-[#c5d3e3] bg-white text-[#334155] text-sm font-medium hover:bg-[#f5f8fb]"
              >
                修正规则
              </button>
              <button
                type="button"
                onClick={() => showStub("确认并返回主系统")}
                className="h-10 px-4 rounded-[8px] bg-[#4a9eff] text-white text-sm font-semibold hover:bg-[#3b8fe8]"
              >
                确认并返回主系统
              </button>
            </div>
          </footer>
        </section>
      </div>

      <Modal
        open={!!preview}
        title={`材料预览 · ${preview ? pieceRefOf(preview) : ""}`}
        onClose={() => {
          setPreview(null);
          setPreviewErr("");
        }}
        width="lg"
      >
        {preview ? (
          <div className="space-y-3 text-sm">
            <p className="text-[#1f2937]">
              {auditMaterialLabel(preview.materialName, pieceRefOf(preview))}
            </p>
            <p className="text-[#7b8da0]">
              {preview.source === "unordered" ? "整编件" : "有序件"} ·{" "}
              {pieceRefOf(preview)} · 共 {preview.pageCount || 1} 页
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[#7b8da0]">页：</span>
              {Array.from(
                { length: Math.max(1, preview.pageCount || 1) },
                (_, i) => i + 1
              ).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    setPreviewPage(n);
                    setPreviewErr("");
                  }}
                  className={`h-8 min-w-8 px-2 rounded-md border text-xs ${
                    previewPage === n
                      ? "border-[#4a9eff] bg-[#eef6fe] text-[#2f6fc0]"
                      : "border-[#e4ebf3] text-[#7b8da0]"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            {previewErr ? (
              <p className="text-sm text-rose-600">{previewErr}</p>
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={`${pieceRefOf(preview)}-${previewPage}`}
              src={pageSrc(preview, previewPage)}
              alt={`${pieceRefOf(preview)}-p${previewPage}`}
              className="w-full max-h-[55vh] object-contain rounded-lg border border-[#e4ebf3] bg-[#f7fafd]"
              onError={() =>
                setPreviewErr("无法加载该页图片（可能尚未上传扫描件）")
              }
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!sourceField}
        title={`${sourceField?.label || ""} · 全部来源`}
        onClose={() => setSourceField(null)}
        width="lg"
      >
        <div className="space-y-2">
          {sourceField?.sources.map((s, i) => (
            <div
              key={i}
              className="rounded-lg border border-[#e4ebf3] px-3 py-2 text-sm break-words"
            >
              {sourceLabel(s)}：{s.value}
            </div>
          ))}
          {!sourceField?.sources.length ? (
            <p className="text-sm text-[#7b8da0]">暂无来源</p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={!!opinionField}
        title={`${opinionField?.label || ""} · AI意见`}
        onClose={() => setOpinionField(null)}
        width="md"
      >
        <p className="text-sm leading-7">{opinionField?.aiOpinion}</p>
      </Modal>

      <DeletePersonModal open={deletePersonOpen} initialCode={personCode}
        onClose={() => setDeletePersonOpen(false)}
        onDeleted={(result) => {
          setPersons((list) => list.filter((person) => person.personCode !== result.personCode));
          if (result.personCode === personCode) {
            setPersonCode("");
            setMaterials([]);
            setReport(null);
            setLoaded(false);
            setPreview(null);
            setSourceField(null);
            setOpinionField(null);
          }
          setTip(result.filesPending
            ? `人员信息已删除，${result.filesPending} 个上传文件待清理`
            : `已删除 ${result.personName}（${result.personCode}）的全部人员信息`);
        }} />

      <RuleEditorModal
        open={ruleOpen}
        title="审核查验规则（数据库 · 附件7/8）"
        value={`${auditRule}\n\n——完整性——\n${compRule}`}
        hint="此处保存规则说明文案。比对逻辑与完整性筛查仍按系统内置字段规则 / completeness_requirements 表执行；改文案不会立刻改变检验结果，需重新「开始检验」。"
        onClose={() => setRuleOpen(false)}
        onSave={async (next) => {
          const [a, c] = next.split("——完整性——");
          const res = await fetch("/api/audit/rules", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audit: (a || "").trim(),
              completeness: (c || "").trim(),
            }),
          });
          const j = await res.json();
          setAuditRule(j.data.audit);
          setCompRule(j.data.completeness);
          setTip(
            "规则文案已保存；比对/完整性仍按内置引擎与 completeness_requirements，请重新「开始检验」"
          );
        }}
      />
    </div>
  );
}
