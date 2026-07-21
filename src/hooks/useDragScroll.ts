import { useEffect, useRef, useState } from 'react';

type DragScrollAxis = 'x' | 'y' | 'both';

/**
 * Drag-to-scroll + overscroll containment for nested scroll areas.
 * Use with overflow-x/y-auto and grab cursors.
 */
export function useDragScroll(axis: DragScrollAxis = 'x') {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const state = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
    moved: false,
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('a, button, input, textarea, select, [role="button"]')) return;

      state.current = {
        active: true,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: element.scrollLeft,
        scrollTop: element.scrollTop,
        moved: false,
      };
      setDragging(true);
      element.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
      if (!state.current.active || state.current.pointerId !== event.pointerId) return;

      const dx = event.clientX - state.current.startX;
      const dy = event.clientY - state.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) state.current.moved = true;

      if (axis !== 'y') element.scrollLeft = state.current.scrollLeft - dx;
      if (axis !== 'x') element.scrollTop = state.current.scrollTop - dy;
      if (state.current.moved) event.preventDefault();
    }

    function endDrag(event: PointerEvent) {
      if (!state.current.active || state.current.pointerId !== event.pointerId) return;
      state.current.active = false;
      setDragging(false);
      try {
        element.releasePointerCapture(event.pointerId);
      } catch {
        // Capture may already be released.
      }
    }

    function onClickCapture(event: MouseEvent) {
      // Suppress click after a drag so day/hour rows don't act as accidental taps.
      if (state.current.moved) {
        event.preventDefault();
        event.stopPropagation();
        state.current.moved = false;
      }
    }

    function onWheel(event: WheelEvent) {
      const dx = event.deltaX;
      const dy = event.deltaY;

      if (axis === 'x') {
        const max = element.scrollWidth - element.clientWidth;
        if (max <= 0) return;
        // Prefer vertical wheel for horizontal lists (trackpads still send deltaX).
        const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
        const next = element.scrollLeft + delta;
        element.scrollLeft = Math.max(0, Math.min(max, next));
        event.preventDefault();
        return;
      }

      if (axis === 'y') {
        const max = element.scrollHeight - element.clientHeight;
        if (max <= 0) return;
        element.scrollTop = Math.max(0, Math.min(max, element.scrollTop + dy));
        event.preventDefault();
        return;
      }

      // both
      const maxX = element.scrollWidth - element.clientWidth;
      const maxY = element.scrollHeight - element.clientHeight;
      if (maxX > 0) element.scrollLeft = Math.max(0, Math.min(maxX, element.scrollLeft + dx));
      if (maxY > 0) element.scrollTop = Math.max(0, Math.min(maxY, element.scrollTop + dy));
      if (maxX > 0 || maxY > 0) event.preventDefault();
    }

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', endDrag);
    element.addEventListener('pointercancel', endDrag);
    element.addEventListener('click', onClickCapture, true);
    element.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', endDrag);
      element.removeEventListener('pointercancel', endDrag);
      element.removeEventListener('click', onClickCapture, true);
      element.removeEventListener('wheel', onWheel);
    };
  }, [axis]);

  return { ref, dragging };
}
