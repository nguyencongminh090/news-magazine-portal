import { useEffect, useRef } from 'react';
import { Icon } from './Icon.jsx';

const FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';

/**
 * Modal slide-in drawer (mobile topic menu). Mounted only while open. Escape / scrim / close button call `onClose`;
 * focus moves in on open, is trapped on Tab, and returns to `returnFocusRef` on close.
 */
export function Drawer({ label, onClose, returnFocusRef, children }) {
  const panel = useRef(null);

  useEffect(() => {
    const opener = returnFocusRef?.current;
    panel.current?.querySelector(FOCUSABLE)?.focus();
    document.body.classList.add('drawer-open');
    return () => {
      document.body.classList.remove('drawer-open');
      opener?.focus();
    };
  }, [returnFocusRef]);

  function onKeyDown(event) {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const items = [...panel.current.querySelectorAll(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={label} ref={panel} onKeyDown={onKeyDown}>
        <div className="head">
          <button type="button" className="icon-btn" aria-label="Close menu" onClick={onClose}><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </>
  );
}
