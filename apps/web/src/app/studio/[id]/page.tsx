import { Suspense } from "react";
import { StoryWorkspace } from "@/components/studio/story-workspace";

export default async function StudioStoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<p className="py-20 text-center text-sm text-ink-3">Loading…</p>}>
      <StoryWorkspace id={id} />
    </Suspense>
  );
}
