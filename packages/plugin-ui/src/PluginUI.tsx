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
import { useCallback, useEffect, useRef, useState } from "react";
import { DownloadIcon, SettingsIcon, XIcon } from "lucide-react";
import React from "react";
import { Button } from "./components/ui/button";
import { ScrollArea } from "./components/ui/scroll-area";
import { TooltipProvider } from "./components/ui/tooltip";

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
  previewPayload: IframePreviewPayload;
  previewRefreshKey: number;
  onDownloadHtmlZip?: (extractImages: boolean) => void;
  onPreviewNode?: (nodeId: string) => void;
};

const DEFAULT_PREVIEW_URL = "http://localhost:4200/";
const PREVIEW_URL_STORAGE_KEY = "figmaToCodePreviewUrlV3";
const DEFAULT_WINDOW_SIZE = { width: 450, height: 700 };
const PREVIEW_WINDOW_WIDTH = 1300;
const getPreviewWindowHeight = () => {
  if (typeof window === "undefined") {
    return 900;
  }

  return Math.max(700, Math.floor(window.screen.availHeight));
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
    // Figma may block localStorage in some plugin contexts. The in-memory value
    // still updates for the current session.
  }
};

const getTargetOrigin = (url: string) => {
  try {
    return new URL(url).origin;
  } catch (_error) {
    return null;
  }
};

