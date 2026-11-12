import { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { developerFileLanguage } from '../components/UI/DeveloperFileEditor';

it.each(['home.html', 'HOME.HTM', 'page.xhtml'])(
  'parses HTML and embedded scripts in %s',
  (name) => {
    const state = EditorState.create({
      doc: '<div class="hello"><script>const message = "hello";</script><style>div { color: red; }</style></div>',
      extensions: developerFileLanguage(name),
    });
    const nodes: string[] = [];
    syntaxTree(state).iterate({
      enter: (node) => {
        nodes.push(node.name);
      },
    });
    expect(nodes).toContain('TagName');
    expect(nodes).toContain('AttributeName');
    expect(nodes).toContain('Script');
    expect(nodes).toContain('StyleSheet');
  }
);
