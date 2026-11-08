/* Related iframe sessions must be discovered before frame-local commands. */
/* eslint-disable no-await-in-loop, no-restricted-syntax */
import type { WebContents } from 'electron';
import { reportAIPointer, withAIProtocol } from './aiProtocol';

type Send = (
  method: string,
  parameters?: Record<string, unknown>,
  sessionId?: string
) => Promise<any>;
interface FrameInfo {
  id: string;
  parentId?: string;
  url: string;
  name: string;
  sessionId?: string;
}

async function withFrames<T>(
  contents: WebContents,
  signal: AbortSignal,
  execute: (send: Send, frames: FrameInfo[]) => Promise<T>
) {
  const sessions = new Map<
    string,
    { parentSession?: string; parentFrame?: string; configured: boolean }
  >();
  const onMessage = (
    _event: unknown,
    method: string,
    params: any,
    parentSession?: string
  ) => {
    if (
      method === 'Target.attachedToTarget' &&
      params.targetInfo?.type === 'iframe' &&
      sessions.size < 128
    )
      sessions.set(params.sessionId, {
        parentSession,
        parentFrame: params.targetInfo.parentFrameId,
        configured: false,
      });
  };
  contents.debugger.on('message', onMessage);
  try {
    return await withAIProtocol(contents, signal, async (send) => {
      const autoAttach = {
        autoAttach: true,
        waitForDebuggerOnStart: false,
        flatten: true,
        filter: [{ type: 'iframe', exclude: false }, { exclude: true }],
      };
      await send('Target.setAutoAttach', autoAttach);
      for (let pass = 0; pass < 128; pass += 1) {
        const pending = [...sessions.entries()].find(
          ([, value]) => !value.configured
        );
        if (!pending) break;
        pending[1].configured = true;
        await send('Target.setAutoAttach', autoAttach, pending[0]);
      }
      const frames: FrameInfo[] = [];
      const roots = new Map<string, string>();
      const visit = (
        tree: any,
        sessionId?: string,
        fallbackParent?: string
      ) => {
        if (frames.length >= 128) return;
        const frame: FrameInfo = {
          id: tree.frame.id,
          parentId: tree.frame.parentId || fallbackParent,
          url: tree.frame.url,
          name: tree.frame.name || '',
          sessionId,
        };
        const existing = frames.findIndex((item) => item.id === frame.id);
        if (existing >= 0) frames[existing] = frame;
        else frames.push(frame);
        tree.childFrames?.forEach((child: any) =>
          visit(child, sessionId, frame.id)
        );
      };
      const root = await send('Page.getFrameTree');
      visit(root.frameTree);
      for (const [sessionId, details] of sessions) {
        const result = await send('Page.getFrameTree', undefined, sessionId);
        roots.set(sessionId, result.frameTree.frame.id);
        visit(
          result.frameTree,
          sessionId,
          details.parentFrame ||
            (details.parentSession
              ? roots.get(details.parentSession)
              : root.frameTree.frame.id)
        );
      }
      return execute(send, frames);
    });
  } finally {
    contents.debugger.removeListener('message', onMessage);
  }
}

