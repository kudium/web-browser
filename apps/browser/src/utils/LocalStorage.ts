export const LocalStorage = {
  get(key: string) {
    try {
      if (
        [
          'kudiumbrowser-active-space',
          'user_last_app_id',
          'user_last_screens',
        ].includes(key)
      )
        return (
          window.sessionStorage.getItem(key) || window.localStorage.getItem(key)
        );
      return window.localStorage.getItem(key);
    } catch {
      return undefined;
    }
  },
  set(key: string, value: string) {
    try {
      if (
        [
          'kudiumbrowser-active-space',
          'user_last_app_id',
          'user_last_screens',
        ].includes(key)
      ) {
        window.sessionStorage.setItem(key, value);
        return;
      }
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
