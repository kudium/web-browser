import { app, nativeTheme, powerMonitor } from 'electron';
import { execFile } from 'child_process';
export type HookOSEvent = 'power' | 'appearance';
let lowPower: { value: boolean | null; at: number } | undefined;
let reading: Promise<boolean | null> | undefined;
async function lowPowerMode() {
  if (process.platform !== 'darwin') return null;
  if (reading) return reading;
  if (lowPower && Date.now() - lowPower.at < 300000) return lowPower.value;
  reading = new Promise<boolean | null>(resolve => {
    execFile('/usr/bin/pmset', ['-g','custom'], {timeout:5000,maxBuffer:32768}, (error, output) => {
      const section = powerMonitor.isOnBatteryPower() ? 'Battery Power' : 'AC Power';
      const body = output.split(`${section}:`)[1]?.split(/\n\S[^\n]*:/)[0];
      const match = body?.match(/\blowpowermode\s+([01])\b/);
      lowPower = {value:!error && match ? match[1] === '1' : null,at:Date.now()};
      resolve(lowPower.value);
    });
  }).finally(()=>{reading=undefined});
  return reading;
}
export async function getHookPower() {
  return {onBattery:powerMonitor.isOnBatteryPower(),lowPowerMode:await lowPowerMode()};
}
export function getHookAppearance() {
  return {dark:nativeTheme.shouldUseDarkColors,
    reducedTransparency:nativeTheme.prefersReducedTransparency,highContrast:nativeTheme.shouldUseHighContrastColors};
}
export function getHookLocale() {
  return {language:app.getLocale(),languages:app.getPreferredSystemLanguages(),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone};
}
const subscribers = new Set<(kind:HookOSEvent)=>void>();
const emitPower = () => {lowPower=undefined; subscribers.forEach(callback=>callback('power'))};
const emitAppearance = () => subscribers.forEach(callback=>callback('appearance'));
/** One set of system listeners regardless of how many hooks subscribe. */
export function onHookOSChange(callback:(kind:HookOSEvent)=>void) {
  if (!subscribers.size) {
    powerMonitor.on('on-ac',emitPower);powerMonitor.on('on-battery',emitPower);powerMonitor.on('resume',emitPower);
    nativeTheme.on('updated',emitAppearance);
  }
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
    if (!subscribers.size) {
      powerMonitor.removeListener('on-ac',emitPower);powerMonitor.removeListener('on-battery',emitPower);powerMonitor.removeListener('resume',emitPower);
      nativeTheme.removeListener('updated',emitAppearance);
    }
  };
}
