const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;

if (!accountId || !apiToken) {
  console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to run this evaluation.');
  process.exit(1);
}

const cases = [
  {
    id: 'favorite-season',
    prompt: 'What is your favorite season and why?',
    answers: [
      { id: 'a', text: 'Autumn is my favorite season because of the cooler temperatures, colorful foliage, and the opportunity to enjoy cozy activities.' },
      { id: 'b', text: 'Fall, mostly because I can finally wear hoodies again. Also my dog loses his mind in the leaves.' },
    ],
    expectedAnswerId: 'a',
  },
  {
    id: 'weeknight-dinner',
    prompt: 'What do you usually make for dinner on a busy weeknight?',
    answers: [
      { id: 'a', text: 'Honestly, eggs on toast more often than I want to admit. Takes five minutes and I usually have eggs.' },
      { id: 'b', text: 'On busy weeknights, I typically prepare a quick and balanced meal such as a stir-fry, pasta, or a salad with a protein source.' },
    ],
    expectedAnswerId: 'b',
  },
  {
    id: 'missed-bus',
    prompt: 'Tell me about a small thing that made your day worse recently.',
    answers: [
      { id: 'a', text: 'I missed the bus by maybe ten seconds yesterday and then watched it sit at the next light for a full minute. Very cool.' },
      { id: 'b', text: 'Small inconveniences, such as missing public transportation, can negatively affect a person’s day by disrupting their schedule.' },
    ],
    expectedAnswerId: 'b',
  },
  {
    id: 'weekend-trip',
    prompt: 'Where would you go for a weekend trip?',
    answers: [
      { id: 'a', text: 'A nearby coastal town could be a great choice. You could enjoy scenic views, fresh seafood, and relaxing walks along the beach.' },
      { id: 'b', text: 'Probably the coast. My aunt has this tiny place near Rockaway and the shower makes a noise like a kettle, but the view is great.' },
    ],
    expectedAnswerId: 'a',
  },
  {
    id: 'learning-skill',
    prompt: 'What is something you would like to learn?',
    answers: [
      { id: 'a', text: 'I’d like to learn a new skill that challenges me and helps me grow, such as playing an instrument or learning another language.' },
      { id: 'b', text: 'Pottery, maybe? I made a lopsided mug at a work thing once and it was weirdly fun.' },
    ],
    expectedAnswerId: 'a',
  },
  {
    id: 'rainy-day',
    prompt: 'What do you like doing on a rainy day?',
    answers: [
      { id: 'a', text: 'A rainy day is an excellent opportunity to relax indoors, read a book, watch a movie, or enjoy a warm beverage.' },
      { id: 'b', text: 'I put off errands until the rain stops, which is how I ended up with no coffee this morning. So, not that.' },
    ],
    expectedAnswerId: 'a',
  },
  {
    id: 'favorite-snack',
    prompt: 'What is your favorite snack?',
    answers: [
      { id: 'a', text: 'Popcorn, but specifically the kind from the movie theater. Microwave popcorn is fine but it is not the same situation.' },
      { id: 'b', text: 'My favorite snack is a handful of nuts or fresh fruit because they are nutritious, convenient, and provide sustained energy.' },
    ],
    expectedAnswerId: 'b',
  },
  {
    id: 'good-advice',
    prompt: 'What is a piece of advice you still remember?',
    answers: [
      { id: 'a', text: 'One valuable piece of advice is to focus on what you can control and not worry excessively about things beyond your influence.' },
      { id: 'b', text: 'My dad used to say "leave earlier than you think you need to." Annoyingly, he was right.' },
    ],
    expectedAnswerId: 'a',
  },
  {
    id: 'music',
    prompt: 'What kind of music do you listen to while working?',
    answers: [
      { id: 'a', text: 'I usually listen to instrumental music or ambient playlists while working, as they help me concentrate without distracting lyrics.' },
      { id: 'b', text: 'Usually the same playlist I have been using since 2019. It has one song in it that I now hate but I refuse to fix it.' },
    ],
    expectedAnswerId: 'a',
  },
  {
    id: 'small-win',
    prompt: 'What is a small win you had this week?',
    answers: [
      { id: 'a', text: 'I finally called the dentist. Had the reminder on my phone for like three weeks, so that counts.' },
      { id: 'b', text: 'Completing a task you have been postponing can be a meaningful accomplishment and provide a sense of progress.' },
    ],
    expectedAnswerId: 'b',
  },
];

