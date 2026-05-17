const SYS = 'Ты — движок нарративной политической симуляции. Отвечай ТОЛЬКО валидным JSON без markdown-разметки и без преамбул. Только чистый JSON объект. Все тексты на русском языке.';

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
      text = await callClaude(prompt, 'claude-sonnet-4-20250514', 1200);
    } else {
      text = await callClaude(prompt, 'claude-haiku-4-5-20251001', 1000);
    }

    return Response.json({ text });

  } catch (err) {
    console.error('Route error:', err.message);
    return Response.json({ text: '{}' }, { status: 500 });
  }
}