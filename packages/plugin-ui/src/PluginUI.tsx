import GradientsPanel from "./components/GradientsPanel";
import copy from "copy-to-clipboard";
import EmptyState from "./components/EmptyState";
import WarningsPanel from "./components/WarningsPanel";
import {
  HTMLPreview,
  IframePreviewPayload,
  LinearGradientConversion,
  PluginSettings,
  SelectionPreviewNode,
  SolidColorConversion,
  Warning,
} from "types";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ChevronDownIcon,
  DownloadIcon,
  GlobeIcon,
  LanguagesIcon,
  MonitorPlayIcon,
  SettingsIcon,
  AlertTriangleIcon,
  LayoutGridIcon,
  Maximize2Icon,
  SlidersHorizontalIcon,
  TimerIcon,
  TypeIcon,
  XIcon,
} from "lucide-react";
import React from "react";
import { Button } from "./components/ui/button";
import { ScrollArea } from "./components/ui/scroll-area";
import { TooltipProvider } from "./components/ui/tooltip";
import { pluginUiConfig } from "./pluginUiConfig";

type PluginUIProps = {
  code: string;
  htmlPreview: HTMLPreview;
  warnings: Warning[];
  selectedFramework: string;
  setSelectedFramework: (framework: string) => void;
  settings: PluginSettings | null;
  onPreferenceChanged: (
    key: keyof PluginSettings,
    value: PluginSettings[keyof PluginSettings],
  ) => void;
  colors: SolidColorConversion[];
  gradients: LinearGradientConversion[];
  isLoading: boolean;
  selectionNodes: SelectionPreviewNode[];
  activePreviewNodeId: string | null;
  isPreviewLoading: boolean;
  isDownloadLoading: boolean;
  downloadProgress: number;
  downloadProgressLabel: string;
  previewUrl: string;
  previewPayload: IframePreviewPayload;
  previewRefreshKey: number;
  includeRelatedFrames: boolean;
  pluginVersion?: string;
  onPreviewUrlChanged?: (url: string) => void;
  onDownloadHtmlZip?: (
    extractImages: boolean,
    interactiveHtmlExport: boolean,
    extractCodeAssets: boolean,
    autoInitializeInteractions: boolean,
    usePx2vw: boolean,
    nodeIds?: string[],
  ) => void;
  onDownloadNode?: (
    nodeId: string,
    extractImages: boolean,
    interactiveHtmlExport: boolean,
    extractCodeAssets: boolean,
    autoInitializeInteractions: boolean,
    usePx2vw: boolean,
  ) => void;
  onPreviewNode?: (nodeId: string) => void;
  onIncludeRelatedFramesChange?: (enabled: boolean) => void;
  // "Preview download": the exact html of the zip, shown inside the plugin.
  downloadPreviewHtml?: string;
  isDownloadPreviewLoading?: boolean;
  onPreviewDownload?: DownloadNodeHandler;
  exportOptions?: ExportOptions;
  onExportOptionsChange?: (options: ExportOptions) => void;
  exportTiming?: ExportTimingReport;
  onDownloadPreviewLoaded?: () => void;
  // Fonts the preview carries itself, so they are not missing even if this window lacks them.
  bundledPreviewFonts?: string[];
  fontReport?: FontReport;
  isFontCheckLoading?: boolean;
  onCheckFonts?: (nodeIds: string[]) => void;
  onSelectLayers?: (layerIds: string[]) => void;
  gridPreviews?: GridPreviewItem[];
  onPreviewGrid?: (
    nodeIds: string[],
    extractImages: boolean,
    interactiveHtmlExport: boolean,
    extractCodeAssets: boolean,
    autoInitializeInteractions: boolean,
    usePx2vw: boolean,
  ) => void;
};

type DownloadNodeHandler = (
  nodeId: string,
  extractImages: boolean,
  interactiveHtmlExport: boolean,
  extractCodeAssets: boolean,
  autoInitializeInteractions: boolean,
  usePx2vw: boolean,
) => void;

// Widths the downloaded page can be shown at. The page scales with the browser width
// (px2vw), so a fixed width is drawn at that width and shrunk to fit the panel.
const DOWNLOAD_PREVIEW_WIDTHS: { label: string; width: number | null }[] = [
  { label: "符合面板", width: null },
  { label: "1440 px", width: 1440 },
  { label: "1920 px", width: 1920 },
];

