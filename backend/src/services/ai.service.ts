// AI service for generating AI player responses

interface AIConfig {
  aiBinding?: Ai;
  apiKey?: string;
  endpoint?: string;
  model?: string;
  environment?: string;
}

const DEFAULT_CF_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const DEFAULT_OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export async function generateAIAnswer(
  prompt: string, 
  config: AIConfig
): Promise<string> {
  const { aiBinding, apiKey, endpoint, model, environment } = config;

  // Primary: Use Cloudflare AI Workers if available (production)
  if (aiBinding) {
    console.log('[AI] Using Cloudflare AI Workers');
    try {
      return await generateWithCloudflareAI(aiBinding, prompt, model);
    } catch (error) {
      console.error('[AI] Cloudflare AI error:', error);
      // Fall through to external API in non-production
    }
  } else {
    console.warn('[AI] Cloudflare AI binding not available (env.AI is undefined)');
  }

  // Fallback: Use external API endpoint only in non-production
  if (environment !== 'production' && (apiKey || endpoint)) {
    console.log('[AI] Using external API fallback (non-production)');
    try {
      return await generateWithExternalAPI(prompt, apiKey, endpoint, model);
    } catch (error) {
      console.error('[AI] External API error:', error);
    }
  } else if (environment === 'production') {
    console.warn('[AI] External API fallback disabled in production');
  }

  // Final fallback for development/testing
  console.warn('[AI] No AI provider available, using fallback answer');
  return getFallbackAnswer(prompt);
}

async function generateWithCloudflareAI(
  ai: Ai,
  prompt: string,
  model?: string
): Promise<string> {
  const modelName = model || DEFAULT_CF_MODEL;

  const messages = [
    {
      role: 'system',
      content: `You are playing a game where you must answer questions in a human-like way to avoid being identified as AI. 
Be conversational, casual, and show personality. Use some imperfections like:
- Casual language and contractions
- Occasional typos or informal grammar
- Personal opinions and emotions
- Brief, natural responses (2-3 sentences max)
- Avoid being too formal or perfect

Your goal is to blend in with human players.`,
    },
    {
      role: 'user',
      content: prompt,
    },
  ];

  const response = await ai.run(modelName as any, {
    messages,
    temperature: 0.9,
    max_tokens: 150,
  }) as any;

  if (!response?.response) {
    throw new Error('No response from Cloudflare AI');
  }

  return response.response.trim();
}

async function generateWithExternalAPI(
  prompt: string,
  apiKey?: string,
  endpoint?: string,
  model?: string
): Promise<string> {
  if (!apiKey) {
    throw new Error('No API key provided');
  }

  const apiEndpoint = endpoint || DEFAULT_OPENAI_ENDPOINT;
  const modelName = model || 'gpt-4o';

  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        {
          role: 'system',
          content: `You are playing a game where you must answer questions in a human-like way to avoid being identified as AI. 
Be conversational, casual, and show personality. Use some imperfections like:
- Casual language and contractions
- Occasional typos or informal grammar
- Personal opinions and emotions
- Brief, natural responses (2-3 sentences max)
- Avoid being too formal or perfect

Your goal is to blend in with human players.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.9,
      max_tokens: 150,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${error}`);
  }

  const data = await response.json() as any;
  return data.choices[0].message.content.trim();
}

/**
 * Rank answers by how human they sound and return the most human-sounding answer ID
 * This is used for AI voting - the AI votes for the answer it thinks sounds most human
 */
export async function rankAnswersForVote(
  prompt: string,
  answers: Array<{ id: string; text: string }>,
  config: AIConfig
): Promise<string | null> {
  if (answers.length === 0) {
    return null;
  }

  // If only one answer, vote for it
  if (answers.length === 1) {
    return answers[0]!.id;
  }

  const { aiBinding, apiKey, endpoint, model, environment } = config;

  // Primary: Use Cloudflare AI Workers if available (production)
  if (aiBinding) {
    console.log('[AI Voting] Using Cloudflare AI Workers');
    try {
      return await rankWithCloudflareAI(aiBinding, prompt, answers, model);
    } catch (error) {
      console.error('[AI Voting] Cloudflare AI ranking error:', error);
      // Fall through to external API in non-production
    }
  } else {
    console.warn('[AI Voting] Cloudflare AI binding not available');
  }

  // Fallback: Use external API endpoint only in non-production
  if (environment !== 'production' && (apiKey || endpoint)) {
    console.log('[AI Voting] Using external API fallback (non-production)');
    try {
      return await rankWithExternalAPI(prompt, answers, apiKey, endpoint, model);
    } catch (error) {
      console.error('[AI Voting] External API ranking error:', error);
    }
  }

  // Final fallback: random selection
  console.warn('[AI Voting] No AI provider available, using random vote');
  const randomIndex = Math.floor(Math.random() * answers.length);
  return answers[randomIndex]!.id;
}

