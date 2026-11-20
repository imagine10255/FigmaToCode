import { postConversionStart } from "../messaging";

let isRunning = false;
// When the last "conversion started" message went out. Exports run one after another, so
// isRunning alone is false again before each one; without this every export paid the 30 ms
// pause below, which added up to seconds on pages with hundreds of images.
let lastStartPostedAt = 0;
let exportCount = 0;
let exportProgressListener: ((count: number) => void) | null = null;

// Count and time of exports per format (PNG, SVG_STRING, …), for the timing report.
// Figma runs several exports at once, so time is wall-clock time during which at least
// one export (of that format, or of any format for the total) was running; adding up each
// export's own duration counted the overlap several times.
const exportStats: Record<string, { count: number; ms: number }> = {};
const running: Record<string, { active: number; since: number }> = {};
const ALL_FORMATS = "*";

const startTimer = (key: string) => {
  const timer = (running[key] ??= { active: 0, since: 0 });
  if (timer.active === 0) {
    timer.since = Date.now();
  }
  timer.active += 1;
};

// Returns the busy time that just ended (0 while other exports are still running).
const stopTimer = (key: string) => {
  const timer = running[key];
  timer.active -= 1;
  return timer.active === 0 ? Date.now() - timer.since : 0;
};
let totalBusyMs = 0;

export const resetExportStats = () => {
  for (const format of Object.keys(exportStats)) {
    delete exportStats[format];
  }
  totalBusyMs = 0;
};

export const getExportStats = () => {
  const copy: Record<string, { count: number; ms: number }> = {};
  for (const format of Object.keys(exportStats)) {
    copy[format] = { ...exportStats[format] };
  }
  return copy;
};

// Includes exports still running, so stage times can subtract it at any moment.
export const getTotalExportMs = () => {
  const timer = running[ALL_FORMATS];
  return (
    totalBusyMs + (timer && timer.active > 0 ? Date.now() - timer.since : 0)
  );
};

// Lets the plugin show how many layers have been exported while a long export runs.
export const setExportProgressListener = (
  listener: ((count: number) => void) | null,
) => {
  exportCount = 0;
  exportProgressListener = listener;
};

/*
 * This is a wrapper for exportAsync() This allows us to pass a message to the UI every time
 * this rather costly operation gets run so that it can display a loading message. This avoids
 * showing a loading message every time anything in the UI changes and only showing it when
 * exportAsync() is called.
 */
export const exportAsyncProxy = async <
  T extends string | Uint8Array = Uint8Array /* | Object */,
>(
  node: SceneNode,
  settings: ExportSettings | ExportSettingsSVGString /*| ExportSettingsREST*/,
): Promise<T> => {
  if (isRunning === false) {
    isRunning = true;
    if (Date.now() - lastStartPostedAt > 1000) {
      postConversionStart();
      // force postMessage to run right now.
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    lastStartPostedAt = Date.now();
  }

  startTimer(settings.format);
  startTimer(ALL_FORMATS);
  // finally: a failed export (e.g. a layer with nothing visible) must still stop the timers.
  try {
    const figmaNode = (await figma.getNodeByIdAsync(node.id)) as ExportMixin;
    // console.log("getting figma id for", figmaNode);

    if (figmaNode.exportAsync === undefined) {
      // console.log(node);
      throw new TypeError(
        "Something went wrong. This node doesn't have an exportAsync() function. Maybe check the type before calling this function.",
      );
    }

    // The following is necessary for typescript to not lose its mind.
    let result;
    if (settings.format === "SVG_STRING") {
      result = await figmaNode.exportAsync(settings as ExportSettingsSVGString);
      // } else if (settings.format === "JSON_REST_V1") {
      //   result = await node.exportAsync(settings as ExportSettingsREST);
    } else {
      result = await figmaNode.exportAsync(settings as ExportSettings);
    }

    return result as T;
  } finally {
    isRunning = false;
    const stats = (exportStats[settings.format] ??= { count: 0, ms: 0 });
    stats.count += 1;
    stats.ms += stopTimer(settings.format);
    totalBusyMs += stopTimer(ALL_FORMATS);
    exportCount += 1;
    exportProgressListener?.(exportCount);
  }
};