export async function listAIFrames(contents: WebContents, signal: AbortSignal) {
  return withFrames(contents, signal, async (_send, frames) =>
    frames.map(({ sessionId: _session, ...frame }) => frame)
  );
}
export async function withAIFrame<T>(
  contents: WebContents,
  frameId: string,
  signal: AbortSignal,
  execute: (
    send: (
      method: string,
      parameters?: Record<string, unknown>
    ) => Promise<any>,
    runProgram: (code: string, returnByValue?: boolean) => Promise<any>,
    pointer: (
      point: { x: number; y: number },
      event?: Record<string, unknown>,
      dispatch?: boolean
    ) => Promise<void>,
    rootSend: Send
  ) => Promise<T>
) {
  let active = true;
  let invalid = false;
  const relevantFrames = new Set<string>();
  const relevantSessions = new Set<string>();
  const owners = new Map<
    string,
    Promise<{ objectId: string; sessionId?: string }>
  >();
  const references: Array<{ objectId: string; sessionId?: string }> = [];
  const onChange = (_event: unknown, method: string, params: any) => {
    let changedFrame: string | undefined;
    if (method === 'Page.frameNavigated') changedFrame = params.frame?.id;
    if (method === 'Page.frameDetached') changedFrame = params.frameId;
    if (
      (changedFrame !== undefined && relevantFrames.has(changedFrame)) ||
      (method === 'Target.detachedFromTarget' &&
        relevantSessions.has(params.sessionId))
    )
      invalid = true;
  };
  const check = () => {
    if (signal.aborted) throw new Error('Stopped.');
    if (!active || invalid)
      throw new Error(
        'Frame document changed or action ended. Read the page again.'
      );
  };
  contents.debugger.on('message', onChange);
  try {
    return await withFrames(contents, signal, async (send, frames) => {
      const frame = frames.find((item) => item.id === frameId);
      if (!frame) throw new Error('Frame changed. List frames again.');
      let ancestor: FrameInfo | undefined = frame;
      for (let depth = 0; ancestor && depth < 128; depth += 1) {
        relevantFrames.add(ancestor.id);
        if (ancestor.sessionId) relevantSessions.add(ancestor.sessionId);
        const { parentId }: FrameInfo = ancestor;
        ancestor = frames.find((item) => item.id === parentId);
      }
      const enabledSessions = new Set<string | undefined>();
      const enable = async (sessionId?: string) => {
        if (!enabledSessions.has(sessionId)) {
          await send('Page.enable', undefined, sessionId);
          enabledSessions.add(sessionId);
        }
      };
      await enable(frame.sessionId);
      const world = await send(
        'Page.createIsolatedWorld',
        { frameId, worldName: 'kudiumbrowser-ai-control' },
        frame.sessionId
      );
      const scopedSend = (
        method: string,
        parameters?: Record<string, unknown>
      ) => {
        check();
        return send(method, parameters, frame.sessionId);
      };
      const runProgram = async (code: string, returnByValue = true) => {
        const result = await scopedSend('Runtime.evaluate', {
          expression: code,
          contextId: world.executionContextId,
          returnByValue,
          awaitPromise: true,
        });
        if (result.exceptionDetails)
          throw new Error(
            result.exceptionDetails.exception?.description ||
              result.exceptionDetails.text ||
              'Frame action failed.'
          );
        return returnByValue ? result.result.value : result.result;
      };
      let focused = false;
      const resolveOwner = (current: FrameInfo, parent: FrameInfo) => {
        let cached = owners.get(current.id);
        if (!cached) {
          cached = (async () => {
            check();
            await enable(parent.sessionId);
            const owner = await send(
              'DOM.getFrameOwner',
              { frameId: current.id },
              parent.sessionId
            );
            const context = await send(
              'Page.createIsolatedWorld',
              { frameId: parent.id, worldName: 'kudiumbrowser-ai-control' },
              parent.sessionId
            );
            const node = await send(
              'DOM.resolveNode',
              {
                backendNodeId: owner.backendNodeId,
                executionContextId: context.executionContextId,
              },
              parent.sessionId
            );
            if (!node.object?.objectId)
              throw new Error('Frame owner reference changed.');
            const reference = {
              objectId: node.object.objectId as string,
              sessionId: parent.sessionId,
            };
            references.push(reference);
            check();
            return reference;
          })();
          owners.set(current.id, cached);
        }
        return cached;
      };
      const pointer = async (
        point: { x: number; y: number },
        event: Record<string, unknown> = { type: 'mouseMoved' },
        dispatch = true
      ) => {
        check();
        let current = frame;
        let translated = point;
        let inputPoint: { x: number; y: number } | undefined;
        for (let depth = 0; current.parentId && depth < 128; depth += 1) {
          const { parentId } = current;
          const parent = frames.find((item) => item.id === parentId);
          if (!parent)
            throw new Error('Frame parent changed. List frames again.');
          if (!inputPoint && parent.sessionId !== frame.sessionId)
            inputPoint = translated;
          const owner = await resolveOwner(current, parent);
          check();
          const result = await send(
            'Runtime.callFunctionOn',
            {
              objectId: owner.objectId,
              functionDeclaration: `function(point) {
            if(!this.isConnected||this.ownerDocument!==document) throw new Error('Frame owner document changed.');
            let a=1,b=0,c=0,d=1;
            for (let el=this;el;el=el.parentElement||el.getRootNode().host) {
              const style=getComputedStyle(el);
              if((style.perspective&&style.perspective!=='none')||(style.rotate&&style.rotate!=='none')||(style.offsetPath&&style.offsetPath!=='none')) throw new Error('Perspective, individual rotation or motion-path iframe input is not supported yet.');
              const matrix=style.transform==='none'?{a:1,b:0,c:0,d:1,is2D:true}:new DOMMatrixReadOnly(style.transform);
              if(!matrix.is2D) throw new Error('Perspective iframe pointer input is not supported yet.');
              const values=style.scale&&style.scale!=='none'?style.scale.split(' ').map(value=>parseFloat(value)/(value.endsWith('%')?100:1)):[1];
              const zoom=style.zoom&&style.zoom!=='normal'?parseFloat(style.zoom)/(style.zoom.endsWith('%')?100:1):1;
              const sx=values[0]*zoom,sy=(values[1]??values[0])*zoom;
              const ma=matrix.a*sx,mb=matrix.b*sy,mc=matrix.c*sx,md=matrix.d*sy;
              const nextA=ma*a+mc*b,nextB=mb*a+md*b,nextC=ma*c+mc*d,nextD=mb*c+md*d;
              a=nextA;b=nextB;c=nextC;d=nextD;
            }
            const style=getComputedStyle(this), rect=this.getBoundingClientRect();
            const number=value=>parseFloat(value)||0;
            const left=number(style.borderLeftWidth)+number(style.paddingLeft), top=number(style.borderTopWidth)+number(style.paddingTop);
            const horizontal=left+number(style.borderRightWidth)+number(style.paddingRight), vertical=top+number(style.borderBottomWidth)+number(style.paddingBottom);
            const width=number(style.width)+(style.boxSizing==='border-box'?0:horizontal), height=number(style.height)+(style.boxSizing==='border-box'?0:vertical);
            const xs=[0,a*width,c*height,a*width+c*height],ys=[0,b*width,d*height,b*width+d*height];
            const minX=Math.min(...xs),minY=Math.min(...ys),expectedWidth=Math.max(...xs)-minX,expectedHeight=Math.max(...ys)-minY;
            const x=rect.left-minX+a*(left+point.x)+c*(top+point.y), y=rect.top-minY+b*(left+point.x)+d*(top+point.y);
            if(![a,b,c,d,width,height,x,y].every(Number.isFinite)||Math.abs(a*d-b*c)<1e-8||Math.abs(expectedWidth-rect.width)>0.5||Math.abs(expectedHeight-rect.height)>0.5) throw new Error('Iframe transform geometry changed or cannot be mapped.');
            if(width<=horizontal||height<=vertical||point.x<0||point.y<0||point.x>=width-horizontal||point.y>=height-vertical||x<0||y<0||x>=innerWidth||y>=innerHeight||document.elementFromPoint(x,y)!==this) throw new Error('Iframe pointer target is covered or outside the viewport.');
            return {x,y};
          }`,
              arguments: [{ value: translated }],
              returnByValue: true,
            },
            parent.sessionId
          );
          check();
          if (result.exceptionDetails)
            throw new Error(
              result.exceptionDetails.exception?.description ||
                'Frame pointer translation failed.'
            );
          translated = result.result.value;
          current = parent;
        }
        if (current.parentId) throw new Error('Frame nesting limit exceeded.');
        check();
        if (!dispatch) return;
        if (!focused) {
          await send('Emulation.setFocusEmulationEnabled', { enabled: true });
          focused = true;
        }
        const dragEvent = [
          'dragEnter',
          'dragOver',
          'dragLeave',
          'drop',
        ].includes(String(event.type));
        // OOPIF input uses session-local coordinates; the visible cursor uses
        // the fully translated top-level viewport position.
        if (frame.sessionId)
          reportAIPointer(contents, { ...event, ...translated });
        await scopedSend(
          dragEvent ? 'Input.dispatchDragEvent' : 'Input.dispatchMouseEvent',
          {
            ...event,
            ...(inputPoint || translated),
          }
        );
      };
      try {
        return await execute(scopedSend, runProgram, pointer, send);
      } finally {
        await Promise.allSettled(
          references.map((reference) =>
            send(
              'Runtime.releaseObject',
              { objectId: reference.objectId },
              reference.sessionId
            )
          )
        );
        references.length = 0;
      }
    });
  } finally {
    active = false;
    contents.debugger.removeListener('message', onChange);
    owners.clear();
    references.length = 0;
  }
}
export async function executeAIFrame(
  contents: WebContents,
  frameId: string,
  code: string,
  signal: AbortSignal
) {
  return withAIFrame(contents, frameId, signal, async (_send, runProgram) =>
    runProgram(code)
  );
}

