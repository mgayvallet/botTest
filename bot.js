require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const crypto      = require('crypto');

// ── Variables d'environnement ──────────────────────────
const TOKEN        = process.env.BOT_TOKEN;
const MINI_APP_URL = process.env.MINI_APP_URL;
const ADMIN_ID     = process.env.ADMIN_ID ? Number(process.env.ADMIN_ID) : null;

if (!TOKEN || !MINI_APP_URL) {
  console.error('❌ BOT_TOKEN et MINI_APP_URL requis dans .env');
  process.exit(1);
}

// ── Rate limiting (5 msg / 10s par user) ──────────────
const rl = new Map();
function limited(id) {
  const now = Date.now(), win = 10_000, max = 5;
  const list = (rl.get(id) || []).filter(t => now - t < win);
  list.push(now); rl.set(id, list);
  return list.length > max;
}

// ── Validation signature Telegram ─────────────────────
function validData(initData) {
  try {
    const p    = new URLSearchParams(initData);
    const hash = p.get('hash'); p.delete('hash');
    const str  = [...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
    const key  = crypto.createHmac('sha256','WebAppData').update(TOKEN).digest();
    return hash === crypto.createHmac('sha256',key).update(str).digest('hex');
  } catch { return false; }
}

// ── Sanitize input ────────────────────────────────────
const sanitize = s => (typeof s==='string' ? s.replace(/[<>&"'`]/g,'').trim().slice(0,200) : '');

// ── Bot ───────────────────────────────────────────────
const bot = new TelegramBot(TOKEN, { polling: true });
console.log('✅ Bot lancé !');

// /start
bot.onText(/\/start/, async msg => {
  const id = msg.from.id;
  if (limited(id)) return bot.sendMessage(id, '⏳ Doucement, attends quelques secondes.');
  const name = sanitize(msg.from.first_name || 'toi');
  await bot.sendMessage(id,
    `👋 Salut *${name}* !\n\nClique ci-dessous pour ouvrir la Mini App 👇`,
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[
        { text: '🚀 Ouvrir la Mini App', web_app: { url: MINI_APP_URL } }
      ]]}
    }
  );
});

// /help
bot.onText(/\/help/, msg => {
  if (limited(msg.from.id)) return;
  bot.sendMessage(msg.from.id,
    `📖 *Commandes*\n\n/start — Ouvrir la Mini App\n/help  — Aide\n/about — Infos`,
    { parse_mode: 'Markdown' }
  );
});

// /about
bot.onText(/\/about/, msg => {
  if (limited(msg.from.id)) return;
  bot.sendMessage(msg.from.id,
    `🤖 *aboulayDiopBOT* v1.0\nMini App Telegram avec sécurité intégrée.`,
    { parse_mode: 'Markdown' }
  );
});

// Données depuis la Mini App
bot.on('message', msg => {
  if (!msg.web_app_data) return;
  const id = msg.from.id;
  if (limited(id)) return;
  try {
    const data   = JSON.parse(msg.web_app_data.data);
    const action = sanitize(data.action || '');
    const rep = {
      confirm:  '✅ Confirmé !',
      profil:   '👤 Voici ton profil.',
      aide:     '💬 Support : @aboulayDiop',
      partager: '🔗 t.me/aboulayDiopBOT',
    };
    bot.sendMessage(id, rep[action] || `📨 Action : ${action}`);
    if (ADMIN_ID) bot.sendMessage(ADMIN_ID, `📊 *${action}* — user \`${id}\``, { parse_mode:'Markdown' });
  } catch(e) { console.error('web_app_data error:', e.message); }
});

// Erreurs
bot.on('polling_error', err => console.error('Polling:', err.message));
process.on('uncaughtException', err => console.error('Uncaught:', err.message));
