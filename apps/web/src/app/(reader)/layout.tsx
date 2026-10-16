import { MobileHeader, SiteFooter, SiteSidebar } from "@/components/reader/site-header";

export default function ReaderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:grid lg:grid-cols-[var(--sidebar-w)_minmax(0,1fr)]">
      <SiteSidebar />
      <div className="min-w-0">
        <MobileHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </div>
    </div>
  );
}
