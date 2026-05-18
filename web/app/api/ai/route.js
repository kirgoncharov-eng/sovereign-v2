// Vercel: разрешаем функции работать до 60 секунд (по умолчанию 10)
export const maxDuration = 60;

const MODEL_FAST = process.env.MODEL_FAST    || 'gemini-3.1-flash-lite';
const MODEL_DEEP = process.env.MODEL_DEEP    || 'gemini-3.1-flash-lite';
const MODEL_FALLBACK = process.env.MODEL_FALLBACK || 'claude-haiku-4-5-20251001';

const GEMINI_URL = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const SYS_BASE = 'Ты — движок нарративной политической симуляции в стиле сериала House of Cards и романов Ле Карре. Отвечай ТОЛЬКО валидным JSON без markdown. Все тексты на русском.';

const SYS_CONSEQUENCE = SYS_BASE + ' При описании последствий: пиши кинематографично и конкретно. Упоминай ключевых персонажей по именам, описывай сцены (время суток, локации, жесты, диалоги), приводи цифры (проценты, суммы, число протестующих). Никаких абстракций. Только конкретика как в хорошем политическом триллере.';

const SYS_ENDING = SYS_BASE + ' При написании финала: пиши как историк через 20 лет после событий. Драматично, с конкретными деталями. Имена, даты, ключевые сцены.';

async function callGemini(prompt, model, maxTokens, system) {
  const r = await fetch(`${GEMINI_URL(model)}?key=${process.env.GOOGLE_AI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json',
        // КРИТИЧНО: отключаем thinking mode — иначе модель тратит время на размышления и таймаутится
        thinkingConfig: { thinkingBudget: 0 }
      }
    })
  });
  const d = await r.json();
  if (!r.ok) {
    console.error('Gemini error:', JSON.stringify(d));
    throw new Error(`Gemini: ${d.error?.message || r.status}`);
  }
  return d.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
}

async function callClaude(prompt, model, maxTokens, system) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens,
      system, messages: [{ role: 'user', content: prompt }]
    })
  });
  const d = await r.json();
  if (!r.ok) {
    console.error('Claude error:', JSON.stringify(d));
    throw new Error(`Claude: ${d.error?.message || r.status}`);
  }
  return d.content?.find(b => b.type === 'text')?.text || '{}';
}

async function callModel(prompt, model, maxTokens, system) {
  const isGemini = model.startsWith('gemini');
  try {
    return isGemini
      ? await callGemini(prompt, model, maxTokens, system)
      : await callClaude(prompt, model, maxTokens, system);
  } catch (err) {
    console.warn(`Primary model ${model} failed, using fallback ${MODEL_FALLBACK}:`, err.message);
    return await callClaude(prompt, MODEL_FALLBACK, maxTokens, system);
  }
}

export async function POST(req) {
  try {
    const { prompt, task } = await req.json();
    let text = '{}';

    if (task === 'ending') {
      text = await callModel(prompt, MODEL_DEEP, 1500, SYS_ENDING);
    } else if (task === 'consequence') {
      text = await callModel(prompt, MODEL_FAST, 1800, SYS_CONSEQUENCE);
    } else {
      text = await callModel(prompt, MODEL_FAST, 1200, SYS_BASE);
    }

    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    return Response.json({ text });

  } catch (err) {
    console.error('Route fatal error:', err.message);
    return Response.json({ text: '{}' }, { status: 500 });
  }
}