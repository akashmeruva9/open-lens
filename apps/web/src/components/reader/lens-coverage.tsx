import { LENS } from "@/lib/meta";

const LANES = ["left", "center", "right"] as const;

/** Three-segment indicator of which lens lanes have coverage. */
export function LensCoverage({ lenses }: { lenses: string[] }) {
  const covered = LANES.filter((l) => lenses.includes(l));
  const label = covered.length
    ? `Perspectives covered: ${covered.map((l) => LENS[l].short).join(", ")}`
    : "No lens coverage yet";
  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <span className="sr-only">{label}</span>
      <span aria-hidden className="flex gap-0.5">
        {LANES.map((l) => (
          <span
            key={l}
            className="h-1.5 w-4 rounded-full"
            style={{ background: lenses.includes(l) ? `var(${LENS[l].tone})` : "var(--line)" }}
          />
        ))}
      </span>
      <span aria-hidden className="text-ink-3">{covered.length}/3 lenses</span>
    </span>
  );
}
