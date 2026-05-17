const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const SYS = 'Ты — движок нарративной политической симуляции. Отвечай ТОЛЬКО валидным JSON без markdown-разметки и без преамбул. Никаких ```json блоков. Только чистый JSON объект. Все тексты на русском языке.';

function extractJSON(text) {
  if (!text) return '{}';
  // убираем markdown-обёртки если есть
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  return clean || '{}';
}

async function callClaude(prompt, model, maxTokens) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: SYS,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Claude error: ${d.error?.message || r.status}`);
  return d.content?.find(b => b.type === 'text')?.text || '{}';
}

async function callGemini(prompt) {
  const r = await fetch(`${GEMINI_URL}?key=${process.env.GOOGLE_AI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // системная инструкция для Gemini
      system_instruction: { parts: [{ text: SYS }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 1000,
        // принудительно JSON-ответ без markdown
        responseMimeType: 'application/json'
      }
    })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Gemini error: ${JSON.stringify(d.error)}`);
  return d.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
}

export async function POST(req) {
  try {
    const { prompt, task } = await req.json();

    let text = '{}';

    if (task === 'ending') {
      // Финал — только Sonnet (1 раз за игру, максимальное качество)
      text = await callClaude(prompt, 'claude-sonnet-4-20250514', 1000);

    } else if (task === 'consequence') {
      // Последствия — Haiku (быстро, качественный нарратив)
      text = await callClaude(prompt, 'claude-haiku-4-5-20251001', 800);

    } else {
      // Событие / старт — Gemini Flash (дёшево, быстро)
      // Если Gemini недоступен — fallback на Haiku
      try {
        text = await callGemini(prompt);
      } catch (geminiErr) {
        console.warn('Gemini failed, falling back to Haiku:', geminiErr.message);
        text = await callClaude(prompt, 'claude-haiku-4-5-20251001', 1000);
      }
    }

    return Response.json({ text: extractJSON(text) });

  } catch (err) {
    console.error('API route error:', err);
    return Response.json({ text: '{}' }, { status: 500 });
  }
}