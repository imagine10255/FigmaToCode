import test from "node:test";
import assert from "node:assert/strict";
import {
  collectHelpPageColorVars,
  loadHelpPageVariables,
  renderHelpPageColorCSS,
  renderHelpPageVariableCSS,
} from "./helpPageColors.ts";
import {
  interactionRuntimeCSS,
  interactionRuntimeScript,
} from "./interactionRuntime.ts";
import { collectInteractionModel } from "./interactionModel.ts";

const rgb = (r: number, g: number, b: number, a = 1) => ({ r, g, b, a });

const createHelpPage = (text: any) => ({
  id: "12:34",
  name: "_HELP_PAGE",
  type: "FRAME",
  children: [
    {
      id: "12:35",
      name: "page",
      type: "INSTANCE",
      children: [text],
    },
  ],
});

test("reads face colors from a gradient fill, edge from stroke, side from drop shadow", () => {
  const vars = collectHelpPageColorVars(
    createHelpPage({
      id: "12:36",
      name: "01",
      type: "TEXT",
      fontSize: 20,
      fills: [
        {
          type: "GRADIENT_LINEAR",
          visible: true,
          opacity: 1,
          gradientStops: [
            { position: 0, color: rgb(1, 1, 1) },
            { position: 1, color: rgb(0, 0, 1) },
          ],
        },
      ],
      strokes: [{ type: "SOLID", visible: true, color: rgb(1, 0, 0) }],
      effects: [
        { type: "INNER_SHADOW", visible: true, color: rgb(0, 1, 0) },
        { type: "DROP_SHADOW", visible: true, color: rgb(0, 0, 0, 0.5) },
      ],
    }),
  );

  assert.deepEqual(vars, {
    "--pager-face-top": "white",
    "--pager-face-bottom": "#0000FF",
    "--pager-edge": "#FF0000",
    "--pager-side": "rgba(0, 0, 0, 0.50)",
    "--pager-font-size": "20px",
  });
});

test("solid fill sets both face colors and keeps Figma variable bindings", () => {
  const vars = collectHelpPageColorVars(
    createHelpPage({
      id: "12:36",
      name: "01",
      type: "TEXT",
      fills: [
        {
          type: "SOLID",
          visible: true,
          color: rgb(1, 1, 1),
          variableColorName: "help-page-face",
        },
      ],
      strokes: [],
      effects: [],
    }),
  );

  assert.deepEqual(vars, {
    "--pager-face-top": "var(--help-page-face, white)",
    "--pager-face-bottom": "var(--help-page-face, white)",
  });
});

