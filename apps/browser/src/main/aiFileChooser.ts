/* eslint-disable no-await-in-loop */
import type { WebContents } from 'electron';
import type { AIProtocolSend } from './aiProtocol';
import type { AIDialogLifecycle } from './aiDialogs';
import { AIUploadFile, verifyAIUpload } from './aiAttachments';

/** Intercept only the chooser opened by an approved observed-button action. */
export async function attachAIChooser(
  contents: WebContents,
  send: AIProtocolSend,
  frameId: string,
  signal: AbortSignal,
  paths: string[],
  trigger: () => Promise<void>,
  validate: () => Promise<void>,
  lifecycle?: AIDialogLifecycle,
  upload?: { directory: boolean; files: AIUploadFile[] }
) {
  let chooser: { backendNodeId: number; mode: string } | undefined;
  let invalid = false;
  let triggered = false;
  let resolveChooser: () => void;
  let rejectChooser: (error: Error) => void;
  const opened = new Promise<void>((resolve, reject) => {
    resolveChooser = resolve;
    rejectChooser = reject;
  });
  opened.catch(() => {});
  const events = (_event: unknown, method: string, params: any) => {
    if (
      (method === 'Page.frameNavigated' && params.frame?.id === frameId) ||
      (method === 'Page.frameDetached' && params.frameId === frameId)
    ) {
      invalid = true;
      rejectChooser(new Error('Chooser document changed.'));
      return;
    }
    if (method !== 'Page.fileChooserOpened' || params.frameId !== frameId)
      return;
    if (!triggered) {
      invalid = true;
      rejectChooser(
        new Error('A file chooser opened before the approved button action.')
      );
      return;
    }
    if (chooser) {
      invalid = true;
      rejectChooser(new Error('More than one file chooser opened.'));
      return;
    }
    chooser = { backendNodeId: params.backendNodeId, mode: params.mode };
    resolveChooser();
  };
  const abort = () => rejectChooser(new Error('Stopped.'));
  let remaining = 5000;
  let started = Date.now();
  let timer!: ReturnType<typeof setTimeout>;
  const arm = () => {
    started = Date.now();
    timer = setTimeout(
      () =>
        rejectChooser(
          new Error(
            'The button did not open a supported file chooser. Effects may already have occurred; read before retrying.'
          )
        ),
      remaining
    );
  };
  arm();
  const disposeLifecycle = lifecycle?.onChange((pending) => {
    clearTimeout(timer);
    if (pending) remaining = Math.max(0, remaining - (Date.now() - started));
    else if (!chooser) arm();
  });
  contents.debugger.on('message', events);
  signal.addEventListener('abort', abort, { once: true });
  let objectId: string | undefined;
  const inspect = async () => {
    signal.throwIfAborted();
    if (invalid) throw new Error('Chooser document changed.');
    const value = await send('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: `function() { return {connected:this.isConnected, tag:this.tagName, type:this.type, disabled:this.matches(':disabled'), multiple:this.multiple, directory:this.webkitdirectory, files:Array.from(this.files||[]).map(file=>({name:file.name,size:file.size,...(this.webkitdirectory?{relativePath:file.webkitRelativePath}:{})}))}; }`,
      returnByValue: true,
    });
    if (value.exceptionDetails) throw new Error('File chooser target changed.');
    const info = value.result?.value;
    if (
      !info?.connected ||
      info.tag !== 'INPUT' ||
      info.type !== 'file' ||
      info.disabled ||
      Boolean(info.directory) !== Boolean(upload?.directory)
    )
      throw new Error('File chooser input changed or is unsupported.');
    if (!info.multiple && paths.length > 1)
      throw new Error('This file chooser accepts one file.');
    return info;
  };
  try {
    signal.throwIfAborted();
    await send('Page.enable');
    await send('Page.setInterceptFileChooserDialog', { enabled: true });
    await validate();
    signal.throwIfAborted();
    if (invalid)
      throw new Error('Chooser changed before the approved button action.');
    triggered = true;
    await trigger();
    await opened;
    clearTimeout(timer);
    if (
      !chooser ||
      !Number.isInteger(chooser.backendNodeId) ||
      !['selectSingle', 'selectMultiple'].includes(chooser.mode)
    )
      throw new Error('Unsupported file chooser.');
    if (chooser.mode === 'selectSingle' && paths.length > 1)
      throw new Error('This file chooser accepts one file.');
    const world = await send('Page.createIsolatedWorld', {
      frameId,
      worldName: 'touchbox-ai-control',
    });
    const node = await send('DOM.resolveNode', {
      backendNodeId: chooser.backendNodeId,
      executionContextId: world.executionContextId,
    });
    objectId = node.object?.objectId;
    if (!objectId) throw new Error('File chooser target no longer exists.');
    await inspect();
    await validate();
    await inspect();
    await send('DOM.setFileInputFiles', {
      backendNodeId: chooser.backendNodeId,
      files: paths,
    });
    if (upload?.directory)
      return await verifyAIUpload(
        async () => (await inspect()).files,
        upload.files,
        signal,
        true
      );
    const receipt = await inspect();
    return receipt.files as Array<{
      name: string;
      size: number;
      relativePath?: string;
    }>;
  } catch (error) {
    if (triggered && !(error as Error).message.includes('Effects may already'))
      throw new Error(
        `${
          (error as Error).message
        } Button effects may already have occurred; read before retrying.`
      );
    throw error;
  } finally {
    clearTimeout(timer);
    disposeLifecycle?.();
    signal.removeEventListener('abort', abort);
    contents.debugger.removeListener('message', events);
    if (objectId)
      await send('Runtime.releaseObject', { objectId }).catch(() => {});
    await send('Page.setInterceptFileChooserDialog', { enabled: false }).catch(
      () => {}
    );
  }
}
