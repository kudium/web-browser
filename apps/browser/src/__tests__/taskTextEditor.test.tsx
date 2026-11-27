import '@testing-library/jest-dom';
import { render,screen,fireEvent } from '@testing-library/react';
import { TaskTextEditor } from '../components/UI/TaskTextEditor';
jest.mock('../components/UI/MarkdownNoteEditor',()=>({MarkdownNoteEditor:({markdown,label,onChange}:any)=><textarea aria-label={label} defaultValue={markdown} onChange={event=>onChange(event.target.value)} />}));
test('shows safe links and formatting and saves rich edits without raw syntax in the title',async()=>{
  const save=jest.fn();
  render(<TaskTextEditor title="Visit España" markdown="Visit **[España](https://example.com/Spain)**" disabled={false} onSave={save}/>);
  expect(screen.getByRole('link',{name:'España'}).closest('strong')).not.toBeNull();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Edit task: Visit España'}));
  const editor=await screen.findByRole('textbox',{name:'Task title: Visit España'});
  fireEvent.change(editor,{target:{value:'Visit **[Cataluña](https://example.com/Catalonia)**'}});
  fireEvent.blur(editor,{relatedTarget:null});
  expect(save).toHaveBeenCalledWith('Visit Cataluña','Visit **[Cataluña](https://example.com/Catalonia)**');
});
