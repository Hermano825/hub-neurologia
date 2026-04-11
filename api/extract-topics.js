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
      model: "gemini-2.0-flash",
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
        responseMimeType: "application/json",
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
      console.log('[DEBUG] JSON parsed successfully:', parsed);

      if (Array.isArray(parsed.topicos) && parsed.topicos.length > 0) {
        return res.json({ topicos: parsed.topicos });
      } else if (Array.isArray(parsed.topicos) && parsed.topicos.length === 0) {
        return res.json({ topicos: [], erro: 'Nenhum tópico encontrado na imagem' });
      }
      // If it's just an array, wrap it
      if (Array.isArray(parsed)) {
        if (parsed.length > 0) {
          return res.json({ topicos: parsed });
        } else {
          return res.json({ topicos: [], erro: 'Array vazio retornado' });
        }
      }
      // Otherwise return as is
      return res.json(parsed);
    } catch (parseError) {
      console.log('[DEBUG] JSON parse failed, raw text:', text);

      // If JSON parsing fails, try to extract array from text
      const arrayMatch = text.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          const array = JSON.parse(arrayMatch[0]);
          if (Array.isArray(array) && array.length > 0) {
            console.log('[DEBUG] Extracted array from text:', array);
            return res.json({ topicos: array });
          }
        } catch (e) {
          console.log('[DEBUG] Array extraction failed:', e.message);
        }
      }

      return res.json({ topicos: [], raw: text, parseError: parseError.message });
    }
  } catch (error) {
    console.error('[ERROR] Exception:', error.message);
    return res.status(500).json({ erro: error.message, tipo: error.constructor.name });
  }
}
