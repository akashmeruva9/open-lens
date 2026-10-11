import Link from "next/link";

export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M16 3a13 13 0 0 1 0 26" fill="var(--brand)" />
      <circle cx="16" cy="16" r="4.5" fill="var(--bg)" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

export function Logo({ href = "/", suffix }: { href?: string; suffix?: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2 text-ink" aria-label="OpenLens home">
      <LogoMark />
      <span className="font-serif text-[19px] font-semibold tracking-tight">
        Open<span className="text-brand">Lens</span>
      </span>
      {suffix ? (
        <span className="ml-1 rounded-md border border-line px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-3">
          {suffix}
        </span>
      ) : null}
    </Link>
  );
}
