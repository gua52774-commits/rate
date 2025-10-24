const { Telegraf, Markup, session } = require('telegraf');
const crypto = require('crypto');
const { createCanvas } = require('canvas');

// Konfigurasi dasar
const BOT_TOKEN = '7524016177:AAEDhnG7UZ2n8BL6dXQA66_gi1IzReTazl4';
const PUBLIC_CHANNEL_ID = '-1002857800900';
const ADMIN_ID = 6468926488;
const TOKEN_VALID_MS = 24 * 60 * 60 * 1000; // 24 jam

const bot = new Telegraf(BOT_TOKEN);
bot.use(session({ defaultSession: () => ({}) }));

let botActive = true;
const blockedUsers = new Set();
const mediaStore = new Map();

// ===== Utility =====
function generateToken(length = 4) {
  return crypto.randomBytes(length).toString('hex');
}

function getUserDisplay(user) {
  if (!user) return 'Tanpa Nama';
  if (user.username) return `@${user.username}`;
  return `[${user.first_name}](tg://user?id=${user.id})`;
}

async function sendSafeMessage(userId, message, extra = {}) {
  try {
    await bot.telegram.sendMessage(userId, message, extra);
  } catch (err) {
    if (err.code === 403) {
      blockedUsers.add(userId);
      console.warn(`❌ User ${userId} memblokir bot.`);
    }
  }
}

// ===== Menu Utama =====
async function showMainMenu(ctx) {
  const markup = Markup.keyboard([
    ['📊 Rate Pap', '📸 Kirim Pap'],
    ['📨 Menfes', '🎭 Profile'],
    ['🎥 Beli Video Premium']
  ]).resize();

  await ctx.reply('Selamat datang! Pilih menu di bawah ini:', markup);
}

// ===== Start =====
bot.start(async (ctx) => {
  ctx.session = {};
  await showMainMenu(ctx);
});

// ===== Menu Kirim Pap =====
bot.hears('📸 Kirim Pap', async (ctx) => {
  ctx.session.state = 'kirimPap';
  await ctx.reply('Ingin kirim pap sebagai?', Markup.keyboard([
    ['🙈 Anonim', '🪪 Identitas'],
    ['🔙 Kembali']
  ]).resize());
});

bot.hears('🙈 Anonim', async (ctx) => {
  if (ctx.session.state === 'kirimPap') {
    ctx.session.kirimPap = { mode: 'Anonim', status: 'menunggu_media' };
    await ctx.reply('✅ Kamu kirim sebagai *Anonim*. Sekarang kirim media-nya.', { parse_mode: 'Markdown' });
  } else if (ctx.session.state === 'menfes') {
    ctx.session.menfes = { mode: 'Anonim', status: 'menunggu_pesan' };
    await ctx.reply('✅ Kamu kirim menfes sebagai *Anonim*. Sekarang kirim pesan kamu.', { parse_mode: 'Markdown' });
  }
});

bot.hears('🪪 Identitas', async (ctx) => {
  const username = getUserDisplay(ctx.from);
  if (ctx.session.state === 'kirimPap') {
    ctx.session.kirimPap = { mode: username, status: 'menunggu_media' };
    await ctx.reply(`✅ Kamu kirim sebagai *${username}*. Sekarang kirim media-nya.`, { parse_mode: 'Markdown' });
  } else if (ctx.session.state === 'menfes') {
    ctx.session.menfes = { mode: username, status: 'menunggu_pesan' };
    await ctx.reply(`✅ Kamu kirim menfes sebagai *${username}*. Sekarang kirim pesan kamu.`, { parse_mode: 'Markdown' });
  }
});

// ===== Kirim Media =====
bot.on(['photo', 'video', 'document'], async (ctx) => {
  const sess = ctx.session.kirimPap;
  if (!sess || sess.status !== 'menunggu_media')
    return ctx.reply('⚠️ Pilih dulu menu "📸 Kirim Pap".');

  let file = null, fileType = '';
  if (ctx.message.photo) {
    file = ctx.message.photo.pop();
    fileType = 'photo';
  } else if (ctx.message.video) {
    file = ctx.message.video;
    fileType = 'video';
  } else if (ctx.message.document) {
    file = ctx.message.document;
    fileType = 'document';
  }

  const token = generateToken();
  mediaStore.set(token, {
    fileId: file.file_id,
    fileType,
    mode: sess.mode,
    from: ctx.from.id,
    caption: ctx.message.caption || '',
    createdAt: Date.now()
  });

  ctx.session.kirimPap = null;
  await ctx.reply('✅ Media diterima! Token sudah dikirim ke admin.');
  await sendSafeMessage(ADMIN_ID, `📥 Pap baru dari ${getUserDisplay(ctx.from)}\n🔐 Token: \`${token}\``, { parse_mode: 'Markdown' });
  await sendSafeMessage(PUBLIC_CHANNEL_ID, `📸 Pap baru masuk!\n🔐 Token: <code>${token}</code>\n📝 Kirim token ini ke bot`, { parse_mode: 'HTML' });

  await showMainMenu(ctx);
});

