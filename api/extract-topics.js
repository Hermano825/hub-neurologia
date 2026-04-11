export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Method not allowed' });

  const { image, mediaType = 'image/jpeg' } = req.body;
  if (!image) return res.status(400).json({ erro: 'Imagem não fornecida' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ erro: 'API key não configurada no servidor' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: image }
            },
            {
              type: 'text',
              text: `Analise esta imagem e extraia todos os tópicos, aulas, assuntos ou itens de estudo listados.

Pode ser: um edital de prova, uma lista de aulas, uma grade curricular, um índice de apostila, ou qualquer lista de conteúdos de medicina.

Seja generoso na extração — se houver qualquer texto que pareça um tópico de estudo, inclua.

Retorne SOMENTE um JSON válido, sem markdown nem explicações:
{"topicos": ["Tópico 1", "Tópico 2", "Tópico 3"]}

Se a imagem não contiver texto ou tópicos identificáveis, retorne:
{"topicos": [], "erro": "Imagem não contém lista de tópicos"}`
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ erro: 'Erro na API Claude: ' + response.status, detalhe: err });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text?.trim() || '';

    // Try to extract JSON from the response
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return res.json(JSON.parse(match[0]));
      } catch (e) {
        // JSON parse failed, fall through
      }
    }

    // If no JSON found but there's text, try to extract lines as topics
    if (text && text.length > 0) {
      const lines = text.split('\n')
        .map(l => l.replace(/^[-•*\d.)\s]+/, '').trim())
        .filter(l => l.length > 3 && l.length < 200);
      if (lines.length > 0) {
        return res.json({ topicos: lines });
      }
    }

    return res.json({ topicos: [], raw: text });
  } catch (error) {
    return res.status(500).json({ erro: error.message });
  }
}
