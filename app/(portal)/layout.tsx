import { AppHeader } from "@/components/shared/AppHeader";
import { SideNav } from "@/components/shared/SideNav";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[#eaf1f8]">
      <AppHeader />
      <div className="flex flex-1 min-h-0">
        <SideNav />
        <main className="flex-1 min-w-0 p-4 md:p-5">{children}</main>
      </div>
    </div>
  );
}
