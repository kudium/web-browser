export interface NativeMenuItem {
  id?: string;
  label?: string;
  enabled?: boolean;
  type?: 'normal' | 'separator' | 'checkbox';
  checked?: boolean;
  role?: 'cut' | 'copy' | 'paste' | 'pasteAndMatchStyle' | 'selectAll';
  submenu?: NativeMenuItem[];
}
export interface NativePrompt {
  message: string;
  detail: string;
  confirm: string;
}

export interface NativeTooltipRequest {
  id: string;
  label?: string;
  anchor?: { x: number; y: number; width: number; height: number };
  dark?: boolean;
}
