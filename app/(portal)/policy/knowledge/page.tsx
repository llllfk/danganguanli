import { Suspense } from "react";
import { KnowledgeBrowser } from "@/components/policy/KnowledgeBrowser";

export default function KnowledgePage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl bg-white shadow-card p-5 text-sm text-[#7b8da0]">
          加载知识库…
        </div>
      }
    >
      <KnowledgeBrowser />
    </Suspense>
  );
}
