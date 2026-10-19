import { type ReactNode } from 'react';

export interface AEPropertyRowProps {
  label: string;
  keyframeControl?: ReactNode;
  children: ReactNode;
  subtle?: boolean;
  className?: string;
  extraAction?: ReactNode;
}

export function AEPropertyRow({
  label,
  keyframeControl,
  children,
  subtle = false,
  className = '',
  extraAction,
}: AEPropertyRowProps) {
  return (
    <div className={`ae-property-row ${subtle ? 'subtle' : ''} ${className}`}>
      <div className="ae-row-left">
        {keyframeControl && <div className="ae-row-kf-slot">{keyframeControl}</div>}
        <span className="ae-row-label" title={label}>
          {label}
        </span>
      </div>

      <div className="ae-row-right">
        {children}
        {extraAction && <div className="ae-row-extra">{extraAction}</div>}
      </div>
    </div>
  );
}
