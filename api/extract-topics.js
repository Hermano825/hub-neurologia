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

  // Try models in order: versioned first, then latest
  const models = ['gemini-1.5-flash-001', 'gemini-1.5-flash-latest', 'gemini-1.5-flash'];

  const prompt = `Você é um especialista em educação médica e residência médica brasileira.
Analise esta imagem e extraia TODOS os tópicos médicos listados.
Ignore datas, nomes de professores, locais e horários.
Normalize siglas: HDA=Hemorragia Digestiva Alta, IAM=Infarto Agudo do Miocárdio, DRGE=Doença do Refluxo Gastroesofágico, ICC=Insuficiência Cardíaca Congestiva, AVE=Acidente Vascular Encefálico.
Retorne APENAS um JSON válido, sem markdown, sem explicações:
{"topicos": ["Tema 1", "Tema 2", "Tema 3"]}
Se não houver tópicos: {"topicos": []}`;

  let lastError = null;

  for (const modelId of models) {
    const url = `https://generativelanguage.googleapis.com/v1/models/${modelId}:generateContent?key=${apiKey}`;
    console.log(`[DEBUG] Trying model: ${modelId}`);
    console.log(`[DEBUG] URL: ${url.replace(apiKey, 'HIDDEN')}`);

    try {
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
      console.log(`[DEBUG] Status ${modelId}: ${response.status}`);

      if (!response.ok) {
        console.log(`[DEBUG] Error body: ${rawBody.substring(0, 200)}`);
        lastError = { model: modelId, status: response.status, body: rawBody };
        continue; // try next model
      }

      // Success!
      const data = JSON.parse(rawBody);
      let responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      console.log(`[DEBUG] Success with ${modelId}:`, responseText.substring(0, 300));

      if (!responseText) {
        return res.json({ topicos: [], erro: 'Resposta vazia' });
      }

      // Clean ```json ... ``` if present
      responseText = responseText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      try {
        const parsed = JSON.parse(responseText);
        if (parsed.topicos && Array.isArray(parsed.topicos)) {
          return res.json({ topicos: parsed.topicos.filter(t => t?.trim?.()) });
        }
        if (Array.isArray(parsed)) {
          return res.json({ topicos: parsed.filter(t => t?.trim?.()) });
        }
        return res.json(parsed);
      } catch (e) {
        const match = responseText.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            if (parsed.topicos && Array.isArray(parsed.topicos)) {
              return res.json({ topicos: parsed.topicos.filter(t => t?.trim?.()) });
            }
          } catch (e2) { /* ignore */ }
        }
        return res.json({ topicos: [], raw: responseText });
      }

    } catch (fetchError) {
      console.log(`[DEBUG] Fetch error for ${modelId}:`, fetchError.message);
      lastError = { model: modelId, erro: fetchError.message };
    }
  }

  // All models failed
  console.error('[ERROR] All models failed. Last error:', lastError);
  return res.status(500).json({
    erro: 'Nenhum modelo disponível. Verifique se o billing está ativo no Google Cloud.',
    detalhe: lastError
  });
}
