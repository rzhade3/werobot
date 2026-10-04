# AI Implementation

## AI Answer Generation

The AI player tries to sound human-like with:
- Conversational, casual language
- Imperfect but readable phrasing
- Personal opinions and emotions
- Brief, natural responses
- Less formal structure

## AI Voting Logic

The AI evaluates each answer to identify AI-like responses using Cloudflare's
Clef decision model (`@cf/cloudflare/clef`). Clef receives the prompt and
answers as structured state and chooses from the supplied answer IDs:
- Looks for overly formal or perfect language
- Identifies generic, robotic, or repetitive phrasing
- Spots answers with little personal touch or emotion
- Detects excessive detail or typical AI response patterns

The AI votes for the answer it thinks is most AI-like. Human players score by correctly identifying the real AI answer or by fooling other humans into voting for their answer as AI.

If Clef is unavailable or returns an unknown answer ID, the voter falls back to
the configured Cloudflare text model. AI answer generation continues to use the
configured text model.

## Configuration

### Primary: Cloudflare AI Workers (Production)

AI answer generation and the voting fallback use **Cloudflare Workers AI** with
the `@cf/meta/llama-3.3-70b-instruct-fp8-fast` model. Voting uses Clef first.

**Benefits:**
- ✅ **10,000 free AI inferences per day**
- ✅ **No API keys required** in production
- ✅ **Runs on Cloudflare's edge network** (low latency)
- ✅ **Commercial use allowed**
- ✅ **Beyond free tier**: Only $0.011 per 1,000 Neurons

The AI binding is automatically configured in `wrangler.toml`:

```toml
[ai]
binding = "AI"

[vars]
OPENAI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
```

### Evaluating AI Voting Models

Compare Clef against the existing text model on the small, labeled sample set
before drawing conclusions about vote quality:

```bash
cd backend
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... npm run eval:ai-vote
```

The token needs permission to run Workers AI models. The evaluation prints
accuracy and latency for both models and per-case choices. The fixtures are
synthetic examples for a quick directional check, not a representative measure
of production voting quality; review and expand them with labeled game answers
before drawing strong conclusions.

### Fallback: External API (Development Only)

For development/testing, you can optionally configure an external API endpoint as a fallback. This **only works when ENVIRONMENT is not "production"**.

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

This ensures production always uses Cloudflare AI Workers for reliability and cost efficiency.
