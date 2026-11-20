import { processColorWithVariable } from "../html/builderImpl/htmlColor";
import { retrieveTopFill } from "../common/retrieveFill";

export const HELP_PAGE_LAYER = "_HELP_PAGE";

/**
 * 分頁字效使用的顏色變數。名稱與宿主端的分頁 CSS 約定一致，
 * 掛在 _HELP_PAGE 上，宿主替換進去的內容可直接繼承。
 */
export type HelpPageColorVars = Partial<
  Record<
    | "--pager-face-top"
    | "--pager-face-bottom"
    | "--pager-edge"
    | "--pager-side",
    string
  >
>;

const isVisible = (item: any) => item && item.visible !== false;

const findFirstText = (node: any): any => {
  if (!isVisible(node)) return null;
  if (node.type === "TEXT") return node;
  for (const child of node.children ?? []) {
    const found = findFirstText(child);
    if (found) return found;
  }
  return null;
};

const stopColor = (stop: any, fillOpacity: number) =>
  processColorWithVariable({
    color: stop.color,
    opacity: (stop.color?.a ?? 1) * fillOpacity,
    variableColorName: stop.variableColorName,
  });

const solidColor = (paint: any) =>
  processColorWithVariable({
    color: paint.color,
    opacity: paint.opacity ?? 1,
    variableColorName: paint.variableColorName,
  });

/**
 * 從 _HELP_PAGE 底下第一個文字圖層讀出顏色：
 * - 填色：實色 → 字面上下同色；漸層 → 第一個與最後一個色標
 * - 外框：最上層可見的實色 stroke
 * - 側面：第一個可見的 drop shadow
 */
export const collectHelpPageColorVars = (helpPage: any): HelpPageColorVars => {
  const text = findFirstText(helpPage);
  if (!text) return {};

  const vars: HelpPageColorVars = {};

  const fill: any = retrieveTopFill(Array.isArray(text.fills) ? text.fills : []);
  if (fill?.type === "SOLID") {
    vars["--pager-face-top"] = solidColor(fill);
    vars["--pager-face-bottom"] = solidColor(fill);
  } else if (fill?.gradientStops?.length) {
    const stops = fill.gradientStops;
    const opacity = fill.opacity ?? 1;
    vars["--pager-face-top"] = stopColor(stops[0], opacity);
    vars["--pager-face-bottom"] = stopColor(stops[stops.length - 1], opacity);
  }

  const stroke: any = retrieveTopFill(
    Array.isArray(text.strokes) ? text.strokes : [],
  );
  if (stroke?.type === "SOLID") {
    vars["--pager-edge"] = solidColor(stroke);
  }

  const shadow: any = (Array.isArray(text.effects) ? text.effects : []).find(
    (effect: any) => effect.type === "DROP_SHADOW" && isVisible(effect),
  );
  if (shadow?.color) {
    vars["--pager-side"] = processColorWithVariable({
      color: shadow.color,
      opacity: shadow.color.a ?? 1,
      variableColorName: shadow.variableColorName,
    });
  }

  return vars;
};

const findHelpPages = (nodes: ReadonlyArray<any>): any[] => {
  const found: any[] = [];
  const visit = (node: any) => {
    if (!node) return;
    if ((node.name || "").trim() === HELP_PAGE_LAYER && node.id) {
      found.push(node);
    }
    (node.children ?? []).forEach(visit);
  };
  nodes.forEach(visit);
  return found;
};

/**
 * 每個 _HELP_PAGE 產生一條以 data-fig-id 為選擇器的規則。
 */
export const renderHelpPageColorCSS = (nodes: ReadonlyArray<any>): string =>
  findHelpPages(nodes)
    .map((helpPage) => {
      const declarations = Object.entries(collectHelpPageColorVars(helpPage))
        .map(([name, value]) => `  ${name}: ${value};`)
        .join("\n");
      if (!declarations) return "";
      const id = String(helpPage.id).replace(/"/g, '\\"');
      return `[data-fig-id="${id}"] {\n${declarations}\n}`;
    })
    .filter(Boolean)
    .join("\n\n");
