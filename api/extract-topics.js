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
Analise esta imagem e extraia TODOS os tópicos médicos listados.
Ignore datas, nomes de professores, locais e horários.
Normalize siglas: HDA=Hemorragia Digestiva Alta, IAM=Infarto Agudo do Miocárdio, DRGE=Doença do Refluxo Gastroesofágico, ICC=Insuficiência Cardíaca Congestiva, AVE=Acidente Vascular Encefálico.
Retorne APENAS um JSON válido, sem markdown:
{"topicos": ["Tema 1", "Tema 2"]}
Se não houver tópicos: {"topicos": []}`;

  // AI Studio keys use v1beta — Cloud Console keys use v1
  // We try both to maximize compatibility
  const endpoints = [
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:generateContent?key=${apiKey}`,
  ];

  const body = JSON.stringify({
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: mediaType, data: image } }
        ]
      }
    ],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
  });

  let lastError = null;

  for (const url of endpoints) {
    const modelName = url.match(/models\/([^:]+)/)?.[1];
    console.log(`[DEBUG] Trying: ${modelName} — ${url.replace(apiKey, 'KEY_HIDDEN')}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });

      const rawBody = await response.text();
      console.log(`[DEBUG] ${modelName} → status ${response.status}: ${rawBody.substring(0, 150)}`);

      if (!response.ok) {
        lastError = { model: modelName, status: response.status, detalhe: rawBody.substring(0, 300) };
        continue;
      }

      // Sucesso!
      const data = JSON.parse(rawBody);
      let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      console.log(`[DEBUG] Success with ${modelName}:`, text.substring(0, 200));

      // Remove markdown ```json blocks if present
      text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

      try {
        const parsed = JSON.parse(text);
        if (parsed.topicos && Array.isArray(parsed.topicos)) {
          return res.json({ topicos: parsed.topicos.filter(t => t?.trim?.()) });
        }
        if (Array.isArray(parsed)) {
          return res.json({ topicos: parsed.filter(t => t?.trim?.()) });
        }
        return res.json(parsed);
      } catch (e) {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            if (parsed.topicos) return res.json({ topicos: parsed.topicos.filter(t => t?.trim?.()) });
          } catch (e2) { /* ignore */ }
        }
        return res.json({ topicos: [], raw: text });
      }

    } catch (err) {
      lastError = { model: modelName, erro: err.message };
      console.log(`[DEBUG] Fetch error: ${err.message}`);
    }
  }

  return res.status(500).json({
    erro: 'Nenhum endpoint funcionou. Verifique se a chave é do AI Studio (aistudio.google.com/apikey) e se o billing está ativo.',
    ultimoErro: lastError
  });
}
