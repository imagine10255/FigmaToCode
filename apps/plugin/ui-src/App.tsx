import { useEffect, useState } from "react";
import { PluginUI } from "plugin-ui";
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
} from "types";
import { postUISettingsChangingMessage } from "./messaging";
import copy from "copy-to-clipboard";
import { createZipBlob } from "./zip";

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
}

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

        case "html-zip-progress":
          const progressMessage = untypedMessage as HtmlZipProgressMessage;
          setState((prevState) => ({
            ...prevState,
            isDownloadLoading: true,
            downloadProgress:
              progressMessage.total > 0
                ? Math.round(
                    (progressMessage.current / progressMessage.total) * 70,
                  )
                : 0,
            downloadProgressLabel: progressMessage.label,
          }));
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
        onDownloadHtmlZip={(extractImages, interactiveHtmlExport) => {
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
              },
            },
            "*",
          );
        }}
        onDownloadNode={(nodeId, extractImages, interactiveHtmlExport) => {
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
