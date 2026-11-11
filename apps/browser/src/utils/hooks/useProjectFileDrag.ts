import { useEffect, useRef, useState } from 'react';

export const PROJECT_FILE_MIME = 'application/x-kudiumbrowser-project-file';
export const PROJECT_FILE_DRAG_EVENT = 'kudiumbrowser-project-file-drag';

/** Cleanup belongs to the window, since virtualized file rows can disappear. */
export function useProjectFileDrag() {
  const [dragging, setDragging] = useState(false);
  const active = useRef(false);
  useEffect(() => {
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      active.current = false;
      clearTimeout(watchdog);
      setDragging(false);
    };
    const renew = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(finish, 15000);
    };
    const change = (event: Event) => {
      if (!(event as CustomEvent).detail) {
        finish();
        return;
      }
      active.current = true;
      setDragging(true);
      renew();
    };
    const over = () => {
      if (active.current) renew();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
    };
    const move = (event: MouseEvent) => {
      if (active.current && event.buttons === 0) finish();
    };
    const visibility = () => {
      if (document.hidden) finish();
    };
    const leave = (event: DragEvent) => {
      if (
        event.relatedTarget === null &&
        (event.target === document || event.target === document.documentElement)
      )
        finish();
    };
    window.addEventListener(PROJECT_FILE_DRAG_EVENT, change);
    window.addEventListener('dragover', over, true);
    window.addEventListener('dragend', finish, true);
    window.addEventListener('drop', finish, true);
    window.addEventListener('mouseup', finish, true);
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', finish, true);
    window.addEventListener('mousedown', finish, true);
    window.addEventListener('mousemove', move, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', finish);
    window.addEventListener('dragleave', leave, true);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clearTimeout(watchdog);
      window.removeEventListener(PROJECT_FILE_DRAG_EVENT, change);
      window.removeEventListener('dragover', over, true);
      window.removeEventListener('dragend', finish, true);
      window.removeEventListener('drop', finish, true);
      window.removeEventListener('mouseup', finish, true);
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', finish, true);
      window.removeEventListener('mousedown', finish, true);
      window.removeEventListener('mousemove', move, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', finish);
      window.removeEventListener('dragleave', leave, true);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  return dragging;
}
