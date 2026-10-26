"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#eaf1f8]">
      <h2 className="text-xl font-bold text-[#1f2d42]">页面出错了</h2>
      <p className="text-sm text-[#7b8da0]">{error.message}</p>
      <button
        className="rounded-lg bg-[#4a9eff] px-4 py-2 text-white"
        onClick={reset}
      >
        重试
      </button>
    </div>
  );
}
