import { EventEmitter } from 'events';
jest.mock('electron', () => {
  const {EventEmitter: E} = jest.requireActual('events');
  return {
    app:{getLocale:()=> 'en-US',getPreferredSystemLanguages:()=>['en-US']},
    powerMonitor:Object.assign(new E(),{isOnBatteryPower:()=>true}),
    nativeTheme:Object.assign(new E(),{shouldUseDarkColors:true,prefersReducedTransparency:false,shouldUseHighContrastColors:false}),
  };
});
jest.mock('child_process', () => ({execFile:jest.fn((_path,_args,_options,done)=>done(null,'Battery Power:\n lowpowermode 1\nAC Power:\n lowpowermode 0'))}));
import { powerMonitor, nativeTheme } from 'electron';
import { execFile } from 'child_process';
import { getHookPower, getHookAppearance, getHookLocale, onHookOSChange } from '../main/hookOS';
it('shares one native event listener per event and removes it after the last hook unsubscribes', () => {
  const first=jest.fn(),second=jest.fn();
  const stopFirst=onHookOSChange(first),stopSecond=onHookOSChange(second);
  expect((powerMonitor as unknown as EventEmitter).listenerCount('on-ac')).toBe(1);
  expect((nativeTheme as unknown as EventEmitter).listenerCount('updated')).toBe(1);
  (powerMonitor as unknown as EventEmitter).emit('on-ac');
  expect(first).toHaveBeenCalledWith('power');expect(second).toHaveBeenCalledWith('power');
  stopFirst();first.mockClear();
  (nativeTheme as unknown as EventEmitter).emit('updated');
  expect(first).not.toHaveBeenCalled();expect(second).toHaveBeenCalledWith('appearance');
  stopSecond();
  expect((powerMonitor as unknown as EventEmitter).listenerCount('on-ac')).toBe(0);
  expect((nativeTheme as unknown as EventEmitter).listenerCount('updated')).toBe(0);
});
it('shares Low Power Mode queries and caches the result without starting a polling timer', async () => {
  const [first,second]=await Promise.all([getHookPower(),getHookPower()]);
  expect(first).toEqual({onBattery:true,lowPowerMode:true});expect(second).toEqual(first);
  await getHookPower();expect(execFile).toHaveBeenCalledTimes(1);
});
it('returns bounded appearance and locale status without device identifiers', () => {
  expect(getHookAppearance()).toEqual({dark:true,reducedTransparency:false,highContrast:false});
  expect(getHookLocale()).toEqual({language:'en-US',languages:['en-US'],timeZone:expect.any(String)});
});
