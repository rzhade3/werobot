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

The AI is powered by GPT-4 via GitHub Models or OpenAI API. Configure the endpoint and model in your `.dev.vars` file in the root directory:

```env
OPENAI_API_KEY=your-api-key
OPENAI_API_ENDPOINT=https://models.github.ai/inference/chat/completions
OPENAI_MODEL=openai/gpt-4.1
```
