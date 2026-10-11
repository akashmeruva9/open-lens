import { SiteFooter, SiteHeader } from "@/components/reader/site-header";

export default function ReaderLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}
