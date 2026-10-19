import { Wand2, Plus, Sparkles } from 'lucide-react';
import { useEditor } from '../store';
import { AdjustmentControls, addAdjustment } from '../AdjustmentControls';

export function AELumetriInspector() {
  const adjustments = useEditor((s) => s.project.adjustments ?? []);
  const selected = useEditor((s) => s.adjustmentSelection);

  return (
    <div className="ae-lumetri-inspector">
      <div className="ae-lumetri-header">
        <div className="ae-lumetri-title-wrap">
          <Wand2 size={15} />
          <div>
            <b>Lumetri Color & Grading</b>
            <small>Cinematic Tone, Balance & 3-Way Wheels</small>
          </div>
        </div>

        <button
          type="button"
          className="ae-add-layer-btn"
          onClick={addAdjustment}
          title="Add new adjustment layer across all timeline tracks"
        >
          <Plus size={12} />
          <span>New Layer</span>
        </button>
      </div>

      <div className="ae-lumetri-content">
        <AdjustmentControls />
      </div>
    </div>
  );
}
