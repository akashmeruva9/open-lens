"use client";
import type { Claim, EvidenceState } from "@openlens/schemas";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { EVIDENCE } from "@/lib/meta";

export interface ClaimEdit { text?: string; state?: EvidenceState; reason: string }

export function ClaimEditor({
  claim, onSubmit, onCancel, preset,
}: { claim: Claim; onSubmit: (patch: ClaimEdit) => Promise<void>; onCancel: () => void; preset?: Partial<ClaimEdit> }) {
  const [text, setText] = useState(preset?.text ?? claim.text);
  const [state, setState] = useState<EvidenceState>(preset?.state ?? claim.state);
  const [reason, setReason] = useState(preset?.reason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = text.trim() !== claim.text || state !== claim.state;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return setError("A reason is required. It is published in the correction log.");
    if (!changed) return setError("Nothing changed.");
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        ...(text.trim() !== claim.text ? { text: text.trim() } : {}),
        ...(state !== claim.state ? { state } : {}),
        reason: reason.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-line bg-surface-2/50 p-3" aria-label={`Edit claim ${claim.id}`}>
      <div>
        <label htmlFor={`ct-${claim.id}`} className="eyebrow">Claim text</label>
        <textarea id={`ct-${claim.id}`} value={text} onChange={(e) => setText(e.target.value)} rows={2}
          className="mt-1 w-full rounded-lg border border-line bg-surface p-2 text-sm text-ink" />
      </div>
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <div>
          <label htmlFor={`cs-${claim.id}`} className="eyebrow">Evidence state</label>
          <select id={`cs-${claim.id}`} value={state} onChange={(e) => setState(e.target.value as EvidenceState)}
            className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink">
            {Object.entries(EVIDENCE).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`cr-${claim.id}`} className="eyebrow">Reason (required, public)</label>
          <input id={`cr-${claim.id}`} value={reason} onChange={(e) => setReason(e.target.value)} required
            placeholder="e.g. Board minutes show the vote was 6-3"
            className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink" />
        </div>
      </div>
      {error ? <p role="alert" className="text-xs text-[var(--st-bad)]">{error}</p> : null}
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button size="sm" variant="primary" type="submit" disabled={busy || !reason.trim() || !changed}>
          {busy ? "Saving…" : "Save & propagate"}
        </Button>
      </div>
    </form>
  );
}
