import type { Project } from './model';

/** Describes actual track contents without changing track/clip selection. */
export function StudioTrackLabel({ project, trackId }: { project: Project; trackId: string }) {
  const clips = project.clips.filter((clip) => clip.trackId === trackId);
  const names = [
    ...new Set(
      clips.map(
        (clip) =>
          project.media.find((media) => media.id === clip.mediaId)?.name ?? 'Unlinked source',
      ),
    ),
  ];
  const empty =
    project.tracks.find((track) => track.id === trackId)?.kind === 'audio'
      ? 'Audio layer'
      : 'Video layer';
  return (
    <span className="studio-layer-name" title={names.join(', ') || empty}>
      {names[0] ?? empty}
      {clips.length > 1 ? ` · ${clips.length} clips` : ''}
    </span>
  );
}
