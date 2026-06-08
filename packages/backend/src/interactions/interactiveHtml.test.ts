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

const createCarouselFixture = () => {
  const carousel: any = {
    id: "carousel-a",
    name: "Carousel",
    type: "INSTANCE",
    visible: true,
    width: 830,
    height: 380,
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
  const viewport: any = {
    id: "viewport-a",
    name: "Frame",
    type: "FRAME",
    visible: true,
    parent: carousel,
    width: 830,
    height: 380,
    x: 0,
    y: 0,
    layoutPositioning: "ABSOLUTE",
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
  const next: any = {
    id: "next-a",
    name: "btn_right",
    type: "INSTANCE",
    visible: true,
    parent: carousel,
    width: 65,
    height: 135,
    x: 825,
    y: 87,
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
            destinationId: "carousel-b",
            navigation: "CHANGE_TO",
          },
        ],
      },
    ],
    children: [],
  };
  const variant: any = {
    id: "carousel-b",
    name: "Property 1=b",
    type: "COMPONENT",
    visible: true,
    width: 830,
    height: 380,
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

  carousel.children = [viewport, next];
  return { sceneNodes: [carousel] as SceneNode[], templateNodes: [variant] };
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

test("interactive HTML export stamps carousel attributes", async () => {
  const fixture = createCarouselFixture();
  const output = await interactiveHtmlMain(
    fixture.sceneNodes,
    settings,
    false,
    fixture.templateNodes as SceneNode[],
  );

  assert.match(output.html, /data-fig-carousel="carousel-a"/);
  assert.match(output.html, /data-fig-carousel-root/);
  assert.match(output.html, /data-fig-carousel-slide/);
  assert.match(output.html, /data-fig-carousel-viewport/);
  assert.match(output.html, /data-fig-carousel-next/);
});
