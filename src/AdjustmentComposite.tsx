import type { ReactNode } from 'react';
import { adjustmentFilter, type AdjustmentLayer } from './adjustments';
import './adjustments.css';

export function AdjustmentComposite({
  layers,
  time,
  draft,
  children,
}: {
  layers?: AdjustmentLayer[];
  time: number;
  draft?: AdjustmentLayer;
  children: ReactNode;
}) {
  const filter = adjustmentFilter(
    draft ? layers?.map((a) => (a.id === draft.id ? draft : a)) : layers,
    time,
  );
  return (
    <div className="adjustment-composite" style={{ filter }} data-adjustment-filter={filter}>
      {children}
    </div>
  );
}
