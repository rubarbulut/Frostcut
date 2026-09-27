import { useEditor } from './store';
export function PlaybackSpeed() {
  const rate = useEditor((s) => s.previewRate),
    setRate = useEditor((s) => s.setPreviewRate);
  return (
    <select
      className="playback-speed"
      aria-label="Playback speed"
      title="Preview speed · export keeps clip timing"
      value={rate}
      onChange={(e) => setRate(+e.target.value)}
    >
      {[0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map((value) => (
        <option key={value} value={value}>
          {value}×
        </option>
      ))}
    </select>
  );
}
