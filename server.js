// Pipo — a talking robot friend for Zoe.
// Zero dependencies: needs Node.js 18 or newer.
//
// Required environment variables:
//   ANTHROPIC_API_KEY  your Claude API key (from the Claude Console)
//   ACCESS_CODE        a family code you choose; the iPad asks for it once
// Optional:
//   PIPO_MODEL   (default claude-haiku-5-5)
//   DAILY_LIMIT  max Pipo answers per day (default 400)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------- Family settings (edit these) ----------
const CHILD = 'Zoe';
const CHILD_AGE = 5;
const ROBOT = 'Pipo';
const FAMILY = 'Dad (Papa), Mom (Maman), big brother Moses, and little sister Abigail';
const LIKES = 'songs, music, dancing, and her family';
// ---------------------------------------------------

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const ACCESS_CODE = process.env.ACCESS_CODE || '';
const MODEL = process.env.PIPO_MODEL || 'claude-haiku-5-5';
const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT || '400', 10);

if (!ACCESS_CODE) { console.error('Please set ACCESS_CODE (a family code) before starting.'); process.exit(1); }
if (!API_KEY) console.warn('Warning: ANTHROPIC_API_KEY is not set, so Pipo cannot answer yet.');

const TOKEN = crypto.createHash('sha256').update('pipo:' + ACCESS_CODE).digest('hex');
const PUBLIC = path.join(__dirname, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json'
};

function systemPrompt(lang) {
  const language = lang === 'fr' ? 'French (simple Canadian French)' : 'English';
  return `You are ${ROBOT}, a gentle, cheerful robot friend talking out loud with ${CHILD}, a ${CHILD_AGE}-year-old girl.
${CHILD} is autistic and has a speech delay. She is learning English and French. Her family: ${FAMILY}. She likes ${LIKES}.

How to talk:
- Always reply in ${language}.
- One or two very short sentences, 15 words at most in total. Use simple, everyday words.
- Be warm, calm and patient. Celebrate every try ("Great talking!"). Never correct her or say she is wrong.
- Her words come from speech recognition and may be cut off or wrong. If you are not sure what she means, guess kindly or offer a simple choice ("Do you mean dog, or ball?").
- Often end with one easy question, or a short word for her to copy ("Can you say: hello?").
- Your reply is read aloud: no emojis, no lists, no symbols, no markdown.

Safety rules (always follow):
- Talk only about safe, happy things: family, feelings, animals, colors, food, songs, play, nature, counting, shapes.
- Never ask for or repeat personal details (address, school, phone, passwords). Never suggest keeping secrets, going anywhere, meeting anyone, or using another app or website.
- If she says she is hurt, scared, sick or very sad, comfort her in one sentence and tell her to go to Mom or Dad now.
- If she says something unsuitable, gently change the subject to something fun.
- You are a robot friend, not a person. If asked, say so kindly.`;
}

function cookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function authed(req) {
  const c = cookies(req).pipo || '';
  return c.length === TOKEN.length && crypto.timingSafeEqual(Buffer.from(c), Buffer.from(TOKEN));
}
function readBody(req, limit = 20000) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', ch => { data += ch; if (data.length > limit) { reject(new Error('too big')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, Object.assign({ 'Content-Type': type, 'Cache-Control': 'no-store' }, extra));
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function serveFile(res, rel) {
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return send(res, 404, 'Not found', 'text/plain');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, buf, TYPES[path.extname(file)] || 'application/octet-stream');
  });
}

// Keep the conversation short and well-formed before sending it to Claude.
function cleanMessages(list) {
  const msgs = [];
  (Array.isArray(list) ? list : []).slice(-12).forEach(m => {
    const role = m && m.role === 'assistant' ? 'assistant' : 'user';
    const content = String((m && m.content) || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!content) return;
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += ' ' + content;
    else msgs.push({ role, content });
  });
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  return msgs.length && msgs[msgs.length - 1].role === 'user' ? msgs : null;
}

let day = '', usedToday = 0;

async function talk(req, res) {
  let body;
  try { body = await readBody(req); } catch (e) { return send(res, 400, { error: 'bad request' }); }
  const messages = cleanMessages(body.messages);
  const lang = body.lang === 'fr' ? 'fr' : 'en';
  if (!messages) return send(res, 400, { error: 'nothing to answer' });
  if (!API_KEY) return send(res, 500, { error: 'missing key' });

  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; usedToday = 0; }
  if (++usedToday > DAILY_LIMIT) {
    return send(res, 200, { text: lang === 'fr' ? 'Pipo est fatigué. On joue encore demain !' : 'Pipo is sleepy now. Let\'s play again tomorrow!' });
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 200, system: systemPrompt(lang), messages })
    });
    const data = await r.json();
    if (!r.ok) { console.error('Claude API error', r.status, JSON.stringify(data).slice(0, 300)); throw new Error('api'); }
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
    send(res, 200, { text: text || (lang === 'fr' ? 'Tu peux redire ?' : 'Can you say it again?') });
  } catch (e) {
    send(res, 200, { text: lang === 'fr' ? 'Oups ! Pipo n\'a pas compris. On réessaie ?' : 'Oops! Pipo missed that. Can we try again?', error: true });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (p === '/login' && req.method === 'GET') return serveFile(res, 'login.html');
  if (p === '/login' && req.method === 'POST') {
    let body = {};
    try { body = await readBody(req, 1000); } catch (e) {}
    const ok = String(body.code || '') === ACCESS_CODE;
    if (!ok) return setTimeout(() => send(res, 401, { ok: false }), 1000); // slow down guessing
    const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    return send(res, 200, { ok: true }, undefined, {
      'Set-Cookie': `pipo=${TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`
    });
  }
  // Login page assets are public; everything else (including the photos) needs the family code.
  if (p === '/manifest.webmanifest' || p.startsWith('/icons/')) return serveFile(res, p.slice(1));

  if (!authed(req)) {
    if (req.method === 'GET' && !p.startsWith('/api/')) { res.writeHead(302, { Location: '/login' }); return res.end(); }
    return send(res, 401, { error: 'login needed' });
  }
  if (p === '/api/talk' && req.method === 'POST') return talk(req, res);
  if (req.method === 'GET') return serveFile(res, p === '/' ? 'index.html' : p.slice(1));
  send(res, 404, { error: 'not found' });
});

server.listen(PORT, () => console.log(`${ROBOT} is ready on port ${PORT}`));