/** Inspect default-world window listeners in every related renderer. */
export async function hasAIUnloadHandlers(
  contents: WebContents,
  signal: AbortSignal
) {
  const contexts = new Map<string, number>();
  const contextKey = (sessionId: string | undefined, frameId: string) =>
    `${sessionId || 'root'}:${frameId}`;
  const observe = (
    _event: unknown,
    method: string,
    params: any,
    sessionId?: string
  ) => {
    if (
      method === 'Runtime.executionContextCreated' &&
      params.context?.auxData?.isDefault
    )
      contexts.set(
        contextKey(sessionId, params.context.auxData.frameId),
        params.context.id
      );
  };
  contents.debugger.on('message', observe);
  try {
    return await withFrames(contents, signal, async (send, frames) => {
      const renderers = [...new Set(frames.map((frame) => frame.sessionId))];
      await Promise.all(
        renderers.map((sessionId) =>
          send('Runtime.enable', undefined, sessionId)
        )
      );
      const results = await Promise.all(
        frames.map(async (frame) => {
          const contextId = contexts.get(contextKey(frame.sessionId, frame.id));
          // Unknown contexts require approval rather than assuming no handler.
          if (contextId === undefined) return true;
          const { result, exceptionDetails } = await send(
            'Runtime.evaluate',
            { expression: 'window', contextId },
            frame.sessionId
          );
          if (exceptionDetails || !result?.objectId) return true;
          try {
            const { listeners } = await send(
              'DOMDebugger.getEventListeners',
              { objectId: result.objectId },
              frame.sessionId
            );
            return listeners.some(
              (listener: { type: string }) => listener.type === 'beforeunload'
            );
          } finally {
            await send(
              'Runtime.releaseObject',
              { objectId: result.objectId },
              frame.sessionId
            );
          }
        })
      );
      return frames.length >= 128 || results.some(Boolean);
    });
  } finally {
    contents.debugger.removeListener('message', observe);
  }
}

/** Run fixed page programs in a stable protocol world for adopted page families. */
export async function executeAIPageProtocol(
  contents: WebContents,
  code: string,
  signal: AbortSignal
) {
  return withAIProtocol(contents, signal, async (send) => {
    const { frameTree } = await send('Page.getFrameTree');
    const { executionContextId } = await send('Page.createIsolatedWorld', {
      frameId: frameTree.frame.id,
      worldName: 'kudiumbrowser-ai-control',
    });
    if (!contents.getURL()) {
      const initial = await send('Runtime.evaluate', {
        expression: 'location.href',
        contextId: executionContextId,
        returnByValue: true,
      });
      if (initial.exceptionDetails || initial.result?.value !== 'about:blank')
        throw new Error(
          'Tab has no observable initial blank document. Navigate it before reading.'
        );
    }
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression: code,
      contextId: executionContextId,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails)
      throw new Error(
        exceptionDetails.exception?.description ||
          exceptionDetails.text ||
          'Page program failed.'
      );
    return result?.value;
  });
}
