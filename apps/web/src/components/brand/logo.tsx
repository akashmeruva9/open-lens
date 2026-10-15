import Link from "next/link";

/**
 * OpenLens mark: a heavy lens ring with an accent aperture segment and a solid pupil.
 * Own artwork; colours come from tokens so it works in light and dark.
 */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="12.25" fill="none" stroke="currentColor" strokeWidth="4.5" />
      <path d="M16 3.75A12.25 12.25 0 0 1 28.25 16H22a6 6 0 0 0-6-6z" fill="var(--accent)" />
      <circle cx="16" cy="16" r="3.4" fill="currentColor" />
    </svg>
  );
}

export function Logo({ href = "/", suffix, size = "md" }: { href?: string; suffix?: string; size?: "md" | "lg" }) {
  return (
    <Link href={href} className="group inline-flex shrink-0 items-center gap-2 rounded-md text-ink" aria-label={suffix ? `OpenLens ${suffix} home` : "OpenLens home"}>
      <LogoMark size={size === "lg" ? 34 : 26} />
      <span className={`font-display font-extrabold leading-none tracking-[-0.04em] ${size === "lg" ? "text-[30px]" : "text-[22px]"}`}>
        openlens
      </span>
      {suffix ? (
        <span className="ml-0.5 rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold leading-4 text-bg">{suffix}</span>
      ) : null}
    </Link>
  );
}
