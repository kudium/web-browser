export const LocalStorage = {
  get(key: string) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return undefined;
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* empty */
    }
  },
  delete(key: string) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* empty */
    }
  },
};