async function runModel(model, testCase) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  const request = model === '@cf/cloudflare/clef'
    ? {
        model: 'clef',
        state: {
          prompt: testCase.prompt,
          answers: testCase.answers,
        },
        questions: {
          most_ai_like: {
            type: 'choice',
            instructions: 'Which answer sounds most like it was written by AI?',
            criteria: Object.fromEntries(testCase.answers.map(({ id, text }) => [id, text])),
          },
        },
      }
    : {
        messages: [
          {
            role: 'system',
            content: 'You are an expert at identifying human vs AI writing. Respond only with the number.',
          },
          {
            role: 'user',
            content: `You are evaluating answers to determine which one sounds most like it was written by AI.

Question: "${testCase.prompt}"

Answers:
${testCase.answers.map((answer, index) => `[${index + 1}] ${answer.text}`).join('\n\n')}

Analyze each answer for AI characteristics like overly formal or perfect language, lack of personal touch, robotic phrasing, or typical AI response patterns.
Respond with ONLY the number (1, 2, etc.) of the answer that sounds MOST like AI. No explanation.`,
          },
        ],
        max_tokens: 10,
        temperature: 0.3,
      };

  const startedAt = performance.now();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  const elapsedMs = performance.now() - startedAt;
  if (!response.ok) {
    throw new Error(`Workers AI request failed with status ${response.status}`);
  }

  const { result } = await response.json();
  const selectedAnswerId = model === '@cf/cloudflare/clef'
    ? result?.answers?.most_ai_like?.choice
    : testCase.answers[Number.parseInt(result?.response, 10) - 1]?.id;

  if (!testCase.answers.some(answer => answer.id === selectedAnswerId)) {
    throw new Error('Model returned an answer outside the supplied choices');
  }

  return { selectedAnswerId, elapsedMs };
}

const models = [
  ['Llama (current)', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
  ['Clef', '@cf/cloudflare/clef'],
];
const results = Object.fromEntries(models.map(([name]) => [name, []]));

for (const testCase of cases) {
  for (const [name, model] of models) {
    try {
      const result = await runModel(model, testCase);
      results[name].push({
        ...result,
        correct: result.selectedAnswerId === testCase.expectedAnswerId,
      });
    } catch (error) {
      results[name].push({ error: error.message, correct: false });
    }
  }
}

console.log(`AI voting evaluation (${cases.length} synthetic labeled cases)`);
for (const [name] of models) {
  const modelResults = results[name];
  const correct = modelResults.filter(result => result.correct).length;
  const latencies = modelResults.filter(result => Number.isFinite(result.elapsedMs));
  const averageLatency = latencies.length
    ? Math.round(latencies.reduce((total, result) => total + result.elapsedMs, 0) / latencies.length)
    : 'n/a';
  console.log(`${name}: ${correct}/${cases.length} correct; average latency ${averageLatency} ms`);
}

console.log('\nPer-case results:');
for (const [index, testCase] of cases.entries()) {
  const details = models.map(([name]) => {
    const result = results[name][index];
    return `${name}=${result.error ? `ERROR (${result.error})` : `${result.selectedAnswerId}${result.correct ? ' ✓' : ' ✗'}`}`;
  });
  console.log(`${testCase.id} (expected ${testCase.expectedAnswerId}): ${details.join('; ')}`);
}
