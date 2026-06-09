import { tailwindCodeGenTextStyles } from "./../../../packages/backend/src/tailwind/tailwindMain";
import {
  flutterMain,
  tailwindMain,
  swiftuiMain,
  htmlMain,
  interactiveHtmlMain,
  composeMain,
  postSettingsChanged,
} from "backend";
import { nodesToJSON } from "backend/src/altNodes/jsonNodeConversion";
import { oldConvertNodesToAltNodes } from "backend/src/altNodes/oldAltConversion";
import { retrieveGenericSolidUIColors } from "backend/src/common/retrieveUI/retrieveColors";
import { collectInteractionDestinationIds } from "backend/src/interactions/interactionModel";
import { flutterCodeGenTextStyles } from "backend/src/flutter/flutterMain";
import { htmlCodeGenTextStyles } from "backend/src/html/htmlMain";
import { swiftUICodeGenTextStyles } from "backend/src/swiftui/swiftuiMain";
import { composeCodeGenTextStyles } from "backend/src/compose/composeMain";
import {
  DownloadHtmlZipMessage,
  HtmlZipProgressMessage,
  HtmlZipFile,
  PluginSettings,
  SelectionPreviewNode,
  SettingWillChangeMessage,
} from "types";

let userPluginSettings: PluginSettings;
const previewUrlStorageKey = "bitstackPreviewUrl";
const defaultPreviewUrl = "https://help.gdg168.com/";
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
  interactiveHtmlExport: false,
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

