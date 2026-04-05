export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const data = req.body;

    // 1. GENERER LE BRIEF AVEC CLAUDE
    const prompt = [
      'Tu es un expert en production video et motion design pour ERE Agency.',
      'Genere un brief professionnel en francais a partir de ces infos client.',
      'Reponds UNIQUEMENT en JSON avec : objectif, audience, messageCle, directionCreative, references, aEviter, livrable, score (60-99), nomClient, typeService.',
      'OBJECTIF: ' + data.objectif,
      'AUDIENCE: ' + data.audience,
      'MESSAGE CLE: ' + data.messageCle,
      'FORMAT: ' + data.format,
      'DEADLINE: ' + data.deadline,
      'REFERENCES: ' + data.references,
      'ASPECTS: ' + data.aspectsInspiration,
      'A EVITER: ' + data.aEviter,
      'directionCreative = synthese creative 2-3 phrases basee sur les references.',
      'livrable = format + deadline.',
      'nomClient = deduis un nom generique si non fourni.',
      'typeService = deduis depuis objectif (motion design / FOOH / explainer / brand video).',
      'JSON uniquement sans markdown.'
    ].join(' ');

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
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

    const claudeResult = await claudeResponse.json();
    if (!claudeResponse.ok) return res.status(claudeResponse.status).json({ error: claudeResult.error?.message || 'Claude error' });

    let text = claudeResult.content[0].text.trim();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const brief = JSON.parse(text);

    // 2. ENVOYER A MAKE.COM (PROFILE&SLIDES webhook)
    const makeWebhookUrl = process.env.MAKE_WEBHOOK_URL;
    if (makeWebhookUrl) {
      const makePayload = {
        // Infos pour PROFILE&SLIDES
        deadline: brief.livrable || data.deadline,
        nomClient: brief.nomClient || 'Client ERE',
        typeService: brief.typeService || data.objectif,
        format: data.format,

        // Brief complet
        objectif: brief.objectif,
        audience: brief.audience,
        messageCle: brief.messageCle,
        directionCreative: brief.directionCreative,
        references: brief.references || data.references,
        aEviter: brief.aEviter,
        livrable: brief.livrable,
        score: brief.score,

        // Metadata
        sourceFormulaire: 'ere-onboarding.vercel.app',
        dateCommande: new Date().toISOString()
      };

      // Envoi non bloquant (on ne fait pas attendre le client)
      fetch(makeWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makePayload)
      }).catch(err => console.error('Make webhook error:', err));
    }

    // 3. RETOURNER LE BRIEF AU CLIENT
    return res.status(200).json(brief);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
