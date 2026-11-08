import { isClaude } from './aiTransport';
/* Stream reads preserve event order and stop when the transport reaches EOF. */
/* eslint-disable no-await-in-loop, no-constant-condition */

export class UnsupportedAIStreamError extends Error {}

/**
 * Collect provider SSE into the same complete payload used by nonstreamed
 * turns. Partial tool arguments and thinking never reach the UI or executor.
 */
export async function readAIProviderStream(
  endpoint: string,
  response: Response,
  signal: AbortSignal,
  onText: (text: string) => void
): Promise<any> {
  if (!response.body) throw new TypeError('The AI stream has no body.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const claude = isClaude(endpoint);
  let message: any = { role: 'assistant', content: '' };
  let payload: any = { choices: [{ message }] };
  const calls = new Map<number, any>();
  let unindexedCalls = false;
  const blocks = new Map<number, any>();
  const argumentsByBlock = new Map<number, string>();
  const openBlocks = new Set<number>();
  let ended = false;
  let finished: string | undefined;
  let buffer = '';
  let lines: string[] = [];
  let bytes = 0;
  let visible = '';
  let lastSent = 0;
  const publish = (force = false) => {
    if (force || Date.now() - lastSent >= 60) {
      onText(visible);
      lastSent = Date.now();
    }
  };
  const event = (data: string) => {
    if (data === '[DONE]') {
      ended = true;
      return;
    }
    const value = JSON.parse(data);
    if (value.error || value.type === 'error')
      throw new Error(
        'The provider reported an error during streaming. Continue to retry this inference.'
      );
    if (!claude) {
      if (value.usage) payload.usage = value.usage;
      const choice =
        value.choices?.find((item: any) => item.index === 0) ??
        value.choices?.[0];
      if (!choice) return;
      if (choice.finish_reason) finished = choice.finish_reason;
      const delta = choice.delta ?? {};
      if (delta.extra_content !== undefined) {
        if (
          message.extra_content !== undefined &&
          JSON.stringify(message.extra_content) !==
            JSON.stringify(delta.extra_content)
        )
          throw new UnsupportedAIStreamError(
            'Use a complete response to preserve provider metadata.'
          );
        message.extra_content = delta.extra_content;
      }
      if (typeof delta.content === 'string') {
        message.content += delta.content;
        visible = message.content;
        publish();
      }
      if (typeof delta.refusal === 'string') {
        message.refusal = (message.refusal ?? '') + delta.refusal;
        message.content += delta.refusal;
        visible = message.content;
        publish();
      }
      ['reasoning_content', 'reasoning'].forEach((key) => {
        if (typeof delta[key] === 'string')
          message[key] = (message[key] ?? '') + delta[key];
      });
      if (Array.isArray(delta.reasoning_details))
        throw new UnsupportedAIStreamError(
          'Use a complete response to preserve this provider’s structured reasoning.'
        );
      delta.tool_calls?.forEach((part: any) => {
        let { index } = part;
        if (index === undefined) {
          // Compatible endpoints may emit complete calls without delta indices.
          // Accept only whole, uniquely identified calls, never ambiguous fragments.
          let args: unknown;
          try {
            args = JSON.parse(part.function?.arguments);
          } catch {
            /* Fall back below. */
          }
          if (
            (calls.size && !unindexedCalls) ||
            !part.id ||
            typeof part.id !== 'string' ||
            typeof part.function?.name !== 'string' ||
            !part.function.name ||
            !args ||
            typeof args !== 'object' ||
            Array.isArray(args) ||
            [...calls.values()].some((call) => call.id === part.id)
          )
            throw new UnsupportedAIStreamError(
              'Use a complete response for ambiguous unindexed tool calls.'
            );
          unindexedCalls = true;
          index = calls.size;
        } else if (unindexedCalls) {
          throw new UnsupportedAIStreamError(
            'Use a complete response for mixed tool stream formats.'
          );
        }
        if (!Number.isInteger(index) || index < 0 || index > 100)
          throw new Error('The provider returned an invalid tool stream.');
        const call = calls.get(index) ?? {
          id: '',
          type: 'function',
          function: { name: '', arguments: '' },
        };
        if (part.id) call.id = part.id;
        if (part.function?.name) call.function.name += part.function.name;
        if (part.function?.arguments)
          call.function.arguments += part.function.arguments;
        if (part.extra_content !== undefined) {
          if (
            call.extra_content !== undefined &&
            JSON.stringify(call.extra_content) !==
              JSON.stringify(part.extra_content)
          )
            throw new UnsupportedAIStreamError(
              'Use a complete response to preserve provider tool metadata.'
            );
          call.extra_content = part.extra_content;
        }
        calls.set(index, call);
      });
      return;
    }
    if (value.type === 'message_start') {
      payload = { ...value.message, content: [] };
      message = payload;
    } else if (value.type === 'content_block_start') {
      if (blocks.has(value.index))
        throw new Error('Duplicate AI content block.');
      blocks.set(value.index, { ...value.content_block });
      openBlocks.add(value.index);
      if (value.content_block.type === 'tool_use')
        argumentsByBlock.set(value.index, '');
      if (value.content_block.type === 'text') {
        if (visible) visible += '\n';
        visible += value.content_block.text ?? '';
        publish();
      }
    } else if (value.type === 'content_block_delta') {
      const block = blocks.get(value.index);
      if (!block || !openBlocks.has(value.index))
        throw new Error('An AI delta has no open block.');
      const { delta } = value;
      if (delta.type === 'text_delta') {
        block.text = (block.text ?? '') + delta.text;
        visible += delta.text;
        publish();
      } else if (delta.type === 'input_json_delta') {
        argumentsByBlock.set(
          value.index,
          (argumentsByBlock.get(value.index) ?? '') + delta.partial_json
        );
      } else if (delta.type === 'thinking_delta') {
        block.thinking = (block.thinking ?? '') + delta.thinking;
      } else if (delta.type === 'signature_delta') {
        block.signature = (block.signature ?? '') + delta.signature;
      } else if (delta.type === 'citations_delta') {
        block.citations = [...(block.citations ?? []), delta.citation];
      } else
        throw new UnsupportedAIStreamError(
          'The provider returned an unsupported stream delta.'
        );
    } else if (value.type === 'content_block_stop') {
      const block = blocks.get(value.index);
      if (!block || !openBlocks.delete(value.index))
        throw new Error('Invalid AI content block completion.');
      if (block.type === 'tool_use') {
        const args = argumentsByBlock.get(value.index);
        if (args) block.input = JSON.parse(args);
      }
    } else if (value.type === 'message_delta') {
      Object.assign(payload, value.delta);
      payload.usage = { ...payload.usage, ...value.usage };
      finished = value.delta?.stop_reason ?? finished;
    } else if (value.type === 'message_stop') ended = true;
  };
  const flush = () => {
    if (lines.length) event(lines.join('\n'));
    lines = [];
  };
  const consume = () => {
    let newline = buffer.indexOf('\n');
    while (newline >= 0 && !ended) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      if (!line) flush();
      else if (line.startsWith('data:'))
        lines.push(line.slice(5).replace(/^ /, ''));
      newline = buffer.indexOf('\n');
    }
  };
  const abort = () => {
    reader.cancel(signal.reason).catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8 * 1024 * 1024)
        throw new Error('The AI stream exceeded its size limit.');
      buffer += decoder.decode(value, { stream: true });
      consume();
      if (ended) break;
    }
    buffer += decoder.decode();
    consume();
    if (!ended && buffer.startsWith('data:'))
      lines.push(buffer.slice(5).trim());
    flush();
    if (!ended || !finished || (claude && openBlocks.size))
      throw new TypeError(
        'The AI stream ended before completing its response.'
      );
    if (
      ['length', 'max_tokens', 'content_filter', 'refusal'].includes(
        finished ?? ''
      )
    )
      throw new Error(
        'The AI response was cut short. Continue the task to retry; no tools from this response were executed.'
      );
    if (claude)
      payload.content = [...blocks.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, block]) => block);
    else {
      payload.choices[0].finish_reason = finished;
      message.tool_calls = [...calls.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, call]) => call);
      if (!message.tool_calls.length) delete message.tool_calls;
    }
    const tools = claude
      ? payload.content
          .filter((block: any) => block.type === 'tool_use')
          .map((block: any) => ({
            id: block.id,
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input),
            },
          }))
      : message.tool_calls ?? [];
    const ids = new Set<string>();
    tools.forEach((call: any) => {
      if (!call.id || !call.function.name || ids.has(call.id))
        throw new Error('The provider returned incomplete tool calls.');
      ids.add(call.id);
      const args = JSON.parse(call.function.arguments);
      if (!args || typeof args !== 'object' || Array.isArray(args))
        throw new Error('The provider returned incomplete tool arguments.');
    });
    publish(true);
    return payload;
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
