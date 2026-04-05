export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const data = req.body;

    const prompt = [
      'Tu es un expert en production video et motion design.',
      'Genere un brief professionnel en francais a partir de ces infos client.',
      'Reponds UNIQUEMENT en JSON avec : objectif, audience, messageCle, directionCreative, references, aEviter, livrable, score (60-99).',
      'OBJECTIF: ' + data.objectif,
      'AUDIENCE: ' + data.audience,
      'MESSAGE CLE: ' + data.messageCle,
      'FORMAT: ' + data.format,
      'DEADLINE: ' + data.deadline,
      'REFERENCES: ' + data.references,
      'ASPECTS: ' + data.aspectsInspiration,
      'A EVITER: ' + data.aEviter,
      'directionCreative = synthese creative 2-3 phrases basee sur les references.',
      'livrable = format + deadline. JSON uniquement sans markdown.'
    ].join(' ');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const result = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: result.error?.message || 'Claude error' });

    let text = result.content[0].text.trim();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const brief = JSON.parse(text);
    return res.status(200).json(brief);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
