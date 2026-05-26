import { tailwindCodeGenTextStyles } from "./../../../packages/backend/src/tailwind/tailwindMain";
import {
  flutterMain,
  tailwindMain,
  swiftuiMain,
  htmlMain,
  composeMain,
  postSettingsChanged,
} from "backend";
import { nodesToJSON } from "backend/src/altNodes/jsonNodeConversion";
import { oldConvertNodesToAltNodes } from "backend/src/altNodes/oldAltConversion";
import { retrieveGenericSolidUIColors } from "backend/src/common/retrieveUI/retrieveColors";
import { flutterCodeGenTextStyles } from "backend/src/flutter/flutterMain";
import { htmlCodeGenTextStyles } from "backend/src/html/htmlMain";
import { swiftUICodeGenTextStyles } from "backend/src/swiftui/swiftuiMain";
import { composeCodeGenTextStyles } from "backend/src/compose/composeMain";
import {
  DownloadHtmlZipMessage,
  HtmlZipFile,
  PluginSettings,
  SelectionPreviewNode,
  SettingWillChangeMessage,
} from "types";

let userPluginSettings: PluginSettings;
const forcedDefaultSettingKeys = new Set<keyof PluginSettings>([
  "framework",
  "htmlGenerationMode",
  "showLayerNames",
  "useColorVariables",
  "embedImages",
  "embedVectors",
]);

export const defaultPluginSettings: PluginSettings = {
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
  tailwindGenerationMode: "jsx",
  baseFontSize: 16,
  useTailwind4: true,
  thresholdPercent: 15,
  baseFontFamily: "",
  fontFamilyCustomConfig: {},
};

// A helper type guard to ensure the key belongs to the PluginSettings type
function isKeyOfPluginSettings(key: string): key is keyof PluginSettings {
  return key in defaultPluginSettings;
}

