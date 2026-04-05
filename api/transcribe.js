export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const audioBuffer = Buffer.concat(chunks);

    const boundary = 'WhistperBoundary' + Date.now();
    const CRLF = '\r\n';

    const part1 = Buffer.from(
      '--' + boundary + CRLF +
      'Content-Disposition: form-data; name="file"; filename="audio.webm"' + CRLF +
      'Content-Type: audio/webm' + CRLF + CRLF
    );
    const part2 = Buffer.from(
      CRLF + '--' + boundary + CRLF +
      'Content-Disposition: form-data; name="model"' + CRLF + CRLF +
      'whisper-1' + CRLF +
      '--' + boundary + CRLF +
      'Content-Disposition: form-data; name="language"' + CRLF + CRLF +
      'fr' + CRLF +
      '--' + boundary + '--' + CRLF
    );

    const body = Buffer.concat([part1, audioBuffer, part2]);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY,
        'Content-Type': 'multipart/form-data; boundary=' + boundary
      },
      body
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'Whisper error' });
    return res.status(200).json({ text: data.text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
