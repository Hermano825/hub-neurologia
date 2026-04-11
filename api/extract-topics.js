export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Method not allowed' });

  const { image, mediaType = 'image/jpeg' } = req.body;
  if (!image) return res.status(400).json({ erro: 'Imagem não fornecida' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ erro: 'ANTHROPIC_API_KEY não configurada' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
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
              text: `Você é um especialista em educação médica. Analise esta imagem e extraia TODOS os tópicos médicos listados.

Instruções:
1. Identifique tópicos de estudo, aulas, disciplinas ou conteúdos médicos
2. Ignore: datas, nomes de professores, locais, horários
3. Padronize nomes: "HDA" → "Hemorragia Digestiva Alta", "IAM" → "Infarto Agudo do Miocárdio"
4. Retorne APENAS um JSON válido, sem explicações:

{"topicos": ["Tópico 1", "Tópico 2", "Tópico 3"]}

Se não houver tópicos, retorne: {"topicos": []}`
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[ERROR]', response.status, err);
      return res.status(500).json({ erro: 'Erro na API Claude', status: response.status });
    }

    const data = await response.json();
    const responseText = data.content?.[0]?.text?.trim() || '';

    console.log('[DEBUG] Claude response:', responseText.substring(0, 300));

    if (!responseText) {
      return res.json({ topicos: [], erro: 'Resposta vazia' });
    }

    try {
      const parsed = JSON.parse(responseText);
      if (parsed.topicos && Array.isArray(parsed.topicos)) {
        return res.json({ topicos: parsed.topicos });
      }
    } catch (e) {
      console.log('[DEBUG] JSON parse error, attempting extraction');
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.topicos && Array.isArray(parsed.topicos)) {
            return res.json({ topicos: parsed.topicos });
          }
        } catch (e2) {
          // ignore
        }
      }
    }

    return res.json({ topicos: [], raw: responseText });

  } catch (error) {
    console.error('[ERROR]', error.message);
    return res.status(500).json({ erro: error.message });
  }
}
