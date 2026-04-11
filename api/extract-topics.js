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
  if (!apiKey) return res.status(500).json({ erro: 'GEMINI_API_KEY não configurada no servidor' });

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
6. Foco na precisão dos termos da nomenclatura de residência médica (SUS, semiologia, especialidades clínicas).`
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
        maxOutputTokens: 1024
      }
    });

    const response = result.response;
    const text = response.text().trim();

    // Try to parse the JSON response
    try {
      const parsed = JSON.parse(text);
      // Ensure it has the expected structure
      if (Array.isArray(parsed.topicos)) {
        return res.json({ topicos: parsed.topicos });
      }
      // If it's just an array, wrap it
      if (Array.isArray(parsed)) {
        return res.json({ topicos: parsed });
      }
      // Otherwise return as is
      return res.json(parsed);
    } catch (parseError) {
      // If JSON parsing fails, try to extract array from text
      const arrayMatch = text.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          const array = JSON.parse(arrayMatch[0]);
          return res.json({ topicos: array });
        } catch (e) {
          // Fall through
        }
      }
      return res.json({ topicos: [], raw: text });
    }
  } catch (error) {
    console.error('Erro ao processar:', error);
    return res.status(500).json({ erro: error.message });
  }
}
