import { validateHookToast } from '../browser/hookToast';
it('accepts plain text and a declared action without executable payloads', () => {
  expect(validateHookToast({id:'notice',title:'Battery',message:'<script>literal</script>',action:{id:'check',label:'Check'}}).id).toBe('notice');
});
it.each([
 {id:'../bad',title:'Battery',message:'x'},
 {id:'x',title:'',message:'x'},
 {id:'x',title:'Battery',message:'x'.repeat(501)},
 {id:'x',title:'Battery',message:'x',durationMs:100000},
 {id:'x',title:'Battery',message:'x',action:{id:'check',label:'Check',run:'code'}},
])('rejects invalid or privileged toast data %#', input => expect(()=>validateHookToast(input)).toThrow());
it('accepts an explicit duration and rejects out-of-range or nonnumeric values', () => {
  expect(validateHookToast({id:'x',title:'Notice',message:'x',durationMs:15000}).durationMs).toBe(15000);
  for (const durationMs of [0,999,60001,NaN,Infinity,1500.5,'5000']) {
    expect(()=>validateHookToast({id:'x',title:'Notice',message:'x',durationMs})).toThrow();
  }
});

it.each(['info','warn','success','error'] as const)('accepts type %s and prefers it over legacy tone', type => {
  expect(validateHookToast({id:'style',title:'Notice',message:'Message',type,tone:'info'}).tone).toBe(type === 'warn' ? 'warning' : type);
});
it('rejects unknown types',()=>{
  expect(()=>validateHookToast({id:'style',title:'Notice',message:'Message',type:'danger'})).toThrow();
});
