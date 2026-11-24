import {
  htmlColor,
  processColorWithVariable,
} from "../html/builderImpl/htmlColor";
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
    | "--pager-side"
    | "--pager-font-size"
    | "--pager-font-family"
    | "--pager-font-weight",
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
 * 從 _HELP_PAGE 底下第一個文字圖層讀出顏色；_HELP_PAGE 挖空時改讀框本身：
 * - 填色：漸層 → 第一個與最後一個色標；兩個實色 → 上面的是字面上半、下面的是下緣；一個實色 → 上下同色
 * - 外框：最上層可見的實色 stroke
 * - 側面：第一個可見的 drop shadow
 * - 字型：文字圖層的字型
 * - 字級：文字圖層的 fontSize；沒有文字（頁碼是圖片）時取 _HELP_PAGE 的高度
 */
// 只輸出 px：插件匯出時會把 CSS 裡所有 px 統一包成 calc(px * var(--px2vw-ratio, 1))，
// 這裡先包會變成乘兩次比例。
const toScaledPx = (value: unknown) =>
  typeof value === "number" && value > 0
    ? `${Math.round(value * 100) / 100}px`
    : undefined;

// _HELP_PAGE 挖空（沒有可見子圖層）時，樣式直接設在框本身
export const isHollowHelpPage = (helpPage: any) =>
  !(helpPage?.children ?? []).some(isVisible);

// 字型名稱 → CSS 字型堆疊。已經是堆疊（含逗號）就原樣使用
const toFontStack = (family: unknown) => {
  if (typeof family !== "string" || !family.trim()) return undefined;
  const value = family.trim();
  if (value.includes(",")) return value;
  return `"${value.replace(/"/g, "")}", "Arial Black", sans-serif`;
};

// 字重：100～1000 的數字，或 CSS 關鍵字
const toFontWeight = (weight: unknown) => {
  const value = String(weight ?? "").trim().toLowerCase();
  if (/^\d{1,4}$/.test(value) && +value >= 1 && +value <= 1000) return value;
  return ["normal", "bold", "bolder", "lighter"].includes(value) ? value : undefined;
};

export const collectHelpPageColorVars = (helpPage: any): HelpPageColorVars => {
  const text = findFirstText(helpPage);
  const source = text ?? (isHollowHelpPage(helpPage) ? helpPage : null);
  if (!source) {
    // 頁碼是圖片（例如 page_nu_000 數字元件）：runtime 會改用系統字，字級取 _HELP_PAGE 的高度
    const fontSize = toScaledPx(helpPage?.height);
    return fontSize ? { "--pager-font-size": fontSize } : {};
  }

  const vars: HelpPageColorVars = {};

  // Figma 的 fills 陣列由下往上，面板上最上面那個是陣列最後一個
  const fills = (Array.isArray(source.fills) ? source.fills : []).filter(
    isVisible,
  );
  const fill: any = retrieveTopFill(fills);
  if (fill?.gradientStops?.length) {
    const stops = fill.gradientStops;
    const opacity = fill.opacity ?? 1;
    vars["--pager-face-top"] = stopColor(stops[0], opacity);
    vars["--pager-face-bottom"] = stopColor(stops[stops.length - 1], opacity);
  } else if (fill?.type === "SOLID") {
    // 兩個實色：上面那個是字面上半、下面那個是字面下緣；只有一個就上下同色
    const solids = fills.filter((paint: any) => paint.type === "SOLID");
    const below = solids.length > 1 ? solids[solids.length - 2] : fill;
    vars["--pager-face-top"] = solidColor(fill);
    vars["--pager-face-bottom"] = solidColor(below);
  }

  const stroke: any = retrieveTopFill(
    Array.isArray(source.strokes) ? source.strokes : [],
  );
  if (stroke?.type === "SOLID") {
    vars["--pager-edge"] = solidColor(stroke);
  }

  const shadow: any = (Array.isArray(source.effects) ? source.effects : []).find(
    (effect: any) => effect.type === "DROP_SHADOW" && isVisible(effect),
  );
  if (shadow?.color) {
    vars["--pager-side"] = processColorWithVariable({
      color: shadow.color,
      opacity: shadow.color.a ?? 1,
      variableColorName: shadow.variableColorName,
    });
  }

  const fontSize = toScaledPx(text ? text.fontSize : helpPage.height);
  if (fontSize) vars["--pager-font-size"] = fontSize;

  const family = toFontStack(
    text?.styledTextSegments?.[0]?.fontName?.family ?? text?.fontName?.family,
  );
  if (family) vars["--pager-font-family"] = family;

  const weight = toFontWeight(
    text?.styledTextSegments?.[0]?.fontWeight ?? text?.fontWeight,
  );
  if (weight) vars["--pager-font-weight"] = weight;

  // Figma 變數取名跟 --pager-* 同名時（例如 pager/edge），會寫出
  // --pager-edge: var(--pager-edge, ...) 自我參照，CSS 會整條作廢，只留預設值。改用色碼本身。
  (Object.keys(vars) as Array<keyof HelpPageColorVars>).forEach((name) => {
    const value = vars[name] as string;
    const selfRef = `var(${name}, `;
    if (value.startsWith(selfRef)) {
      vars[name] = value.slice(selfRef.length, -1);
    }
  });

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
      const entries: Array<[string, string]> = Object.entries(
        collectHelpPageColorVars(helpPage),
      ) as Array<[string, string]>;
      // 固定成 Figma 上的寬度：系統字寬度跟原本的數字圖片不同，不固定會從左邊往右長出去而偏移
      const width = toScaledPx(helpPage.width);
      // 文字比框寬時也要往兩側等量溢出；匯出的 inline style 是 flex-start，所以要 !important
      if (entries.length && width) {
        entries.push(
          ["width", width],
          ["display", "flex !important"],
          ["align-items", "center !important"],
          ["justify-content", "center !important"],
        );
      }
      // 樣式設在挖空的框本身時，填色／外框／陰影是給頁碼字用的，框自己不能畫出來
      if (entries.length && isHollowHelpPage(helpPage)) {
        entries.push(
          ["background", "none !important"],
          ["border", "none !important"],
          ["outline", "none !important"],
          ["box-shadow", "none !important"],
        );
      }
      const declarations = entries
        .map(([name, value]) => `  ${name}: ${value};`)
        .join("\n");
      if (!declarations) return "";
      const id = String(helpPage.id).replace(/"/g, '\\"');
      return `[data-fig-id="${id}"] {\n${declarations}\n}`;
    })
    .filter(Boolean)
    .join("\n\n");