test("renders one rule per _HELP_PAGE and skips pages without a text sample", () => {
  const css = renderHelpPageColorCSS([
    {
      id: "root",
      name: "Help",
      type: "FRAME",
      children: [
        createHelpPage({
          id: "12:36",
          name: "01",
          type: "TEXT",
          fills: [{ type: "SOLID", visible: true, color: rgb(1, 0, 0) }],
          strokes: [],
          effects: [],
        }),
        { id: "99:1", name: "_HELP_PAGE", type: "FRAME", children: [] },
      ],
    },
  ]);

  assert.match(css, /\[data-fig-id="12:34"\] \{/);
  assert.match(css, /--pager-face-top: #FF0000;/);
  assert.doesNotMatch(css, /99:1/);
});

test("runtime publishes _HELP_PAGE state and never overwrites host content", () => {
  assert.match(interactionRuntimeScript, /\[data-layer="_HELP_PAGE"\]/);
  assert.match(interactionRuntimeScript, /data-help-page-current/);
  assert.match(interactionRuntimeScript, /data-help-page-total/);
  assert.match(interactionRuntimeScript, /figma:help-page/);
  assert.match(interactionRuntimeScript, /window\.figmaHelpPage = \{/);
  assert.match(interactionRuntimeScript, /slidesUpdated slidesLengthChange/);
  // 未被宿主替換時，改寫 Figma 原稿裡的數字文字
  assert.match(interactionRuntimeScript, /data-help-page-role/);
  assert.match(interactionRuntimeScript, /\/\^\\d\+\$\//);
  assert.match(
    interactionRuntimeScript,
    /!targetPagination\.matches\(HELP_PAGE_SELECTOR\)/,
  );
});

test("runtime stamps each swiper-slide with the Figma layer name", () => {
  assert.match(interactionRuntimeScript, /function getSlideLayerName/);
  assert.match(
    interactionRuntimeScript,
    /slide\.setAttribute\("data-layer", slideLayerName\)/,
  );
});

test("interaction model keeps the main component id of instances", () => {
  const model = collectInteractionModel([
    {
      id: "32:17321",
      name: "動態調整",
      type: "INSTANCE",
      componentId: "32:9314",
      children: [],
    } as any,
    { id: "32:9314", name: "Property 1=a1", type: "COMPONENT", children: [] } as any,
  ]);

  assert.equal(model.nodes[0].componentId, "32:9314");
  assert.equal(model.nodes[1].componentId, undefined);
  assert.match(interactionRuntimeScript, /nodeById\.get\(node\.componentId\)/);
});

test("image-only page numbers fall back to the frame height for the font size", () => {
  const vars = collectHelpPageColorVars({
    id: "12:34",
    name: "_HELP_PAGE",
    type: "FRAME",
    height: 20,
    children: [
      { id: "12:40", name: "page_nu_000 2", type: "INSTANCE", children: [] },
    ],
  });

  assert.deepEqual(vars, {
    "--pager-font-size": "20px",
  });
});

test("runtime swaps image page numbers for system text styled by --pager-* vars", () => {
  assert.match(interactionRuntimeScript, /fig-help-pager/);
  assert.match(interactionRuntimeScript, /fig-help-pager__num" data-help-page-role="current"/);
  assert.match(interactionRuntimeScript, /fig-help-pager__num" data-help-page-role="total"/);
  assert.match(interactionRuntimeCSS, /\.fig-help-pager \{/);
  assert.match(interactionRuntimeCSS, /var\(--pager-edge, #4a1fb8\)/);
  assert.match(interactionRuntimeCSS, /var\(--pager-font-size, 20px\)/);
  assert.match(interactionRuntimeCSS, /\.fig-help-pager__num::after \{/);
  assert.match(interactionRuntimeCSS, /content: attr\(data-text\)/);
});

test("runtime renders the pager slash exactly like the digits", () => {
  assert.match(interactionRuntimeScript, /fig-help-pager__num fig-help-pager__slash" data-text="\/">\/</);
  // 斜線沒有自己的樣式，跟數字共用 .fig-help-pager__num
  assert.doesNotMatch(interactionRuntimeCSS, /\.fig-help-pager__slash/);
});

test("a single styled text layer drives every --pager-* var including the font", () => {
  const vars = collectHelpPageColorVars(
    createHelpPage({
      id: "12:36",
      name: "01 / 04",
      type: "TEXT",
      fontSize: 18,
      styledTextSegments: [{ fontName: { family: "Russo One", style: "Regular" } }],
      fills: [{ type: "SOLID", visible: true, color: rgb(1, 1, 1) }],
      strokes: [
        { type: "SOLID", visible: true, color: rgb(1, 0, 0), variableColorName: "pager-edge" },
      ],
      effects: [
        { type: "DROP_SHADOW", visible: true, color: rgb(0, 0, 0), variableColorName: "help-side" },
      ],
    }),
  );

  // 與 --pager-* 同名的 Figma 變數不能自我參照，否則 CSS 整條作廢
  assert.equal(vars["--pager-edge"], "#FF0000");
  assert.equal(vars["--pager-side"], "var(--help-side, black)");
  assert.equal(vars["--pager-font-size"], "18px");
  assert.equal(vars["--pager-font-family"], '"Russo One", "Arial Black", sans-serif');
});

test("pins _HELP_PAGE to its Figma width so system text stays centered", () => {
  const css = renderHelpPageColorCSS([
    { id: "12:34", name: "_HELP_PAGE", type: "FRAME", width: 70, height: 20, children: [] },
  ]);
  assert.match(css, /--pager-font-size: 20px;/);
  assert.match(css, /width: 70px;/);
  assert.match(css, /justify-content: center !important;/);
});

test("a hollow _HELP_PAGE frame carries the pager colors itself and stops painting them", () => {
  const helpPage = {
    id: "8025:5255",
    name: "_HELP_PAGE",
    type: "INSTANCE",
    width: 70,
    height: 20,
    children: [],
    // 面板由上往下：face-top、face-bottom；陣列由下往上
    fills: [
      { type: "SOLID", visible: true, color: rgb(0.894, 0.847, 1), variableColorName: "help-face-bottom" },
      { type: "SOLID", visible: true, color: rgb(1, 1, 1), variableColorName: "help-face-top" },
    ],
    strokes: [{ type: "SOLID", visible: true, color: rgb(0, 1, 0), variableColorName: "help-edge" }],
    effects: [{ type: "DROP_SHADOW", visible: true, color: rgb(0, 0.3, 0), variableColorName: "help-side" }],
  };

  const vars = collectHelpPageColorVars(helpPage);
  assert.equal(vars["--pager-face-top"], "var(--help-face-top, white)");
  assert.match(vars["--pager-face-bottom"]!, /^var\(--help-face-bottom, /);
  assert.match(vars["--pager-edge"]!, /^var\(--help-edge, /);
  assert.match(vars["--pager-side"]!, /^var\(--help-side, /);
  assert.equal(vars["--pager-font-size"], "20px");

  const css = renderHelpPageColorCSS([helpPage]);
  assert.match(css, /background: none !important;/);
  assert.match(css, /border: none !important;/);
  assert.match(css, /box-shadow: none !important;/);
  assert.match(css, /display: flex !important;/);
});

test("help/* local variables become shared --pager-* vars without binding any layer", () => {
  const css = renderHelpPageVariableCSS([
    { name: "help/face-top", color: rgb(1, 1, 1) },
    { name: "help/edge", color: rgb(0, 1, 0) },
    { name: "help/side", color: rgb(0, 0.2, 0) },
    { name: "other/edge", color: rgb(1, 0, 0) },
  ]);

  assert.match(css, /^\[data-layer="_HELP_PAGE"\] \{/);
  assert.match(css, /--pager-face-top: var\(--help-face-top, white\);/);
  assert.match(css, /--pager-edge: var\(--help-edge, #00FF00\);/);
  assert.match(css, /--pager-side: var\(--help-side, /);
  assert.doesNotMatch(css, /other/);
  assert.equal(renderHelpPageVariableCSS([]), "");
});

test("loads help/* variables from Figma, resolving aliases in the default mode", async () => {
  const collection = { id: "c1", defaultModeId: "m1" };
  const vars: Record<string, any> = {
    base: { id: "base", name: "brand/green", variableCollectionId: "c1", valuesByMode: { m1: rgb(0, 1, 0) } },
    edge: { id: "edge", name: "help/edge", variableCollectionId: "c1", valuesByMode: { m1: { type: "VARIABLE_ALIAS", id: "base" } } },
    top: { id: "top", name: "help/face-top", variableCollectionId: "c1", valuesByMode: { m1: rgb(1, 1, 1) } },
    font: { id: "font", name: "help/font-family", variableCollectionId: "c1", valuesByMode: { m1: "Russo One" } },
    weight: { id: "weight", name: "help/font-weight", variableCollectionId: "c1", valuesByMode: { m1: 900 } },
  };
  (globalThis as any).figma = {
    variables: {
      getLocalVariablesAsync: async () => Object.values(vars),
      getVariableCollectionByIdAsync: async () => collection,
      getVariableByIdAsync: async (id: string) => vars[id],
    },
  };
  try {
    const found = await loadHelpPageVariables();
    assert.deepEqual(
      found.map((v) => [v.name, "color" in v ? v.color : v.text]).sort(),
      [["help/edge", rgb(0, 1, 0)], ["help/face-top", rgb(1, 1, 1)], ["help/font-family", "Russo One"], ["help/font-weight", "900"]],
    );
  } finally {
    delete (globalThis as any).figma;
  }
});

test("help/font-family string variable sets the pager font, keeping a full stack as is", () => {
  const css = renderHelpPageVariableCSS([
    { name: "help/font-family", text: "Russo One" },
  ]);
  assert.match(
    css,
    /--pager-font-family: var\(--help-font-family, "Russo One", "Arial Black", sans-serif\);/,
  );
  assert.match(
    renderHelpPageVariableCSS([{ name: "help/font-family", text: "Impact, sans-serif" }]),
    /--pager-font-family: var\(--help-font-family, Impact, sans-serif\);/,
  );
  // 顏色變數取了字型的名字不輸出
  assert.equal(renderHelpPageVariableCSS([{ name: "help/font-family", color: rgb(1, 1, 1) }]), "");
});

test("help/font-weight sets the pager weight from a number or keyword, ignoring junk", () => {
  assert.match(
    renderHelpPageVariableCSS([{ name: "help/font-weight", text: "900" }]),
    /--pager-font-weight: var\(--help-font-weight, 900\);/,
  );
  assert.match(
    renderHelpPageVariableCSS([{ name: "help/font-weight", text: "Bold" }]),
    /--pager-font-weight: var\(--help-font-weight, bold\);/,
  );
  assert.equal(renderHelpPageVariableCSS([{ name: "help/font-weight", text: "heavy" }]), "");
  assert.match(interactionRuntimeCSS, /font-weight: var\(--pager-font-weight, 900\);/);
});

test("a text layer's font weight drives --pager-font-weight", () => {
  const vars = collectHelpPageColorVars(
    createHelpPage({
      id: "12:36",
      name: "01 / 04",
      type: "TEXT",
      styledTextSegments: [{ fontName: { family: "Roboto", style: "Black" }, fontWeight: 900 }],
      fills: [],
      strokes: [],
      effects: [],
    }),
  );
  assert.equal(vars["--pager-font-weight"], "900");
});

test("pager defaults: Roboto 900 with a 1.25x depth multiplier on the side shadow", () => {
  assert.match(interactionRuntimeCSS, /var\(--pager-font-family, "Roboto", "Arial Black", sans-serif\)/);
  assert.match(interactionRuntimeCSS, /--_depth: var\(--pager-depth, 1\.25\);/);
  assert.match(interactionRuntimeCSS, /calc\(\.0625em \* var\(--_depth\)\) 0 var\(--_side\)/);
});
