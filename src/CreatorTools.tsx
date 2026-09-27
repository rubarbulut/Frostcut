import { useState } from 'react';
import { Modal } from './components';
import { AutoReframe } from './AutoReframe';
import { SubtitleTools } from './SubtitleTools';
import { PublishTools } from './PublishTools';
import { BrollTools } from './BrollTools';
import { DiscoverTools } from './DiscoverTools';
import { BatchExport } from './BatchExport';
export default function CreatorTools({
  onClose,
  initialTab = 'Reframe',
}: {
  onClose: () => void;
  initialTab?: string;
}) {
  const [tab, setTab] = useState(initialTab);
  return (
    <Modal title="Creator tools" onClose={onClose} wide>
      <div className="creator-tabs" role="tablist" aria-label="Creator tools">
        {['Reframe', 'Subtitles', 'B-roll', 'Publish', 'Discover', 'Batch export'].map((name) => (
          <button key={name} role="tab" aria-selected={tab === name} onClick={() => setTab(name)}>
            {name}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'Reframe' && <AutoReframe />}
        {tab === 'Subtitles' && <SubtitleTools />}
        {tab === 'B-roll' && <BrollTools />}
        {tab === 'Publish' && <PublishTools />}
        {tab === 'Discover' && <DiscoverTools />}
        {tab === 'Batch export' && <BatchExport />}
      </div>
    </Modal>
  );
}
