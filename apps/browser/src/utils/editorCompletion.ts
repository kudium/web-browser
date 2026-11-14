import { acceptCompletion, autocompletion } from '@codemirror/autocomplete';
import { Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

/** Accept IntelliSense first; fall through to normal indentation otherwise. */
export const tabCompletion = [
  autocompletion({ interactionDelay: 0 }),
  Prec.highest(
    keymap.of([
      {
        key: 'Tab',
        run: (view) => {
          if (view.state.readOnly || !view.state.facet(EditorView.editable))
            return true;
          return acceptCompletion(view);
        },
      },
    ])
  ),
];
