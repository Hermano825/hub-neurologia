import { GoogleGenerativeAI } from "@google/generative-ai";

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
    // Direct REST API call to v1 (not v1beta)
    const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: `Você é um especialista em educação médica e residência médica brasileira. Sua tarefa é transformar imagens de cronogramas, editais e roteiros de provas em dados estruturados.

Instruções:
1. Realize OCR da imagem com máxima precisão técnica.
2. Identifique APENAS tópicos médicos (ignore datas, nomes de professores, locais de prova).
3. Normalize os termos médicos:
   - "HDA" → "Hemorragia Digestiva Alta"
   - "IAM" → "Infarto Agudo do Miocárdio"
   - "DRGE" → "Doença do Refluxo Gastroesofágico"
   - "ICC" → "Insuficiência Cardíaca Congestiva"
4. Retorne um JSON válido com este formato exato (como texto puro, não em markdown):
   {"topicos": ["Tópico 1", "Tópico 2", "Tópico 3"]}
5. Se não houver tópicos identificáveis, retorne: {"topicos": []}
6. Não invente tópicos. Foco em nomenclatura de residência médica.`
            }
          ]
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: mediaType,
                  data: image
                }
              },
              {
                text: "Extraia os tópicos médicos desta imagem e retorne um JSON com o array de tópicos normalizados."
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

    console.log('[DEBUG] API Status:', response.status);

    if (!response.ok) {
      const errData = await response.json();
      console.error('[ERROR] API Response:', errData);
      return res.status(response.status).json({
        erro: errData.error?.message || `Erro ${response.status}`,
        detalhe: errData.error?.details?.[0]?.reason || ''
      });
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    console.log('[DEBUG] Gemini response:', responseText.substring(0, 400));

    if (!responseText) {
      return res.json({ topicos: [], erro: 'Resposta vazia do Gemini' });
    }

    try {
      // Parse JSON from response text
      const parsed = JSON.parse(responseText);

      if (parsed.topicos && Array.isArray(parsed.topicos)) {
        const validTopicos = parsed.topicos.filter(t => t && String(t).trim().length > 0);
        return res.json({ topicos: validTopicos });
      }

      if (Array.isArray(parsed)) {
        const validTopicos = parsed.filter(t => t && String(t).trim().length > 0);
        return res.json({ topicos: validTopicos });
      }

      return res.json(parsed);

    } catch (parseError) {
      console.log('[DEBUG] JSON parse error, attempting extraction');

      // Try to extract JSON object from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.topicos && Array.isArray(parsed.topicos)) {
            const validTopicos = parsed.topicos.filter(t => t && String(t).trim().length > 0);
            return res.json({ topicos: validTopicos });
          }
        } catch (e2) {
          console.log('[DEBUG] Extraction failed');
        }
      }

      return res.json({ topicos: [], raw: responseText, erro: 'Falha no parsing JSON' });
    }

  } catch (error) {
    console.error('[ERROR]', error.message);
    return res.status(500).json({
      erro: error.message
    });
  }
}