// ===== Rate Pap =====
bot.hears('📊 Rate Pap', async (ctx) => {
  ctx.session.rating = { stage: 'menunggu_token' };
  await ctx.reply('🔢 Masukkan token pap yang ingin kamu nilai:', Markup.keyboard([
    ['🔙 Kembali']
  ]).resize());
});

// ===== Menfes =====
bot.hears('📨 Menfes', async (ctx) => {
  ctx.session.state = 'menfes';
  await ctx.reply('Ingin mengirim menfes sebagai?', Markup.keyboard([
    ['🙈 Anonim', '🪪 Identitas'],
    ['🔙 Kembali']
  ]).resize());
});

// ===== Beli Video Premium =====
bot.hears('🎥 Beli Video Premium', async (ctx) => {
  await ctx.reply(
    '🎬 Klik tautan di bawah untuk membeli video premium:\n👉 [@vvip_3_bot](https://t.me/vvip_3_bot)',
    { parse_mode: 'Markdown', disable_web_page_preview: true }
  );
});

// ===== Profile =====
bot.hears('🎭 Profile', async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  let papCount = 0;
  for (const [, val] of mediaStore) {
    if (val.from === userId) papCount++;
  }

  const width = 400, height = 200;
  const canvas = createCanvas(width, height);
  const c = canvas.getContext('2d');
  c.fillStyle = '#1e293b'; c.fillRect(0, 0, width, height);
  c.fillStyle = '#fff'; c.font = 'bold 26px Sans-serif'; c.fillText('Profile Card', 20, 40);
  c.font = '22px Sans-serif'; c.fillText(`User: ${username}`, 20, 90);
  c.font = '20px Sans-serif'; c.fillText(`Jumlah Pap: ${papCount}`, 20, 130);
  c.font = 'italic 16px Sans-serif'; c.fillStyle = '#ccc'; c.fillText('Terima kasih sudah aktif!', 20, height - 30);
  const buffer = canvas.toBuffer();

  await ctx.replyWithPhoto({ source: buffer }, { caption: `✨ Profile ${username}` });
});

// ===== Pesan Text Umum =====
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();

  if (text === '🔙 Kembali') {
    ctx.session = {};
    return showMainMenu(ctx);
  }

  // Token rating
  const rating = ctx.session.rating;
  if (rating?.stage === 'menunggu_token') {
    const data = mediaStore.get(text);
    if (!data) return ctx.reply('❌ Token tidak valid.');

    if (Date.now() - data.createdAt > TOKEN_VALID_MS) {
      mediaStore.delete(text);
      return ctx.reply('⏳ Token kedaluwarsa.');
    }

    if (ctx.from.id === data.from)
      return ctx.reply('⚠️ Kamu tidak bisa menilai pap sendiri.');

    ctx.session.rating = { stage: 'menunggu_rating', token: text, from: data.from };

    const caption = `📸 Pap oleh: *${data.mode}*${data.caption ? `\n📝 ${data.caption}` : ''}`;
    const mediaOptions = { caption, parse_mode: 'Markdown', protect_content: true };

    if (data.fileType === 'photo') await ctx.replyWithPhoto(data.fileId, mediaOptions);
    else if (data.fileType === 'video') await ctx.replyWithVideo(data.fileId, mediaOptions);
    else await ctx.replyWithDocument(data.fileId, mediaOptions);

    return ctx.reply('📝 Ketik angka rating (1–5):');
  }

  if (rating?.stage === 'menunggu_rating') {
    const val = parseInt(text);
    if (isNaN(val) || val < 1 || val > 5) return ctx.reply('Masukkan angka 1–5.');
    await ctx.reply(`✅ Terima kasih! Kamu memberi rating ${val}/5`);
    await sendSafeMessage(rating.from, `📸 Pap kamu diberi rating *${val}/5*`, { parse_mode: 'Markdown' });
    ctx.session.rating = null;
    return showMainMenu(ctx);
  }

  // Menfes kirim pesan
  if (ctx.session.menfes?.status === 'menunggu_pesan') {
    const pesan = text;
    const mode = ctx.session.menfes.mode;
    ctx.session.menfes = null;

    const fullMsg = `📨 Menfes dari ${mode}:\n\n${pesan}`;
    await sendSafeMessage(PUBLIC_CHANNEL_ID, fullMsg, { parse_mode: 'Markdown' });
    await sendSafeMessage(ADMIN_ID, fullMsg + `\n\n👤 Dari: ${getUserDisplay(ctx.from)}`, { parse_mode: 'Markdown' });

    await ctx.reply('✅ Menfes kamu sudah dikirim!');
    return showMainMenu(ctx);
  }
});

// ===== Admin Commands =====
bot.command('boton', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  botActive = true;
  await ctx.reply('🤖 Bot dinyalakan.');
});

bot.command('botoff', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  botActive = false;
  await ctx.reply('🤖 Bot dimatikan.');
});

// ===== Launch Bot =====
bot.launch().then(() => console.log('✅ Bot is running...')).catch(console.error);

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
