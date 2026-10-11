import { EventEmitter } from "node:events";
import type { StoryEventMsg } from "@openlens/schemas";

const bus = new EventEmitter();
bus.setMaxListeners(200);

export const emit = (storyId: string, msg: StoryEventMsg) => bus.emit(storyId, msg);
export function subscribe(storyId: string, fn: (m: StoryEventMsg) => void) {
  bus.on(storyId, fn);
  return () => {
    bus.off(storyId, fn);
  };
}
