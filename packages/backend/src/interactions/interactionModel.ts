import type {
  InteractionAction,
  InteractionModel,
  InteractionNode,
  InteractionPage,
  InteractionReaction,
  InteractionTrigger,
} from "./interactionTypes";

const pageNodeTypes = new Set([
  "FRAME",
  "COMPONENT",
  "INSTANCE",
  "COMPONENT_SET",
  "SECTION",
]);

const jsonClone = <T>(value: T): T => {
  if (value === null || value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
};

export const serializePrototypeReactions = (reactions: unknown): unknown[] => {
  if (!Array.isArray(reactions)) {
    return [];
  }

  return reactions.map((reaction) => jsonClone(reaction));
};

const normalizeActions = (reaction: any): InteractionAction[] => {
  if (Array.isArray(reaction?.actions)) {
    return reaction.actions
      .filter((action: any) => action?.type)
      .map((action: any) => jsonClone(action));
  }

  if (reaction?.action?.type) {
    return [jsonClone(reaction.action)];
  }

  return [];
};

const normalizeTrigger = (trigger: any): InteractionTrigger | null => {
  if (!trigger?.type) {
    return null;
  }

  return jsonClone(trigger);
};

export const normalizeReaction = (
  sourceId: string,
  sourcePageId: string | null,
  reaction: unknown,
): InteractionReaction | null => {
  const trigger = normalizeTrigger((reaction as any)?.trigger);
  const actions = normalizeActions(reaction);

  if (!trigger || actions.length === 0) {
    return null;
  }

  return {
    sourceId,
    sourcePageId,
    trigger,
    actions,
  };
};

const isPageNode = (node: any, parentPageId: string | null) =>
  parentPageId === null && pageNodeTypes.has(node?.type);

const toInteractionPage = (node: any): InteractionPage => ({
  id: node.id,
  name: node.name || node.id,
  width: typeof node.width === "number" ? node.width : 0,
  height: typeof node.height === "number" ? node.height : 0,
});

const toInteractionNode = (
  node: any,
  pageId: string | null,
): InteractionNode => ({
  id: node.id,
  name: node.name || node.id,
  type: node.type || "UNKNOWN",
  pageId,
  parentId: node.parent?.id ?? null,
  width: typeof node.width === "number" ? node.width : undefined,
  height: typeof node.height === "number" ? node.height : undefined,
  x: typeof node.x === "number" ? node.x : undefined,
  y: typeof node.y === "number" ? node.y : undefined,
});

export const collectInteractionModel = (
  sceneNodes: ReadonlyArray<SceneNode>,
): InteractionModel => {
  const pages: InteractionPage[] = [];
  const nodes: InteractionNode[] = [];
  const reactions: InteractionReaction[] = [];

  const visit = (node: any, inheritedPageId: string | null) => {
    if (!node?.id) {
      return;
    }

    const pageId = isPageNode(node, inheritedPageId)
      ? node.id
      : inheritedPageId;

    if (pageId === node.id) {
      pages.push(toInteractionPage(node));
    }

    nodes.push(toInteractionNode(node, pageId));

    const nodeReactions =
      Array.isArray(node.prototypeReactions) && node.prototypeReactions.length
        ? node.prototypeReactions
        : node.reactions;

    if (Array.isArray(nodeReactions)) {
      for (const reaction of nodeReactions) {
        const normalized = normalizeReaction(node.id, pageId, reaction);
        if (normalized) {
          reactions.push(normalized);
        }
      }
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        visit(child, pageId);
      }
    }
  };

  for (const node of sceneNodes) {
    visit(node, null);
  }

  return {
    version: 1,
    initialPageId: pages[0]?.id ?? null,
    pages,
    nodes,
    reactions,
  };
};

export const serializeInteractionModel = (model: InteractionModel): string =>
  JSON.stringify(model, null, 2);

export const collectInteractionDestinationIds = (
  sceneNodes: ReadonlyArray<SceneNode>,
): string[] => {
  const model = collectInteractionModel(sceneNodes);
  const ids = new Set<string>();

  for (const reaction of model.reactions) {
    for (const action of reaction.actions) {
      if (action.type === "NODE" && action.destinationId) {
        ids.add(action.destinationId);
      }
    }
  }

  return [...ids];
};
