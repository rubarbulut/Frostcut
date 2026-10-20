export type StudioLayout = { project: number; inspector: number; timeline: number };
export const STUDIO_LAYOUT_KEY = 'frostcut.studio-layout.v1';
export const STUDIO_LAYOUT_RESET = 'frostcut:reset-studio-layout';
export const defaultStudioLayout: StudioLayout = { project: 260, inspector: 290, timeline: 260 };

/** UI dimensions only. Never changes project data or the timeline time scale. */
export function clampStudioLayout(
  value: unknown,
  width: number,
  height: number,
  inspector = true,
): StudioLayout {
  const source = value && typeof value === 'object' ? (value as Partial<StudioLayout>) : {};
  const finite = (n: unknown, fallback: number) =>
    typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  const clamp = (n: number, min: number, max: number) =>
    Math.round(Math.max(min, Math.min(Math.max(min, max), n)));
  const availableWidth = Math.max(760, finite(width, 1280));
  const project = clamp(
    finite(source.project, 260),
    200,
    Math.min(440, availableWidth - (inspector ? 240 : 0) - 300 - 12),
  );
  return {
    project,
    inspector: clamp(
      finite(source.inspector, 290),
      240,
      inspector ? Math.min(420, availableWidth - project - 300 - 12) : 420,
    ),
    timeline: clamp(finite(source.timeline, 260), 150, Math.max(150, finite(height, 600) - 190)),
  };
}

export function readStudioLayout(): StudioLayout {
  try {
    return JSON.parse(localStorage.getItem(STUDIO_LAYOUT_KEY) ?? 'null') ?? defaultStudioLayout;
  } catch {
    return defaultStudioLayout;
  }
}

export function resetStudioLayout() {
  try {
    localStorage.removeItem(STUDIO_LAYOUT_KEY);
  } catch {
    /* Layout still resets in memory. */
  }
  window.dispatchEvent(new Event(STUDIO_LAYOUT_RESET));
}
