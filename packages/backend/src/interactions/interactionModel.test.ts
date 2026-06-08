import test from "node:test";
import assert from "node:assert/strict";
import {
  collectCarouselAttributes,
  collectInteractionModel,
  normalizeReaction,
  serializeInteractionModel,
} from "./interactionModel.ts";
import { renderInteractionScripts } from "./interactionRuntime.ts";
import { triggerTypeToDomEvent } from "./triggerMapping.ts";

test("normalizes reactions with the current actions array", () => {
  const reaction = normalizeReaction("button-a", "frame-a", {
    trigger: { type: "ON_CLICK" },
    actions: [
      {
        type: "NODE",
        destinationId: "frame-b",
        navigation: "NAVIGATE",
      },
    ],
  });

  assert.deepEqual(reaction, {
    sourceId: "button-a",
    sourcePageId: "frame-a",
    trigger: { type: "ON_CLICK" },
    actions: [
      {
        type: "NODE",
        destinationId: "frame-b",
        navigation: "NAVIGATE",
      },
    ],
  });
});

test("normalizes legacy singular action reactions", () => {
  const reaction = normalizeReaction("button-a", "frame-a", {
    trigger: { type: "ON_CLICK" },
    action: {
      type: "URL",
      url: "https://example.com",
    },
  });

  assert.equal(reaction?.actions.length, 1);
  assert.deepEqual(reaction?.actions[0], {
    type: "URL",
    url: "https://example.com",
  });
});

test("maps supported prototype triggers to DOM events", () => {
  assert.equal(triggerTypeToDomEvent({ type: "ON_CLICK" }), "click");
  assert.equal(triggerTypeToDomEvent({ type: "ON_PRESS" }), "click");
  assert.equal(triggerTypeToDomEvent({ type: "ON_HOVER" }), "mouseenter");
  assert.equal(triggerTypeToDomEvent({ type: "MOUSE_LEAVE" }), "mouseleave");
  assert.equal(triggerTypeToDomEvent({ type: "ON_DRAG" }), "pointerdown");
  assert.equal(triggerTypeToDomEvent({ type: "AFTER_TIMEOUT" }), null);
});

test("serializes an interaction model as readable JSON", () => {
  const model = collectInteractionModel([
    {
      id: "frame-a",
      name: "Frame A",
      type: "FRAME",
      width: 320,
      height: 240,
      children: [],
    },
  ] as any);

  assert.match(serializeInteractionModel(model), /"version": 1/);
  assert.match(serializeInteractionModel(model), /"initialPageId": "frame-a"/);
});

