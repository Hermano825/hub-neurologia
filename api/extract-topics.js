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

    // Use gemini-1.5-flash - cheapest model for vision tasks
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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
    });

    const responseText = result.response.text().trim();
    console.log('[DEBUG] Gemini response:', responseText.substring(0, 300));

    try {
      const parsed = JSON.parse(responseText);
      if (parsed.topicos && Array.isArray(parsed.topicos)) {
        return res.json({ topicos: parsed.topicos });
      }
    } catch (e) {
      console.log('[DEBUG] JSON parse error, trying extraction');
      // Try to extract JSON from response
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

    // Fallback: return raw response with error
    return res.json({ topicos: [], raw: responseText });

  } catch (error) {
    console.error('[ERROR]', error.message);
    return res.status(500).json({
      erro: error.message,
      dica: 'Verifique se a GEMINI_API_KEY está correta e se o billing está ativo'
    });
  }
}