export const hasHelpPage = (nodes: ReadonlyArray<any>) =>
  findHelpPages(nodes).length > 0;

/**
 * Figma 檔案裡的本地變數。只認 help 群組底下這些名稱，
 * 不用綁在任何圖層上，匯出時直接讀。顏色用 Color 變數，字型用 String 變數，
 * 字重用 Number（例如 900）或 String 變數。
 */
const HELP_PAGE_VARIABLE_TARGETS: Record<string, keyof HelpPageColorVars> = {
  "help/face-top": "--pager-face-top",
  "help/face-bottom": "--pager-face-bottom",
  "help/edge": "--pager-edge",
  "help/side": "--pager-side",
  "help/font-family": "--pager-font-family",
  "help/font-weight": "--pager-font-weight",
};

const TEXT_FORMATTERS: Partial<
  Record<keyof HelpPageColorVars, (value: string) => string | undefined>
> = {
  "--pager-font-family": toFontStack,
  "--pager-font-weight": toFontWeight,
};

type Rgba = { r: number; g: number; b: number; a?: number };

export type HelpPageVariable =
  | { name: string; color: Rgba }
  | { name: string; text: string };

const toCssVariableName = (name: string) =>
  name.trim().replaceAll("/", "-").replaceAll(" ", "-").replaceAll(",", "");

const findTarget = (name: unknown) =>
  HELP_PAGE_VARIABLE_TARGETS[String(name).trim().toLowerCase()];

/**
 * 所有 _HELP_PAGE 共用的一條規則。寫成 var(--help-xxx, 值)，宿主一樣可以在外層換掉。
 * 放在各 _HELP_PAGE 自己的規則（圖層上有綁變數或設樣式）前面，那邊的設定優先。
 */
export const renderHelpPageVariableCSS = (
  variables: ReadonlyArray<HelpPageVariable>,
): string => {
  const declarations = variables
    .map((variable) => {
      const target = findTarget(variable.name);
      if (!target) return "";
      const format = TEXT_FORMATTERS[target];
      const fallback =
        "color" in variable
          ? format
            ? undefined
            : htmlColor(variable.color as RGB, variable.color.a ?? 1)
          : format?.(variable.text);
      if (!fallback) return "";
      return `  ${target}: var(--${toCssVariableName(variable.name)}, ${fallback});`;
    })
    .filter(Boolean);
  if (!declarations.length) return "";
  return `[data-layer="${HELP_PAGE_LAYER}"] {\n${declarations.join("\n")}\n}`;
};

const isAlias = (value: any) => value && value.type === "VARIABLE_ALIAS";
const isColorValue = (value: any) =>
  value && typeof value === "object" && "r" in value;

/**
 * 從 Figma 讀出 help/* 本地變數（預設模式的值，別名會往下解）。
 * 不在 Figma 環境（例如測試）時回傳空陣列。
 */
export const loadHelpPageVariables = async (): Promise<HelpPageVariable[]> => {
  const api = (globalThis as any).figma?.variables;
  if (!api?.getLocalVariablesAsync) return [];

  const resolve = async (variable: any, depth = 0): Promise<any> => {
    if (!variable || depth > 5) return null;
    const collection = await api.getVariableCollectionByIdAsync(
      variable.variableCollectionId,
    );
    const value = variable.valuesByMode?.[collection?.defaultModeId];
    if (isAlias(value)) {
      return resolve(await api.getVariableByIdAsync(value.id), depth + 1);
    }
    return value ?? null;
  };

  const variables: any[] = await api.getLocalVariablesAsync();
  const found: HelpPageVariable[] = [];
  for (const variable of variables) {
    if (!findTarget(variable.name)) continue;
    const value = await resolve(variable);
    if (isColorValue(value)) found.push({ name: variable.name, color: value });
    else if (typeof value === "string" && value.trim()) {
      found.push({ name: variable.name, text: value });
    } else if (typeof value === "number") {
      found.push({ name: variable.name, text: String(value) });
    }
  }
  return found;
};
