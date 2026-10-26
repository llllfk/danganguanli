import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#eaf1f8]">
      <h2 className="text-2xl font-bold text-[#1f2d42]">404</h2>
      <p className="text-[#7b8da0]">未找到页面</p>
      <Link href="/policy" className="text-[#4a9eff] underline">
        返回政策问答
      </Link>
    </div>
  );
}
