import '@testing-library/jest-dom';
import {render,screen,fireEvent} from '@testing-library/react';
import {Theme} from '@radix-ui/themes';
import {HookPresets} from '../components/UI/HookPresets';
import {hookExamples} from '../browser/hookExamples';

it('exposes all built-in samples and inserts the battery toast into After load',async()=>{
  const insert=jest.fn();
  render(<Theme><HookPresets disabled={false} stage="before" source="" canRun onInsert={insert}/></Theme>);
  fireEvent.click(screen.getByRole('button',{name:'Examples'}));
  const example=hookExamples.find(item=>item.id==='battery-toast')!;
  const sample=await screen.findByRole('button',{name:/Battery status with a toast action/});
  for(const item of hookExamples)expect(screen.getByText(item.name)).toBeInTheDocument();
  fireEvent.click(sample);
  fireEvent.click(screen.getByRole('button',{name:'Insert code'}));
  expect(insert).toHaveBeenCalledWith(example.source,'after');
});
