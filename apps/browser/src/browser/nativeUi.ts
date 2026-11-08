export interface NativeMenuItem {
  id?: string;
  label?: string;
  enabled?: boolean;
  type?: 'normal' | 'separator';
  submenu?: NativeMenuItem[];
}
export interface NativePrompt {
  message: string;
  detail: string;
  confirm: string;
}
