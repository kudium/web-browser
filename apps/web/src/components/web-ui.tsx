import { Button as RadixButton, TextField, TextArea as RadixTextArea } from '@radix-ui/themes';
import type { ComponentProps, InputHTMLAttributes, SelectHTMLAttributes } from 'react';

// Native fields preserve the server-rendered forms and existing progressive enhancement.
export function Button({ className, ...props }: ComponentProps<typeof RadixButton>) {
  return <RadixButton type={props.type || "submit"} size="2" variant={className?.includes('hook-primary') ? 'solid' : 'surface'} className={className} {...props} />;
}
export function Input({ type, className, ...props }: Omit<ComponentProps<typeof TextField.Root>, "size" | "type"> & Pick<InputHTMLAttributes<HTMLInputElement>, "accept" | "defaultChecked" | "checked"> & { type?: ComponentProps<typeof TextField.Root>["type"] | "checkbox" | "file" }) {
  if (type === 'hidden' || type === 'file') return <input type={type} className={className} {...props} />;
  if (type === 'checkbox') return <input type="checkbox" className={`ui-checkbox ${className || ''}`} {...props} />;
  return <TextField.Root size="3" type={type} className={className} {...props} />;
}
export function Textarea(props: ComponentProps<typeof RadixTextArea>) {
  return <RadixTextArea size="3" {...props} />;
}
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <div className="rt-TextFieldRoot rt-r-size-3 rt-variant-surface ui-native-select"><select className={`rt-reset rt-TextFieldInput ${className || ''}`} {...props} /><svg className="ui-select-chevron" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg></div>;
}
