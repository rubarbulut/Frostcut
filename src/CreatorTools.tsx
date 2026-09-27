import { useId, useState } from 'react';
import { Modal } from './components';
import { AutoReframe } from './AutoReframe';
import { SubtitleTools } from './SubtitleTools';
import { PublishTools } from './PublishTools';
import { BrollTools } from './BrollTools';
import { DiscoverTools } from './DiscoverTools';
import { BatchExport } from './BatchExport';
import { EqualParts } from './EqualParts';
import { SequenceTools } from './SequenceTools';
import { BrandKitTools } from './BrandKitTools';
import { ChapterTools } from './ChapterTools';
import { StyleMemoryTools } from './StyleMemoryTools';
export default function CreatorTools({
  onClose,
  initialTab = 'Reframe',
}: {
  onClose: () => void;
  initialTab?: string;
}) {
  const [tab, setTab] = useState(initialTab);
  const tabId = useId();
  const tabs = [
    'Split',
    'Parts',
    'Reframe',
    'Subtitles',
    'Brand kit',
    'Style memory',
    'Chapters',
    'B-roll',
    'Publish',
    'Discover',
    'Batch export',
  ];
  return (
    <Modal title="Creator tools" onClose={onClose} wide>
      <div className="creator-tabs" role="tablist" aria-label="Creator tools">
        {tabs.map((name, index) => (
          <button
            key={name}
            role="tab"
            id={`${tabId}-${index}`}
            aria-controls={`${tabId}-panel`}
            aria-selected={tab === name}
            tabIndex={tab === name ? 0 : -1}
            onClick={() => setTab(name)}
            onKeyDown={(e) => {
              const next =
                e.key === 'ArrowRight'
                  ? (index + 1) % tabs.length
                  : e.key === 'ArrowLeft'
                    ? (index + tabs.length - 1) % tabs.length
                    : e.key === 'Home'
                      ? 0
                      : e.key === 'End'
                        ? tabs.length - 1
                        : -1;
              if (next < 0) return;
              e.preventDefault();
              e.stopPropagation();
              setTab(tabs[next]);
              e.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                [next]?.focus();
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${tabId}-panel`}
        aria-labelledby={`${tabId}-${tabs.indexOf(tab)}`}
        tabIndex={0}
      >
        {tab === 'Split' && <EqualParts onCreated={onClose} />}
        {tab === 'Parts' && <SequenceTools />}
        {tab === 'Reframe' && <AutoReframe />}
        {tab === 'Subtitles' && <SubtitleTools />}
        {tab === 'Brand kit' && <BrandKitTools />}
        {tab === 'Style memory' && <StyleMemoryTools />}
        {tab === 'Chapters' && <ChapterTools onNavigate={onClose} />}
        {tab === 'B-roll' && <BrollTools />}
        {tab === 'Publish' && <PublishTools />}
        {tab === 'Discover' && <DiscoverTools />}
        {tab === 'Batch export' && <BatchExport />}
      </div>
    </Modal>
  );
}
