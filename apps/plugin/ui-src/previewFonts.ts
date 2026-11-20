// Fonts embedded into the download preview. Figma's plugin window cannot use fonts that are
// installed only for the current Windows user, so without these the preview fell back to a
// serif font. See fonts/README.txt. Vite inlines each file as a data: URL.
import robotoRegular from "./fonts/Roboto-Regular.ttf";
import robotoItalic from "./fonts/Roboto-Italic.ttf";
import robotoMedium from "./fonts/Roboto-Medium.ttf";
import robotoMediumItalic from "./fonts/Roboto-MediumItalic.ttf";
import robotoBold from "./fonts/Roboto-Bold.ttf";
import robotoBoldItalic from "./fonts/Roboto-BoldItalic.ttf";
import promptRegular from "./fonts/Prompt-Regular.ttf";
import promptMedium from "./fonts/Prompt-Medium.ttf";
import promptSemiBold from "./fonts/Prompt-SemiBold.ttf";
import promptBold from "./fonts/Prompt-Bold.ttf";
import bengaliRegular from "./fonts/NotoSansBengali-Regular.ttf";
import bengaliBold from "./fonts/NotoSansBengali-Bold.ttf";
import pyidaungsuRegular from "./fonts/Pyidaungsu-Regular.ttf";
import pyidaungsuBold from "./fonts/Pyidaungsu-Bold.ttf";

type PreviewFont = {
  family: string;
  weight: number;
  italic: boolean;
  src: string;
};

const PREVIEW_FONTS: PreviewFont[] = [
  { family: "Roboto", weight: 400, italic: false, src: robotoRegular },
  { family: "Roboto", weight: 400, italic: true, src: robotoItalic },
  { family: "Roboto", weight: 500, italic: false, src: robotoMedium },
  { family: "Roboto", weight: 500, italic: true, src: robotoMediumItalic },
  { family: "Roboto", weight: 700, italic: false, src: robotoBold },
  { family: "Roboto", weight: 700, italic: true, src: robotoBoldItalic },
  { family: "Prompt", weight: 400, italic: false, src: promptRegular },
  { family: "Prompt", weight: 500, italic: false, src: promptMedium },
  { family: "Prompt", weight: 600, italic: false, src: promptSemiBold },
  { family: "Prompt", weight: 700, italic: false, src: promptBold },
  { family: "Noto Sans Bengali", weight: 400, italic: false, src: bengaliRegular },
  { family: "Noto Sans Bengali", weight: 700, italic: false, src: bengaliBold },
  { family: "Pyidaungsu", weight: 400, italic: false, src: pyidaungsuRegular },
  { family: "Pyidaungsu", weight: 700, italic: false, src: pyidaungsuBold },
];

export const BUNDLED_PREVIEW_FONT_FAMILIES = [
  ...new Set(PREVIEW_FONTS.map((font) => font.family)),
];

// @font-face rules for the bundled fonts the page asks for (only those, to keep the
// preview document small).
export const previewFontFaceCss = (html: string) => {
  const used = new Set(
    (html.replace(/&quot;|&#39;/g, "'").match(/font-family\s*:\s*[^;"<>}]+/gi) ?? []).flatMap(
      (declaration) =>
        declaration
          .replace(/font-family\s*:\s*/i, "")
          .split(",")
          .map((name) => name.trim().replace(/^'+|'+$/g, "").toLowerCase()),
    ),
  );
  return PREVIEW_FONTS.filter((font) => used.has(font.family.toLowerCase()))
    .map(
      (font) =>
        `@font-face{font-family:"${font.family}";src:url(${font.src}) format("truetype");` +
        `font-weight:${font.weight};font-style:${font.italic ? "italic" : "normal"};}`,
    )
    .join("\n");
};
