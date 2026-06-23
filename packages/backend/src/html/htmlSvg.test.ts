import test from "node:test";
import assert from "node:assert/strict";
import { htmlMain } from "./htmlMain.ts";
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
  embedVectors: true,
  htmlGenerationMode: "html",
  interactiveHtmlExport: false,
  tailwindGenerationMode: "jsx",
  baseFontSize: 16,
  useTailwind4: true,
  thresholdPercent: 15,
  baseFontFamily: "",
  fontFamilyCustomConfig: {},
};

test("embedded SVG wrapper keeps the vector node size", async () => {
  const svgNode: any = {
    id: "svg-a",
    name: "page_nu_000",
    type: "VECTOR",
    visible: true,
    width: 14,
    height: 20,
    x: 0,
    y: 0,
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "FIXED",
    blendMode: "PASS_THROUGH",
    opacity: 1,
    canBeFlattened: true,
    svg: '<svg width="14" height="20" viewBox="0 0 14 20"></svg>',
  };

  const output = await htmlMain([svgNode] as SceneNode[], settings);

  assert.match(output.html, /data-svg-wrapper/);
  assert.match(output.html, /style="width: 14px; height: 20px"/);
});
