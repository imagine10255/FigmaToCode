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
  HtmlZipFile,
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
  previewRefreshKey: number;
}

const emptyPreview = { size: { width: 0, height: 0 }, content: "" };
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
const getDataUrlExtension = (mimeType: string) => {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/svg+xml":
      return "svg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/png":
    default:
      return "png";
  }
};
const extractDataUrlAssets = (html: string) => {
  const assets: HtmlZipFile[] = [];
  let imageIndex = 0;
  const nextHtml = html.replace(
    /data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/g,
    (_match, mimeType, base64) => {
      imageIndex += 1;
      const extension = getDataUrlExtension(mimeType);
      const path = `assets/image-${imageIndex.toString().padStart(2, "0")}.${extension}`;

      assets.push({
        path,
        content: base64,
        encoding: "base64",
      });

      return path;
    },
  );

  return { html: nextHtml, assets };
};
const wrapHtmlDocument = (html: string) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
${html}
</body>
</html>`;
const downloadCurrentHtmlZip = (html: string, extractImages: boolean) => {
  const { html: exportedHtml, assets } = extractImages
    ? extractDataUrlAssets(html)
    : { html, assets: [] as HtmlZipFile[] };
  const files: HtmlZipFile[] = [
    {
      path: "index.html",
      content: wrapHtmlDocument(exportedHtml),
      encoding: "text",
    },
    ...assets,
  ];

  downloadBlob(createZipBlob(files), "figma-html.zip");
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
    previewRefreshKey: 0,
  });

  const rootStyles = getComputedStyle(document.documentElement);
  const figmaColorBgValue = rootStyles
    .getPropertyValue("--figma-color-bg")
    .trim();

  useEffect(() => {
    window.onmessage = (event: MessageEvent) => {
      const untypedMessage = event.data.pluginMessage as Message;
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
  const html = state.htmlPreview.content || state.code;
  const iframePreviewPayload: IframePreviewPayload = {
    type: "figma-to-code-preview",
    version: 1,
    selection: state.selectionPreviewNodes,
    sections: html
      ? [
          {
            name: state.selectionPreviewNodes[0]?.name ?? "Figma selection",
            html,
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
        previewPayload={iframePreviewPayload}
        previewRefreshKey={state.previewRefreshKey}
        onDownloadHtmlZip={(extractImages) => {
          downloadCurrentHtmlZip(html, extractImages);
        }}
        onPreviewHtml={() => {
          setState((prevState) => ({
            ...prevState,
            previewRefreshKey: prevState.previewRefreshKey + 1,
          }));
        }}
      />
    </div>
  );
}
