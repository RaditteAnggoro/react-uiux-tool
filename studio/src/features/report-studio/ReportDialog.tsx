import { useEffect, useRef, type ReactNode } from "react";

export default function ReportDialog({ label, className = "", onCancel, children, dismissOnBackdrop = false }: {
  label: string;
  className?: string;
  onCancel: () => void;
  children: ReactNode;
  dismissOnBackdrop?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const trigger = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);
  return (
    <dialog ref={ref} className={`rs-dialog rs-modal-card ${className}`} aria-label={label}
      onCancel={event => { event.preventDefault(); onCancel(); }}
      onClick={event => {
        if (!dismissOnBackdrop || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom) onCancel();
      }}
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
        )].filter(control => control.getClientRects().length > 0);
        const edge = event.shiftKey ? controls[0] : controls.at(-1);
        if (edge === event.target) {
          event.preventDefault();
          (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
        }
      }}>
      {children}
    </dialog>
  );
}
