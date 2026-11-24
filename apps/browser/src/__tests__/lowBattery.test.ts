jest.mock('child_process', () => ({ execFile: jest.fn() }));
import { execFile } from 'child_process';
jest.mock('electron', () => ({ app: {}, Notification: {}, powerMonitor: {} }));
import { createLowBatteryCheck, parseBatteryStatus, getBatteryStatus } from '../main/lowBattery';

it('reads the internal battery and distinguishes charging from discharging', () => {
  expect(parseBatteryStatus("Now drawing from 'Battery Power'\n -InternalBattery-0 (id=123)\t20%; discharging; 1:00 remaining present: true")).toEqual({percent:20, discharging:true});
  expect(parseBatteryStatus("Now drawing from 'AC Power'\n -InternalBattery-0\t19%; charging; present: true")).toEqual({percent:19, discharging:false});
  expect(parseBatteryStatus("Now drawing from 'AC Power'")).toBeUndefined();
  expect(parseBatteryStatus('InternalBattery 101%; discharging')).toBeUndefined();
});
it('alerts once at 20% or lower and rearms after recovery above 25%', async () => {
  const notify = jest.fn();
  let percent = 21;
  let discharging = true;
  const monitor = createLowBatteryCheck(async () => ({percent, discharging}), notify);
  await monitor.check(); expect(notify).not.toHaveBeenCalled();
  percent = 20; await monitor.check(); expect(notify).toHaveBeenCalledWith(20);
  percent = 19; await monitor.check();
  discharging = false; await monitor.check();
  discharging = true; await monitor.check();
  percent = 21; await monitor.check();
  percent = 20; await monitor.check(); expect(notify).toHaveBeenCalledTimes(1);
  percent = 26; await monitor.check();
  percent = 15; await monitor.check(); expect(notify).toHaveBeenCalledTimes(2);
  monitor.dispose(); percent = 27; await monitor.check();
});
it('does not alert while charging, and alerts if launched already below 20%', async () => {
  const notify = jest.fn();
  let discharging = false;
  const monitor = createLowBatteryCheck(async () => ({percent:10, discharging}), notify);
  await monitor.check(); expect(notify).not.toHaveBeenCalled();
  discharging = true; await monitor.check(); expect(notify).toHaveBeenCalledWith(10);
});
it('ignores failed reads and prevents overlapping checks or alerts after disposal', async () => {
  const notify = jest.fn();
  let finish!: (value: {percent:number; discharging:boolean}) => void;
  const read = jest.fn(() => new Promise<{percent:number; discharging:boolean}>(resolve => { finish = resolve; }));
  const monitor = createLowBatteryCheck(read, notify);
  const pending = monitor.check(); await monitor.check(); expect(read).toHaveBeenCalledTimes(1);
  monitor.dispose(); finish({percent:5, discharging:true}); await pending;
  expect(notify).not.toHaveBeenCalled();
  await expect(createLowBatteryCheck(async () => { throw new Error('OS read failed'); }, notify).check()).resolves.toBeUndefined();
});

it('shares concurrent hook battery reads and caches the snapshot', async () => {
  let callback!: (error: Error|null, output: string) => void;
  (execFile as unknown as jest.Mock).mockImplementation((_path,_args,_options,done)=>{callback=done});
  const first = getBatteryStatus(true);
  const second = getBatteryStatus();
  expect(execFile).toHaveBeenCalledTimes(1);
  callback(null,"Now drawing from 'Battery Power'\n -InternalBattery-0 20%; discharging; present: true");
  const result = await first;
  expect(result).toEqual({available:true,percent:20,charging:false,onBattery:true,sampledAt:expect.any(Number)});
  expect(await second).toEqual(result);
  expect(await getBatteryStatus()).toEqual(result);
  expect(execFile).toHaveBeenCalledTimes(1);
});

it('skips disabled reads and suppresses an in-flight alert, then permits re-enabling', async()=>{
  let enabled=false;
  const notify=jest.fn();
  let finish!: (value:{percent:number;discharging:boolean})=>void;
  const read=jest.fn(()=>new Promise<{percent:number;discharging:boolean}>(resolve=>{finish=resolve}));
  const monitor=createLowBatteryCheck(read,notify,()=>enabled);
  await monitor.check(); expect(read).not.toHaveBeenCalled();
  enabled=true; const pending=monitor.check();
  enabled=false; finish({percent:10,discharging:true}); await pending;
  expect(notify).not.toHaveBeenCalled();
  enabled=true; const resumed=monitor.check(); finish({percent:10,discharging:true}); await resumed;
  expect(notify).toHaveBeenCalledWith(10);
  monitor.dispose();
});
