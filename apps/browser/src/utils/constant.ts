import { NewWindowParams } from '../types';

export const MAIN_WINDOW: NewWindowParams = { options: {}, view: 'main' };

export const SETTINGS_WINDOW: NewWindowParams = {
  options: {
    width: 1080,
    height: 800,
    minWidth: 760,
    minHeight: 600,
  },
  view: 'settings',
  isChild: true,
};

export const ADD_APP_WINDOW: NewWindowParams = {
  options: {
    width: 500,
    height: 630,
    resizable: false,
  },
  view: 'add-app',
  isChild: true,
};

export const STORAGE_KEY = {
  USER_APPS: 'user_apps',
  USER_LAST_APP_ID: 'user_last_app_id',
  USER_LAST_SCREENS: 'user_last_screens',
};

export const EVENT_KEY = {
  APP_LIST_UPDATE: 'app_list_update',
  SPACE_UPDATE: 'space_update',

  EDIT_APP: 'edit_app',
};

export type IStorageKey = keyof typeof STORAGE_KEY;

export type IEventKey = keyof typeof EVENT_KEY;
