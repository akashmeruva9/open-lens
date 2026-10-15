"use client";
import type { StoryBundle } from "@openlens/schemas";
import { useEffect, useRef } from "react";
import { impactedOutputIds } from "@/lib/data/derive";
import { ClaimEditor, type ClaimEdit } from "./claim-editor";

/** Claim whose change would ripple through the most outputs: the best demo candidate. */
export function pickDemoClaim(b: StoryBundle) {
  let best = b.claims[0];
  let bestN = -1;
  for (const c of b.claims) {
    const n = impactedOutputIds(b.outputs, [c.id]).length;
    if (n > bestN) {
      best = c;
      bestN = n;
    }
  }
  return best ? { claim: best, impacted: bestN } : null;
}

export function SimulateCorrectionDialog({
  bundle, open, onClose, onSubmit,
}: { bundle: StoryBundle; open: boolean; onClose: () => void; onSubmit: (claimId: string, patch: ClaimEdit) => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const pick = pickDemoClaim(bundle);

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="sim-title"
      className="m-auto w-[min(640px,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-black/50">
      {pick ? (
        <div className="p-5">
          <h2 id="sim-title" className="font-display text-xl font-semibold">Simulate a correction</h2>
          <p className="mt-1 text-sm text-ink-2">
            Editing this claim will flag <strong>{pick.impacted}</strong> dependent output{pick.impacted === 1 ? "" : "s"} (direct citations plus anything built on them) as <em>needs review</em>, bump the ledger version and log a public correction.
          </p>
          <div className="mt-4">
            {open ? (
              <ClaimEditor
                claim={pick.claim}
                preset={{
                  state: pick.claim.state === "contested" ? "unverified" : "contested",
                  reason: "New board notice disputes this figure; pending verification.",
                }}
                onCancel={onClose}
                onSubmit={async (patch) => {
                  await onSubmit(pick.claim.id, patch);
                  onClose();
                }}
              />
            ) : null}
          </div>
        </div>
      ) : (
        <div className="p-5">
          <p>No claims in this ledger yet.</p>
          <button type="button" onClick={onClose} className="mt-3 underline">Close</button>
        </div>
      )}
    </dialog>
  );
}
