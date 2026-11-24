import { app, powerMonitor } from 'electron';
import { execFile } from 'child_process';

export function parseBatteryStatus(output: string) {
  const battery = output.split('\n').find((line) => /InternalBattery/.test(line));
  const percent = battery?.match(/\b(\d{1,3})%/);
  if (!percent || Number(percent[1]) > 100) return undefined;
  return {
    percent: Number(percent[1]),
    discharging: /Now drawing from 'Battery Power'/.test(output) && /;\s*discharging\b/.test(battery!),
  };
}

/** One alert per low-battery episode, with hysteresis around the threshold. */
export function createLowBatteryCheck(
  read: () => Promise<ReturnType<typeof parseBatteryStatus>>,
  notify: (percent: number) => void,
  enabled: () => boolean = () => true,
) {
  let running = false;
  let alerted = false;
  let disposed = false;
  return {
    async check() {
      if (running || disposed || !enabled()) return;
      running = true;
      try {
        const status = await read();
        if (!status || disposed || !enabled()) return;
        if (status.percent > 25) alerted = false;
        if (status.discharging && status.percent <= 20 && !alerted) {
          notify(status.percent);
          alerted = true;
        }
      } catch {
        // Missing batteries and transient OS failures must not interrupt browsing.
      } finally { running = false; }
    },
    dispose() { disposed = true; },
  };
}

export type BatteryStatus = { available: boolean; percent: number | null; charging: boolean | null; onBattery: boolean | null; sampledAt: number | null };
let batteryCache: BatteryStatus | undefined;
let batteryRead: Promise<BatteryStatus> | undefined;
export function getBatteryStatus(force = false): Promise<BatteryStatus> {
  if (process.platform !== 'darwin') return Promise.resolve({available:false,percent:null,charging:null,onBattery:null,sampledAt:null});
  if (batteryRead) return batteryRead;
  if (!force && batteryCache?.sampledAt && Date.now() - batteryCache.sampledAt < 5 * 60000) return Promise.resolve(batteryCache);
  batteryRead = new Promise<BatteryStatus>((resolve) => {
    execFile('/usr/bin/pmset', ['-g', 'batt'], {timeout:5000,maxBuffer:16384,env:{...process.env,LC_ALL:'C'}}, (error, output) => {
      const status = !error && parseBatteryStatus(output);
      batteryCache = status ? {available:true,percent:status.percent,charging:/;\s*charging\b/.test(output),onBattery:/Now drawing from 'Battery Power'/.test(output),sampledAt:Date.now()} : {available:false,percent:null,charging:null,onBattery:null,sampledAt:Date.now()};
      resolve(batteryCache);
    });
  }).finally(() => { batteryRead = undefined; });
  return batteryRead;
}

export function startLowBatteryNotifications(notify: (percent: number) => void, options: {
  enabled: () => boolean;
  onChange: (listener: () => void) => () => void;
}) {
  // Electron exposes AC/battery events, but not the percentage on macOS.
  if (process.platform !== 'darwin') return;
  const monitor = createLowBatteryCheck(async () => {
    const status = await getBatteryStatus(true);
    return status.available && status.percent !== null ? {percent:status.percent,discharging:status.onBattery === true && !status.charging} : undefined;
  }, notify, options.enabled);
  const check = () => {
    if (options.enabled() && powerMonitor.isOnBatteryPower()) void monitor.check();
  };
  // Percentage changes have no Electron event. Poll conservatively only
  // while unplugged; power changes and resume still trigger an immediate check.
  let timer: ReturnType<typeof setInterval> | undefined;
  const configure = () => {
    if (!options.enabled()) { clearInterval(timer); timer = undefined; return; }
    if (timer) return;
    timer = setInterval(check, 5 * 60000);
    timer.unref();
    check();
  };
  const unsubscribe = options.onChange(configure);
  powerMonitor.on('on-battery', check);
  const onAC = () => { batteryCache = undefined; };
  powerMonitor.on('on-ac', onAC);
  powerMonitor.on('resume', check);
  app.once('before-quit', () => {
    clearInterval(timer);
    unsubscribe();
    monitor.dispose();
    powerMonitor.removeListener('on-battery', check);
    powerMonitor.removeListener('on-ac', onAC);
    powerMonitor.removeListener('resume', check);
  });
  configure();
}
