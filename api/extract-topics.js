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

    // Simple model initialization without extra parameters
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Image part
    const imagePart = {
      inlineData: {
        mimeType: mediaType,
        data: image
      }
    };

    // Prompt with all instructions embedded
    const promptPart = {
      text: `Você é um especialista em educação médica e residência médica brasileira. Sua tarefa é extrair tópicos médicos de imagens de cronogramas, editais e roteiros de provas.

INSTRUÇÕES:
1. Realize OCR da imagem com máxima precisão técnica.
2. Identifique APENAS tópicos médicos (ignore datas, nomes de professores, locais de prova, horários).
3. Normalize os termos médicos conforme nomenclatura de residência:
   - "HDA" → "Hemorragia Digestiva Alta"
   - "IAM" → "Infarto Agudo do Miocárdio"
   - "DRGE" → "Doença do Refluxo Gastroesofágico"
   - "ICC" → "Insuficiência Cardíaca Congestiva"
   - "AVE" → "Acidente Vascular Encefálico"
   - Qualquer sigla: expanda para nome completo
4. Retorne APENAS um JSON válido com este formato exato (sem markdown, sem explicações adicionais):
   {"topicos": ["Tópico 1", "Tópico 2", "Tópico 3"]}
5. Se não houver tópicos identificáveis, retorne: {"topicos": []}
6. Não invente tópicos que não estejam na imagem.`
    };

    // Call API with both image and prompt as array
    const result = await model.generateContent([imagePart, promptPart]);

    const responseText = result.response.text().trim();
    console.log('[DEBUG] Gemini response:', responseText.substring(0, 500));

    if (!responseText) {
      return res.json({ topicos: [], erro: 'Resposta vazia do Gemini' });
    }

    try {
      // Parse JSON from response
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

      // Try to extract JSON from response text
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

      return res.json({ topicos: [], raw: responseText });
    }

  } catch (error) {
    console.error('[ERROR]', error.message);
    return res.status(500).json({
      erro: error.message
    });
  }
}
