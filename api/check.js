// api/check.js
import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const body = req.body || {};
  const input = (body.text || '').toString().trim();
  if (!input) return res.status(400).json({ error: 'No text provided' });

  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) return res.status(500).json({ error: 'OpenAI API key not configured' });

  // System prompt: act as friendly english teacher
  const system = `You are an expert English teacher. 
When given a short spoken sentence, provide:
1) a corrected, natural English sentence (single line).
2) a concise list of the mistakes found and why (simple explanation for each).
3) a confidence estimate (low/medium/high).
Return JSON only with keys: corrected, explanation, confidence.`;

  const userPrompt = `Student said: "${input}"\n\nReturn corrected sentence and explain mistakes.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',        // or another model available in your account
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 400,
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const txt = await response.text();
      console.error('OpenAI error', txt);
      return res.status(502).send('OpenAI API error');
    }

    const data = await response.json();
    // extract assistant text
    const assistant = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    // Try to parse assistant reply heuristically: we will return the full assistant text if parsing fails.
    let corrected = '';
    let explanation = '';
    let confidence = '';

    if (assistant) {
      // Some models may return text in paragraphs; try to extract a corrected sentence (first line) and explanation (rest)
      const parts = assistant.trim().split(/\n+/).map(s => s.trim()).filter(Boolean);
      // pick first short line as corrected
      corrected = parts[0] || assistant;
      explanation = parts.slice(1).join('\n') || '';
      // look for confidence word
      const confMatch = assistant.match(/\b(low|medium|high)\b/i);
      confidence = confMatch ? confMatch[0].toLowerCase() : '';
    }

    return res.json({ corrected, explanation, confidence, raw: assistant });
  } catch (err) {
    console.error('Handler error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
