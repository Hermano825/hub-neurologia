const PROMPTS = {
  resumo: (t) => `Você é professor especialista em neurologia médica para residência. Crie um resumo clínico direto sobre "${t}" voltado para prova de residência brasileira.

Retorne APENAS um JSON válido, sem markdown:
{
  "topico": "${t}",
  "pontos_chave": ["ponto 1", "ponto 2", "ponto 3", "ponto 4", "ponto 5"],
  "resumo_clinico": "Texto corrido objetivo com definição, fisiopatologia essencial, quadro clínico típico, diagnóstico e tratamento",
  "armadilhas_prova": ["Armadilha clássica 1 que aparece em provas", "Armadilha 2", "Armadilha 3"],
  "mnemônicos": ["Mnemônico útil se houver, caso contrário deixe vazio"],
  "valores_importantes": {"Parâmetro": "valor ou critério diagnóstico"}
}`,

  flashcards: (t) => `Você é professor especialista em neurologia médica. Crie 10 flashcards de alta qualidade sobre "${t}" para estudo de residência médica brasileira.

Retorne APENAS um JSON válido, sem markdown:
{
  "topico": "${t}",
  "flashcards": [
    {"frente": "Pergunta direta ou conceito-chave", "verso": "Resposta completa, didática e memorável"},
    {"frente": "...", "verso": "..."}
  ]
}

Inclua: definições, critérios diagnósticos, fármacos com doses quando pertinente, sinais clínicos específicos, achados em exames de imagem. Priorize o que mais cai em provas.`,

  questoes: (t) => `Você é professor especialista em neurologia médica. Crie 5 questões de múltipla escolha sobre "${t}" no estilo das provas de residência brasileira (ENARE, USP, Unifesp, UERJ).

Retorne APENAS um JSON válido, sem markdown:
{
  "topico": "${t}",
  "questoes": [
    {
      "enunciado": "Caso clínico ou situação problema realista e detalhada",
      "alternativas": ["A) opção A", "B) opção B", "C) opção C", "D) opção D", "E) opção E"],
      "gabarito": "A",
      "explicacao": "Explicação detalhada: por que o gabarito está correto E por que cada distrator está errado"
    }
  ]
}

As questões devem ter casos clínicos realistas. Os distratos devem ser plausíveis (não óbvios).`
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Method not allowed' });

  const { topico, tipo } = req.body;
  if (!topico || !tipo) return res.status(400).json({ erro: 'topico e tipo são obrigatórios' });
  if (!PROMPTS[tipo]) return res.status(400).json({ erro: 'tipo inválido: use resumo, flashcards ou questoes' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        messages: [{ role: 'user', content: PROMPTS[tipo](topico) }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(500).json({ erro: 'Erro na API Claude', detalhe: err.error?.message });
    }

    const data = await response.json();
    const text = data.content[0].text.trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return res.json(JSON.parse(match[0]));
    }
    return res.json({ erro: 'Formato inválido na resposta', raw: text });
  } catch (error) {
    return res.status(500).json({ erro: error.message });
  }
}
