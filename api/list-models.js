import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ erro: 'GEMINI_API_KEY não configurada' });

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const models = await genAI.listModels();

    const visionModels = models.models.filter(m =>
      m.name.includes('vision') ||
      m.name.includes('flash') ||
      m.name.includes('pro') ||
      m.displayName.toLowerCase().includes('vision')
    );

    return res.json({
      total: models.models.length,
      visionModels: visionModels.map(m => ({
        name: m.name,
        displayName: m.displayName,
        version: m.version
      }))
    });
  } catch (error) {
    return res.status(500).json({ erro: error.message });
  }
}
