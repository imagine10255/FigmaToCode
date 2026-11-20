import { HtmlZipFile } from "types";
import swiperJs from "./vendor/swiper-bundle.min.js?raw";
import swiperCss from "./vendor/swiper-bundle.min.css?raw";
import { previewFontFaceCss } from "./previewFonts";

// Turns the files of a download (html + styles.css + script.js + _assets) into one
// self-contained html for the "preview download" iframe. Nothing in the html changes
// except that each reference to a file of the export becomes a data: URL, so tags,
// order and `defer` stay exactly as in the zip.

// The plugin may only reach help.gdg168.com, so the Swiper the page loads from jsDelivr
// comes from this bundled copy: 11.2.10, the version "swiper@11" resolves to.
const SWIPER_CDN_PATTERN =
  /https:\/\/cdn\.jsdelivr\.net\/npm\/swiper@[^/"']+\/swiper-bundle\.min\.(js|css)/g;

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  css: "text/css",
  js: "text/javascript",
  json: "application/json",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
};

const textEncoder = new TextEncoder();

const getMimeType = (path: string) =>
  MIME_TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ??
  "application/octet-stream";

const textToBase64 = (text: string) => {
  const bytes = textEncoder.encode(text);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};

const toDataUrl = (mimeType: string, base64: string) =>
  `data:${mimeType};base64,${base64}`;

const getDirectory = (path: string) =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";

const resolvePath = (directory: string, reference: string) => {
  const parts: string[] = [];
  for (const part of `${directory}${reference}`.split("/")) {
    if (part === "..") {
      parts.pop();
    } else if (part && part !== ".") {
      parts.push(part);
    }
  }
  return parts.join("/");
};

const swiperDataUrls: Record<string, string> = {
  js: toDataUrl("text/javascript", textToBase64(swiperJs)),
  css: toDataUrl("text/css", textToBase64(swiperCss)),
};

export const buildDownloadPreviewDocument = (files: HtmlZipFile[]) => {
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const dataUrlCache = new Map<string, string>();

  // Every attribute value (src="…", href='…') and CSS url(…) that names a file of the export.
  const embedReferences = (text: string, directory: string): string => {
    const replaceReference = (
      match: string,
      open: string,
      reference: string,
      close: string,
    ) => {
      if (/^(data:|https?:|blob:|#)/i.test(reference)) {
        return match;
      }
      const path = resolvePath(directory, reference.split(/[?#]/)[0]);
      const file = filesByPath.get(path);
      return file ? `${open}${fileToDataUrl(file)}${close}` : match;
    };
    return text
      .replace(/(=\s*["'])([^"'\s<>]+)(["'])/g, replaceReference)
      .replace(
        /(url\(\s*(?:["']|&quot;)?)([^"'()\s&]+)((?:["']|&quot;)?\s*\))/g,
        replaceReference,
      );
  };

  const fileToDataUrl = (file: HtmlZipFile): string => {
    const cached = dataUrlCache.get(file.path);
    if (cached) {
      return cached;
    }
    const mimeType = getMimeType(file.path);
    const dataUrl =
      file.encoding === "base64"
        ? toDataUrl(mimeType, file.content)
        : toDataUrl(
            mimeType,
            textToBase64(
              // A stylesheet's own url(...) references are relative to the stylesheet.
              mimeType === "text/css"
                ? embedReferences(file.content, getDirectory(file.path))
                : file.content,
            ),
          );
    dataUrlCache.set(file.path, dataUrl);
    return dataUrl;
  };

  const htmlFile = files
    .filter((file) => /\.html?$/i.test(file.path))
    .sort((a, b) => a.path.split("/").length - b.path.split("/").length)[0];
  if (!htmlFile) {
    throw new Error("The export has no html page.");
  }

  const html = htmlFile.content.replace(
    SWIPER_CDN_PATTERN,
    (_url, extension: string) => swiperDataUrls[extension],
  );
  const page = embedReferences(html, getDirectory(htmlFile.path));
  // The plugin window cannot use the computer's own fonts; give the page bundled copies.
  const fontCss = previewFontFaceCss(page);
  if (!fontCss) {
    return page;
  }
  const fontStyle = `<style data-preview-fonts>\n${fontCss}\n</style>\n`;
  return /<\/head>/i.test(page)
    ? page.replace(/<\/head>/i, `${fontStyle}</head>`)
    : fontStyle + page;
};