const sanitizeFileName = (value: string, fallback: string) => {
  const cleaned = value
    .trim()
    .replace(/[\\/:*?"<>|#%{}^~[\]`;\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return cleaned || fallback;
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

const extractDataUrlAssets = (
  content: string,
  filePrefix: string,
  files: HtmlZipFile[],
) => {
  let imageIndex = 0;
  const dataUrlPattern =
    /data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/g;

  return content.replace(dataUrlPattern, (_match, mimeType, base64) => {
    imageIndex += 1;
    const extension = getDataUrlExtension(mimeType);
    const assetName = `${filePrefix}-${imageIndex.toString().padStart(2, "0")}.${extension}`;
    const assetPath = `assets/${assetName}`;

    files.push({
      path: assetPath,
      content: base64,
      encoding: "base64",
    });

    return `assets/${assetName}`;
  });
};

const wrapHtmlDocument = (title: string, body: string, css?: string) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title.replace(/[<>&"]/g, "")}</title>
${css ? `  <style>\n${css}\n  </style>\n` : ""}</head>
<body>
${body}
</body>
</html>`;
};

const toPreviewRgb = (color: RGB) => ({
  r: Math.round(color.r * 255),
  g: Math.round(color.g * 255),
  b: Math.round(color.b * 255),
});

const getPreviewFill = (node: SceneNode) => {
  if (!("fills" in node) || !Array.isArray(node.fills)) {
    return null;
  }

  const solidFill = node.fills.find(
    (paint): paint is SolidPaint => paint.type === "SOLID",
  );

  return solidFill ? toPreviewRgb(solidFill.color) : null;
};

const getPreviewSize = (node: SceneNode) => ({
  width: "width" in node ? node.width : null,
  height: "height" in node ? node.height : null,
});

const buildSelectionPreviewNodes = (): SelectionPreviewNode[] => {
  return figma.currentPage.selection.map((node) => {
    const size = getPreviewSize(node);

    return {
      id: node.id,
      name: node.name,
      type: node.type,
      width: size.width,
      height: size.height,
      fill: getPreviewFill(node),
    };
  });
};

const postSelectionPreviewData = () => {
  figma.ui.postMessage({
    type: "selection-preview-data",
    nodes: buildSelectionPreviewNodes(),
  });
};

type HtmlExportSection = {
  name: string;
  folder: string;
  html: string;
  css?: string;
  assets: HtmlZipFile[];
};

const buildHtmlExportSections = async (
  settings: PluginSettings,
  extractImages: boolean,
) => {
  const selectedNodes = figma.currentPage.selection;

  if (selectedNodes.length === 0) {
    throw new Error("Please select at least one section or frame.");
  }

  const exportSettings: PluginSettings = {
    ...settings,
    framework: "HTML",
    htmlGenerationMode: "html",
    embedImages: true,
  };

  const sections: HtmlExportSection[] = [];
  const multiExport = selectedNodes.length > 1;

  for (const [index, node] of selectedNodes.entries()) {
    const baseName = sanitizeFileName(
      node.name,
      `section-${(index + 1).toString().padStart(2, "0")}`,
    );
    const folder = multiExport
      ? `${(index + 1).toString().padStart(2, "0")}-${baseName}`
      : baseName;
    const convertedSelection = settings.useOldPluginVersion2025
      ? oldConvertNodesToAltNodes([node], null)
      : await nodesToJSON([node], exportSettings);
    const result = await htmlMain(convertedSelection, exportSettings);
    const assets: HtmlZipFile[] = [];
    const html = extractImages
      ? extractDataUrlAssets(result.html, "image", assets)
      : result.html;
    let css = result.css;
    if (css && extractImages) {
      css = extractDataUrlAssets(css, "css-image", assets);
    }

    sections.push({
      name: baseName,
      folder,
      html,
      css,
      assets,
    });
  }

  return sections;
};

const buildHtmlZipFiles = async (
  settings: PluginSettings,
  extractImages: boolean,
) => {
  const selectedNodes = figma.currentPage.selection;
  const sections = await buildHtmlExportSections(settings, extractImages);
  const files: HtmlZipFile[] = [];

  for (const section of sections) {
    files.push({
      path: `${section.folder}/index.html`,
      content: wrapHtmlDocument(section.name, section.html, section.css),
      encoding: "text",
    });
    files.push(
      ...section.assets.map((asset) => ({
        ...asset,
        path: `${section.folder}/${asset.path}`,
      })),
    );
  }

  return {
    fileName:
      selectedNodes.length === 1
        ? `${sanitizeFileName(selectedNodes[0].name, "figma-html")}.zip`
        : "figma-sections-html.zip",
    files,
  };
};

const getUserSettings = async () => {
  console.log("[DEBUG] getUserSettings - Starting to fetch user settings");
  const possiblePluginSrcSettings =
    (await figma.clientStorage.getAsync("userPluginSettings")) ?? {};
  console.log(
    "[DEBUG] getUserSettings - Raw settings from storage:",
    possiblePluginSrcSettings,
  );

  const updatedPluginSrcSettings = {
    ...defaultPluginSettings,
    ...Object.keys(defaultPluginSettings).reduce((validSettings, key) => {
      if (
        isKeyOfPluginSettings(key) &&
        key in possiblePluginSrcSettings &&
        typeof possiblePluginSrcSettings[key] ===
          typeof defaultPluginSettings[key] &&
        !forcedDefaultSettingKeys.has(key)
      ) {
        validSettings[key] = possiblePluginSrcSettings[key] as any;
      }
      return validSettings;
    }, {} as Partial<PluginSettings>),
  };

  userPluginSettings = updatedPluginSrcSettings as PluginSettings;
  console.log("[DEBUG] getUserSettings - Final settings:", userPluginSettings);
  return userPluginSettings;
};

const initSettings = async () => {
  console.log("[DEBUG] initSettings - Initializing plugin settings");
  await getUserSettings();
  postSettingsChanged(userPluginSettings);
};

const buildHtmlPreviewForNode = async (
  nodeId: string,
  settings: PluginSettings,
) => {
  const node = await figma.getNodeByIdAsync(nodeId);

  if (!node || !("type" in node)) {
    throw new Error("Selected frame was not found.");
  }

  const sceneNode = node as SceneNode;
  const exportSettings: PluginSettings = {
    ...settings,
    framework: "HTML",
    htmlGenerationMode: "html",
    embedImages: true,
  };
  const convertedSelection = settings.useOldPluginVersion2025
    ? oldConvertNodesToAltNodes([sceneNode], null)
    : await nodesToJSON([sceneNode], exportSettings);
  const result = await htmlMain(convertedSelection, exportSettings);

  return {
    nodeId: sceneNode.id,
    name: sceneNode.name,
    html: result.html,
    css: result.css,
  };
};

const standardMode = async () => {
  console.log("[DEBUG] standardMode - Starting standard mode initialization");
  figma.showUI(__html__, { width: 450, height: 700, themeColors: true });
  let initialized = false;
  const initializeOnce = async () => {
    if (initialized) {
      return;
    }
    initialized = true;
    postSelectionPreviewData();
    await initSettings();
  };

  // Listen for selection changes
  figma.on("selectionchange", () => {
    console.log(
      "[DEBUG] selectionchange event - New selection count:",
      figma.currentPage.selection.length,
    );
    postSelectionPreviewData();
  });

  // Listen for page changes
  figma.loadAllPagesAsync();
  figma.on("documentchange", () => {
    console.log("[DEBUG] documentchange event triggered");
    postSelectionPreviewData();
  });

  figma.ui.onmessage = async (msg) => {
    console.log(
      "[DEBUG] figma.ui.onmessage",
      msg?.type ? `type=${msg.type}` : "unknown type",
    );

    if (msg.type === "ui-ready") {
      await initializeOnce();
    } else if (msg.type === "pluginSettingWillChange") {
      const { key, value } = msg as SettingWillChangeMessage<unknown>;
      console.log(`[DEBUG] Setting changed: ${key} = ${value}`);
      (userPluginSettings as any)[key] = value;
      figma.clientStorage.setAsync("userPluginSettings", userPluginSettings);
    } else if (msg.type === "download-html-zip") {
      try {
        const { extractImages } = msg as DownloadHtmlZipMessage;
        const zipData = await buildHtmlZipFiles(
          userPluginSettings,
          extractImages,
        );
        figma.ui.postMessage({
          type: "html-zip-ready",
          ...zipData,
        });
      } catch (error) {
        figma.ui.postMessage({
          type: "html-zip-error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else if (msg.type === "resize-ui") {
      const { width, height } = msg as {
        type: "resize-ui";
        width: number;
        height: number;
      };
      figma.ui.resize(width, height);
    } else if (msg.type === "preview-node") {
      try {
        const { nodeId } = msg as { type: "preview-node"; nodeId: string };
        const preview = await buildHtmlPreviewForNode(
          nodeId,
          userPluginSettings,
        );

        figma.ui.postMessage({
          type: "preview-node-ready",
          ...preview,
        });
      } catch (error) {
        figma.ui.postMessage({
          type: "preview-node-error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else if (msg.type === "get-selection-json") {
      console.log("[DEBUG] get-selection-json message received");

      const nodes = figma.currentPage.selection;
      if (nodes.length === 0) {
        figma.ui.postMessage({
          type: "selection-json",
          data: { message: "No nodes selected" },
        });
        return;
      }
      const result: {
        json?: SceneNode[];
        oldConversion?: any;
        newConversion?: any;
      } = {};

      try {
        result.json = (await Promise.all(
          nodes.map(
            async (node) =>
              (
                (await node.exportAsync({
                  format: "JSON_REST_V1",
                })) as any
              ).document,
          ),
        )) as SceneNode[];
      } catch (error) {
        console.error("Error exporting JSON:", error);
      }

      try {
        const newNodes = await nodesToJSON(nodes, userPluginSettings);
        const removeParent = (node: any) => {
          if (node.parent) {
            delete node.parent;
          }
          if (node.children) {
            node.children.forEach(removeParent);
          }
        };
        newNodes.forEach(removeParent);
        result.newConversion = newNodes;
      } catch (error) {
        console.error("Error in new conversion:", error);
      }

      const nodeJson = result;

      console.log(
        "[DEBUG] Exported node JSON:",
        `jsonCount=${result.json?.length ?? 0}`,
        `newConversionCount=${result.newConversion?.length ?? 0}`,
      );

      // Send the JSON data back to the UI
      figma.ui.postMessage({
        type: "selection-json",
        data: nodeJson,
      });
    }
  };
};

const codegenMode = async () => {
  console.log("[DEBUG] codegenMode - Starting codegen mode initialization");
  // figma.showUI(__html__, { visible: false });
  await getUserSettings();

  figma.codegen.on(
    "generate",
    async ({ language, node }: CodegenEvent): Promise<CodegenResult[]> => {
      console.log(
        `[DEBUG] codegen.generate - Language: ${language}, Node: id=${node.id}, type=${node.type}`,
      );

      const convertedSelection = await nodesToJSON([node], userPluginSettings);
      console.log(
        "[DEBUG] codegen.generate - Converted selection count:",
        convertedSelection.length,
      );

      switch (language) {
        case "html":
          return [
            {
              title: "Code",
              code: (
                await htmlMain(
                  convertedSelection,
                  { ...userPluginSettings, htmlGenerationMode: "html" },
                  true,
                )
              ).html,
              language: "HTML",
            },
            {
              title: "Text Styles",
              code: htmlCodeGenTextStyles(userPluginSettings),
              language: "HTML",
            },
          ];
        case "html_jsx":
          return [
            {
              title: "Code",
              code: (
                await htmlMain(
                  convertedSelection,
                  { ...userPluginSettings, htmlGenerationMode: "jsx" },
                  true,
                )
              ).html,
              language: "HTML",
            },
            {
              title: "Text Styles",
              code: htmlCodeGenTextStyles(userPluginSettings),
              language: "HTML",
            },
          ];

        case "html_svelte":
          return [
            {
              title: "Code",
              code: (
                await htmlMain(
                  convertedSelection,
                  { ...userPluginSettings, htmlGenerationMode: "svelte" },
                  true,
                )
              ).html,
              language: "HTML",
            },
            {
              title: "Text Styles",
              code: htmlCodeGenTextStyles(userPluginSettings),
              language: "HTML",
            },
          ];

        case "html_styled_components":
          return [
            {
              title: "Code",
              code: (
                await htmlMain(
                  convertedSelection,
                  {
                    ...userPluginSettings,
                    htmlGenerationMode: "styled-components",
                  },
                  true,
                )
              ).html,
              language: "HTML",
            },
            {
              title: "Text Styles",
              code: htmlCodeGenTextStyles(userPluginSettings),
              language: "HTML",
            },
          ];

        case "tailwind":
        case "tailwind_jsx":
          return [
            {
              title: "Code",
              code: await tailwindMain(convertedSelection, {
                ...userPluginSettings,
                tailwindGenerationMode:
                  language === "tailwind_jsx" ? "jsx" : "html",
              }),
              language: "HTML",
            },
            // {
            //   title: "Style",
            //   code: tailwindMain(convertedSelection, defaultPluginSettings),
            //   language: "HTML",
            // },
            {
              title: "Tailwind Colors",
              code: (await retrieveGenericSolidUIColors("Tailwind"))
                .map((d) => {
                  let str = `${d.hex};`;
                  if (d.colorName !== d.hex) {
                    str += ` // ${d.colorName}`;
                  }
                  if (d.meta) {
                    str += ` (${d.meta})`;
                  }
                  return str;
                })
                .join("\n"),
              language: "JAVASCRIPT",
            },
            {
              title: "Text Styles",
              code: tailwindCodeGenTextStyles(),
              language: "HTML",
            },
          ];
        case "flutter":
          return [
            {
              title: "Code",
              code: flutterMain(convertedSelection, {
                ...userPluginSettings,
                flutterGenerationMode: "snippet",
              }),
              language: "SWIFT",
            },
            {
              title: "Text Styles",
              code: flutterCodeGenTextStyles(),
              language: "SWIFT",
            },
          ];
        case "swiftUI":
          return [
            {
              title: "SwiftUI",
              code: swiftuiMain(convertedSelection, {
                ...userPluginSettings,
                swiftUIGenerationMode: "snippet",
              }),
              language: "SWIFT",
            },
            {
              title: "Text Styles",
              code: swiftUICodeGenTextStyles(),
              language: "SWIFT",
            },
          ];
        // case "compose":
        //   return [
        //     {
        //       title: "Jetpack Compose",
        //       code: composeMain(convertedSelection, {
        //         ...userPluginSettings,
        //         composeGenerationMode: "snippet",
        //       }),
        //       language: "KOTLIN",
        //     },
        //     {
        //       title: "Text Styles",
        //       code: composeCodeGenTextStyles(),
        //       language: "KOTLIN",
        //     },
        //   ];
        default:
          break;
      }

      const blocks: CodegenResult[] = [];
      return blocks;
    },
  );
};

switch (figma.mode) {
  case "default":
  case "inspect":
    console.log("[DEBUG] Starting plugin in", figma.mode, "mode");
    standardMode();
    break;
  case "codegen":
    console.log("[DEBUG] Starting plugin in codegen mode");
    codegenMode();
    break;
  default:
    console.log("[DEBUG] Unknown plugin mode:", figma.mode);
    break;
}
