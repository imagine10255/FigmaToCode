import type {
  CarouselMetadata,
  InteractionAction,
  InteractionAttributesByNodeId,
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

const getChangeActions = (reaction: InteractionReaction): InteractionAction[] =>
  reaction.actions.filter(
    (action) =>
      action.type === "NODE" &&
      action.navigation === "CHANGE_TO" &&
      Boolean(action.destinationId),
  );

const isClickTrigger = (reaction: InteractionReaction) =>
  reaction.trigger.type === "ON_CLICK" || reaction.trigger.type === "ON_PRESS";

const isForwardNode = (
  node: InteractionNode | undefined,
  rootWidth: number,
) => {
  const name = (node?.name || "").toLowerCase();

  if (
    name.includes("right") ||
    name.includes("next") ||
    name.includes("forward")
  ) {
    return true;
  }

  if (name.includes("left") || name.includes("prev") || name.includes("back")) {
    return false;
  }

  if (
    typeof node?.x === "number" &&
    typeof node.width === "number" &&
    rootWidth > 0
  ) {
    return node.x + node.width / 2 >= rootWidth / 2;
  }

  return true;
};

const isControlLikeNode = (node: InteractionNode | undefined) => {
  const name = (node?.name || "").toLowerCase();

  return (
    name.includes("page") ||
    name.includes("pagination") ||
    name.includes("btn") ||
    name.includes("button") ||
    name.includes("arrow") ||
    name.includes("left") ||
    name.includes("right") ||
    name.includes("prev") ||
    name.includes("next")
  );
};

const isPaginationNode = (node: InteractionNode | undefined) => {
  const name = (node?.name || "").toLowerCase();
  return name.includes("page") || name.includes("pagination");
};

const isViewportCandidate = (
  node: InteractionNode | undefined,
  root: InteractionNode,
) => {
  if (!node || isControlLikeNode(node)) {
    return false;
  }

  const rootWidth = root.width ?? 0;
  const rootHeight = root.height ?? 0;
  const width = node.width ?? 0;
  const height = node.height ?? 0;
  const x = node.x ?? 0;
  const y = node.y ?? 0;

  return (
    width >= rootWidth * 0.45 &&
    height >= rootHeight * 0.45 &&
    Math.abs(x) <= Math.max(12, rootWidth * 0.08) &&
    Math.abs(y) <= Math.max(12, rootHeight * 0.08)
  );
};

const addRole = (
  roles: Record<string, Set<string>>,
  nodeId: string | undefined,
  role: string,
) => {
  if (!nodeId) return;
  roles[nodeId] = roles[nodeId] || new Set<string>();
  roles[nodeId].add(role);
};

export const collectCarouselMetadata = (
  model: InteractionModel,
): CarouselMetadata[] => {
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string, InteractionNode[]>();

  for (const node of model.nodes) {
    if (!node.parentId) continue;
    const children = childrenByParent.get(node.parentId) || [];
    children.push(node);
    childrenByParent.set(node.parentId, children);
  }

  const forwardDestinationByRoot = new Map<string, string>();
  for (const reaction of model.reactions) {
    const source = nodeById.get(reaction.sourceId);
    if (!source) continue;
    const actions = getChangeActions(reaction);
    if (!actions.length) continue;

    if (reaction.trigger.type === "ON_DRAG") {
      forwardDestinationByRoot.set(
        reaction.sourceId,
        String(actions[0].destinationId),
      );
      continue;
    }

    if (!isClickTrigger(reaction) || !source.parentId) continue;
    const root = nodeById.get(source.parentId);
    if (!root || !isForwardNode(source, root.width ?? 0)) continue;
    forwardDestinationByRoot.set(
      source.parentId,
      String(actions[0].destinationId),
    );
  }

  const metadata: CarouselMetadata[] = [];
  const seenRoots = new Set<string>();

  for (const [rootId] of forwardDestinationByRoot) {
    if (seenRoots.has(rootId)) continue;

    const slides = [rootId];
    const visited = new Set(slides);
    let currentId = rootId;

    while (currentId) {
      const destinationId = forwardDestinationByRoot.get(currentId);
      if (!destinationId || visited.has(destinationId)) break;
      slides.push(destinationId);
      visited.add(destinationId);
      currentId = destinationId;
    }

    if (slides.length < 2) continue;
    slides.forEach((slideId) => seenRoots.add(slideId));

    const nodeRoles: Record<string, Set<string>> = {};
    const carouselId = slides[0];

    slides.forEach((slideId) => {
      const root = nodeById.get(slideId);
      addRole(nodeRoles, slideId, "root");
      addRole(nodeRoles, slideId, "slide");

      const children = childrenByParent.get(slideId) || [];
      const viewport = children
        .filter((child) => root && isViewportCandidate(child, root))
        .sort(
          (left, right) =>
            (right.width ?? 0) * (right.height ?? 0) -
            (left.width ?? 0) * (left.height ?? 0),
        )[0];
      addRole(nodeRoles, viewport?.id, "viewport");

      children
        .filter(isPaginationNode)
        .forEach((child) => addRole(nodeRoles, child.id, "pagination"));

      model.reactions
        .filter((reaction) => isClickTrigger(reaction))
        .forEach((reaction) => {
          const source = nodeById.get(reaction.sourceId);
          if (!source || source.parentId !== slideId) return;
          if (!getChangeActions(reaction).length) return;
          addRole(
            nodeRoles,
            source.id,
            isForwardNode(source, root?.width ?? 0) ? "next" : "prev",
          );
        });
    });

    metadata.push({
      id: carouselId,
      slides,
      nodeRoles: Object.fromEntries(
        Object.entries(nodeRoles).map(([nodeId, roles]) => [
          nodeId,
          [...roles] as CarouselMetadata["nodeRoles"][string],
        ]),
      ),
    });
  }

  return metadata;
};

export const collectCarouselAttributes = (
  model: InteractionModel,
): InteractionAttributesByNodeId => {
  const attributes: InteractionAttributesByNodeId = {};

  collectCarouselMetadata(model).forEach((carousel) => {
    carousel.slides.forEach((slideId, index) => {
      attributes[slideId] = {
        ...attributes[slideId],
        "fig-carousel": carousel.id,
        "fig-carousel-index": String(index),
        "fig-carousel-slide": true,
      };
    });

    Object.entries(carousel.nodeRoles).forEach(([nodeId, roles]) => {
      const nextAttributes = {
        ...attributes[nodeId],
        "fig-carousel": carousel.id,
      };

      roles.forEach((role) => {
        nextAttributes[`fig-carousel-${role}`] = true;
      });

      attributes[nodeId] = nextAttributes;
    });
  });

  return attributes;
};
