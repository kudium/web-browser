// Runs in the renderer world after the dependency registers its custom element.
// Keep this adapter isolated because updateIcon is a dependency implementation API.
export function retainExtensionIcons() {
  type ActionElement = HTMLElement & {
    id: string;
    partition: string;
    tab: number;
    pendingIcon?: HTMLImageElement;
    updateIcon: (info: { iconModified?: string }) => void;
  };
  const cache = new Map<string, string>();
  const Action = customElements.get('browser-action');
  if (!Action) return;
  const prototype = Action.prototype as ActionElement;
  const original = prototype.updateIcon;
  if (!original) return;
  prototype.updateIcon = function updateIcon(info) {
    const key = `${this.partition}:${this.id}`;
    const cached = cache.get(key);
    if (cached && !this.style.backgroundImage) {
      this.style.backgroundImage = cached;
      this.classList.remove('no-icon');
    }
    original.call(this, info);
    const image = this.pendingIcon;
    if (!image) return;
    const { onload } = image;
    const { onerror } = image;
    image.onload = (event) => {
      onload?.call(image, event);
      if (this.isConnected && this.style.backgroundImage) {
        cache.set(key, this.style.backgroundImage);
        if (cache.size > 256) cache.delete(cache.keys().next().value!);
      }
    };
    image.onerror = (event) => {
      onerror?.call(image, event);
      if (this.style.backgroundImage) this.classList.remove('no-icon');
    };
  };
}
