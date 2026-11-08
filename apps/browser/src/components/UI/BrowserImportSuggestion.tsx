import { useState } from 'react';
import { Download, X } from 'lucide-react';
import { browser } from '../../browser/client';

const key = 'kudium-browser-import-suggestion';
export function BrowserImportSuggestion() {
  const [show, setShow] = useState(() => {
    try {
      return !localStorage.getItem(key);
    } catch {
      return false;
    }
  });
  const dismiss = () => {
    try {
      localStorage.setItem(key, 'dismissed');
    } catch {
      /* In-memory dismissal still works. */
    }
    setShow(false);
  };
  if (!show) return null;
  return (
    <div className="onboarding-suggestion" role="status">
      <Download size={16} aria-hidden="true" />
      <div>
        <strong>Bring your browser with you</strong>
        <p>Import from Arc, Chrome, Dia, Edge & more.</p>
        <button
          type="button"
          onClick={() => {
            browser.preferences('open', { section: 'import' });
            dismiss();
          }}
        >
          Import browsing data
        </button>
      </div>
      <button
        className="suggestion-dismiss"
        type="button"
        aria-label="Dismiss import suggestion"
        onClick={dismiss}
      >
        <X size={14} />
      </button>
    </div>
  );
}
