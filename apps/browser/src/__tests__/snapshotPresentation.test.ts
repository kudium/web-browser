import {
  presentSnapshots,
  captureNativeViewSnapshots,
  withinSnapshotDeadline,
} from '../main/snapshotPresentation';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('bounds a stalled native capture and ignores its late result', async () => {
  let finish!: (value: string) => void;
  const result = withinSnapshotDeadline(
    new Promise<string>((resolve) => {
      finish = resolve;
    }),
    80,
  );
  jest.advanceTimersByTime(80);
  expect(await result).toBeUndefined();
  finish('late image');
  expect(await result).toBeUndefined();
  expect(jest.getTimerCount()).toBe(0);
});

it('cleans up the deadline after successful and failed captures', async () => {
  expect(await withinSnapshotDeadline(Promise.resolve('frame'), 80)).toBe(
    'frame',
  );
  await expect(
    withinSnapshotDeadline(Promise.reject(new Error('capture failed')), 80),
  ).rejects.toThrow('capture failed');
  expect(jest.getTimerCount()).toBe(0);
});

it('bounds snapshot painting even when the renderer cannot execute its probe', async () => {
  const window = {
    isDestroyed: () => false,
    webContents: {
      send: jest.fn(),
      executeJavaScript: jest.fn(() => new Promise(() => {})),
    },
  };
  const pending = presentSnapshots(
    window as any,
    [
      {
        id: 'tab',
        x: 8,
        y: 40,
        width: 900,
        height: 600,
        image: 'data:image/png;base64,fixture',
      },
    ],
    undefined,
    80,
  );
  jest.advanceTimersByTime(80);
  await pending;
  expect(window.webContents.send).toHaveBeenCalledWith(
    'browser-snapshots',
    expect.any(Array),
  );
  expect(jest.getTimerCount()).toBe(0);
});

it.each([true, false])(
  'uses one painted frame for hover=%s and preserves the normal overlay wait',
  async (hover) => {
    let complete = false;
    const host = {
      isDestroyed: () => false,
      webContents: {
        send: (_channel: string, frames: any[]) => {
          const image = document.createElement('img');
          image.className = 'browser-snapshot';
          image.dataset.presentationId = frames[0].presentationId;
          image.decode = () => Promise.resolve();
          document.body.append(image);
        },
        executeJavaScript: (source: string) => window.eval(source),
      },
    };
    try {
      const pending = presentSnapshots(
        host as any,
        [{ id: 'tab', x: 0, y: 0, width: 100, height: 100, image: 'fixture' }],
        undefined,
        hover ? 80 : undefined,
      ).then(() => {
        complete = true;
      });
      await jest.advanceTimersByTimeAsync(17);
      expect(complete).toBe(hover);
      if (!hover) await jest.advanceTimersByTimeAsync(17);
      await pending;
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      document.body.innerHTML = '';
    }
  },
);


it('captures docked inspector and page bounds independently, retaining the owning tab scope', async () => {
  const source=(bounds:any,image:string)=>({getBounds:()=>bounds,getVisible:()=>true,webContents:{isDestroyed:()=>false,capturePage:jest.fn().mockResolvedValue({toDataURL:()=>image})}} as any);
  const page=source({x:20,y:60,width:500,height:600},'page');
  const tools=source({x:526,y:92,width:300,height:568},'tools');
  const frames=await captureNativeViewSnapshots('tab',[{view:page},{view:tools,surface:'devtools'}],{bounds:{x:20,y:60,width:806,height:600}});
  expect(frames).toEqual([
    expect.objectContaining({id:'tab',width:500,image:'page'}),
    expect.objectContaining({id:'tab',surface:'devtools',x:526,y:92,width:300,height:568,image:'tools'}),
  ]);
  expect(await captureNativeViewSnapshots('tab',[{view:page}],{bounds:{x:10,y:40,width:300,height:400},useSlotBounds:true})).toEqual([expect.objectContaining({x:10,y:40,width:300,height:400})]);
  tools.getVisible=()=>false;
  expect(await captureNativeViewSnapshots('tab',[{view:tools,surface:'devtools'}])).toEqual([]);
  expect(tools.webContents.capturePage).toHaveBeenCalledTimes(1);
  tools.getBounds=()=>{throw new Error('view destroyed')};tools.getVisible=()=>true;
  expect(await captureNativeViewSnapshots('tab',[{view:page},{view:tools,surface:'devtools'}])).toHaveLength(1);
});
