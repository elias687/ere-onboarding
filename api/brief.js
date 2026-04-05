export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const data = req.body;

    const promptText = [
      'Tu es un expert en production video et motion design pour ERE Agency.',
      'Genere un brief professionnel en francais a partir de ces infos client.',
      data.pdfBase64 ? 'Un document PDF a ete joint — analyse-le et integre son contenu dans le brief.' : '',
      'Reponds UNIQUEMENT en JSON avec : objectif, audience, messageCle, directionCreative, references, aEviter, livrable, score (60-99), nomClient, typeService.',
      'CLIENT: ' + (data.nomClient || 'Non precise'),
      'EMAIL: ' + (data.email || 'Non precise'),
      'TELEPHONE: ' + (data.telephone || 'Non precise'),
      'SITE WEB: ' + (data.siteWeb || 'Non precise'),
      'CONTACT PREFERE: ' + (data.moyenContact || 'Non precise'),
      'OBJECTIF: ' + data.objectif,
      'PLATEFORMES: ' + (data.plateformes || 'Non precise'),
      'AUDIENCE: ' + data.audience,
      'MESSAGE CLE: ' + data.messageCle,
      'FORMAT: ' + data.format,
      'DEADLINE: ' + data.deadline,
      'REFERENCES: ' + data.references,
      'ASPECTS INSPIRANTS: ' + data.aspectsInspiration,
      'A EVITER: ' + data.aEviter,
      data.briefExistant ? 'BRIEF EXISTANT: ' + data.briefExistant : '',
      'directionCreative = synthese creative 2-3 phrases basee sur les references.',
      'livrable = format + deadline. nomClient = nom du client.',
      'typeService = deduis depuis objectif.',
      'JSON uniquement sans markdown.'
    ].filter(Boolean).join(' ');

    // Message Claude avec ou sans PDF
    let messageContent;
    if (data.pdfBase64) {
      messageContent = [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: data.pdfBase64 },
          title: data.pdfName || 'Brief client',
          cache_control: { type: 'ephemeral' }
        },
        { type: 'text', text: promptText }
      ];
    } else {
      messageContent = promptText;
    }

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1500,
        messages: [{ role: 'user', content: messageContent }]
      })
    });

    const claudeResult = await claudeResponse.json();
    if (!claudeResponse.ok) {
      return res.status(claudeResponse.status).json({ error: claudeResult.error?.message || 'Claude error' });
    }

    let text = claudeResult.content[0].text.trim();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const brief = JSON.parse(text);

    // Envoyer a Make.com et capturer le statut
    let makeOk = false;
    const makeWebhookUrl = process.env.MAKE_WEBHOOK_URL;

    if (makeWebhookUrl) {
      try {
        const makePayload = {
          deadline: brief.livrable || data.deadline,
          nomClient: brief.nomClient || data.nomClient || 'Client ERE',
          email: data.email || '',
          telephone: data.telephone || '',
          siteWeb: data.siteWeb || '',
          moyenContact: data.moyenContact || '',
          typeService: brief.typeService || data.objectif,
          plateformes: data.plateformes || '',
          format: data.format,
          objectif: brief.objectif,
          audience: brief.audience,
          messageCle: brief.messageCle,
          directionCreative: brief.directionCreative,
          references: brief.references || data.references,
          aEviter: brief.aEviter,
          livrable: brief.livrable,
          score: brief.score,
          briefPdfJoint: data.pdfBase64 ? 'Oui — ' + (data.pdfName || 'brief.pdf') : 'Non',
          sourceFormulaire: 'ere-onboarding.vercel.app',
          dateCommande: new Date().toISOString()
        };

        const makeRes = await fetch(makeWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(makePayload)
        });

        // Make repond "Accepted" avec status 200 si le webhook est actif
        makeOk = makeRes.ok;
        if (!makeOk) {
          const makeErr = await makeRes.text();
          console.error('Make webhook rejected:', makeRes.status, makeErr);
        }
      } catch (makeErr) {
        console.error('Make webhook error:', makeErr.message);
        makeOk = false;
      }
    } else {
      console.warn('MAKE_WEBHOOK_URL not set in environment variables');
    }

    // Retourner le brief + statut Make
    return res.status(200).json({ ...brief, _makeOk: makeOk });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
