import { SiteFooter, SiteHeader } from "@/components/site-header";

export function LegalPage({
  title,
  version,
  children,
}: {
  title: string;
  version: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader action="track" />
      <main
        id="main"
        className="mx-auto max-w-2xl px-4 py-10 sm:px-6 [&_h2]:mt-8 [&_h2]:text-[20px] [&_h2]:font-semibold [&_li]:mt-1.5 [&_p]:mt-3 [&_p]:text-[16px] [&_p]:leading-relaxed [&_p]:text-ink-2 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-[16px] [&_ul]:text-ink-2"
      >
        <h1 className="text-[28px] font-bold">{title}</h1>
        <p className="!mt-1 !text-[14px] !text-ink-3">Version {version}</p>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
