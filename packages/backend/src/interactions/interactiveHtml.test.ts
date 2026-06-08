import test from "node:test";
import assert from "node:assert/strict";
import { htmlMain } from "../html/htmlMain.ts";
import { interactiveHtmlMain } from "./interactiveHtml.ts";
import type { PluginSettings } from "types";

(globalThis as any).figma = { mixed: Symbol("figma.mixed") };

const settings: PluginSettings = {
  framework: "HTML",
  showLayerNames: true,
  useOldPluginVersion2025: false,
  responsiveRoot: false,
  flutterGenerationMode: "snippet",
  swiftUIGenerationMode: "snippet",
  composeGenerationMode: "snippet",
  roundTailwindValues: true,
  roundTailwindColors: true,
  useColorVariables: true,
  customTailwindPrefix: "",
  embedImages: true,
  embedVectors: false,
  htmlGenerationMode: "html",
  interactiveHtmlExport: false,
  tailwindGenerationMode: "jsx",
  baseFontSize: 16,
  useTailwind4: true,
  thresholdPercent: 15,
  baseFontFamily: "",
  fontFamilyCustomConfig: {},
};

const createFixture = () => {
  const frame: any = {
    id: "frame-a",
    name: "Frame A",
    type: "FRAME",
    visible: true,
    width: 320,
    height: 240,
    x: 0,
    y: 0,
    layoutMode: "NONE",
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "FIXED",
    blendMode: "PASS_THROUGH",
    opacity: 1,
    fills: [],
    strokes: [],
    strokeWeight: 0,
    effects: [],
    children: [],
  };
  const button: any = {
    id: "button-a",
    name: "Button A",
    type: "RECTANGLE",
    visible: true,
    parent: frame,
    width: 80,
    height: 32,
    x: 12,
    y: 16,
    layoutPositioning: "ABSOLUTE",
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "FIXED",
    blendMode: "PASS_THROUGH",
    opacity: 1,
    fills: [],
    strokes: [],
    strokeWeight: 0,
    effects: [],
    prototypeReactions: [
      {
        trigger: { type: "ON_CLICK" },
        actions: [
          {
            type: "NODE",
            destinationId: "frame-b",
            navigation: "NAVIGATE",
          },
        ],
      },
    ],
  };

  frame.children = [button];
  return [frame] as SceneNode[];
};

test("static HTML export does not stamp interaction attributes", async () => {
  const output = await htmlMain(createFixture(), settings);

  assert.doesNotMatch(output.html, /data-fig-id/);
  assert.doesNotMatch(output.html, /figma-interaction-model/);
});

test("interactive HTML export stamps nodes and embeds runtime", async () => {
  const output = await interactiveHtmlMain(createFixture(), settings);

  assert.match(output.html, /data-fig-id="frame-a"/);
  assert.match(output.html, /data-fig-page="frame-a"/);
  assert.match(output.html, /data-fig-id="button-a"/);
  assert.match(output.html, /figma-interaction-model/);
  assert.match(output.html, /"sourceId": "button-a"/);
  assert.match(output.css ?? "", /data-fig-page/);
});
