export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Method not allowed' });

  const { image, mediaType = 'image/jpeg' } = req.body;
  if (!image) return res.status(400).json({ erro: 'Imagem não fornecida' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
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
              text: `Esta imagem contém uma lista de tópicos ou aulas de medicina para uma prova (provavelmente neurologia).

Extraia TODOS os nomes dos tópicos/aulas listados. Seja preciso e mantenha os nomes originais.

Retorne APENAS um JSON válido neste formato exato, sem markdown:
{"topicos": ["Nome do Tópico 1", "Nome do Tópico 2", "Nome do Tópico 3"]}

Se não houver tópicos identificáveis, retorne:
{"topicos": [], "erro": "Não foi possível identificar tópicos"}`
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(500).json({ erro: 'Erro na API Claude', detalhe: err.error?.message });
    }

    const data = await response.json();
    const text = data.content[0].text.trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return res.json(JSON.parse(match[0]));
    }
    return res.json({ topicos: [], raw: text });
  } catch (error) {
    return res.status(500).json({ erro: error.message });
  }
}
