import GradientsPanel from "./components/GradientsPanel";
import copy from "copy-to-clipboard";
import CodePanel from "./components/CodePanel";
import EmptyState from "./components/EmptyState";
import WarningsPanel from "./components/WarningsPanel";
import {
  Framework,
  HTMLPreview,
  IframePreviewPayload,
  LinearGradientConversion,
  PluginSettings,
  SolidColorConversion,
  Warning,
} from "types";
import {
  preferenceOptions,
  selectPreferenceOptions,
} from "./codegenPreferenceOptions";
import Loading from "./components/Loading";
import { useCallback, useEffect, useRef, useState } from "react";
import { SettingsIcon, XIcon } from "lucide-react";
import React from "react";
import { Button } from "./components/ui/button";
import { ScrollArea } from "./components/ui/scroll-area";
import { TooltipProvider } from "./components/ui/tooltip";

type PluginUIProps = {
  code: string;
  htmlPreview: HTMLPreview;
  warnings: Warning[];
  selectedFramework: Framework;
  setSelectedFramework: (framework: Framework) => void;
  settings: PluginSettings | null;
  onPreferenceChanged: (
    key: keyof PluginSettings,
    value: PluginSettings[keyof PluginSettings],
  ) => void;
  colors: SolidColorConversion[];
  gradients: LinearGradientConversion[];
  isLoading: boolean;
  previewPayload: IframePreviewPayload;
  previewRefreshKey: number;
  onDownloadHtmlZip?: (extractImages: boolean) => void;
  onPreviewHtml?: () => void;
};

const frameworks: Framework[] = ["HTML"];
const DEFAULT_PREVIEW_URL = "https://www.google.com/";
const PREVIEW_URL_STORAGE_KEY = "figmaToCodePreviewUrlV2";
const DEFAULT_WINDOW_SIZE = { width: 450, height: 700 };
const PREVIEW_WINDOW_SIZE = { width: 960, height: 720 };

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

type FrameworkTabsProps = {
  frameworks: Framework[];
  selectedFramework: Framework;
  setSelectedFramework: (framework: Framework) => void;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
};

const FrameworkTabs = ({
  frameworks,
  selectedFramework,
  setSelectedFramework,
  showSettings,
  setShowSettings,
}: FrameworkTabsProps) => {
  return (
    <div className="grid grid-cols-1 gap-1 grow">
      {frameworks.map((tab) => (
        <Button
          variant="ghost"
          size="sm"
          key={`tab ${tab}`}
          className={`w-full h-8 rounded-md text-sm ${
            selectedFramework === tab && !showSettings
              ? "bg-primary text-primary-foreground shadow-xs hover:bg-primary hover:text-primary-foreground dark:hover:bg-primary"
              : "bg-muted text-foreground hover:bg-primary/90 hover:text-primary-foreground dark:hover:bg-primary/90"
          }`}
          onClick={() => {
            setSelectedFramework(tab as Framework);
            setShowSettings(false);
          }}
        >
          {tab}
        </Button>
      ))}
    </div>
  );
};

export const PluginUI = (props: PluginUIProps) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showPreviewFrame, setShowPreviewFrame] = useState(false);
  const [savedPreviewUrl, setSavedPreviewUrl] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_PREVIEW_URL;
    return getStoredPreviewUrl() ?? DEFAULT_PREVIEW_URL;
  });
  const [draftPreviewUrl, setDraftPreviewUrl] = useState(savedPreviewUrl);

  const isEmpty = props.code === "";
  const warnings = props.warnings ?? [];
  const previewOrigin = getTargetOrigin(savedPreviewUrl);
  const postPreviewPayload = useCallback(() => {
    if (!showPreviewFrame || !previewOrigin || !iframeRef.current?.contentWindow) {
      return;
    }

    // UI -> iframe: forward the latest Figma payload to the embedded preview app.
    iframeRef.current.contentWindow.postMessage(
      props.previewPayload,
      previewOrigin,
    );
  }, [previewOrigin, props.previewPayload, showPreviewFrame]);

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
    props.previewPayload,
    props.previewRefreshKey,
    savedPreviewUrl,
  ]);
  const resizePluginWindow = (width: number, height: number) => {
    parent.postMessage({ pluginMessage: { type: "resize-ui", width, height } }, "*");
  };
  const openPreviewFrame = () => {
    setShowSettings(false);
    setShowPreviewFrame(true);
    resizePluginWindow(PREVIEW_WINDOW_SIZE.width, PREVIEW_WINDOW_SIZE.height);
    props.onPreviewHtml?.();
  };
  const closePreviewFrame = () => {
    setShowPreviewFrame(false);
    resizePluginWindow(DEFAULT_WINDOW_SIZE.width, DEFAULT_WINDOW_SIZE.height);
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full overflow-hidden bg-background text-foreground">
        <div className="px-2 py-1.5 dark:bg-card">
          <div className="flex gap-1 bg-muted dark:bg-card rounded-lg p-0.5">
            <FrameworkTabs
              frameworks={frameworks}
              selectedFramework={props.selectedFramework}
              setSelectedFramework={props.setSelectedFramework}
              showSettings={showSettings}
              setShowSettings={setShowSettings}
            />
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 rounded-md ${
                showSettings
                  ? "bg-primary text-primary-foreground shadow-xs hover:bg-primary hover:text-primary-foreground dark:hover:bg-primary"
                  : "bg-muted text-foreground hover:bg-primary/90 hover:text-primary-foreground dark:hover:bg-primary/90"
              }`}
              onClick={() => {
                setDraftPreviewUrl(savedPreviewUrl);
                setShowPreviewFrame(false);
                setShowSettings(!showSettings);
              }}
              aria-label="Settings"
            >
              <SettingsIcon size={16} />
            </Button>
          </div>
        </div>
        <div
          style={{
            height: 1,
            width: "100%",
            backgroundColor: "rgba(255,255,255,0.12)",
          }}
        ></div>
        <ScrollArea className="min-h-0 flex-1 overflow-hidden">
          {showSettings ? (
            <div className="flex flex-col gap-3 px-4 pt-4 pb-3">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-foreground">
                  Preview Settings
                </p>
                <p className="text-xs text-muted-foreground">
                  Preview uses the saved URL. Changes take effect after Save.
                </p>
              </div>

              <div className="flex flex-col gap-2 rounded-md border bg-card p-3">
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
            </div>
          ) : showPreviewFrame ? (
            <div className="flex h-[672px] flex-col gap-2 px-3 py-3">
              <div className="flex h-8 shrink-0 items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    Preview
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {savedPreviewUrl}
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

              <div className="min-h-0 flex-1 overflow-hidden rounded-md border bg-white">
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
          ) : (
            <div className="flex flex-col items-center px-4 pt-3 pb-2 gap-2 dark:bg-transparent">
              {props.isLoading ? (
                <Loading />
              ) : isEmpty ? (
                <div className="flex min-h-[180px] items-center justify-center">
                  <EmptyState />
                </div>
              ) : (
                <>
              {warnings.length > 0 && <WarningsPanel warnings={warnings} />}

              <CodePanel
                code={props.code}
                selectedFramework={props.selectedFramework}
                preferenceOptions={preferenceOptions}
                selectPreferenceOptions={selectPreferenceOptions}
                settings={props.settings}
                onPreferenceChanged={props.onPreferenceChanged}
                onDownloadHtmlZip={props.onDownloadHtmlZip}
                onPreviewHtml={openPreviewFrame}
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
                </>
              )}
            </div>
          )}
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
};
