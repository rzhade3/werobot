# AI Implementation

## AI Answer Generation

The AI player tries to sound human-like with:
- Conversational, casual language
- Imperfect but readable phrasing
- Personal opinions and emotions
- Brief, natural responses
- Less formal structure

## AI Voting Logic

AI voting uses Cloudflare's **Clef** decision model. The game sends the prompt as
structured state and the candidate answers as options in a typed `choice`
question. Clef selects the answer that appears most AI-like based on:

- Looks for overly formal or perfect language
- Identifies generic, robotic, or repetitive phrasing
- Spots answers with little personal touch or emotion
- Detects excessive detail or typical AI response patterns

The selected Clef option is mapped back to the corresponding answer ID. Human
players score by correctly identifying the real AI answer or by fooling other
humans into voting for their answer as AI.

## Configuration

### Primary: Cloudflare AI Workers (Production)

Production uses two Cloudflare Workers AI models:

- Answer generation: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- AI voting/ranking: `@cf/cloudflare/clef`

Both use the same Workers AI binding and require no provider API key:

```toml
[ai]
binding = "AI"

[vars]
OPENAI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
AI_RANKING_MODEL = "@cf/cloudflare/clef"
```

### Fallback: External API (Development Only)

For development/testing, you can optionally configure an OpenAI-compatible API
endpoint as a fallback. This **only works when `ENVIRONMENT` is not
`"production"`**. `OPENAI_MODEL` controls the model used by this fallback;
`AI_RANKING_MODEL` applies only to the Workers AI Clef call.

Create a `.dev.vars` file in the root directory:

```env
# Optional: External API fallback (only works in non-production)
OPENAI_API_KEY=your-api-key
OPENAI_API_ENDPOINT=https://models.github.ai/inference/chat/completions
OPENAI_MODEL=openai/gpt-4.1
```

**Note:** The fallback will only be used if:
1. Cloudflare AI is unavailable, AND
2. `ENVIRONMENT` is not set to `"production"`

If ranking still cannot be completed, the AI player chooses a random votable
answer. Production does not call the external API fallback.
