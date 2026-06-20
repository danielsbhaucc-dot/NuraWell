const FOCUSABLE_SELECTOR =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, object, embed, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') return false;
    if (el.hasAttribute('disabled')) return false;
    if (el.tabIndex < 0 && !el.matches('a[href], button, input, select, textarea')) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  });
}

export function focusFirstElement(container: HTMLElement | null, fallback?: HTMLElement | null): void {
  if (!container) {
    fallback?.focus();
    return;
  }
  const [first] = getFocusableElements(container);
  (first ?? fallback)?.focus();
}
