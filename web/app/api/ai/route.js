const SYS_BASE = 'Ты — движок нарративной политической симуляции в стиле сериала House of Cards и романов Ле Карре. Отвечай ТОЛЬКО валидным JSON без markdown-разметки. Все тексты на русском.';

const SYS_CONSEQUENCE = SYS_BASE + ' При описании последствий: пиши кинематографично и конкретно. Упоминай ключевых персонажей по именам, описывай сцены (время суток, локации, жесты, диалоги), приводи цифры (проценты, суммы, число протестующих). Никаких абстракций вроде "ситуация ухудшилась". Только конкретика как в хорошем политическом триллере.';

const SYS_ENDING = SYS_BASE + ' При написании финала: пиши как историк через 20 лет после событий. Драматично, с конкретными деталями падения или триумфа. Имена, даты, ключевые сцены.';

async function callClaude(prompt, model, maxTokens, system) {
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
      system: system || SYS_BASE,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const d = await r.json();
  if (!r.ok) {
    console.error('Claude API error:', JSON.stringify(d));
    throw new Error(`Claude error: ${d.error?.message || r.status}`);
  }
  const text = d.content?.find(b => b.type === 'text')?.text || '{}';
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

export async function POST(req) {
  try {
    const { prompt, task } = await req.json();
    let text = '{}';

    if (task === 'ending') {
      // Финал — Sonnet, максимальное качество
      text = await callClaude(prompt, 'claude-sonnet-4-20250514', 1500, SYS_ENDING);
    } else if (task === 'consequence') {
      // Последствия — ГЛАВНЫЙ нарративный момент → Sonnet
      text = await callClaude(prompt, 'claude-sonnet-4-20250514', 1800, SYS_CONSEQUENCE);
    } else {
      // События/старт — Haiku
      text = await callClaude(prompt, 'claude-haiku-4-5-20251001', 1200, SYS_BASE);
    }

    return Response.json({ text });
  } catch (err) {
    console.error('Route error:', err.message);
    return Response.json({ text: '{}' }, { status: 500 });
  }
}