test("fixture model emits click to navigate wiring", () => {
  const model = collectInteractionModel([
    {
      id: "frame-a",
      name: "Frame A",
      type: "FRAME",
      width: 320,
      height: 240,
      children: [
        {
          id: "button-a",
          name: "Button",
          type: "RECTANGLE",
          width: 80,
          height: 32,
          prototypeReactions: [
            {
              trigger: { type: "ON_CLICK" },
              actions: [
                {
                  type: "NODE",
                  destinationId: "frame-b",
                  navigation: "NAVIGATE",
                  transition: { type: "DISSOLVE", duration: 200 },
                },
              ],
            },
          ],
          children: [],
        },
      ],
    },
    {
      id: "frame-b",
      name: "Frame B",
      type: "FRAME",
      width: 320,
      height: 240,
      children: [],
    },
  ] as any);

  const scripts = renderInteractionScripts(model);

  assert.equal(model.reactions[0].sourceId, "button-a");
  assert.equal(model.reactions[0].actions[0].destinationId, "frame-b");
  assert.match(scripts, /"ON_CLICK": "click"/);
  assert.match(scripts, /showPage\(action\.destinationId/);
  assert.match(scripts, /"destinationId": "frame-b"/);
});

test("runtime includes best-effort variable and conditional handlers", () => {
  const scripts = renderInteractionScripts({
    version: 1,
    initialPageId: null,
    pages: [],
    nodes: [],
    reactions: [
      {
        sourceId: "button-a",
        sourcePageId: null,
        trigger: { type: "ON_CLICK" },
        actions: [
          {
            type: "SET_VARIABLE",
            variableId: "VariableID:1",
            variableValue: { type: "BOOLEAN", value: true },
          },
          {
            type: "CONDITIONAL",
            conditionalBlocks: [
              {
                condition: { type: "BOOLEAN", value: true },
                actions: [{ type: "CLOSE" }],
              },
            ],
          },
        ],
      },
    ],
  });

  assert.match(scripts, /state\.variables/);
  assert.match(scripts, /SET_VARIABLE/);
  assert.match(scripts, /CONDITIONAL/);
  assert.match(scripts, /evaluateExpression/);
});

test("change-to keeps the original instance shell for template variants", () => {
  const scripts = renderInteractionScripts({
    version: 1,
    initialPageId: null,
    pages: [],
    nodes: [
      {
        id: "instance-a",
        name: "Carousel",
        type: "INSTANCE",
        pageId: null,
        parentId: null,
        width: 830,
        height: 380,
        x: 0,
        y: 0,
      },
      {
        id: "variant-b",
        name: "Property 1=b",
        type: "COMPONENT",
        pageId: "variant-b",
        parentId: null,
        width: 830,
        height: 380,
        x: 0,
        y: 0,
      },
    ],
    reactions: [
      {
        sourceId: "instance-a",
        sourcePageId: null,
        trigger: { type: "ON_CLICK" },
        actions: [
          {
            type: "NODE",
            destinationId: "variant-b",
            navigation: "CHANGE_TO",
          },
        ],
      },
    ],
  });

  assert.match(scripts, /target\.innerHTML = destination\.innerHTML/);
  assert.match(scripts, /data-fig-current-variant-id/);
  assert.doesNotMatch(scripts, /target\.replaceWith\(destination\)/);
});

test("change-to runtime animates smart-animate variants", () => {
  const scripts = renderInteractionScripts({
    version: 1,
    initialPageId: null,
    pages: [],
    nodes: [],
    reactions: [
      {
        sourceId: "button-right",
        sourcePageId: null,
        trigger: { type: "ON_CLICK" },
        actions: [
          {
            type: "NODE",
            destinationId: "variant-b",
            navigation: "CHANGE_TO",
            transition: {
              type: "SMART_ANIMATE",
              duration: 1,
              easing: { type: "SLOW" },
            },
          },
        ],
      },
      {
        sourceId: "carousel",
        sourcePageId: null,
        trigger: { type: "ON_DRAG" },
        actions: [
          {
            type: "NODE",
            destinationId: "variant-c",
            navigation: "CHANGE_TO",
          },
        ],
      },
    ],
  });

  assert.match(scripts, /animateChangeTo/);
  assert.match(scripts, /findChangeViewportPair/);
  assert.match(scripts, /data-fig-change-viewport/);
  assert.match(scripts, /data-fig-drag-viewport/);
  assert.match(scripts, /isControlLikeLayer/);
  assert.match(scripts, /dragstart/);
  assert.match(scripts, /ensureSwiperLoaded/);
  assert.match(scripts, /swiper-bundle\.min\.js/);
  assert.match(scripts, /initFigmaSwiperCarousels/);
  assert.match(scripts, /__figmaSwiperDiagnostics/);
  assert.match(scripts, /carouselDragSuppressed/);
  assert.match(scripts, /delegatedClicks/);
  assert.match(scripts, /pageShows/);
  assert.match(scripts, /bindDelegatedNavigateReactions/);
  assert.match(scripts, /new SwiperConstructor/);
  assert.match(scripts, /allowTouchMove: true/);
  assert.match(scripts, /loop: false/);
  assert.match(scripts, /preventInteractionOnTransition: false/);
  assert.match(scripts, /simulateTouch: true/);
  assert.match(scripts, /watchOverflow: false/);
  assert.match(scripts, /viewport\.cloneNode\(false\)/);
  assert.match(scripts, /sourcePagination/);
  assert.match(scripts, /getActiveSwiperSlideRoot/);
  assert.match(scripts, /activeIndexChange/);
  assert.match(
    scripts,
    /templatePage\.setAttribute\("data-fig-page", pageId\)/,
  );
  assert.match(scripts, /type: "INSTANT"/);
  assert.match(scripts, /usedIndexes/);
  assert.match(scripts, /root\.setAttribute\("data-fig-carousel"/);
  assert.match(scripts, /root\.setAttribute\("data-fig-carousel-index"/);
  assert.match(scripts, /getDirectionalChangeAction/);
  assert.match(scripts, /inferNodeDirection/);
  assert.match(scripts, /runtimeTemplateById/);
  assert.match(scripts, /buildLinearDragChain/);
  assert.match(scripts, /cloneActionWithDestination/);
  assert.match(scripts, /createDragChangeState/);
  assert.match(scripts, /finishDragChangeState/);
  assert.match(scripts, /document\.addEventListener\("pointermove"/);
  assert.match(scripts, /translate3d/);
  assert.match(scripts, /cubic-bezier\(0\.2, 0, 0, 1\)/);
  assert.match(scripts, /bindDragReaction/);
  assert.match(
    scripts,
    /Math\.max\(Math\.abs\(deltaX\), Math\.abs\(deltaY\)\) < 24/,
  );
  assert.doesNotMatch(scripts, /setPointerCapture/);
  assert.doesNotMatch(
    scripts,
    /target\.__figmaChangeToAnimating = false;\n      commitChangeTo\(target, destination, destinationId\);\n      return;/,
  );
  assert.doesNotMatch(scripts, /function commitSwiperSlide/);
  assert.doesNotMatch(scripts, /commitSwiperSlide\(root, slideRoot\)/);
});

test("collects carousel export attributes from change-to variants", () => {
  const model = collectInteractionModel([
    {
      id: "carousel-a",
      name: "Carousel",
      type: "INSTANCE",
      width: 830,
      height: 380,
      children: [
        {
          id: "viewport-a",
          name: "Frame",
          type: "FRAME",
          parent: { id: "carousel-a" },
          width: 830,
          height: 380,
          x: 0,
          y: 0,
          children: [],
        },
        {
          id: "next-a",
          name: "btn_right",
          type: "INSTANCE",
          parent: { id: "carousel-a" },
          width: 65,
          height: 135,
          x: 825,
          y: 87,
          prototypeReactions: [
            {
              trigger: { type: "ON_CLICK" },
              actions: [
                {
                  type: "NODE",
                  destinationId: "carousel-b",
                  navigation: "CHANGE_TO",
                },
              ],
            },
          ],
          children: [],
        },
      ],
    },
    {
      id: "carousel-b",
      name: "Property 1=b",
      type: "COMPONENT",
      width: 830,
      height: 380,
      prototypeReactions: [
        {
          trigger: { type: "ON_DRAG" },
          actions: [
            {
              type: "NODE",
              destinationId: "carousel-c",
              navigation: "CHANGE_TO",
            },
          ],
        },
      ],
      children: [
        {
          id: "viewport-b",
          name: "Frame",
          type: "FRAME",
          parent: { id: "carousel-b" },
          width: 830,
          height: 380,
          x: 0,
          y: 0,
          children: [],
        },
      ],
    },
    {
      id: "carousel-c",
      name: "Property 1=c",
      type: "COMPONENT",
      width: 830,
      height: 380,
      children: [],
    },
  ] as any);

  const attributes = collectCarouselAttributes(model);

  assert.equal(attributes["carousel-a"]["fig-carousel"], "carousel-a");
  assert.equal(attributes["carousel-a"]["fig-carousel-root"], true);
  assert.equal(attributes["carousel-a"]["fig-carousel-slide"], true);
  assert.equal(attributes["carousel-b"]["fig-carousel-index"], "1");
  assert.equal(attributes["viewport-a"]["fig-carousel-viewport"], true);
  assert.equal(attributes["next-a"]["fig-carousel-next"], true);
});
