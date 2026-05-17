const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export async function POST(req) {
  const { prompt, task } = await req.json();

  // Финал — только Sonnet
  if (task === 'ending') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 1000,
        system: 'Ты — движок нарративной политической симуляции. Только JSON, без markdown.',
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const d = await r.json();
    const text = d.content?.find(b => b.type === 'text')?.text || '{}';
    return Response.json({ text });
  }

  // Последствия — Haiku
  if (task === 'consequence') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 800,
        system: 'Ты — движок нарративной политической симуляции. Только JSON, без markdown.',
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const d = await r.json();
    const text = d.content?.find(b => b.type === 'text')?.text || '{}';
    return Response.json({ text });
  }

  // Всё остальное (события, старт) — Gemini Flash
  const r = await fetch(`${GEMINI_URL}?key=${process.env.GOOGLE_AI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 1000 }
    })
  });
  const d = await r.json();
  const text = d.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return Response.json({ text });
}