import { useEffect, useState } from "react";
import {
  PluginUI,
  ExportOptions,
  ExportTimingReport,
  FontReport,
  GridPreviewItem,
} from "plugin-ui";
import pluginPackage from "../package.json";
import {
  Framework,
  PluginSettings,
  ConversionMessage,
  Message,
  HTMLPreview,
  LinearGradientConversion,
  SolidColorConversion,
  ErrorMessage,
  SettingsChangedMessage,
  Warning,
  HtmlZipReadyMessage,
  HtmlFileReadyMessage,
  HtmlZipProgressMessage,
  IframePreviewPayload,
  SelectionPreviewDataMessage,
  SelectionPreviewNode,
  DownloadPreviewReadyMessage,
} from "types";
import { postUISettingsChangingMessage } from "./messaging";
import copy from "copy-to-clipboard";
import { createZipBlob } from "./zip";
import { buildDownloadPreviewDocument } from "./downloadPreview";
import { BUNDLED_PREVIEW_FONT_FAMILIES } from "./previewFonts";

interface AppState {
  code: string;
  selectedFramework: Framework;
  isLoading: boolean;
  htmlPreview: HTMLPreview;
  settings: PluginSettings | null;
  colors: SolidColorConversion[];
  gradients: LinearGradientConversion[];
  warnings: Warning[];
  selectionPreviewNodes: SelectionPreviewNode[];
  activePreviewNodeId: string | null;
  previewHtml: string;
  previewName: string;
  previewUrl: string;
  isPreviewLoading: boolean;
  isDownloadLoading: boolean;
  downloadProgress: number;
  downloadProgressLabel: string;
  previewRefreshKey: number;
  includeRelatedFrames: boolean;
  downloadPreviewHtml: string;
  isDownloadPreviewLoading: boolean;
  exportOptions?: ExportOptions;
  exportTiming?: ExportTimingReport;
  fontReport?: FontReport;
  isFontCheckLoading: boolean;
  gridPreviews: GridPreviewItem[];
  isGridLoading: boolean;
}

// Preview timing measured here: from the click, and how long building and showing the
// page took. Kept outside React state because the messages arrive in quick succession.
const previewClock = {
  requestedAt: 0,
  readyAt: 0,
  buildMs: 0,
};

const emptyPreview = { size: { width: 0, height: 0 }, content: "" };
const PREVIEW_URL_STORAGE_KEY = "bitstackPreviewUrl";
const DEFAULT_PREVIEW_URL = "https://help.gdg168.com/";
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
    // The main thread also stores this in figma.clientStorage.
  }
};
const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
const isDarkFigmaBackground = (background: string) => {
  const value = background.trim().toLowerCase();

  return Boolean(
    value &&
    value !== "#fff" &&
    value !== "#ffffff" &&
    value !== "rgb(255, 255, 255)" &&
    value !== "rgba(255, 255, 255, 1)",
  );
};

