import { appleAIPrerequisite } from './aiApplePrerequisite';
import { aiContextManagement } from '../browser/aiContextManagement';
import { appleAIContext } from './aiAppleContext';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { APPLE_AI_ENDPOINT } from '../browser/aiProviders';

class AppleAIContextError extends Error {}

function helperPath() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64')
    throw new Error(
      'Apple local AI requires an Apple Silicon Mac with macOS 26 or later.'
    );
  const relative = 'assets/native/kudiumbrowser-apple-ai';
  const candidates = [
    path.join(process.resourcesPath, relative),
    path.join(app.getAppPath(), relative),
    ...(!app.isPackaged
      ? [path.resolve(app.getAppPath(), '../../', relative)]
      : []),
  ];
  const helper = candidates.find((candidate) => fs.existsSync(candidate));
  if (!helper)
    throw new Error(
      'Apple local AI helper is missing. Rebuild or update Kudium Browser.'
    );
  return helper;
}

function runAppleAI(
  body: string | undefined,
  signal?: AbortSignal | null
): Promise<any> {
  signal?.throwIfAborted();
  const helper = helperPath();
  return new Promise((resolve, reject) => {
    const child = spawn(helper, body === undefined ? ['--check'] : [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    let settled = false;
    const finish = (error?: Error, value?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      child.kill();
      if (error) reject(error);
      else resolve(value);
    };
    const abort = () =>
      finish(
        signal?.reason instanceof Error
          ? signal.reason
          : new Error('Apple AI request cancelled.')
      );
    const timer = setTimeout(
      () => finish(new Error('Apple AI request timed out.')),
      90000
    );
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.on('error', () =>
      finish(
        new Error(
          'Unable to start Apple local AI. macOS 26 or later is required.'
        )
      )
    );
    child.stdin.on('error', () => {});
    child.stderr.resume(); // Never log conversation or native diagnostic contents.
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (data: string) => {
      output += data;
      if (output.length > 4 * 1024 * 1024)
        finish(new Error('Apple AI response exceeded the allowed size.'));
    });
    child.on('close', (code) => {
      try {
        const payload = JSON.parse(output);
        if (code !== 0 || payload.error)
          finish(
            payload.code === 'context_limit' ||
            (typeof payload.error === 'string' &&
              /Provided [\d,]+ tokens,? but the maximum allowed is [\d,]+/i.test(
                payload.error
              ))
              ? new AppleAIContextError(payload.error)
              : new Error(payload.error || 'Apple AI inference failed.')
          );
        else finish(undefined, payload);
      } catch {
        finish(
          new Error(
            'Apple local AI failed to return a valid response. Check Apple Intelligence in System Settings.'
          )
        );
      }
    });
    child.stdin.end(body ?? '');
  });
}

/** Reserved endpoint is routed directly to a native process, never to HTTP. */
export async function fetchAppleAI(
  url: string,
  request: RequestInit
): Promise<Response | undefined> {
  const parsed = new URL(url);
  if (parsed.hostname !== new URL(APPLE_AI_ENDPOINT).hostname) return undefined;
  if (
    url !== `${APPLE_AI_ENDPOINT}/models` &&
    url !== `${APPLE_AI_ENDPOINT}/chat/completions`
  )
    throw new Error('Unsupported Apple AI endpoint.');
  if (url.endsWith('/models')) {
    await runAppleAI(undefined, request.signal);
    return Response.json({ data: [{ id: 'apple-on-device' }] });
  }
  if (typeof request.body !== 'string')
    throw new Error('Invalid Apple AI request.');
  const body = JSON.parse(request.body);
  if (body.model !== 'apple-on-device')
    throw new Error('Select the Apple on-device model.');
  if (
    body.messages?.some(
      (message: any) =>
        Array.isArray(message.content) &&
        message.content.some((block: any) => block.type === 'image_url')
    )
  )
    throw new Error(
      'Apple local AI does not support screenshot attachments here. Use page text or select a vision provider.'
    );
  const prerequisite = appleAIPrerequisite(body);
  if (prerequisite) return Response.json(prerequisite);
  const managed = aiContextManagement(
    APPLE_AI_ENDPOINT,
    body.kudium_context_management
  );
  let context = managed
    ? appleAIContext(body)
    : { ...body, tools: (body.tools ?? []).map((tool: any) => tool.function) };
  delete context.kudium_context_management;
  let payload;
  for (let level = 0; ; level += 1) {
    try {
      payload = await runAppleAI(JSON.stringify(context), request.signal);
      break;
    } catch (error) {
      if (!(error instanceof AppleAIContextError)) throw error;
      if (!managed)
        throw new Error(
          'Apple local AI reached its context limit. Enable Context window management in the AI model dialog, or select a model with a larger context. No cloud fallback was used.',
        );
      if (level === 3)
        throw new Error(
          'Apple local AI cannot fit this request and its required action history. Try a shorter request or a model with a larger context. No actions were repeated and no cloud fallback was used.',
        );
      request.signal?.throwIfAborted();
      // The native helper returned no actions. Rebuild from canonical data,
      // shrinking optional observations/tools while preserving action identity.
      context = appleAIContext(body, level + 1);
      delete context.kudium_context_management;
    }
  }
  // Reject every generated call before exposing any to the existing executor.
  const tools = new Set(context.tools.map((tool: any) => tool.name));
  for (const call of payload.choices?.[0]?.message?.tool_calls ?? []) {
    if (!tools.has(call.function?.name))
      throw new Error(
        'Apple AI requested an unknown tool. No actions were executed.'
      );
    const args = JSON.parse(call.function.arguments);
    if (!args || Array.isArray(args) || typeof args !== 'object')
      throw new Error(
        'Apple AI returned invalid tool arguments. No actions were executed.'
      );
  }
  return Response.json(payload);
}
