import test from "node:test";
import assert from "node:assert/strict";
import {
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