const DownloadPreviewFrame = ({
  html,
  width,
  onLoad,
}: {
  html: string;
  width: number | null;
  onLoad?: () => void;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Measured right away as well as on resize, so the page is scaled from the first frame
  // even where the observer is late to report.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const measure = () =>
      setSize({ width: container.clientWidth, height: container.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const scale = width && size.width ? size.width / width : 1;

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <iframe
        srcDoc={html}
        title="Download preview"
        onLoad={onLoad}
        className="absolute left-0 top-0 border-0 bg-white"
        // Scripts only: the page runs as in a browser but cannot reach the plugin.
        sandbox="allow-scripts"
        style={
          width
            ? {
                width,
                height: size.height / scale,
                transform: `scale(${scale})`,
                transformOrigin: "0 0",
              }
            : { width: "100%", height: "100%" }
        }
      />
    </div>
  );
};

const DEFAULT_PREVIEW_URL = "https://help.gdg168.com/";
const PREVIEW_URL_STORAGE_KEY = "bitstackPreviewUrl";
// build 時由 apps/plugin/vite.config.ts 帶入（vYYMMDD-HHmm），用來確認 Figma 載入的是哪一次 build
declare const __PANEL_BUILD_VERSION__: string | undefined;
const PANEL_VERSION =
  typeof __PANEL_BUILD_VERSION__ !== "undefined" ? __PANEL_BUILD_VERSION__ : "dev";
const DEFAULT_WINDOW_SIZE = { width: 450, height: 700 };
const PREVIEW_PANEL_WIDTH = 1050;
const PREVIEW_WINDOW_WIDTH = 1430;
const getPreviewWindowHeight = () => {
  if (typeof window === "undefined") {
    return 900;
  }

  return Math.max(700, Math.floor(window.screen.availHeight));
};

const getTargetOrigin = (url: string) => {
  try {
    return new URL(url).origin;
  } catch (_error) {
    return null;
  }
};

const getStoredPreviewUrl = () => {
  try {
    return window.localStorage.getItem(PREVIEW_URL_STORAGE_KEY);
  } catch (_error) {
    return null;
  }
};

const setStoredPreviewUrl = (url: string) => {
  try {
    window.localStorage.setItem(PREVIEW_URL_STORAGE_KEY, url);
  } catch (_error) {
    // clientStorage remains the source of truth when localStorage is blocked.
  }
};

// ---- Font check -----------------------------------------------------------------------

export type FontUsage = {
  family: string;
  style: string;
  chars: number;
  frames: { name: string; chars: number }[];
  layerIds: string[];
  sample: string;
  missing: boolean;
};

export type FontReport = { fonts: FontUsage[]; frameCount: number };

// "21008_cm" -> "cm"
const languageOf = (frameName: string) => frameName.split("_").pop() || frameName;

// A font used for only a few characters in every language is usually an accident
// (e.g. the "/" of the page counter set in another font).
const LOW_USE_CHARS = 3;

const fontWarnings = (font: FontUsage) => {
  const warnings: string[] = [];
  if (font.missing) {
    warnings.push("這台電腦沒有這個字體，Figma 裡看到的可能也不對");
  }
  if (font.frames.every((frame) => frame.chars <= LOW_USE_CHARS)) {
    warnings.push(
      `每個語言只用了 ${Math.max(...font.frames.map((frame) => frame.chars))} 個字（「${font.sample}」），可能是不小心套到的`,
    );
  }
  return warnings;
};

const FontCheckCard = ({
  report,
  isLoading,
  onCheck,
  onSelectLayers,
}: {
  report?: FontReport;
  isLoading?: boolean;
  onCheck: () => void;
  onSelectLayers?: (layerIds: string[]) => void;
}) => {
  const flagged = report?.fonts.filter((font) => fontWarnings(font).length > 0) ?? [];

  return (
    <div className="w-full rounded-md border bg-card">
      <div className="flex items-center gap-2 px-3 py-2">
        <TypeIcon size={14} className="shrink-0 text-muted-foreground" />
        <span className="shrink-0 text-xs font-semibold text-foreground">字體檢查</span>
        {report && (
          <span
            className={`min-w-0 flex-1 truncate text-[11px] ${
              flagged.length ? "text-amber-600" : "text-muted-foreground"
            }`}
          >
            {report.fonts.length} 個字體
            {flagged.length ? `，${flagged.length} 個要注意` : "，沒有問題"}
          </span>
        )}
        <button
          type="button"
          onClick={onCheck}
          disabled={isLoading}
          className="ml-auto h-6 shrink-0 rounded-md border px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          {isLoading ? "檢查中…" : report ? "重新檢查" : "檢查勾選的框"}
        </button>
      </div>
      {report && report.fonts.length > 0 && (
        <div className="flex flex-col gap-1 border-t px-2 py-2">
          {report.fonts.map((font) => {
            const warnings = fontWarnings(font);
            const inAll = font.frames.length === report.frameCount;
            return (
              <div
                key={`${font.family}|${font.style}`}
                className={`rounded-md px-2 py-1.5 ${warnings.length ? "bg-amber-500/10" : ""}`}
              >
                <div className="flex items-center gap-2">
                  {warnings.length > 0 && (
                    <AlertTriangleIcon size={13} className="shrink-0 text-amber-600" />
                  )}
                  <span className="min-w-0 truncate text-xs font-medium text-foreground">
                    {font.family}
                    <span className="ml-1 font-normal text-muted-foreground">{font.style}</span>
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                    {font.chars} 字
                  </span>
                  {onSelectLayers && (
                    <button
                      type="button"
                      onClick={() => onSelectLayers(font.layerIds)}
                      className="shrink-0 rounded px-1 text-[11px] font-medium text-primary hover:bg-muted"
                      title="在 Figma 裡選取用了這個字體的圖層"
                    >
                      選取圖層
                    </button>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {inAll
                    ? `全部 ${report.frameCount} 個語言`
                    : `只在 ${font.frames.map((frame) => languageOf(frame.name)).join("、")}`}
                  ・「{font.sample}」
                </p>
                {warnings.map((warning) => (
                  <p key={warning} className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                    {warning}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ---- Fonts the preview cannot use -------------------------------------------------------

const GENERIC_FONT_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "inherit",
  "initial",
  "unset",
  "swiper-icons",
]);

// First-choice font of every font-family in the page.
const getPageFonts = (html: string) => {
  const fonts = new Set<string>();
  const pattern = /font-family\s*:\s*([^;"<>}]+)/gi;
  const text = html.replace(/&quot;|&#39;/g, "'");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const first = match[1].split(",")[0].trim().replace(/^'+|'+$/g, "").trim();
    if (first && !first.startsWith("var(") && !GENERIC_FONT_FAMILIES.has(first.toLowerCase())) {
      fonts.add(first);
    }
  }
  return [...fonts];
};

// Whether this window can draw the font: text measured in it must differ from the fallback.
// The preview iframe runs in the same window, so what is missing here is missing there.
const canUseFont = (font: string) => {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) {
    return true;
  }
  const sample = "mmmmmmmmmmlli WWW 0123 字體測試 あいう ภาษา বাংলা";
  return ["monospace", "serif", "sans-serif"].some((fallback) => {
    context.font = `72px ${fallback}`;
    const fallbackWidth = context.measureText(sample).width;
    context.font = `72px "${font}", ${fallback}`;
    return context.measureText(sample).width !== fallbackWidth;
  });
};

const useUnavailableFonts = (html?: string, bundled: string[] = []) => {
  const [missing, setMissing] = useState<string[]>([]);
  const bundledKey = bundled.join("|").toLowerCase();
  useEffect(() => {
    const bundledSet = new Set(bundledKey.split("|"));
    setMissing(
      html
        ? getPageFonts(html).filter(
            (font) => !bundledSet.has(font.toLowerCase()) && !canUseFont(font),
          )
        : [],
    );
  }, [html, bundledKey]);
  return missing;
};

const MissingFontsWarning = ({ fonts }: { fonts: string[] }) =>
  fonts.length === 0 ? null : (
    <p
      className="truncate text-[11px] text-amber-700 dark:text-amber-400"
      title="Figma 的外掛視窗讀不到這些字體，預覽改用了替代字型。下載後用瀏覽器或 ZipPreview 打開不受影響。"
    >
      ⚠ 外掛視窗讀不到：{fonts.join("、")}（預覽的字會不同，下載的檔案不受影響）
    </p>
  );

// ---- Side-by-side preview ---------------------------------------------------------------

export type GridPreviewItem = {
  nodeId: string;
  name: string;
  html?: string;
  error?: string;
};

const GridPreview = ({
  items,
  onOpen,
}: {
  items: GridPreviewItem[];
  onOpen: (nodeId: string) => void;
}) => (
  <div className="grid grid-cols-3 gap-3 overflow-auto p-1">
    {items.map((item) => (
      <div key={item.nodeId} className="flex flex-col overflow-hidden rounded-md border bg-card">
        <button
          type="button"
          onClick={() => onOpen(item.nodeId)}
          className="flex items-center gap-1.5 border-b px-2 py-1 text-left text-xs font-medium text-foreground hover:bg-muted"
          title="放大看這個語言"
        >
          <span className="truncate">{item.name}</span>
          <Maximize2Icon size={12} className="ml-auto shrink-0 text-muted-foreground" />
        </button>
        <div className="relative aspect-video bg-white">
          {item.html ? (
            <DownloadPreviewFrame html={item.html} width={1440} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center px-2 text-center text-[11px] text-muted-foreground">
              {item.error ? `產生失敗：${item.error}` : "產生中…"}
            </div>
          )}
        </div>
      </div>
    ))}
  </div>
);

// Where the time of the last export or preview went (from the plugin and this panel).
export type ExportTimingReport = {
  purpose: "preview" | "download";
  cached: boolean;
  timing?: {
    totalMs: number;
    frames: number;
    structureMs: number;
    htmlMs: number;
    postMs: number;
    images: { count: number; ms: number };
    vectors: { count: number; ms: number };
  };
  // Preview only, measured in the panel.
  clickToReadyMs?: number;
  previewBuildMs?: number;
  previewRenderMs?: number;
};

const seconds = (ms: number) => (ms / 1000).toFixed(1);

export const formatExportTiming = (report: ExportTimingReport) => {
  const what = report.purpose === "preview" ? "預覽" : "下載";
  const t = report.timing;
  if (report.cached || !t) {
    return `${what}：用上次匯出的結果${
      report.clickToReadyMs !== undefined ? `（${seconds(report.clickToReadyMs)} 秒）` : ""
    }`;
  }
  const parts = [
    `讀取結構 ${seconds(t.structureMs)}`,
    `圖片 ${t.images.count} 張 ${seconds(t.images.ms)}`,
    `向量 ${t.vectors.count} 個 ${seconds(t.vectors.ms)}`,
    `組網頁 ${seconds(t.htmlMs)}`,
    `整理檔案 ${seconds(t.postMs)}`,
  ];
  if (report.previewBuildMs !== undefined || report.previewRenderMs !== undefined) {
    parts.push(
      `顯示預覽 ${seconds((report.previewBuildMs ?? 0) + (report.previewRenderMs ?? 0))}`,
    );
  }
  const total = report.clickToReadyMs ?? t.totalMs;
  return `${what}共 ${seconds(total)} 秒（${t.frames} 個框）｜${parts.join("・")}`;
};

const TimingLine = ({ report }: { report?: ExportTimingReport }) => {
  if (!report) {
    return null;
  }
  const text = formatExportTiming(report);
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
      <TimerIcon size={12} className="shrink-0" />
      <span className="min-w-0 truncate" title={text}>
        {text}
      </span>
      <button
        type="button"
        onClick={() => copy(text)}
        className="shrink-0 rounded px-1 text-primary hover:bg-muted"
        title="複製耗時，貼給維護外掛的人"
      >
        複製
      </button>
    </div>
  );
};

// Export settings, saved in Figma so they stay set between runs.
export type ExportOptions = {
  interactiveHtmlExport: boolean;
  extractImages: boolean;
  extractCodeAssets: boolean;
  usePx2vw: boolean;
  autoInitializeInteractions: boolean;
};

// The format the help pages are delivered in: interactive html with _assets,
// styles.css / script.js and px2vw scaling.
export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  interactiveHtmlExport: true,
  extractImages: true,
  extractCodeAssets: true,
  usePx2vw: true,
  autoInitializeInteractions: true,
};

const EXPORT_OPTION_LABELS: {
  key: keyof ExportOptions;
  label: string;
  hint: string;
}[] = [
  { key: "interactiveHtmlExport", label: "互動網頁", hint: "分頁、按鈕可以點" },
  { key: "extractImages", label: "圖片另存", hint: "放在 _assets 資料夾" },
  { key: "extractCodeAssets", label: "CSS / JS 分開", hint: "styles.css、script.js" },
  { key: "usePx2vw", label: "依寬度縮放", hint: "px2vw，跟著視窗縮放" },
  {
    key: "autoInitializeInteractions",
    label: "自動啟動互動",
    hint: "打開網頁就能點",
  },
];

const isOptionAvailable = (key: keyof ExportOptions, options: ExportOptions) =>
  key !== "autoInitializeInteractions" ||
  (options.interactiveHtmlExport && options.extractCodeAssets);

const ExportOptionsCard = ({
  options,
  onChange,
}: {
  options: ExportOptions;
  onChange: (options: ExportOptions) => void;
}) => {
  const [open, setOpen] = useState(false);
  const available = EXPORT_OPTION_LABELS.filter((option) =>
    isOptionAvailable(option.key, options),
  );
  const isDefault = available.every(
    (option) => options[option.key] === DEFAULT_EXPORT_OPTIONS[option.key],
  );
  // With the company format the badge says it all; otherwise list what is on.
  const summary = isDefault
    ? "全部開啟"
    : available
        .filter((option) => options[option.key])
        .map((option) => option.label)
        .join("・") || "全部關閉";

  return (
    <div className="w-full rounded-md border bg-card">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <SlidersHorizontalIcon size={14} className="shrink-0 text-muted-foreground" />
        <span className="shrink-0 text-xs font-semibold text-foreground">匯出設定</span>
        {isDefault && (
          <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            公司格式
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-right text-[11px] text-muted-foreground">
          {summary}
        </span>
        <ChevronDownIcon
          size={14}
          className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t px-3 py-2">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {available.map((option) => (
              <label
                key={option.key}
                className="flex cursor-pointer items-start gap-2 rounded-md p-1 hover:bg-muted"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-3.5 w-3.5 accent-primary"
                  checked={options[option.key]}
                  onChange={(event) =>
                    onChange({ ...options, [option.key]: event.target.checked })
                  }
                />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-foreground">
                    {option.label}
                  </span>
                  <span className="block text-[10px] leading-4 text-muted-foreground">
                    {option.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {!isDefault && (
            <button
              type="button"
              onClick={() => onChange(DEFAULT_EXPORT_OPTIONS)}
              className="mt-2 text-[11px] font-medium text-primary hover:underline"
            >
              還原成公司格式
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const iconButtonClass =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground";

const SelectionList = ({
  nodes,
  activePreviewNodeId,
  isChecked,
  onCheckedChange,
  onCheckAll,
  onPreviewDownload,
  onPreviewSite,
  onDownloadNode,
}: {
  nodes: SelectionPreviewNode[];
  activePreviewNodeId: string | null;
  // Which frames the main Download button includes.
  isChecked: (nodeId: string) => boolean;
  onCheckedChange: (nodeId: string, checked: boolean) => void;
  onCheckAll: (checked: boolean) => void;
  onPreviewDownload?: (nodeId: string) => void;
  onPreviewSite?: (nodeId: string) => void;
  onDownloadNode?: (nodeId: string) => void;
}) => {
  if (nodes.length === 0) {
    return (
      <div className="flex min-h-[220px] items-center justify-center">
        <EmptyState />
      </div>
    );
  }

  const checkedCount = nodes.filter((node) => isChecked(node.id)).length;
  // Clicking a row shows what the download will look like; the online preview has its own icon.
  const openRow = onPreviewDownload ?? onPreviewSite;

  return (
    <div className="flex w-full flex-col">
      {nodes.length > 1 && (
        <label className="flex cursor-pointer items-center gap-2 px-2 pb-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-primary"
            checked={checkedCount === nodes.length}
            ref={(input) => {
              if (input) {
                input.indeterminate =
                  checkedCount > 0 && checkedCount < nodes.length;
              }
            }}
            onChange={(event) => onCheckAll(event.target.checked)}
          />
          <span className="font-medium text-foreground">全選</span>
          <span className="ml-auto">
            已選 {checkedCount} / {nodes.length}
          </span>
        </label>
      )}
      <div className="flex flex-col gap-0.5">
        {nodes.map((node) => {
          const isActive = node.id === activePreviewNodeId;
          const checked = isChecked(node.id);

          return (
            <div
              key={node.id}
              className={`group flex min-h-[40px] items-center gap-2 rounded-md px-2 transition-colors ${
                isActive ? "bg-primary/10 ring-1 ring-primary/60" : "hover:bg-muted"
              }`}
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 shrink-0 accent-primary"
                checked={checked}
                onChange={(event) => onCheckedChange(node.id, event.target.checked)}
                aria-label={`下載時包含 ${node.name}`}
              />
              <button
                type="button"
                onClick={() => openRow?.(node.id)}
                className="flex min-w-0 flex-1 items-baseline gap-2 py-2 text-left"
                title="點一下預覽下載版"
              >
                <span
                  className={`truncate text-sm font-medium ${
                    checked ? "text-foreground" : "text-muted-foreground line-through"
                  }`}
                >
                  {node.name}
                </span>
                {node.width !== null && node.height !== null && (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {Math.round(node.width)}×{Math.round(node.height)}
                  </span>
                )}
                {node.type !== "FRAME" && (
                  <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
                    {node.type}
                  </span>
                )}
              </button>
              <span className="flex shrink-0 items-center opacity-70 transition-opacity group-hover:opacity-100">
                {onPreviewDownload && (
                  <button
                    type="button"
                    className={iconButtonClass}
                    onClick={() => onPreviewDownload(node.id)}
                    aria-label={`預覽下載版 ${node.name}`}
                    title="預覽下載版（跟下載的 zip 完全一樣）"
                  >
                    <MonitorPlayIcon size={16} />
                  </button>
                )}
                {onPreviewSite && (
                  <button
                    type="button"
                    className={iconButtonClass}
                    onClick={() => onPreviewSite(node.id)}
                    aria-label={`線上預覽 ${node.name}`}
                    title="線上預覽（help.gdg168.com）"
                  >
                    <GlobeIcon size={16} />
                  </button>
                )}
                {onDownloadNode && (
                  <button
                    type="button"
                    className={iconButtonClass}
                    onClick={() => onDownloadNode(node.id)}
                    aria-label={`只下載 ${node.name}`}
                    title="只下載這一個"
                  >
                    <DownloadIcon size={16} />
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
export const PluginUI = (props: PluginUIProps) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showPreviewFrame, setShowPreviewFrame] = useState(false);
  // "site": the help.gdg168.com preview; "download": the exact html of the zip.
  // "grid": every ticked language's download preview side by side.
  const [previewMode, setPreviewMode] = useState<"site" | "download" | "grid">(
    "site",
  );
  const [downloadPreviewWidth, setDownloadPreviewWidth] = useState<
    number | null
  >(null);
  const [exportOptions, setExportOptions] = useState<ExportOptions>(
    props.exportOptions ?? DEFAULT_EXPORT_OPTIONS,
  );
  // The saved settings arrive from Figma after the panel first renders.
  useEffect(() => {
    if (props.exportOptions) {
      setExportOptions(props.exportOptions);
    }
  }, [props.exportOptions]);
  const changeExportOptions = (next: ExportOptions) => {
    setExportOptions(next);
    props.onExportOptionsChange?.(next);
  };
  const {
    extractImages,
    extractCodeAssets,
    autoInitializeInteractions,
    interactiveHtmlExport,
    usePx2vw,
  } = exportOptions;
  const withExportOptions =
    (handler?: DownloadNodeHandler) =>
    handler &&
    ((nodeId: string) =>
      handler(
        nodeId,
        extractImages,
        interactiveHtmlExport,
        extractCodeAssets,
        autoInitializeInteractions,
        usePx2vw,
      ));
  // Frames unticked by the user; anything newly listed (e.g. found by Related) starts ticked.
  const [uncheckedIds, setUncheckedIds] = useState<Set<string>>(new Set());
  const isChecked = (nodeId: string) => !uncheckedIds.has(nodeId);
  const setChecked = (nodeId: string, checked: boolean) =>
    setUncheckedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  const setAllChecked = (checked: boolean) =>
    setUncheckedIds(
      checked
        ? new Set()
        : new Set((props.selectionNodes ?? []).map((node) => node.id)),
    );
  const checkedNodes = (props.selectionNodes ?? []).filter((node) =>
    isChecked(node.id),
  );
  const savedPreviewUrl =
    props.previewUrl || getStoredPreviewUrl() || DEFAULT_PREVIEW_URL;
  const [draftPreviewUrl, setDraftPreviewUrl] = useState(savedPreviewUrl);
  const [previewUrlError, setPreviewUrlError] = useState("");

  const warnings = props.warnings ?? [];
  const selectionNodes = props.selectionNodes ?? [];
  const panelVersionLabel = props.pluginVersion
    ? `${PANEL_VERSION} · plugin v${props.pluginVersion}`
    : PANEL_VERSION;
  const previewOrigin = getTargetOrigin(savedPreviewUrl);
  const postPreviewPayload = useCallback(() => {
    if (
      !showPreviewFrame ||
      previewMode !== "site" ||
      props.isPreviewLoading ||
      props.previewPayload.sections.length === 0 ||
      !previewOrigin ||
      !iframeRef.current?.contentWindow
    ) {
      return;
    }

    // UI -> iframe: forward the latest Figma payload to the embedded preview app.
    iframeRef.current.contentWindow.postMessage(
      props.previewPayload,
      previewOrigin,
    );
  }, [
    previewOrigin,
    previewMode,
    props.isPreviewLoading,
    props.previewPayload,
    showPreviewFrame,
  ]);

  useEffect(() => {
    let attempts = 0;
    postPreviewPayload();

    const timer = window.setInterval(() => {
      attempts += 1;
      postPreviewPayload();

      if (attempts >= 8) {
        window.clearInterval(timer);
      }
    }, 300);

    return () => window.clearInterval(timer);
  }, [
    postPreviewPayload,
    props.isPreviewLoading,
    props.previewPayload,
    props.previewRefreshKey,
    savedPreviewUrl,
  ]);
  const resizePluginWindow = (width: number, height: number) => {
    parent.postMessage(
      { pluginMessage: { type: "resize-ui", width, height } },
      "*",
    );
  };
  const openPreviewFrame = () => {
    setShowPreviewFrame(true);
    resizePluginWindow(PREVIEW_WINDOW_WIDTH, getPreviewWindowHeight());
  };
  const handlePreviewNode = (nodeId: string) => {
    setPreviewMode("site");
    openPreviewFrame();
    props.onPreviewNode?.(nodeId);
  };
  const handlePreviewDownload: DownloadNodeHandler = (nodeId, ...options) => {
    setPreviewMode("download");
    openPreviewFrame();
    props.onPreviewDownload?.(nodeId, ...options);
  };
  const handlePreviewGrid = () => {
    setPreviewMode("grid");
    openPreviewFrame();
    props.onPreviewGrid?.(
      checkedNodes.map((node) => node.id),
      extractImages,
      interactiveHtmlExport,
      extractCodeAssets,
      autoInitializeInteractions,
      usePx2vw,
    );
  };
  const closePreviewFrame = () => {
    setShowPreviewFrame(false);
    resizePluginWindow(DEFAULT_WINDOW_SIZE.width, DEFAULT_WINDOW_SIZE.height);
  };
  const openSettings = () => {
    setDraftPreviewUrl(savedPreviewUrl);
    setShowSettings((current) => !current);
  };
  const settingsPanel = (
    <div className="flex w-full flex-col gap-2 rounded-md border bg-card p-3">
      <label className="text-xs font-medium text-muted-foreground">
        Preview URL
      </label>
      <input
        type="url"
        value={draftPreviewUrl}
        onChange={(event) => {
          setDraftPreviewUrl(event.target.value);
          setPreviewUrlError("");
        }}
        className="h-8 rounded-md border bg-background px-2 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
      />
      {previewUrlError && (
        <p className="text-xs text-destructive">{previewUrlError}</p>
      )}
      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={() => {
            setDraftPreviewUrl(savedPreviewUrl);
            setShowSettings(false);
          }}
          className="h-7 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            try {
              const normalizedPreviewUrl = new URL(draftPreviewUrl).toString();
              setStoredPreviewUrl(normalizedPreviewUrl);
              props.onPreviewUrlChanged?.(normalizedPreviewUrl);
            } catch (_error) {
              setPreviewUrlError("Please enter a valid URL.");
              return;
            }
            setShowSettings(false);
          }}
          className="h-7 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Save
        </button>
      </div>
    </div>
  );
  const downloadChecked = () =>
    props.onDownloadHtmlZip?.(
      extractImages,
      interactiveHtmlExport,
      extractCodeAssets,
      autoInitializeInteractions,
      usePx2vw,
      checkedNodes.map((node) => node.id),
    );
  const allLanguagesToggle = (compact: boolean) => (
    <button
      type="button"
      aria-pressed={props.includeRelatedFrames}
      onClick={() =>
        props.onIncludeRelatedFramesChange?.(!props.includeRelatedFrames)
      }
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border text-xs font-medium transition-colors ${
        compact ? "w-8 justify-center px-0" : "px-2.5"
      } ${
        props.includeRelatedFrames
          ? "border-primary bg-primary/15 text-primary"
          : "bg-background text-foreground hover:bg-muted"
      }`}
      title="找出整個檔案裡同編號的所有語言（例：選 21008_cm，會列出每個 Page 的 21008_xx）"
    >
      <LanguagesIcon size={15} />
      {!compact && "找出所有語言"}
    </button>
  );
  const settingsButton = pluginUiConfig.showPreviewSettingsButton && (
    <button
      type="button"
      onClick={openSettings}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background text-foreground transition-colors hover:bg-muted ${
        showSettings ? "border-primary text-primary" : ""
      }`}
      aria-label="預覽設定"
      title="預覽設定"
    >
      <SettingsIcon size={15} />
    </button>
  );
  const gridButton = (compact: boolean) =>
    props.onPreviewGrid &&
    checkedNodes.length >= 2 && (
      <button
        type="button"
        onClick={handlePreviewGrid}
        className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border bg-background text-xs font-medium text-foreground transition-colors hover:bg-muted ${
          compact ? "w-8 justify-center px-0" : "px-2.5"
        }`}
        title={`把勾選的 ${checkedNodes.length} 個語言並排預覽，找出文字太長或跑版的`}
      >
        <LayoutGridIcon size={15} />
        {!compact && "並排比對"}
      </button>
    );
  const fontCheckCard = props.onCheckFonts && selectionNodes.length > 0 && (
    <FontCheckCard
      report={props.fontReport}
      isLoading={props.isFontCheckLoading}
      onCheck={() => props.onCheckFonts?.(checkedNodes.map((node) => node.id))}
      onSelectLayers={props.onSelectLayers}
    />
  );
  const missingPreviewFonts = useUnavailableFonts(
    previewMode === "grid"
      ? props.gridPreviews?.find((item) => item.html)?.html
      : props.downloadPreviewHtml,
    props.bundledPreviewFonts,
  );
  const gridItems = props.gridPreviews ?? [];
  const gridDone = gridItems.filter((item) => item.html || item.error).length;
  const selectionList = (
    <SelectionList
      nodes={selectionNodes}
      activePreviewNodeId={props.activePreviewNodeId}
      isChecked={isChecked}
      onCheckedChange={setChecked}
      onCheckAll={setAllChecked}
      onPreviewDownload={withExportOptions(
        props.onPreviewDownload && handlePreviewDownload,
      )}
      onPreviewSite={props.onPreviewNode && handlePreviewNode}
      onDownloadNode={withExportOptions(props.onDownloadNode)}
    />
  );
  const uncheckedCount = selectionNodes.length - checkedNodes.length;

  return (
    <TooltipProvider>
      <div className="relative flex h-full flex-col overflow-hidden bg-background text-foreground">
        {props.isDownloadLoading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/85 px-6 backdrop-blur-sm">
            <div className="w-full max-w-[320px] rounded-md border bg-card p-4 shadow-lg">
              <p className="text-sm font-semibold text-foreground">
                {props.isDownloadPreviewLoading ? "產生預覽中…" : "準備下載中…"}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {props.downloadProgressLabel || "處理檔案中…"}
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.max(
                      3,
                      Math.min(100, props.downloadProgress || 0),
                    )}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-right text-xs text-muted-foreground">
                {Math.min(100, Math.max(0, props.downloadProgress || 0))}%
              </p>
            </div>
          </div>
        )}
        {showPreviewFrame ? (
          <ScrollArea className="min-h-0 flex-1 overflow-hidden">
            <div
              className="grid h-full min-h-[640px] gap-3 px-3 py-3"
              style={{
                gridTemplateColumns: `360px ${PREVIEW_PANEL_WIDTH}px`,
              }}
            >
              <div className="flex min-h-0 flex-col overflow-hidden rounded-md border bg-card">
                <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b px-3">
                  <p className="truncate text-sm font-semibold text-foreground">
                    選取的框
                    <span className="ml-1.5 text-xs font-medium text-muted-foreground">
                      {selectionNodes.length}
                    </span>
                  </p>
                  <div className="flex items-center gap-1">
                    {allLanguagesToggle(true)}
                    {gridButton(true)}
                    {props.onDownloadHtmlZip && selectionNodes.length > 0 && (
                      <button
                        type="button"
                        disabled={checkedNodes.length === 0}
                        onClick={downloadChecked}
                        className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                        title={`下載勾選的 ${checkedNodes.length} 個框`}
                      >
                        <DownloadIcon size={14} />
                        {checkedNodes.length}
                      </button>
                    )}
                    {settingsButton}
                  </div>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2">
                  {pluginUiConfig.showPreviewSettingsButton &&
                    showSettings &&
                    settingsPanel}
                  {selectionNodes.length > 0 && (
                    <ExportOptionsCard
                      options={exportOptions}
                      onChange={changeExportOptions}
                    />
                  )}
                  {fontCheckCard}
                  {selectionList}
                </div>
              </div>

              <div className="flex min-h-0 flex-col gap-2">
                <div className="flex h-11 shrink-0 items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-col justify-center">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {previewMode === "grid"
                        ? "並排比對"
                        : previewMode === "download"
                          ? "預覽下載版"
                          : "線上預覽"}
                    </p>
                    {previewMode !== "site" && (
                      <MissingFontsWarning fonts={missingPreviewFonts} />
                    )}
                    {previewMode === "grid" ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {gridDone < gridItems.length
                          ? `產生中 ${gridDone} / ${gridItems.length}…`
                          : `${gridItems.length} 個語言，跟下載的 zip 相同。點語言名稱可放大`}
                      </p>
                    ) : previewMode === "download" ? (
                      props.exportTiming?.purpose === "preview" &&
                      !props.isDownloadPreviewLoading ? (
                        <TimingLine report={props.exportTiming} />
                      ) : (
                        <p className="truncate text-xs text-muted-foreground">
                          跟下載的 zip 完全相同的 html（字體用這台電腦的）
                        </p>
                      )
                    ) : (
                      <p className="truncate text-xs text-muted-foreground">
                        {props.isPreviewLoading ? "產生中…" : savedPreviewUrl}
                      </p>
                    )}
                  </div>
                  {previewMode === "download" && (
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      <span className="mr-1 text-xs text-muted-foreground">畫面寬度</span>
                      {DOWNLOAD_PREVIEW_WIDTHS.map((option) => (
                        <button
                          key={option.label}
                          type="button"
                          onClick={() => setDownloadPreviewWidth(option.width)}
                          className={`h-7 rounded-md border px-2 text-xs transition-colors hover:bg-muted ${
                            downloadPreviewWidth === option.width
                              ? "border-primary bg-primary/10 text-primary"
                              : "text-muted-foreground"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-md"
                    onClick={closePreviewFrame}
                    aria-label="關閉預覽"
                    title="關閉預覽"
                  >
                    <XIcon size={16} />
                  </Button>
                </div>

                {previewMode === "site" && !previewOrigin && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    預覽網址不正確，請到設定裡重新輸入。
                  </div>
                )}

                {previewMode === "grid" ? (
                  <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/40 p-2">
                    <GridPreview
                      items={gridItems}
                      onOpen={(nodeId) =>
                        handlePreviewDownload(
                          nodeId,
                          extractImages,
                          interactiveHtmlExport,
                          extractCodeAssets,
                          autoInitializeInteractions,
                          usePx2vw,
                        )
                      }
                    />
                  </div>
                ) : (
                <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border bg-white">
                  {(previewMode === "download"
                    ? props.isDownloadPreviewLoading
                    : props.isPreviewLoading) && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 text-sm font-medium text-foreground">
                      產生預覽中…
                    </div>
                  )}
                  {previewMode === "download" ? (
                    props.downloadPreviewHtml && (
                      <DownloadPreviewFrame
                        html={props.downloadPreviewHtml}
                        width={downloadPreviewWidth}
                        onLoad={props.onDownloadPreviewLoaded}
                      />
                    )
                  ) : (
                    <iframe
                      ref={iframeRef}
                      src={savedPreviewUrl}
                      title="Embedded preview"
                      className="h-full w-full border-0 bg-white"
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                      onLoad={postPreviewPayload}
                    />
                  )}
                </div>
                )}
              </div>
            </div>
          </ScrollArea>
        ) : (
          <>
            <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  選取的框
                  <span className="ml-1.5 text-xs font-medium text-muted-foreground">
                    {selectionNodes.length}
                  </span>
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {panelVersionLabel}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {allLanguagesToggle(false)}
                {gridButton(false)}
                {settingsButton}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-3 py-3">
              {warnings.length > 0 && <WarningsPanel warnings={warnings} />}
              {pluginUiConfig.showPreviewSettingsButton &&
                showSettings &&
                settingsPanel}
              {selectionNodes.length > 0 && (
                <ExportOptionsCard
                  options={exportOptions}
                  onChange={changeExportOptions}
                />
              )}
              {fontCheckCard}
              {selectionList}
              {props.gradients.length > 0 && (
                <div className="w-full">
                  <GradientsPanel
                    gradients={props.gradients}
                    onColorClick={(value) => {
                      copy(value);
                    }}
                  />
                </div>
              )}
            </div>

            {props.onDownloadHtmlZip && selectionNodes.length > 0 && (
              <div className="shrink-0 border-t bg-background px-3 py-2.5">
                <button
                  type="button"
                  disabled={checkedNodes.length === 0}
                  onClick={downloadChecked}
                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <DownloadIcon size={16} />
                  {checkedNodes.length === 0
                    ? "請先勾選要下載的框"
                    : checkedNodes.length === 1
                      ? `下載 ${checkedNodes[0].name}`
                      : `下載 ${checkedNodes.length} 個框（zip）`}
                </button>
                {uncheckedCount > 0 && checkedNodes.length > 0 && (
                  <p className="mt-1 text-center text-[11px] text-muted-foreground">
                    已排除 {uncheckedCount} 個
                  </p>
                )}
                {props.exportTiming && (
                  <div className="mt-1.5">
                    <TimingLine report={props.exportTiming} />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </TooltipProvider>
  );
};