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
  ExportHtmlFilesResponseMessage,
  Warning,
  SelectedNode,
} from "types";
import {
  postUIExportHtmlFilesMessage,
  postUISettingsChangingMessage,
} from "./messaging";
import copy from "copy-to-clipboard";

interface AppState {
  code: string;
  selectedFramework: Framework;
  isLoading: boolean;
  htmlPreview: HTMLPreview;
  settings: PluginSettings | null;
  colors: SolidColorConversion[];
  gradients: LinearGradientConversion[];
  warnings: Warning[];
  selectedNodes: SelectedNode[];
  exportProgress?: {
    current: number;
    total: number;
  };
}

const emptyPreview = { size: { width: 0, height: 0 }, content: "" };
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
    selectedNodes: [],
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
            selectedNodes: conversionMessage.selectedNodes || [],
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

        case "export-html-files-start":
          console.log("[export] Starting export of", event.data.pluginMessage.total, "files");
          setState((prevState) => ({
            ...prevState,
            exportProgress: { current: 0, total: event.data.pluginMessage.total },
          }));
          break;

        case "export-html-files-progress":
          console.log("[export] Progress:", event.data.pluginMessage.processed, "/", event.data.pluginMessage.total);
          setState((prevState) => ({
            ...prevState,
            exportProgress: {
              current: event.data.pluginMessage.processed,
              total: event.data.pluginMessage.total,
            },
          }));
          break;

        case "export-html-files-response":
          const exportMessage = untypedMessage as ExportHtmlFilesResponseMessage;
          downloadHtmlFiles(exportMessage.files);
          // 清除进度显示
          setTimeout(() => {
            setState((prevState) => ({
              ...prevState,
              exportProgress: undefined,
            }));
          }, 500);
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

  const downloadHtmlFiles = async (
    files: Array<{ filename: string; content: string }>,
  ) => {
    try {
      console.log("[download] Starting download for", files.length, "files");
      
      // 单文件：直接下载，无需ZIP压缩 - 更快
      if (files.length === 1) {
        console.log("[download] Single file - direct download without ZIP");
        const { filename, content } = files[0];
        const blob = new Blob([content], { type: "text/html;charset=utf-8" });
        triggerDownload(blob, filename);
        return;
      }

      // 多文件：使用ZIP压缩（动态导入JSZip - 只在需要时加载）
      console.log("[download] Multiple files - lazy loading JSZip");
      const JSZip = (await import("jszip")).default;
      
      const zip = new JSZip();
      files.forEach((file) => {
        zip.file(file.filename, file.content);
      });

      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      triggerDownload(blob, "figma-html-export.zip");
    } catch (error) {
      console.error("Failed to download files:", error);
    }
  };

  // 高效下载触发函数 - 最小化DOM操作
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    // 使用click()而不是appendChild + click + removeChild - 更高效
    link.click();
    // 延迟释放URL - 确保下载完成
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

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

  const handleExportHtmlFiles = () => {
    postUIExportHtmlFilesMessage({ targetOrigin: "*" });
  };

  const darkMode = isDarkFigmaBackground(figmaColorBgValue);

  return (
    <div
      className={`${darkMode ? "dark" : ""} h-full bg-background text-foreground`}
    >
      <PluginUI
        isLoading={state.isLoading}
        selectedNodes={state.selectedNodes}
        onExportHTMLFiles={handleExportHtmlFiles}
        exportProgress={state.exportProgress}
      />
    </div>
  );
}
