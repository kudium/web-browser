# Model picker examples

Reviewed November 7, 2026. These are API identifiers for chat and tool workflows, not a promise of account availability. Refresh models queries the configured provider; saved model selections and manual IDs remain supported.

Current Gemini examples include 3.5 Flash-Lite, 3.1 Flash-Lite, 3.8 Flash and 4 Argon. Gemini 2.5 Flash has retired and is no longer suggested. Cost-oriented choices include GPT-6 Luna, Gemini Flash-Lite, Claude Haiku 5.5, Qwen 3.8 Flash, GLM 5.3 Flash and DeepSeek Flash. No price is hardcoded; provider billing and availability can change.

Sources checked:

- https://ai.google.dev/gemini-api/docs/models
- https://developers.openai.com/api/docs/models
- https://platform.claude.com/docs/en/models/overview
- https://api-docs.deepseek.com/quick_start/pricing
- https://www.alibabacloud.com/help/en/model-studio/models
- https://platform.kimi.com/docs/models
- https://docs.z.ai/guides/llm/glm-5
- https://platform.minimax.io/docs/guides/models-intro
- https://docs.x.ai/developers/models
- https://docs.mistral.ai/models
- https://openrouter.ai/api/v1/models

OpenAI GPT-6 Luna, GPT-6.1 Sol and GPT-6 Astra model pages explicitly list Chat Completions support. OpenRouter IDs were checked against its public model catalog. Provider examples are deliberately limited to general chat/coding; image generation, audio-only, embeddings and special-access cybersecurity models are omitted.

## Meta Muse

Added Meta Muse using `https://api.meta.ai/v1`, with `muse-spark-1.3` as the preset and `muse-wonder-1.0` as an alternative. Spark 1.2 and 1.1 remain selectable. Meta's official documentation confirms bearer-key authentication, model discovery, and OpenAI-compatible Chat Completions with function tools. Muse Wonder Full is a Muse Code offering and is not suggested as an API model. Contributor variants are not suggested; they have different data-use terms. Live inference requires the user's Meta Model API key and has not been tested with a real key.

- https://dev.meta.ai/docs/models
- https://dev.meta.ai/docs/cookbook/quickstart-chat-completions
- https://dev.meta.ai/docs/cookbook/tool-function-calling
- https://dev.meta.ai/docs/protocols/chat-completions