const sanitizeAssetFileName = (value: string, fallback: string) => {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
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
  const inlineOnlyDataLayer = "_HELP_CONTENT";
  const dataUrlPattern =
    /data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/g;
  const tagPattern = /<\/?([a-zA-Z][\w:-]*)([^<>]*)>/g;
  const usedAssetPaths = new Set(files.map((file) => file.path));
  const assetPathByDataUrl = new Map<string, string>();
  const inlineOnlyStack: boolean[] = [];
  const getShortHash = (value: string) => {
    let hash = 0;

    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }

    return hash.toString(36).padStart(6, "0").slice(0, 8);
  };
  const getDataLayerFromAttributes = (attributes: string) => {
    return (
      attributes.match(/\sdata-layer=(["'])(.*?)\1/i)?.[2]?.trim() || filePrefix
    );
  };
  const createAssetPath = (
    dataLayer: string,
    extension: string,
    base64: string,
  ) => {
    const stableName = sanitizeAssetFileName(dataLayer, filePrefix);
    const hash = getShortHash(base64);
    let assetPath = `_assets/${stableName}-${hash}.${extension}`;
    let duplicateIndex = 2;

    while (usedAssetPaths.has(assetPath)) {
      assetPath = `_assets/${stableName}-${hash}-${duplicateIndex
        .toString()
        .padStart(2, "0")}.${extension}`;
      duplicateIndex += 1;
    }

    usedAssetPaths.add(assetPath);
    return assetPath;
  };

  return content.replace(tagPattern, (tag, tagName, attributes = "") => {
    const normalizedTagName = tagName.toLowerCase();
    const isClosingTag = tag.startsWith("</");
    const isSelfClosingTag =
      tag.endsWith("/>") ||
      [
        "area",
        "base",
        "br",
        "col",
        "embed",
        "hr",
        "img",
        "input",
        "link",
        "meta",
        "param",
        "source",
        "track",
        "wbr",
      ].includes(normalizedTagName);

    if (isClosingTag) {
      inlineOnlyStack.pop();
      return tag;
    }

    const isInsideInlineOnlyLayer = inlineOnlyStack.some(Boolean);
    const hasDataImage = attributes.includes("data:image/");
    const dataLayer = getDataLayerFromAttributes(attributes);
    const startsInlineOnlyLayer = dataLayer === inlineOnlyDataLayer;
    const shouldKeepImageInline =
      normalizedTagName === "img" && isInsideInlineOnlyLayer && hasDataImage;

    if (!isSelfClosingTag) {
      inlineOnlyStack.push(isInsideInlineOnlyLayer || startsInlineOnlyLayer);
    }

    if (shouldKeepImageInline || !hasDataImage) {
      return tag;
    }

    const nextAttributes = attributes.replace(
      dataUrlPattern,
      (dataUrl, mimeType, base64) => {
        const existingAssetPath = assetPathByDataUrl.get(dataUrl);
        if (existingAssetPath) {
          return existingAssetPath;
        }

        const extension = getDataUrlExtension(mimeType);
        const assetPath = createAssetPath(dataLayer, extension, base64);

        assetPathByDataUrl.set(dataUrl, assetPath);
        files.push({
          path: assetPath,
          content: base64,
          encoding: "base64",
        });

        return assetPath;
      },
    );

    return `<${tagName}${nextAttributes}>`;
  });
};

type HtmlDocumentAssets = {
  cssHref?: string;
  jsSrc?: string;
};

const extractInlineScripts = (html: string) => {
  const scripts: string[] = [];
  const htmlWithoutScripts = html.replace(
    /<script(?![^>]*\btype=(["'])application\/json\1)[^>]*>([\s\S]*?)<\/script>/gi,
    (_scriptTag, _quote, scriptContent: string) => {
      const trimmedScript = scriptContent.trim();
      if (trimmedScript) {
        scripts.push(trimmedScript);
      }

      return "";
    },
  );

  return {
    html: htmlWithoutScripts,
    js: scripts.join("\n\n"),
  };
};

const wrapHtmlDocument = (
  title: string,
  body: string,
  css?: string,
  assets: HtmlDocumentAssets = {},
) => {
  const cssTag = assets.cssHref
    ? `  <link rel="stylesheet" href="${escapeHtmlAttribute(assets.cssHref)}" />\n`
    : css
      ? `  <style>\n${css}\n  </style>\n`
      : "";
  const jsTag = assets.jsSrc
    ? `\n<script src="${escapeHtmlAttribute(assets.jsSrc)}"></script>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title.replace(/[<>&"]/g, "")}</title>
${cssTag}</head>
<body>
${body}${jsTag}
</body>
</html>`;
};

const formatDownloadTimestamp = () => {
  const date = new Date();
  const pad = (value: number) => value.toString().padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds(),
  )}`;
};

const formatZipTimestamp = () => {
  const date = new Date();
  const pad = (value: number) => value.toString().padStart(2, "0");

  return `${date.getFullYear().toString().slice(-2)}${pad(
    date.getMonth() + 1,
  )}${pad(date.getDate())}${pad(date.getHours())}${pad(
    date.getMinutes(),
  )}${pad(date.getSeconds())}`;
};

const escapeHtmlAttribute = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const getRootStartTagMatch = (html: string) =>
  html.match(/<([a-zA-Z][\w:-]*)(\s[^<>]*)?>/);

const getRootDataLayer = (html: string) => {
  const rootMatch = getRootStartTagMatch(html);
  const attributes = rootMatch?.[2] ?? "";
  const dataLayerMatch = attributes.match(/\sdata-layer=(["'])(.*?)\1/i);

  return dataLayerMatch?.[2]?.trim() || "help";
};

const applyDataLastUpdateToRoot = (html: string) => {
  const timestamp = escapeHtmlAttribute(formatDownloadTimestamp());

  return html.replace(
    /<([a-zA-Z][\w:-]*)(\s[^<>]*)?>/,
    (match, tagName, rawAttributes = "") => {
      const attributes = rawAttributes || "";

      if (/\sdata-last-update=(["']).*?\1/i.test(attributes)) {
        return `<${tagName}${attributes.replace(
          /\sdata-last-update=(["']).*?\1/i,
          ` data-last-update="${timestamp}"`,
        )}>`;
      }

      return `<${tagName}${attributes} data-last-update="${timestamp}">`;
    },
  );
};

const addRobotoToInlineFontFamilies = (html: string) => {
  return html.replace(
    /\sstyle=(["'])(.*?)\1/gi,
    (_styleAttribute, quote: string, styleValue: string) => {
      const nextStyleValue = styleValue.replace(
        /font-family\s*:\s*([^;]+)/gi,
        (fontFamilyDeclaration, fontFamilyValue: string) => {
          if (/roboto/i.test(fontFamilyValue)) {
            return fontFamilyDeclaration;
          }

          return fontFamilyDeclaration.replace(
            fontFamilyValue,
            `${fontFamilyValue.trim()}, Roboto`,
          );
        },
      );

      return ` style=${quote}${nextStyleValue}${quote}`;
    },
  );
};

const prepareHtmlForDownload = (html: string) => {
  return addRobotoToInlineFontFamilies(applyDataLastUpdateToRoot(html));
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

const postPreviewUrlSetting = async () => {
  const storedPreviewUrl =
    (await figma.clientStorage.getAsync(previewUrlStorageKey)) ||
    figma.root.getPluginData(previewUrlStorageKey);
  const previewUrl =
    typeof storedPreviewUrl === "string" &&
    /^https?:\/\//.test(storedPreviewUrl)
      ? storedPreviewUrl
      : defaultPreviewUrl;

  console.log("[preview-url] loaded", {
    clientStorage: await figma.clientStorage.getAsync(previewUrlStorageKey),
    rootPluginData: figma.root.getPluginData(previewUrlStorageKey),
    previewUrl,
  });

  figma.ui.postMessage({
    type: "preview-url-setting",
    previewUrl,
  });
};

const normalizePreviewUrl = (value: string) => {
  const trimmed = value.trim();

  if (!/^https?:\/\/[^/\s]+/i.test(trimmed)) {
    throw new Error("Preview URL must start with http:// or https://.");
  }

  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
};

type HtmlExportSection = {
  name: string;
  folder: string;
  fileName: string;
  html: string;
  css?: string;
  js?: string;
  assets: HtmlZipFile[];
};

const getSceneNodeById = async (nodeId: string) => {
  const node = await figma.getNodeByIdAsync(nodeId);

  if (!node || !("type" in node) || !("visible" in node)) {
    throw new Error("Selected frame was not found.");
  }

  return node as SceneNode;
};

const postHtmlZipProgress = (current: number, total: number, label: string) => {
  figma.ui.postMessage({
    type: "html-zip-progress",
    current,
    total,
    label,
  } as HtmlZipProgressMessage);
};

const getUniqueFolderName = (
  baseName: string,
  usedFolderNames: Map<string, number>,
) => {
  const usedCount = usedFolderNames.get(baseName) ?? 0;
  usedFolderNames.set(baseName, usedCount + 1);

  return usedCount === 0
    ? baseName
    : `${baseName}-${(usedCount + 1).toString().padStart(2, "0")}`;
};

const getNumericNamePrefixes = (nodes: readonly SceneNode[]) => {
  const prefixes: string[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    const prefix = node.name.match(/^(\d+)(?=[-_]|$)/)?.[1] ?? "";
    if (prefix && !seen.has(prefix)) {
      seen.add(prefix);
      prefixes.push(prefix);
    }
  }

  return prefixes;
};

const getZipFileName = (
  selectedNodes: readonly SceneNode[],
  sections: HtmlExportSection[],
) => {
  if (selectedNodes.length === 1) {
    return `${sections[0]?.fileName.replace(/\.html$/i, "") || "help"}.zip`;
  }

  const numericPrefixes = getNumericNamePrefixes(selectedNodes);
  const baseName =
    numericPrefixes.length > 0
      ? sanitizeFileName(numericPrefixes.join("_"), "figma-sections")
      : "figma-sections";

  return `${baseName}-${formatZipTimestamp()}.zip`;
};

const getUniqueFileName = (fileName: string, usedFileNames: Set<string>) => {
  if (!usedFileNames.has(fileName)) {
    usedFileNames.add(fileName);
    return fileName;
  }

  const extensionMatch = fileName.match(/(\.[^.]+)$/);
  const extension = extensionMatch?.[1] ?? "";
  const baseName = extension ? fileName.slice(0, -extension.length) : fileName;
  let duplicateIndex = 2;
  let nextFileName = `${baseName}-${duplicateIndex
    .toString()
    .padStart(2, "0")}${extension}`;

  while (usedFileNames.has(nextFileName)) {
    duplicateIndex += 1;
    nextFileName = `${baseName}-${duplicateIndex
      .toString()
      .padStart(2, "0")}${extension}`;
  }

  usedFileNames.add(nextFileName);
  return nextFileName;
};

const getFileNameStem = (fileName: string) => fileName.replace(/\.[^.]+$/, "");

const collectNodeIds = (nodes: readonly SceneNode[]) => {
  const ids = new Set<string>();
  const visit = (node: any) => {
    if (!node?.id) {
      return;
    }

    ids.add(node.id);

    if (Array.isArray(node.children)) {
      node.children.forEach(visit);
    }
  };

  nodes.forEach(visit);
  return ids;
};

const getInteractionTemplateNodes = async (
  convertedSelection: SceneNode[],
  settings: PluginSettings,
) => {
  const exportedIds = collectNodeIds(convertedSelection);
  const queuedDestinationIds =
    collectInteractionDestinationIds(convertedSelection);
  const processedDestinationIds = new Set<string>();
  const templateNodes: SceneNode[] = [];

  while (queuedDestinationIds.length > 0) {
    const destinationId = queuedDestinationIds.shift();
    if (
      !destinationId ||
      exportedIds.has(destinationId) ||
      processedDestinationIds.has(destinationId)
    ) {
      continue;
    }
    processedDestinationIds.add(destinationId);

    const destination = await figma.getNodeByIdAsync(destinationId);
    if (
      !destination ||
      !("type" in destination) ||
      !("visible" in destination)
    ) {
      continue;
    }

    const convertedDestination = settings.useOldPluginVersion2025
      ? oldConvertNodesToAltNodes([destination as SceneNode], null)
      : await nodesToJSON([destination as SceneNode], settings);
    const convertedTemplateNodes = convertedDestination as SceneNode[];

    templateNodes.push(...convertedTemplateNodes);
    collectNodeIds(convertedTemplateNodes).forEach((id) => exportedIds.add(id));
    collectInteractionDestinationIds(convertedTemplateNodes).forEach(
      (nestedDestinationId) => {
        if (
          !exportedIds.has(nestedDestinationId) &&
          !processedDestinationIds.has(nestedDestinationId)
        ) {
          queuedDestinationIds.push(nestedDestinationId);
        }
      },
    );
  }

  return templateNodes;
};

const buildHtmlExportSections = async (
  settings: PluginSettings,
  extractImages: boolean,
  interactiveHtmlExport: boolean,
  extractCodeAssets: boolean,
  nodes?: readonly SceneNode[],
) => {
  const selectedNodes = nodes ?? figma.currentPage.selection;

  if (selectedNodes.length === 0) {
    throw new Error("Please select at least one section or frame.");
  }

  const exportSettings: PluginSettings = {
    ...settings,
    framework: "HTML",
    htmlGenerationMode: "html",
    interactiveHtmlExport,
    embedImages: true,
  };

  const sections: HtmlExportSection[] = [];
  const multiExport = selectedNodes.length > 1;
  const usedFolderNames = new Map<string, number>();

  for (const [index, node] of selectedNodes.entries()) {
    postHtmlZipProgress(
      index,
      selectedNodes.length,
      `Preparing ${node.name || `section ${index + 1}`}...`,
    );
    const baseName = sanitizeFileName(
      node.name,
      `section-${(index + 1).toString().padStart(2, "0")}`,
    );
    const folder = multiExport
      ? getUniqueFolderName(baseName, usedFolderNames)
      : baseName;
    const convertedSelection = settings.useOldPluginVersion2025
      ? oldConvertNodesToAltNodes([node], null)
      : await nodesToJSON([node], exportSettings);
    const convertedSceneNodes = convertedSelection as SceneNode[];
    const templateNodes = interactiveHtmlExport
      ? await getInteractionTemplateNodes(convertedSceneNodes, exportSettings)
      : [];
    const result = interactiveHtmlExport
      ? await interactiveHtmlMain(
          convertedSceneNodes,
          exportSettings,
          false,
          templateNodes,
        )
      : await htmlMain(convertedSceneNodes, exportSettings);
    const assets: HtmlZipFile[] = [];
    const htmlWithAssets = extractImages
      ? extractDataUrlAssets(result.html, "image", assets)
      : result.html;
    let css = result.css;
    if (css && extractImages) {
      css = extractDataUrlAssets(css, "css-image", assets);
    }
    const preparedHtml = prepareHtmlForDownload(htmlWithAssets);
    const extractedScripts = extractCodeAssets
      ? extractInlineScripts(preparedHtml)
      : null;
    const html = extractedScripts?.html ?? preparedHtml;
    const dataLayer = getRootDataLayer(html);
    const fileName = `${sanitizeFileName(dataLayer, "help")}.html`;

    sections.push({
      name: baseName,
      folder,
      fileName,
      html,
      css,
      js: extractedScripts?.js,
      assets,
    });
    postHtmlZipProgress(
      index + 1,
      selectedNodes.length,
      `Prepared ${node.name || `section ${index + 1}`}`,
    );
  }

  return sections;
};

const buildHtmlDownload = async (
  settings: PluginSettings,
  extractImages: boolean,
  interactiveHtmlExport: boolean = false,
  extractCodeAssets: boolean = false,
  nodeId?: string,
) => {
  const selectedNodes = nodeId
    ? [await getSceneNodeById(nodeId)]
    : figma.currentPage.selection;
  postHtmlZipProgress(0, selectedNodes.length, "Starting export...");
  const sections = await buildHtmlExportSections(
    settings,
    extractImages,
    interactiveHtmlExport,
    extractCodeAssets,
    selectedNodes,
  );

  if (!extractImages && !extractCodeAssets && sections.length === 1) {
    const section = sections[0];

    return {
      type: "html-file-ready" as const,
      fileName: section.fileName,
      content: wrapHtmlDocument(section.name, section.html, section.css),
    };
  }

  const files: HtmlZipFile[] = [];
  const usedFileNames = new Set<string>();

  for (const section of sections) {
    const htmlFileName =
      extractImages || extractCodeAssets
        ? section.fileName
        : getUniqueFileName(section.fileName, usedFileNames);
    const codeFileStem = getFileNameStem(htmlFileName);
    const cssFileName = `${codeFileStem}.css`;
    const jsFileName = `${codeFileStem}.js`;
    const isFolderExport =
      sections.length > 1 && (extractImages || extractCodeAssets);
    const htmlPath = isFolderExport
      ? `${section.folder}/${htmlFileName}`
      : htmlFileName;
    const cssPath = isFolderExport
      ? `${section.folder}/${cssFileName}`
      : cssFileName;
    const jsPath = isFolderExport
      ? `${section.folder}/${jsFileName}`
      : jsFileName;
    const cssHref = extractCodeAssets && section.css ? cssFileName : undefined;
    const jsSrc = extractCodeAssets && section.js ? jsFileName : undefined;

    files.push({
      path: htmlPath,
      content: wrapHtmlDocument(
        section.name,
        section.html,
        extractCodeAssets ? undefined : section.css,
        {
          cssHref,
          jsSrc,
        },
      ),
      encoding: "text",
    });

    if (extractCodeAssets && section.css) {
      files.push({
        path: cssPath,
        content: section.css,
        encoding: "text",
      });
    }

    if (extractCodeAssets && section.js) {
      files.push({
        path: jsPath,
        content: section.js,
        encoding: "text",
      });
    }

    if (extractImages) {
      files.push(
        ...section.assets.map((asset) => ({
          ...asset,
          path:
            sections.length === 1
              ? asset.path
              : `${section.folder}/${asset.path}`,
        })),
      );
    }
  }

  return {
    type: "html-zip-ready" as const,
    fileName: getZipFileName(selectedNodes, sections),
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
  const result = await htmlMain(
    convertedSelection as SceneNode[],
    exportSettings,
  );

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
      await postPreviewUrlSetting();
    } else if (msg.type === "pluginSettingWillChange") {
      const { key, value } = msg as SettingWillChangeMessage<unknown>;
      console.log(`[DEBUG] Setting changed: ${key} = ${value}`);
      (userPluginSettings as any)[key] = value;
      figma.clientStorage.setAsync("userPluginSettings", userPluginSettings);
    } else if (msg.type === "download-html-zip") {
      try {
        const {
          extractImages,
          interactiveHtmlExport,
          extractCodeAssets,
          nodeId,
        } = msg as DownloadHtmlZipMessage;
        const downloadData = await buildHtmlDownload(
          userPluginSettings,
          extractImages,
          Boolean(interactiveHtmlExport),
          Boolean(extractCodeAssets),
          nodeId,
        );
        figma.ui.postMessage(downloadData);
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
    } else if (msg.type === "save-preview-url") {
      const { previewUrl } = msg as {
        type: "save-preview-url";
        previewUrl: string;
      };
      const normalizedPreviewUrl = normalizePreviewUrl(previewUrl);

      await figma.clientStorage.setAsync(
        previewUrlStorageKey,
        normalizedPreviewUrl,
      );
      figma.root.setPluginData(previewUrlStorageKey, normalizedPreviewUrl);
      console.log("[preview-url] saved", {
        clientStorage: await figma.clientStorage.getAsync(previewUrlStorageKey),
        rootPluginData: figma.root.getPluginData(previewUrlStorageKey),
        previewUrl: normalizedPreviewUrl,
      });
      figma.ui.postMessage({
        type: "preview-url-setting",
        previewUrl: normalizedPreviewUrl,
      });
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
