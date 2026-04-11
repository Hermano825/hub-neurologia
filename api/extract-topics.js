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
    const genAI = new GoogleGenerativeAI(apiKey);

    // Use gemini-1.5-flash - multimodal model that replaces old vision models
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash"
    });

    const result = await model.generateContent({
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
              text: `Você é um especialista em educação médica e residência médica brasileira. Sua tarefa é transformar imagens de cronogramas, editais e roteiros de provas em dados estruturados.

Instruções:
1. Realize OCR da imagem com máxima precisão técnica.
2. Identifique APENAS tópicos médicos (ignore datas, nomes de professores, locais de prova).
3. Normalize os termos médicos:
   - "HDA" → "Hemorragia Digestiva Alta"
   - "IAM" → "Infarto Agudo do Miocárdio"
   - "DRGE" → "Doença do Refluxo Gastroesofágico"
   - "ICC" → "Insuficiência Cardíaca Congestiva"
4. Retorne ESTRITAMENTE um JSON válido com este formato exato:
   {"topicos": ["Tópico 1", "Tópico 2", "Tópico 3"]}
5. Se não houver tópicos identificáveis, retorne: {"topicos": []}
6. Não invente tópicos. Foco em nomenclatura de residência médica (SUS, semiologia, especialidades).`
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
        maxOutputTokens: 1024
      }
    });

    const responseText = result.response.text().trim();
    console.log('[DEBUG] Gemini 1.5 Flash response:', responseText.substring(0, 300));

    if (!responseText) {
      return res.json({ topicos: [], erro: 'Resposta vazia do Gemini' });
    }

    try {
      const parsed = JSON.parse(responseText);

      // Validate structure
      if (parsed.topicos && Array.isArray(parsed.topicos)) {
        // Filter out empty strings
        const validTopicos = parsed.topicos.filter(t => t && t.trim().length > 0);
        return res.json({ topicos: validTopicos });
      }

      // If response is just an array
      if (Array.isArray(parsed)) {
        const validTopicos = parsed.filter(t => t && t.trim().length > 0);
        return res.json({ topicos: validTopicos });
      }

      return res.json(parsed);

    } catch (parseError) {
      console.log('[DEBUG] JSON parse failed, attempting fallback extraction');

      // Fallback: try to extract JSON object from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.topicos && Array.isArray(parsed.topicos)) {
            const validTopicos = parsed.topicos.filter(t => t && t.trim().length > 0);
            return res.json({ topicos: validTopicos });
          }
        } catch (e2) {
          console.log('[DEBUG] Fallback extraction failed');
        }
      }

      return res.json({ topicos: [], raw: responseText, erro: 'Falha no parsing JSON' });
    }

  } catch (error) {
    console.error('[ERROR]', error.message);
    return res.status(500).json({
      erro: error.message,
      tipo: error.constructor.name
    });
  }
}
