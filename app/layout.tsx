import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "干部人事档案智能辅助系统",
  description: "政策问答 · 智能整编 · 审核查验 · 人才分析",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
