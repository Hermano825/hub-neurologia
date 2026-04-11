export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Method not allowed' });

  const { image, mediaType = 'image/jpeg' } = req.body;
  if (!image) return res.status(400).json({ erro: 'Imagem não fornecida' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ erro: 'GEMINI_API_KEY não configurada' });

  try {
    // Use REST API directly with gemini-1.5-pro (most stable, works with REST API)
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: mediaType,
                    data: image
                  }
                },
                {
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
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024
          }
        })
      }
    );

    if (!response.ok) {
      const errData = await response.text();
      console.error('[ERROR] Status:', response.status, 'Body:', errData);
      return res.status(response.status).json({
        erro: `Erro ${response.status} na API Gemini`,
        detalhe: errData
      });
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    console.log('[DEBUG] Gemini response:', responseText.substring(0, 300));

    if (!responseText) {
      return res.json({ topicos: [], erro: 'Resposta vazia do Gemini' });
    }

    try {
      const parsed = JSON.parse(responseText);
      if (parsed.topicos && Array.isArray(parsed.topicos)) {
        return res.json({ topicos: parsed.topicos });
      }
    } catch (e) {
      console.log('[DEBUG] JSON parse error, trying extraction');
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
    return res.status(500).json({
      erro: error.message
    });
  }
}
