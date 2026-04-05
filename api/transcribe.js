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
    const buffer = Buffer.concat(chunks);

    // Forward to OpenAI Whisper
    const { Readable } = await import('stream');
    const FormData = (await import('formdata-node')).FormData;
    const { fileFromPath } = await import('formdata-node/file-from-path');

    // Use fetch with raw buffer
    const boundary = '----FormBoundary' + Math.random().toString(36);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.webm"\r\nContent-Type: audio/webm\r\n\r\n`),
      buffer,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nfr\r\n--${boundary}--\r\n`)
    ]);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
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