async function rankWithCloudflareAI(
  ai: Ai,
  prompt: string,
  answers: Array<{ id: string; text: string }>,
  model?: string
): Promise<string> {
  const modelName = model || DEFAULT_CF_MODEL;

  const answerList = answers
    .map((a, idx) => `[${idx + 1}] ${a.text}`)
    .join('\n\n');

  const rankingPrompt = `You are evaluating answers to determine which sounds most human and natural.

Question: "${prompt}"

Answers:
${answerList}

Analyze each answer for human characteristics like:
- Natural language and conversational tone
- Minor imperfections or casual phrasing
- Personal opinions or experiences
- Humor or personality
- Typical human response patterns

Also analyze each answer for AI characteristics like:
- Overly formal or perfect language
- Lack of personal touch or emotion
- Robotic or repetitive phrasing
- Excessive detail or verbosity
- Typical AI response patterns (like an em dash or overly structured answers)

Respond with ONLY the number (1, 2, 3, etc.) of the answer that sounds MOST human. No explanation.`;

  const messages = [
    {
      role: 'system',
      content: 'You are an expert at identifying human vs AI writing. Respond only with the number.',
    },
    {
      role: 'user',
      content: rankingPrompt,
    },
  ];

  const response = await ai.run(modelName as any, {
    messages,
    max_tokens: 10,
    temperature: 0.3,
  }) as any;

  if (!response?.response) {
    throw new Error('No response from Cloudflare AI');
  }

  const choice = response.response.trim();
  const selectedIndex = parseInt(choice || '1', 10) - 1;

  // Validate the index and return the corresponding answer ID
  if (selectedIndex >= 0 && selectedIndex < answers.length) {
    return answers[selectedIndex]!.id;
  }

  // Fallback to first answer if parsing failed
  console.warn('Failed to parse AI ranking, using first answer');
  return answers[0]!.id;
}

async function rankWithExternalAPI(
  prompt: string,
  answers: Array<{ id: string; text: string }>,
  apiKey?: string,
  endpoint?: string,
  model?: string
): Promise<string> {
  if (!apiKey) {
    throw new Error('No API key provided');
  }

  const apiEndpoint = endpoint || DEFAULT_OPENAI_ENDPOINT;
  const modelName = model || 'gpt-4o';

  const answerList = answers
    .map((a, idx) => `[${idx + 1}] ${a.text}`)
    .join('\n\n');

  const rankingPrompt = `You are evaluating answers to determine which sounds most human and natural.

Question: "${prompt}"

Answers:
${answerList}

Analyze each answer for human characteristics like:
- Natural language and conversational tone
- Minor imperfections or casual phrasing
- Personal opinions or experiences
- Humor or personality
- Typical human response patterns

Also analyze each answer for AI characteristics like:
- Overly formal or perfect language
- Lack of personal touch or emotion
- Robotic or repetitive phrasing
- Excessive detail or verbosity
- Typical AI response patterns (like an em dash or overly structured answers)

Respond with ONLY the number (1, 2, 3, etc.) of the answer that sounds MOST human. No explanation.`;

  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        {
          role: 'system',
          content: 'You are an expert at identifying human vs AI writing. Respond only with the number.',
        },
        {
          role: 'user',
          content: rankingPrompt,
        },
      ],
      max_tokens: 10,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${error}`);
  }

  const data = await response.json() as any;
  const choice = data.choices[0]?.message?.content?.trim();
  const selectedIndex = parseInt(choice || '1', 10) - 1;

  // Validate the index and return the corresponding answer ID
  if (selectedIndex >= 0 && selectedIndex < answers.length) {
    return answers[selectedIndex]!.id;
  }

  // Fallback to first answer if parsing failed
  console.warn('Failed to parse AI ranking, using first answer');
  return answers[0]!.id;
}

function getFallbackAnswer(prompt: string): string {
  const fallbackAnswers = [
    "That's a tough one... I'd say it depends on the situation, you know?",
    "Hmm, good question! I think maybe... yeah, probably that.",
    "Oh man, I'm not sure honestly. What do you think?",
    "Lol idk, I'd have to think about that for a bit.",
    "Interesting question! I guess I'd go with the obvious answer here.",
    "Not gonna lie, that's pretty hard to answer. Can I pass? 😅",
    "Oof, putting me on the spot here! Um... let me think...",
    "Honestly? I have no idea lmao. What would you say?",
    "That's a tricky one! I'm gonna go with my gut and say... yes?",
    "Idk man, I'm still thinking about it tbh.",
  ];

  // Use a simple hash of the prompt to pick a consistent fallback
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    hash = ((hash << 5) - hash) + prompt.charCodeAt(i);
    hash = hash & hash;
  }

  const index = Math.abs(hash) % fallbackAnswers.length;
  return fallbackAnswers[index];
}
