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

  const prompt = `Você é um especialista em educação médica e residência médica brasileira.
Analise a imagem e extraia TODOS os tópicos médicos listados.
Ignore datas, nomes de professores, locais e horários.
Normalize siglas: HDA=Hemorragia Digestiva Alta, IAM=Infarto Agudo do Miocárdio, DRGE=Doença do Refluxo Gastroesofágico, ICC=Insuficiência Cardíaca Congestiva, AVE=Acidente Vascular Encefálico.
Retorne APENAS um JSON no formato: {"topicos": ["Tema 1", "Tema 2"]}
Se não houver tópicos retorne: {"topicos": []}`;

  try {
    // Direct REST call to v1 — bypasses SDK v1beta issue
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: mediaType,
                  data: image
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024
        }
      })
    });

    const rawBody = await response.text();
    console.log('[DEBUG] HTTP Status:', response.status);
    console.log('[DEBUG] Raw response:', rawBody.substring(0, 500));

    if (!response.ok) {
      let errData;
      try { errData = JSON.parse(rawBody); } catch (e) { errData = { message: rawBody }; }
      return res.status(response.status).json({
        erro: errData?.error?.message || `Erro HTTP ${response.status}`,
        status: response.status
      });
    }

    const data = JSON.parse(rawBody);
    let responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('[DEBUG] Model text:', responseText.substring(0, 400));

    if (!responseText) {
      return res.json({ topicos: [], erro: 'Resposta vazia' });
    }

    // Clean response: remove ```json ... ``` blocks if present
    responseText = responseText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(responseText);
      if (parsed.topicos && Array.isArray(parsed.topicos)) {
        const valid = parsed.topicos.filter(t => t && String(t).trim().length > 0);
        return res.json({ topicos: valid });
      }
      if (Array.isArray(parsed)) {
        return res.json({ topicos: parsed.filter(t => t && String(t).trim().length > 0) });
      }
      return res.json(parsed);
    } catch (parseError) {
      // Try to extract JSON object from text
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.topicos && Array.isArray(parsed.topicos)) {
            return res.json({ topicos: parsed.topicos.filter(t => t && String(t).trim().length > 0) });
          }
        } catch (e) { /* ignore */ }
      }
      return res.json({ topicos: [], raw: responseText });
    }

  } catch (error) {
    console.error('[ERROR]', error.message);
    return res.status(500).json({ erro: error.message });
  }
}
