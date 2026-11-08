import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import { AppManager, ScreenManager } from '../AppManager';
import { EVENT_KEY, STORAGE_KEY } from '../constant';
import { IApp } from '../../types';
import { eventBus } from '../EventBus';
import { LocalStorage } from '../LocalStorage';
import { windowWorkspace } from '../windowWorkspace';

export const useAppList = (): {
  appList: IApp[];
  setAppList: Dispatch<SetStateAction<IApp[]>>;
  lastIndex: number;
} => {
  const initialRaw = useRef<string | null | undefined>();
  const [appList, setAppList] = useState(() => {
    initialRaw.current = LocalStorage.get(STORAGE_KEY.USER_APPS);
    return AppManager.getAll();
  });

  // get last app index
  const lastId = ScreenManager.getLastAppId();
  const lastURL = ScreenManager.getLastAppUrl();
  const lastIndex = appList.findIndex((app) =>
    lastId ? app.id === lastId : app.url === lastURL
  );

  useEffect(() => {
    // On App Updated
    const refresh = () => {
      const list = AppManager.getAll();
      setAppList(list);
    };
    const off = eventBus.on(EVENT_KEY.APP_LIST_UPDATE, refresh);
    const offWindow = windowWorkspace.subscribe(refresh);
    // Subscribe before rereading: a write between render and effect must not
    // leave the new consumer on an old layout until the next update.
    if (LocalStorage.get(STORAGE_KEY.USER_APPS) !== initialRaw.current)
      refresh();
    return () => {
      off();
      offWindow();
    };
  }, []);

  return { appList, setAppList, lastIndex };
};
