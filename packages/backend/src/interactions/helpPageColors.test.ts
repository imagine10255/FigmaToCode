import test from "node:test";
import assert from "node:assert/strict";
import {
  collectHelpPageColorVars,
  renderHelpPageColorCSS,
} from "./helpPageColors.ts";
import { interactionRuntimeScript } from "./interactionRuntime.ts";

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
