let pending: { id: string; taskId?: string } | undefined;
export function openTodoNote(id: string, taskId?: string) {
  pending = { id, taskId };
  window.dispatchEvent(
    new CustomEvent('kudiumbrowser-open-note', { detail: id }),
  );
}
export function takeTodoNavigation() {
  const value = pending;
  pending = undefined;
  return value;
}
