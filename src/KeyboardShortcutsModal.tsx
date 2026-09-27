import { Modal } from './components';
import { Command, Keyboard } from 'lucide-react';

export function KeyboardShortcutsModal({ onClose }: { onClose: () => void }) {
  const sections = [
    {
      title: 'Playback & Navigation',
      shortcuts: [
        { keys: ['Space'], desc: 'Play / Pause playback' },
        { keys: ['J', 'K', 'L'], desc: 'Rewind / Pause / Forward' },
        { keys: ['←', '→'], desc: 'Step 1 frame backward / forward' },
        { keys: ['Home', 'End'], desc: 'Jump to start / end of timeline' },
      ],
    },
    {
      title: 'Timeline Editing',
      shortcuts: [
        { keys: ['Ctrl', 'K'], desc: 'Split clip at playhead' },
        { keys: ['Delete'], desc: 'Delete selected clip' },
        { keys: ['Shift', 'Delete'], desc: 'Ripple delete (close gap)' },
        { keys: ['Alt', 'Drag'], desc: 'Duplicate clip instance' },
        { keys: ['Shift', 'Click'], desc: 'Multi-select clips' },
        { keys: ['Ctrl', 'Wheel'], desc: 'Zoom in / out on timeline' },
      ],
    },
    {
      title: 'Media Bin & Assets',
      shortcuts: [
        { keys: ['Double-click'], desc: 'Insert media to timeline at playhead' },
        { keys: ['⭐ Star'], desc: 'Pin / favorite asset' },
        { keys: ['📁 Folder'], desc: 'Assign to category (B-Roll, SFX, Music)' },
      ],
    },
    {
      title: 'Project & History',
      shortcuts: [
        { keys: ['Ctrl', 'Z'], desc: 'Undo last edit' },
        { keys: ['Ctrl', 'Y'], desc: 'Redo last edit' },
        { keys: ['Ctrl', 'S'], desc: 'Save project locally' },
      ],
    },
  ];

  return (
    <Modal title="Keyboard Shortcuts" onClose={onClose} wide>
      <div className="shortcuts-modal-content">
        <div className="shortcuts-grid">
          {sections.map((section) => (
            <div key={section.title} className="shortcuts-section">
              <h4>{section.title}</h4>
              <div className="shortcuts-list">
                {section.shortcuts.map((sc, i) => (
                  <div key={i} className="shortcut-row">
                    <span className="shortcut-desc">{sc.desc}</span>
                    <div className="shortcut-keys">
                      {sc.keys.map((k, j) => (
                        <kbd key={j} className="shortcut-key">
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
