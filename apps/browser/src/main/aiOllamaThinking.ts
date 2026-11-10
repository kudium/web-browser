import { isOllamaEndpoint } from '../browser/aiProviders';

/** Native Ollama exposes the thinking toggle for models beyond gpt-oss. */
export async function fetchOllamaThinking(
  url: string,
  request: RequestInit
): Promise<Response | undefined> {
  const endpoint = new URL(url);
  if (
    !endpoint.pathname.endsWith('/v1/chat/completions') ||
    !isOllamaEndpoint(`${endpoint.origin}/v1`) ||
    typeof request.body !== 'string'
  )
    return undefined;
  const body = JSON.parse(request.body);
  if (body.think === undefined) return undefined;
  const messages = body.messages.map((message: any) => {
    const content = Array.isArray(message.content)
      ? message.content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text)
          .join('\n')
      : message.content || '';
    const images = Array.isArray(message.content)
      ? message.content
          .filter((block: any) => block.type === 'image_url')
          .map((block: any) => {
            const image = /^data:image\/[^;]+;base64,(.+)$/.exec(
              block.image_url?.url || ''
            );
            if (!image)
              throw new Error('Ollama requires local screenshot images.');
            return image[1];
          })
      : [];
    const call = body.messages
      .flatMap((item: any) => item.tool_calls || [])
      .find((item: any) => item.id === message.tool_call_id);
    return {
      ...(message.reasoning_content
        ? { thinking: message.reasoning_content }
        : {}),
      role: message.role,
      content,
      ...(images.length ? { images } : {}),
      ...(message.role === 'tool' ? { tool_name: call?.function?.name } : {}),
      ...(message.tool_calls
        ? {
            tool_calls: message.tool_calls.map((item: any) => ({
              function: {
                name: item.function.name,
                arguments: JSON.parse(item.function.arguments),
              },
            })),
          }
        : {}),
    };
  });
  const response = await fetch(`${endpoint.origin}/api/chat`, {
    ...request,
    redirect: 'manual',
    body: JSON.stringify({
      model: body.model,
      messages,
      tools: body.tools,
      think: body.think,
      stream: false,
    }),
  });
  if (!response.ok) {
    if (response.status === 400) {
      const detail = await response
        .clone()
        .json()
        .catch(() => ({}));
      if (detail.error)
        throw new Error(`Ollama: ${String(detail.error).slice(0, 500)}`);
    }
    return response;
  }
  const payload = await response.json();
  if (payload.error)
    throw new Error(`Ollama: ${String(payload.error).slice(0, 500)}`);
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            role: 'assistant',
            reasoning_content: payload.message?.thinking,
            content: payload.message?.content || '',
            tool_calls: payload.message?.tool_calls?.map(
              (call: any, index: number) => ({
                id: `ollama-${Date.now()}-${index}`,
                type: 'function',
                function: {
                  name: call.function.name,
                  arguments: JSON.stringify(call.function.arguments),
                },
              })
            ),
          },
          finish_reason: payload.done_reason,
        },
      ],
      usage: {
        prompt_tokens: payload.prompt_eval_count || 0,
        completion_tokens: payload.eval_count || 0,
      },
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
