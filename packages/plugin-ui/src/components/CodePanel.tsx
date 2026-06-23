import {
  Framework,
  LocalCodegenPreferenceOptions,
  PluginSettings,
  SelectPreferenceOptions,
} from "types";
import { useMemo, useState } from "react";
import EmptyState from "./EmptyState";
import SettingsGroup from "./SettingsGroup";
import FrameworkTabs from "./FrameworkTabs";
import { TailwindSettings } from "./TailwindSettings";
import { DownloadIcon, EyeIcon } from "lucide-react";

interface CodePanelProps {
  code: string;
  selectedFramework: Framework;
  settings: PluginSettings | null;
  preferenceOptions: LocalCodegenPreferenceOptions[];
  selectPreferenceOptions: SelectPreferenceOptions[];
  onPreferenceChanged: (
    key: keyof PluginSettings,
    value: PluginSettings[keyof PluginSettings],
  ) => void;
  onDownloadHtmlZip?: (extractImages: boolean, nodeIds?: string[]) => void;
  onPreviewHtml?: () => void;
}

const CodePanel = (props: CodePanelProps) => {
  const [extractImages, setExtractImages] = useState(true);
  const {
    code,
    preferenceOptions,
    selectPreferenceOptions,
    selectedFramework,
    settings,
    onPreferenceChanged,
    onDownloadHtmlZip,
    onPreviewHtml,
  } = props;
  const isCodeEmpty = code === "";

  // Memoized preference groups for better performance
  const {
    essentialPreferences,
    stylingPreferences,
    visibleStylingPreferences,
    selectableSettingsFiltered,
  } = useMemo(() => {
    // Get preferences for the current framework
    const frameworkPreferences = preferenceOptions.filter((preference) =>
      preference.includedLanguages?.includes(selectedFramework),
    );

    // Define preference grouping based on property names
    const essentialPropertyNames = ["jsx"];
    const stylingPropertyNames = [
      "useTailwind4",
      "roundTailwindValues",
      "roundTailwindColors",
      "useColorVariables",
      "showLayerNames",
      "embedImages",
      "embedVectors",
    ];

    // Group preferences by category
    return {
      essentialPreferences: frameworkPreferences.filter((p) =>
        essentialPropertyNames.includes(p.propertyName),
      ),
      stylingPreferences: frameworkPreferences.filter((p) =>
        stylingPropertyNames.includes(p.propertyName),
      ),
      visibleStylingPreferences: frameworkPreferences
        .filter((p) => stylingPropertyNames.includes(p.propertyName))
        .map((preference) =>
          preference.propertyName === "embedImages"
            ? {
                ...preference,
                label: "Export images as files",
                description:
                  "Download image assets as files next to the exported HTML instead of keeping Base64 inside the HTML.",
              }
            : preference,
        ),
      selectableSettingsFiltered: selectPreferenceOptions.filter((p) =>
        p.includedLanguages?.includes(selectedFramework),
      ),
    };
  }, [preferenceOptions, selectPreferenceOptions, selectedFramework]);

  const hasSettingsBeforeStyling =
    essentialPreferences.length > 0 || selectableSettingsFiltered.length > 0;
  const settingsWithExportImages =
    settings && selectedFramework === "HTML"
      ? { ...settings, embedImages: extractImages }
      : settings;
  const handleStylingPreferenceChanged = (
    key: keyof PluginSettings,
    value: PluginSettings[keyof PluginSettings],
  ) => {
    if (key === "embedImages" && selectedFramework === "HTML") {
      setExtractImages(Boolean(value));
      return;
    }

    onPreferenceChanged(key, value);
  };

  return (
    <div className="w-full flex flex-col gap-2 mt-2">
      <div className="flex items-center justify-between w-full">
        <p className="text-lg font-medium text-center text-foreground rounded-lg">
          Code
        </p>
        {!isCodeEmpty && (
          <div className="flex items-center gap-1">
            {selectedFramework === "HTML" && onDownloadHtmlZip && (
              <button
                type="button"
                onClick={() => onDownloadHtmlZip(extractImages)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background text-foreground transition-colors hover:bg-muted"
                aria-label={
                  extractImages
                    ? "Download HTML and image assets as a zip"
                    : "Download HTML with embedded Base64 images as a zip"
                }
                title={
                  extractImages
                    ? "Download HTML and image assets as a zip"
                    : "Download HTML with embedded Base64 images as a zip"
                }
              >
                <DownloadIcon size={15} />
              </button>
            )}
            {selectedFramework === "HTML" && onPreviewHtml && (
              <button
                type="button"
                onClick={onPreviewHtml}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                aria-label="Preview exported HTML"
                title="Preview exported HTML"
              >
                <EyeIcon size={15} />
                Preview
              </button>
            )}
          </div>
        )}
      </div>

      {!isCodeEmpty && (
        <div className="flex flex-col p-3 bg-card border rounded-lg text-sm">
          {/* Essential settings always shown */}
          <SettingsGroup
            title=""
            settings={essentialPreferences}
            alwaysExpanded={true}
            selectedSettings={settings}
            onPreferenceChanged={onPreferenceChanged}
          />

          {/* Framework-specific options */}
          {selectableSettingsFiltered.length > 0 && (
            <div className="mb-2 flex flex-col gap-2 last:mb-0">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {selectedFramework} Options
              </p>
              {selectableSettingsFiltered.map((preference) => {
                // Regular toggle buttons for other options
                return (
                  <FrameworkTabs
                    options={preference.options}
                    selectedValue={
                      (settings?.[preference.propertyName] ??
                        preference.options.find((option) => option.isDefault)
                          ?.value ??
                        "") as string
                    }
                    onChange={(value) => {
                      onPreferenceChanged(preference.propertyName, value);
                    }}
                  />
                );
              })}
            </div>
          )}

          {/* Styling preferences with custom prefix for Tailwind */}
          {(stylingPreferences.length > 0 ||
            selectedFramework === "Tailwind") && (
            <div className={hasSettingsBeforeStyling ? "mt-2" : undefined}>
              <SettingsGroup
                title="Styling Options"
                settings={visibleStylingPreferences}
                selectedSettings={settingsWithExportImages}
                onPreferenceChanged={handleStylingPreferenceChanged}
              >
                {selectedFramework === "Tailwind" && (
                  <TailwindSettings
                    settings={settings}
                    onPreferenceChanged={onPreferenceChanged}
                  />
                )}
              </SettingsGroup>
            </div>
          )}
        </div>
      )}

      {isCodeEmpty && <EmptyState />}
    </div>
  );
};

export default CodePanel;
