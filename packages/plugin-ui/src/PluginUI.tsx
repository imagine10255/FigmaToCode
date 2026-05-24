import React from "react";
import { Button } from "./components/ui/button";
import { SelectedNode } from "types";

type PluginUIProps = {
  isLoading: boolean;
  selectedNodes: SelectedNode[];
  onExportHTMLFiles: () => void;
  exportProgress?: {
    current: number;
    total: number;
  };
};

export const PluginUI = (props: PluginUIProps) => {
  if (props.isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-foreground">
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  const progressPercent = props.exportProgress
    ? Math.round((props.exportProgress.current / props.exportProgress.total) * 100)
    : 0;

  return (
    <div className="flex h-full flex-col bg-background text-foreground p-4">
      <div className="mb-4">
        <p className="text-base font-semibold">HTML Export</p>
        <p className="text-xs text-muted-foreground">選取後按下載即可匯出多個 HTML。</p>
      </div>

      <div className="mb-4 rounded-xl border border-muted bg-card p-3">
        <p className="mb-2 text-sm font-medium">Selected Frames</p>
        {props.selectedNodes.length > 0 ? (
          <div className="space-y-2">
            {props.selectedNodes.map((node) => (
              <div
                key={node.id}
                className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm"
              >
                <span className="font-medium text-foreground">{node.name}</span>
                <span className="text-xs text-muted-foreground">{node.type}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">請先在 Figma 中選取 Frame。</p>
        )}
      </div>

      {props.exportProgress && (
        <div className="mb-4 rounded-xl border border-muted bg-card p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Exporting...</p>
            <p className="text-xs text-muted-foreground">{props.exportProgress.current}/{props.exportProgress.total}</p>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">{progressPercent}% complete</p>
        </div>
      )}

      <Button
        className="w-full"
        onClick={props.onExportHTMLFiles}
        disabled={props.exportProgress !== undefined}
      >
        {props.exportProgress ? "Exporting..." : "Download HTML"}
      </Button>
    </div>
  );
};
