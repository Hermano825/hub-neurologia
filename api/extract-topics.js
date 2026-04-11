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
    const model = genAI.getGenerativeModel({
      model: "gemini-pro-vision",
      systemInstruction: `Você é um especialista em educação médica. Sua tarefa é transformar imagens de cronogramas, editais e roteiros de provas de residência médica em dados estruturados.

Instruções:
1. Realize o OCR da imagem com máxima precisão técnica.
2. Identifique apenas os tópicos médicos (ignore datas, nomes de professores ou locais de prova).
3. Padronize os termos: se o texto disser "HDA", converta para "Hemorragia Digestiva Alta"; se disser "IAM", converta para "Infarto Agudo do Miocárdio".
4. Retorne ESTRITAMENTE um JSON válido (sem textos introdutórios) no formato: {"topicos": ["Tema 1", "Tema 2"]}
5. Não invente tópicos. Se algo estiver ilegível, ignore.
6. Se a imagem não contiver tópicos médicos identificáveis, retorne: {"topicos": []}
7. Foco na precisão dos termos da nomenclatura de residência médica (SUS, semiologia, especialidades clínicas).`
    });

    const imagePart = {
      inlineData: {
        data: image,
        mimeType: mediaType
      }
    };

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            imagePart,
            {
              text: "Extraia os tópicos médicos desta imagem e retorne um JSON com o array de tópicos normalizados."
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048
      }
    });

    const response = result.response;
    const text = response.text().trim();

    console.log('[DEBUG] Resposta Gemini:', text.substring(0, 500));

    // Try to parse the JSON response
    try {
      const parsed = JSON.parse(text);
      console.log('[DEBUG] JSON parsed successfully');

      if (Array.isArray(parsed.topicos) && parsed.topicos.length > 0) {
        return res.json({ topicos: parsed.topicos });
      } else if (Array.isArray(parsed.topicos)) {
        return res.json({ topicos: [], erro: 'Nenhum tópico encontrado na imagem' });
      }
      if (Array.isArray(parsed)) {
        return res.json({ topicos: parsed.length > 0 ? parsed : [] });
      }
      return res.json(parsed);
    } catch (parseError) {
      console.log('[DEBUG] JSON parse failed, attempting extraction');

      const arrayMatch = text.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          const array = JSON.parse(arrayMatch[0]);
          if (Array.isArray(array) && array.length > 0) {
            console.log('[DEBUG] Extracted array successfully');
            return res.json({ topicos: array });
          }
        } catch (e) {
          console.log('[DEBUG] Array extraction failed');
        }
      }

      // Last resort: split by lines
      const lines = text.split('\n')
        .map(l => l.replace(/^[-•*\d.)\s"]+/, '').trim())
        .filter(l => l.length > 3 && l.length < 200 && !l.includes('topicos') && !l.includes('{') && !l.includes('}'));

      if (lines.length > 0) {
        console.log('[DEBUG] Fallback: extracted lines as topics');
        return res.json({ topicos: lines });
      }

      return res.json({ topicos: [], raw: text });
    }
  } catch (error) {
    console.error('[ERROR]', error.message);
    return res.status(500).json({ erro: error.message });
  }
}
