import type { InteractionTrigger } from "./interactionTypes";

export const triggerDomEventByType: Record<string, string> = {
  ON_CLICK: "click",
  ON_PRESS: "click",
  ON_HOVER: "mouseenter",
  MOUSE_ENTER: "mouseenter",
  MOUSE_LEAVE: "mouseleave",
  MOUSE_DOWN: "mousedown",
  MOUSE_UP: "mouseup",
};

export const triggerTypeToDomEvent = (
  trigger: Pick<InteractionTrigger, "type"> | null | undefined,
): string | null => {
  if (!trigger?.type) {
    return null;
  }

  return triggerDomEventByType[trigger.type] ?? null;
};