export default function App() {
  const [state, setState] = useState<AppState>({
    code: "",
    selectedFramework: "HTML",
    isLoading: true,
    htmlPreview: emptyPreview,
    settings: null,
    colors: [],
    gradients: [],
    warnings: [],
    selectionPreviewNodes: [],
    activePreviewNodeId: null,
    previewHtml: "",
    previewName: "",
    previewUrl: getStoredPreviewUrl() ?? DEFAULT_PREVIEW_URL,
    isPreviewLoading: false,
    isDownloadLoading: false,
    downloadProgress: 0,
    downloadProgressLabel: "",
    previewRefreshKey: 0,
    includeRelatedFrames: false,
    downloadPreviewHtml: "",
    isDownloadPreviewLoading: false,
    isFontCheckLoading: false,
    gridPreviews: [],
    isGridLoading: false,
  });

  const rootStyles = getComputedStyle(document.documentElement);
  const figmaColorBgValue = rootStyles
    .getPropertyValue("--figma-color-bg")
    .trim();

  useEffect(() => {
    window.onmessage = (event: MessageEvent) => {
      const untypedMessage = event.data?.pluginMessage as Message | undefined;
      if (!untypedMessage?.type) {
        return;
      }

      console.log("[ui] message received:", untypedMessage);

      switch (untypedMessage.type) {
        case "conversionStart":
          setState((prevState) => ({
            ...prevState,
            code: "",
            isLoading: true,
          }));
          break;

        case "code":
          const conversionMessage = untypedMessage as ConversionMessage;
          setState((prevState) => ({
            ...prevState,
            ...conversionMessage,
            selectedFramework: conversionMessage.settings.framework,
            isLoading: false,
          }));
          break;

        case "pluginSettingsChanged":
          const settingsMessage = untypedMessage as SettingsChangedMessage;
          setState((prevState) => ({
            ...prevState,
            settings: settingsMessage.settings,
            selectedFramework: settingsMessage.settings.framework,
          }));
          break;

        case "empty":
          // const emptyMessage = untypedMessage as EmptyMessage;
          setState((prevState) => ({
            ...prevState,
            code: "",
            htmlPreview: emptyPreview,
            warnings: [],
            colors: [],
            gradients: [],
            isLoading: false,
          }));
          break;

        case "error":
          const errorMessage = untypedMessage as ErrorMessage;

          setState((prevState) => ({
            ...prevState,
            colors: [],
            gradients: [],
            code: `Error :(\n// ${errorMessage.error}`,
            isLoading: false,
          }));
          break;

        case "selection-json":
          const json = event.data.pluginMessage.data;
          copy(JSON.stringify(json, null, 2));
          break;

        case "selection-preview-data":
          const selectionPreviewMessage =
            untypedMessage as SelectionPreviewDataMessage;
          setState((prevState) => ({
            ...prevState,
            selectionPreviewNodes: selectionPreviewMessage.nodes,
          }));
          break;

        case "preview-url-setting":
          const incomingPreviewUrl = (
            event.data.pluginMessage as { previewUrl?: string }
          ).previewUrl;
          const storedPreviewUrl = getStoredPreviewUrl();
          const shouldKeepStoredPreviewUrl =
            incomingPreviewUrl === DEFAULT_PREVIEW_URL &&
            Boolean(storedPreviewUrl) &&
            storedPreviewUrl !== DEFAULT_PREVIEW_URL;
          const nextPreviewUrl =
            shouldKeepStoredPreviewUrl && storedPreviewUrl
              ? storedPreviewUrl
              : incomingPreviewUrl;

          if (nextPreviewUrl) {
            setState((prevState) => ({
              ...prevState,
              previewUrl: nextPreviewUrl,
            }));
            setStoredPreviewUrl(nextPreviewUrl);
          }

          if (shouldKeepStoredPreviewUrl && storedPreviewUrl) {
            parent.postMessage(
              {
                pluginMessage: {
                  type: "save-preview-url",
                  previewUrl: storedPreviewUrl,
                },
              },
              "*",
            );
          }
          break;

        case "preview-node-ready":
          setState((prevState) => {
            const previewMessage = event.data.pluginMessage as {
              nodeId: string;
              name: string;
              html: string;
              css?: string;
            };

            return {
              ...prevState,
              activePreviewNodeId: previewMessage.nodeId,
              previewHtml: previewMessage.css
                ? `<style>\n${previewMessage.css}\n</style>\n${previewMessage.html}`
                : previewMessage.html,
              previewName: previewMessage.name,
              isPreviewLoading: false,
              previewRefreshKey: prevState.previewRefreshKey + 1,
            };
          });
          break;

        case "preview-node-error":
          setState((prevState) => ({
            ...prevState,
            isPreviewLoading: false,
            warnings: [
              ...(prevState.warnings ?? []),
              `Preview failed: ${event.data.pluginMessage.error}`,
            ],
          }));
          break;

        case "html-zip-ready":
          const zipMessage = untypedMessage as HtmlZipReadyMessage;
          setState((prevState) => ({
            ...prevState,
            isDownloadLoading: true,
            downloadProgress: 0,
            downloadProgressLabel: "Compressing files...",
          }));
          createZipBlob(zipMessage.files, (current, total, label) => {
            setState((prevState) => ({
              ...prevState,
              isDownloadLoading: true,
              downloadProgress:
                total > 0 ? 70 + Math.round((current / total) * 30) : 70,
              downloadProgressLabel: label,
            }));
          })
            .then((blob) => {
              downloadBlob(blob, zipMessage.fileName);
              setState((prevState) => ({
                ...prevState,
                isDownloadLoading: false,
                downloadProgress: 100,
                downloadProgressLabel: "Download ready",
              }));
            })
            .catch((error) => {
              setState((prevState) => ({
                ...prevState,
                isDownloadLoading: false,
                warnings: [
                  ...(prevState.warnings ?? []),
                  `Compression failed: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                ],
              }));
            });
          break;

        case "html-file-ready":
          const htmlMessage = untypedMessage as HtmlFileReadyMessage;
          downloadBlob(
            new Blob([htmlMessage.content], {
              type: "text/html;charset=utf-8",
            }),
            htmlMessage.fileName,
          );
          setState((prevState) => ({
            ...prevState,
            isDownloadLoading: false,
            downloadProgress: 100,
            downloadProgressLabel: "Download ready",
          }));
          break;

        case "download-preview-ready":
          const downloadPreviewMessage =
            untypedMessage as DownloadPreviewReadyMessage;
          setState((prevState) => {
            try {
              const buildStart = performance.now();
              const downloadPreviewHtml = buildDownloadPreviewDocument(
                downloadPreviewMessage.files,
              );
              previewClock.buildMs = performance.now() - buildStart;
              previewClock.readyAt = performance.now();
              return {
                ...prevState,
                activePreviewNodeId: downloadPreviewMessage.nodeId,
                downloadPreviewHtml,
                isDownloadPreviewLoading: false,
                isDownloadLoading: false,
              };
            } catch (error) {
              return {
                ...prevState,
                isDownloadPreviewLoading: false,
                isDownloadLoading: false,
                warnings: [
                  ...(prevState.warnings ?? []),
                  `Preview failed: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                ],
              };
            }
          });
          break;

        case "font-report":
          const fontMessage = untypedMessage as unknown as FontReport;
          setState((prevState) => ({
            ...prevState,
            fontReport: { fonts: fontMessage.fonts, frameCount: fontMessage.frameCount },
            isFontCheckLoading: false,
          }));
          break;

        case "font-report-error":
          setState((prevState) => ({
            ...prevState,
            isFontCheckLoading: false,
            warnings: [
              ...(prevState.warnings ?? []),
              `字體檢查失敗：${event.data.pluginMessage.error}`,
            ],
          }));
          break;

        case "grid-preview-item":
          const gridMessage = event.data.pluginMessage as {
            nodeId: string;
            files?: DownloadPreviewReadyMessage["files"];
            error?: string;
          };
          setState((prevState) => ({
            ...prevState,
            isDownloadLoading: false,
            gridPreviews: prevState.gridPreviews.map((item) => {
              if (item.nodeId !== gridMessage.nodeId) {
                return item;
              }
              try {
                return gridMessage.files
                  ? { ...item, html: buildDownloadPreviewDocument(gridMessage.files) }
                  : { ...item, error: gridMessage.error ?? "未知錯誤" };
              } catch (error) {
                return {
                  ...item,
                  error: error instanceof Error ? error.message : String(error),
                };
              }
            }),
          }));
          break;

        case "grid-preview-done":
          setState((prevState) => ({
            ...prevState,
            isGridLoading: false,
            isDownloadLoading: false,
          }));
          break;

        case "export-timing":
          const timingMessage = untypedMessage as unknown as ExportTimingReport;
          setState((prevState) => ({
            ...prevState,
            exportTiming: {
              purpose: timingMessage.purpose,
              cached: timingMessage.cached,
              timing: timingMessage.timing,
              ...(timingMessage.purpose === "preview"
                ? {
                    clickToReadyMs: previewClock.readyAt - previewClock.requestedAt,
                    previewBuildMs: previewClock.buildMs,
                  }
                : {}),
            },
          }));
          break;

        case "export-options":
          setState((prevState) => ({
            ...prevState,
            exportOptions: (
              untypedMessage as unknown as { options: ExportOptions }
            ).options,
          }));
          break;

        case "download-preview-error":
          setState((prevState) => ({
            ...prevState,
            isDownloadPreviewLoading: false,
            isDownloadLoading: false,
            warnings: [
              ...(prevState.warnings ?? []),
              `Preview failed: ${event.data.pluginMessage.error}`,
            ],
          }));
          break;

        case "html-zip-progress":
          const progressMessage = untypedMessage as HtmlZipProgressMessage;
          setState((prevState) =>
            // The grid shows its own progress; no full-screen box over it.
            prevState.isGridLoading
              ? prevState
              : {
            ...prevState,
            isDownloadLoading: true,
            downloadProgress:
              progressMessage.total > 0
                ? Math.round(
                    (progressMessage.current / progressMessage.total) * 70,
                  )
                : 0,
            downloadProgressLabel: progressMessage.label,
                },
          );
          break;

        case "html-zip-error":
          setState((prevState) => ({
            ...prevState,
            isDownloadLoading: false,
            warnings: [
              ...(prevState.warnings ?? []),
              `Download failed: ${event.data.pluginMessage.error}`,
            ],
          }));
          break;

        default:
          break;
      }
    };

    return () => {
      window.onmessage = null;
    };
  }, []);

  useEffect(() => {
    parent.postMessage({ pluginMessage: { type: "ui-ready" } }, "*");
  }, []);

  const handleFrameworkChange = (updatedFramework: Framework) => {
    if (updatedFramework !== state.selectedFramework) {
      setState((prevState) => ({
        ...prevState,
        // code: "// Loading...",
        selectedFramework: updatedFramework,
      }));
      postUISettingsChangingMessage("framework", updatedFramework, {
        targetOrigin: "*",
      });
    }
  };
  const handlePreferencesChange = (
    key: keyof PluginSettings,
    value: PluginSettings[keyof PluginSettings],
  ) => {
    if (state.settings && state.settings[key] === value) {
      // do nothing
    } else {
      postUISettingsChangingMessage(key, value, { targetOrigin: "*" });
    }
  };

  const darkMode = isDarkFigmaBackground(figmaColorBgValue);
  const iframePreviewPayload: IframePreviewPayload = {
    type: "figma-to-code-preview",
    version: 1,
    selection: state.selectionPreviewNodes,
    sections: state.previewHtml
      ? [
          {
            name: state.previewName || "Figma selection",
            html: state.previewHtml,
            assets: [],
          },
        ]
      : [],
  };

  return (
    <div
      className={`${darkMode ? "dark" : ""} h-full bg-background text-foreground`}
    >
      <PluginUI
        isLoading={state.isLoading}
        code={state.code}
        warnings={state.warnings}
        selectedFramework={state.selectedFramework}
        setSelectedFramework={handleFrameworkChange}
        onPreferenceChanged={handlePreferencesChange}
        htmlPreview={state.htmlPreview}
        settings={state.settings}
        colors={state.colors}
        gradients={state.gradients}
        selectionNodes={state.selectionPreviewNodes}
        activePreviewNodeId={state.activePreviewNodeId}
        isPreviewLoading={state.isPreviewLoading}
        isDownloadLoading={state.isDownloadLoading}
        downloadProgress={state.downloadProgress}
        downloadProgressLabel={state.downloadProgressLabel}
        previewUrl={state.previewUrl}
        previewPayload={iframePreviewPayload}
        previewRefreshKey={state.previewRefreshKey}
        includeRelatedFrames={state.includeRelatedFrames}
        downloadPreviewHtml={state.downloadPreviewHtml}
        exportOptions={state.exportOptions}
        exportTiming={state.exportTiming}
        bundledPreviewFonts={BUNDLED_PREVIEW_FONT_FAMILIES}
        fontReport={state.fontReport}
        isFontCheckLoading={state.isFontCheckLoading}
        onCheckFonts={(nodeIds) => {
          setState((prevState) => ({ ...prevState, isFontCheckLoading: true }));
          parent.postMessage(
            { pluginMessage: { type: "check-fonts", nodeIds } },
            "*",
          );
        }}
        onSelectLayers={(layerIds) =>
          parent.postMessage(
            { pluginMessage: { type: "select-layers", layerIds } },
            "*",
          )
        }
        gridPreviews={state.gridPreviews}
        onPreviewGrid={(
          nodeIds,
          extractImages,
          interactiveHtmlExport,
          extractCodeAssets,
          autoInitializeInteractions,
          usePx2vw,
        ) => {
          setState((prevState) => ({
            ...prevState,
            isGridLoading: true,
            gridPreviews: nodeIds.map((nodeId) => ({
              nodeId,
              name:
                prevState.selectionPreviewNodes.find((node) => node.id === nodeId)
                  ?.name ?? nodeId,
            })),
          }));
          parent.postMessage(
            {
              pluginMessage: {
                type: "preview-grid",
                nodeIds,
                extractImages,
                interactiveHtmlExport,
                extractCodeAssets,
                autoInitializeInteractions,
                usePx2vw,
              },
            },
            "*",
          );
        }}
        onDownloadPreviewLoaded={() => {
          // The page finished loading in the preview: add the render time once.
          const renderMs = performance.now() - previewClock.readyAt;
          setState((prevState) =>
            prevState.exportTiming?.purpose === "preview" &&
            prevState.exportTiming.previewRenderMs === undefined
              ? {
                  ...prevState,
                  exportTiming: {
                    ...prevState.exportTiming,
                    previewRenderMs: renderMs,
                    clickToReadyMs:
                      performance.now() - previewClock.requestedAt,
                  },
                }
              : prevState,
          );
        }}
        onExportOptionsChange={(options) =>
          parent.postMessage(
            { pluginMessage: { type: "save-export-options", options } },
            "*",
          )
        }
        isDownloadPreviewLoading={state.isDownloadPreviewLoading}
        onPreviewDownload={(
          nodeId,
          extractImages,
          interactiveHtmlExport,
          extractCodeAssets,
          autoInitializeInteractions,
          usePx2vw,
        ) => {
          previewClock.requestedAt = performance.now();
          setState((prevState) => ({
            ...prevState,
            activePreviewNodeId: nodeId,
            downloadPreviewHtml: "",
            isDownloadPreviewLoading: true,
          }));
          parent.postMessage(
            {
              pluginMessage: {
                type: "preview-download",
                nodeId,
                extractImages,
                interactiveHtmlExport,
                extractCodeAssets,
                autoInitializeInteractions,
                usePx2vw,
              },
            },
            "*",
          );
        }}
        pluginVersion={pluginPackage.version}
        onPreviewUrlChanged={(previewUrl) => {
          setStoredPreviewUrl(previewUrl);
          setState((prevState) => ({
            ...prevState,
            previewUrl,
          }));
          parent.postMessage(
            {
              pluginMessage: {
                type: "save-preview-url",
                previewUrl,
              },
            },
            "*",
          );
        }}
        onDownloadHtmlZip={(
          extractImages,
          interactiveHtmlExport,
          extractCodeAssets,
          autoInitializeInteractions,
          usePx2vw,
          nodeIds,
        ) => {
          const exportNodeIds =
            nodeIds ?? state.selectionPreviewNodes.map((node) => node.id);

          setState((prevState) => ({
            ...prevState,
            isDownloadLoading: true,
            downloadProgress: 0,
            downloadProgressLabel: "Starting export...",
          }));
          parent.postMessage(
            {
              pluginMessage: {
                type: "download-html-zip",
                extractImages,
                interactiveHtmlExport,
                extractCodeAssets,
                autoInitializeInteractions,
                usePx2vw,
                nodeIds: exportNodeIds.length > 0 ? exportNodeIds : undefined,
              },
            },
            "*",
          );
        }}
        onIncludeRelatedFramesChange={(enabled) => {
          const selectedNodeIds = state.selectionPreviewNodes.map(
            (node) => node.id,
          );

          setState((prevState) => ({
            ...prevState,
            includeRelatedFrames: enabled,
          }));
          parent.postMessage(
            {
              pluginMessage: {
                type: "set-related-frame-search",
                enabled,
                nodeIds: enabled ? selectedNodeIds : undefined,
              },
            },
            "*",
          );
        }}
        onDownloadNode={(
          nodeId,
          extractImages,
          interactiveHtmlExport,
          extractCodeAssets,
          autoInitializeInteractions,
          usePx2vw,
        ) => {
          setState((prevState) => ({
            ...prevState,
            isDownloadLoading: true,
            downloadProgress: 0,
            downloadProgressLabel: "Starting export...",
          }));
          parent.postMessage(
            {
              pluginMessage: {
                type: "download-html-zip",
                extractImages,
                interactiveHtmlExport,
                extractCodeAssets,
                autoInitializeInteractions,
                usePx2vw,
                nodeId,
              },
            },
            "*",
          );
        }}
        onPreviewNode={(nodeId) => {
          parent.postMessage(
            {
              pluginMessage: {
                type: "preview-node",
                nodeId,
              },
            },
            "*",
          );
          setState((prevState) => ({
            ...prevState,
            activePreviewNodeId: nodeId,
            previewHtml: "",
            previewName:
              prevState.selectionPreviewNodes.find((node) => node.id === nodeId)
                ?.name ?? "",
            isPreviewLoading: true,
          }));
        }}
      />
    </div>
  );
}
