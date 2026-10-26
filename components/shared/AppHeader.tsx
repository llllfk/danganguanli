export function AppHeader({ title }: { title?: string }) {
  return (
    <header className="relative h-[72px] bg-white border-b border-[#e4ebf3] flex items-center px-6 overflow-hidden">
      <div className="absolute right-0 top-0 h-full w-[55%] hr-header-ribbon opacity-95" />
      <div className="relative z-10 flex items-center gap-3">
        <span className="hr-gradient-text text-2xl font-bold tracking-wide">
          HR AI
        </span>
        <h1 className="text-xl font-bold text-[#1f2d42]">
          干部人事档案智能辅助系统
        </h1>
        <span className="ml-2 rounded-md border-2 border-[#a9cdf5] px-2 py-0.5 text-sm text-[#4a9eff]">
          V3.0
        </span>
        {title ? (
          <span className="ml-4 text-sm text-[#7b8da0]">/ {title}</span>
        ) : null}
      </div>
      <div className="relative z-10 ml-auto flex items-center gap-3 text-white">
        <span className="text-lg">档案管理员</span>
        <div className="h-10 w-10 rounded-full bg-gradient-to-b from-[#3d82d0] to-[#1f5ea0] border-2 border-white/40" />
      </div>
    </header>
  );
}
