# AI Implementation

## AI Answer Generation

The AI player tries to sound AI-like with:
- Formal, structured language
- Perfect grammar and spelling
- Objective, analytical responses
- Lack of personal experiences or emotions
- Detailed, comprehensive answers
- Technical or precise wording

## AI Voting Logic

The AI evaluates each answer to identify humans:
- Looks for natural, casual language patterns
- Identifies personal experiences or emotions
- Spots informal grammar or conversational tone
- Detects humor, wit, or subjective opinions

The AI votes for who it thinks is most HUMAN. Since players with fewer votes win, the AI tries to give votes to humans while avoiding votes itself by sounding AI-like.

## Configuration

### Primary: Cloudflare AI Workers (Production)

The AI is now powered by **Cloudflare Workers AI** using the `@cf/meta/llama-3.3-70b-instruct-fp8-fast` model.

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
