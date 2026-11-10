import { createContext, useContext } from 'react';

/** DOM-dependent controls must use the document currently hosting the panel. */
export const AssistantPanelDocumentContext = createContext<Document | null>(
  null
);
export function useAssistantPanelDocument() {
  return useContext(AssistantPanelDocumentContext) || document;
}

export const AssistantPanelWindowContext = createContext<{
  title: string;
  floating: boolean;
  toggle: () => void;
} | null>(null);
