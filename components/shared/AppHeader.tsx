import { UserMenu } from "@/components/shared/UserMenu";

export function AppHeader({ title }: { title?: string }) {
  return (
    <header className="sticky top-0 z-50 min-h-[72px] bg-white border-b border-[#e4ebf3] flex items-center px-6 py-2 overflow-visible isolate">
      <div className="pointer-events-none absolute right-0 top-0 h-full w-[55%] hr-header-ribbon opacity-95" />
      <div className="relative z-10 flex items-center gap-3 min-w-0">
        <span className="hr-gradient-text text-2xl font-bold tracking-wide shrink-0">
          HR AI
        </span>
        <h1 className="text-xl font-bold text-[#1f2d42] truncate">
          干部人事档案智能辅助系统
        </h1>
        <span className="ml-2 shrink-0 rounded-md border-2 border-[#a9cdf5] px-2 py-0.5 text-sm text-[#4a9eff]">
          V3.0
        </span>
        {title ? (
          <span className="ml-4 text-sm text-[#7b8da0] shrink-0">/ {title}</span>
        ) : null}
      </div>
      <UserMenu />
    </header>
  );
}
