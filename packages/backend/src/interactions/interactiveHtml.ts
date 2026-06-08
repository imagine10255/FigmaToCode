import type { PluginSettings } from "types";
import { htmlMain, HtmlOutput } from "../html/htmlMain";
import {
  collectCarouselAttributes,
  collectInteractionModel,
} from "./interactionModel";
import {
  interactionRuntimeCSS,
  renderInteractionScripts,
} from "./interactionRuntime";

export const interactiveHtmlMain = async (
  sceneNode: Array<SceneNode>,
  settings: PluginSettings,
  isPreview: boolean = false,
  templateNodes: Array<SceneNode> = [],
): Promise<HtmlOutput> => {
  const model = collectInteractionModel([...sceneNode, ...templateNodes]);
  const interactiveSettings: PluginSettings = {
    ...settings,
    framework: "HTML",
    htmlGenerationMode: "html",
    interactiveHtmlExport: true,
    interactionAttributesByNodeId: collectCarouselAttributes(model),
  };
  const output = await htmlMain(sceneNode, interactiveSettings, isPreview);
  const templateHtml = await renderInteractionTemplates(
    templateNodes,
    interactiveSettings,
  );

  return {
    html: `${output.html}
${templateHtml}
${renderInteractionScripts(model)}`,
    css: [output.css, interactionRuntimeCSS].filter(Boolean).join("\n\n"),
  };
};

const renderInteractionTemplates = async (
  templateNodes: Array<SceneNode>,
  settings: PluginSettings,
) => {
  const templates: string[] = [];

  for (const node of templateNodes) {
    const output = await htmlMain([node], settings);
    templates.push(
      `<template data-fig-template="${node.id}">${output.html}</template>`,
    );
  }

  return templates.join("\n");
};