const SelectionList = ({
  nodes,
  activePreviewNodeId,
  onPreviewNode,
}: {
  nodes: SelectionPreviewNode[];
  activePreviewNodeId: string | null;
  onPreviewNode?: (nodeId: string) => void;
}) => {
  if (nodes.length === 0) {
    return (
      <div className="flex min-h-[220px] items-center justify-center">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      {nodes.map((node) => {
        const isActive = node.id === activePreviewNodeId;

        return (
          <button
            type="button"
            key={node.id}
            onClick={() => onPreviewNode?.(node.id)}
            className={`grid min-h-[54px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors ${
              isActive
                ? "border-primary bg-primary/10"
                : "border-transparent bg-muted/70 hover:bg-muted"
            }`}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {node.name}
              </p>
              {node.width !== null && node.height !== null && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {Math.round(node.width)} x {Math.round(node.height)} px
                </p>
              )}
            </div>
            <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {node.type}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export const PluginUI = (props: PluginUIProps) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showPreviewFrame, setShowPreviewFrame] = useState(false);
  const [extractImages, setExtractImages] = useState(true);
  const [savedPreviewUrl, setSavedPreviewUrl] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_PREVIEW_URL;
    return getStoredPreviewUrl() ?? DEFAULT_PREVIEW_URL;
  });
  const [draftPreviewUrl, setDraftPreviewUrl] = useState(savedPreviewUrl);

  const warnings = props.warnings ?? [];
  const selectionNodes = props.selectionNodes ?? [];
  const previewOrigin = getTargetOrigin(savedPreviewUrl);
  const postPreviewPayload = useCallback(() => {
    if (
      !showPreviewFrame ||
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
    openPreviewFrame();
    props.onPreviewNode?.(nodeId);
  };
  const closePreviewFrame = () => {
    setShowPreviewFrame(false);
    resizePluginWindow(DEFAULT_WINDOW_SIZE.width, DEFAULT_WINDOW_SIZE.height);
  };
  const openSettings = () => {
    setDraftPreviewUrl(savedPreviewUrl);
    setShowSettings((current) => !current);
  };
  const SettingsPanel = () => (
    <div className="flex w-full flex-col gap-2 rounded-md border bg-card p-3">
      <label className="text-xs font-medium text-muted-foreground">
        Preview URL
      </label>
      <input
        type="url"
        value={draftPreviewUrl}
        onChange={(event) => setDraftPreviewUrl(event.target.value)}
        className="h-8 rounded-md border bg-background px-2 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
      />
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
            setSavedPreviewUrl(draftPreviewUrl);
            setStoredPreviewUrl(draftPreviewUrl);
            setShowSettings(false);
          }}
          className="h-7 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Save
        </button>
      </div>
    </div>
  );
  const SelectionHeaderActions = ({ compact = false }: { compact?: boolean }) => (
    <div className="flex items-center gap-1">
      {props.onDownloadHtmlZip && selectionNodes.length > 0 && (
        <button
          type="button"
          onClick={() => props.onDownloadHtmlZip?.(extractImages)}
          className={
            compact
              ? "inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background text-foreground transition-colors hover:bg-muted"
              : "inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          }
          aria-label="Download selected frames"
          title="Download selected frames"
        >
          <DownloadIcon size={15} />
          {!compact && "Download"}
        </button>
      )}
      <button
        type="button"
        onClick={openSettings}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background text-foreground transition-colors hover:bg-muted ${
          showSettings ? "border-primary text-primary" : ""
        }`}
        aria-label="Preview settings"
        title="Preview settings"
      >
        <SettingsIcon size={15} />
      </button>
    </div>
  );

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full overflow-hidden bg-background text-foreground">
        <ScrollArea className="min-h-0 flex-1 overflow-hidden">
          {showPreviewFrame ? (
            <div className="grid h-full min-h-[640px] grid-cols-[360px_minmax(0,1fr)] gap-3 px-3 py-3">
              <div className="min-h-0 overflow-hidden rounded-md border bg-card">
                <div className="flex h-11 items-center justify-between border-b px-3">
                  <p className="text-sm font-semibold text-foreground">
                    Selected Frames
                    <span className="ml-2 text-xs font-medium text-muted-foreground">
                      {selectionNodes.length}
                    </span>
                  </p>
                  <SelectionHeaderActions compact />
                </div>
                <div className="flex h-[calc(100%-44px)] flex-col gap-2 overflow-auto p-2">
                  {showSettings && <SettingsPanel />}
                  <SelectionList
                    nodes={selectionNodes}
                    activePreviewNodeId={props.activePreviewNodeId}
                    onPreviewNode={handlePreviewNode}
                  />
                </div>
              </div>

              <div className="flex min-h-0 flex-col gap-2">
                <div className="flex h-8 shrink-0 items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      Preview
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {props.isPreviewLoading
                        ? "Generating HTML..."
                        : savedPreviewUrl}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-md"
                    onClick={closePreviewFrame}
                    aria-label="Close preview"
                  >
                    <XIcon size={16} />
                  </Button>
                </div>

                {!previewOrigin && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    Preview URL is invalid. Open settings and save a valid URL.
                  </div>
                )}

                <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border bg-white">
                  {props.isPreviewLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 text-sm font-medium text-foreground">
                      Generating preview...
                    </div>
                  )}
                  <iframe
                    ref={iframeRef}
                    src={savedPreviewUrl}
                    title="Embedded preview"
                    className="h-full w-full border-0 bg-white"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    onLoad={postPreviewPayload}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center px-4 pt-3 pb-2 gap-2 dark:bg-transparent">
              {warnings.length > 0 && <WarningsPanel warnings={warnings} />}

              <div className="flex w-full items-center justify-between">
                <p className="text-lg font-medium text-foreground">
                  Selected Frames
                  <span className="ml-2 text-sm font-medium text-muted-foreground">
                    {selectionNodes.length}
                  </span>
                </p>
                <SelectionHeaderActions />
              </div>

              {showSettings && <SettingsPanel />}

              {selectionNodes.length > 0 && (
                <label className="flex w-full items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={extractImages}
                    onChange={(event) => setExtractImages(event.target.checked)}
                  />
                  Export images as files
                </label>
              )}

              <SelectionList
                nodes={selectionNodes}
                activePreviewNodeId={props.activePreviewNodeId}
                onPreviewNode={handlePreviewNode}
              />

              {props.gradients.length > 0 && (
                <div className="mt-3 w-full">
                  <GradientsPanel
                    gradients={props.gradients}
                    onColorClick={(value) => {
                      copy(value);
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
};
