export type InteractionTriggerType =
  | "ON_CLICK"
  | "ON_HOVER"
  | "ON_PRESS"
  | "ON_DRAG"
  | "AFTER_TIMEOUT"
  | "MOUSE_ENTER"
  | "MOUSE_LEAVE"
  | "MOUSE_UP"
  | "MOUSE_DOWN"
  | "ON_KEY_DOWN"
  | "ON_MEDIA_HIT"
  | "ON_MEDIA_END"
  | string;

export type InteractionActionType =
  | "NODE"
  | "URL"
  | "BACK"
  | "CLOSE"
  | "SET_VARIABLE"
  | "SET_VARIABLE_MODE"
  | "CONDITIONAL"
  | "UPDATE_MEDIA_RUNTIME"
  | string;

export type InteractionNavigation =
  | "NAVIGATE"
  | "SWAP"
  | "OVERLAY"
  | "SCROLL_TO"
  | "CHANGE_TO"
  | string;

export type InteractionEasing = {
  type: string;
  easingFunctionCubicBezier?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
};

export type InteractionTransition = {
  type: string;
  duration?: number;
  easing?: InteractionEasing | null;
  direction?: "LEFT" | "RIGHT" | "TOP" | "BOTTOM" | string;
  matchLayers?: boolean;
};

export type InteractionTrigger = {
  type: InteractionTriggerType;
  delay?: number;
  timeout?: number;
  keyCodes?: number[];
  mediaHitTime?: number;
};

export type InteractionAction = {
  type: InteractionActionType;
  destinationId?: string | null;
  navigation?: InteractionNavigation;
  transition?: InteractionTransition | null;
  url?: string;
  preserveScrollPosition?: boolean;
  overlayRelativePosition?: { x: number; y: number };
  variableId?: string | null;
  variableCollectionId?: string | null;
  variableModeId?: string | null;
  variableValue?: unknown;
  conditionalBlocks?: unknown[];
};

export type InteractionReaction = {
  sourceId: string;
  sourcePageId: string | null;
  trigger: InteractionTrigger;
  actions: InteractionAction[];
};

export type InteractionPage = {
  id: string;
  name: string;
  width: number;
  height: number;
};

export type InteractionNode = {
  id: string;
  name: string;
  type: string;
  pageId: string | null;
  parentId: string | null;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
};

export type InteractionModel = {
  version: 1;
  initialPageId: string | null;
  pages: InteractionPage[];
  nodes: InteractionNode[];
  reactions: InteractionReaction[];
};

export type CarouselNodeRole =
  | "root"
  | "slide"
  | "viewport"
  | "next"
  | "prev"
  | "pagination";

export type CarouselMetadata = {
  id: string;
  slides: string[];
  nodeRoles: Record<string, CarouselNodeRole[]>;
};

export type InteractionAttributesByNodeId = Record<
  string,
  Record<string, string | boolean>
>;
