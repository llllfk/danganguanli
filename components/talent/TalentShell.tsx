import { TalentNav } from "./TalentNav";

export function TalentShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-[calc(100vh-110px)] overflow-auto">
      <div className="rounded-2xl bg-white shadow-card min-h-full flex flex-col">
        <div className="px-5 pt-4 pb-0">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="inline-flex h-8 w-7 items-center justify-center rounded border border-[#9cc4f5] text-[#9cc4f5]">
              <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
                <rect
                  x="1"
                  y="2"
                  width="12"
                  height="13"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M4 6h6M4 9h6M4 12h4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <h1 className="text-lg font-semibold text-[#243b53]">{title}</h1>
          </div>
          <TalentNav />
        </div>
        <div className="flex-1 px-5 pb-5 pt-1">{children}</div>
      </div>
    </div>
  );
}
