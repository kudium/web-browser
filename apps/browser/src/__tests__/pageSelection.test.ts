import { savePageSelection } from '../main/pageSelection';
import { passwordVault } from '../main/passwordManager';
import { addTodo } from '../main/todos';
import { getGroupLocks } from '../main/groupLocks';
jest.mock('../main/passwordManager', () => ({passwordVault:jest.fn()}));
jest.mock('../main/todos', () => ({addTodo:jest.fn(() => ({recordId:'tasks'}))}));
jest.mock('../main/groupLocks', () => ({getGroupLocks:jest.fn()}));
const save=jest.fn();
beforeEach(() => {jest.clearAllMocks();(passwordVault as jest.Mock).mockReturnValue({save});(getGroupLocks as jest.Mock).mockReturnValue({locked:()=>false});});
it('saves selected text as an ordinary note using the clicked group scope', () => {
  savePageSelection('note','  Track this\nMore information  ','group:example');
  expect(save).toHaveBeenCalledWith(expect.objectContaining({kind:'note',title:'Track this',notes:'Track this\nMore information',allowAI:false,sensitive:false,asRead:false,scope:'group:example'}),'group:example');
});
it('uses the existing Today task flow', () => {
  savePageSelection('today',' Follow up ','group:example');
  expect(addTodo).toHaveBeenCalledWith('Follow up',true,'group:example');
  expect(save).not.toHaveBeenCalled();
});
it('does not save empty text or selections from a locked group', () => {
  expect(() => savePageSelection('note',' ')).toThrow();
  (getGroupLocks as jest.Mock).mockReturnValue({locked:()=>true});
  expect(() => savePageSelection('note','Private','group:locked')).toThrow('Unlock');
  expect(save).not.toHaveBeenCalled();expect(addTodo).not.toHaveBeenCalled();
});

it('retains long selections as details with a short title', () => {
  const text='A long selected paragraph. '.repeat(50);
  savePageSelection('today',text,'group:page');
  const args=(addTodo as jest.Mock).mock.calls[0];
  expect(args[0].length).toBeLessThanOrEqual(160);
  expect(args[8]).toBe(text.trim());
});
it('appends notes through the existing save path preserving their content and scope', () => {
  const note={id:'note',kind:'note',scope:'group:other',title:'Existing',notes:'Original'};
  (passwordVault as jest.Mock).mockReturnValue({save,edit:()=>note,isOrdinaryNote:()=>true});
  savePageSelection('append','Additional text','group:page',undefined,{id:'note',scope:'group:other',kind:'note'});
  expect(save).toHaveBeenCalledWith({...note,notes:'Original\n\nAdditional text'},'group:other');
});
