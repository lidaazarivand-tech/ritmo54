export type VerticalSnapshot = Map<string, number>;

export function captureVerticalPositions(
  container: ParentNode | null,
  selector: string,
  keyAttribute: string,
): VerticalSnapshot {
  const snapshot: VerticalSnapshot = new Map();
  if (!container) return snapshot;
  for (const element of container.querySelectorAll<HTMLElement>(selector)) {
    const key = element.dataset[keyAttribute];
    if (key !== undefined && !snapshot.has(key)) snapshot.set(key, element.getBoundingClientRect().top);
  }
  return snapshot;
}

/** Animate only rows that actually changed vertical position. Uses the browser's compositor. */
export function animateVerticalReorder(
  container: ParentNode | null,
  before: VerticalSnapshot,
  selector: string,
  keyAttribute: string,
  duration = 220,
): void {
  if (!container || !before.size || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  for (const element of container.querySelectorAll<HTMLElement>(selector)) {
    const key = element.dataset[keyAttribute];
    const oldTop = key === undefined ? undefined : before.get(key);
    if (oldTop === undefined) continue;
    const delta = oldTop - element.getBoundingClientRect().top;
    if (Math.abs(delta) < 1) continue;
    if (typeof element.animate === 'function') element.animate(
      [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }],
      { duration, easing: 'cubic-bezier(.2,.75,.25,1)' },
    );
  }
}
