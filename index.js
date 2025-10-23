const { Telegraf, Markup, session } = require('telegraf');
const crypto = require('crypto');
const { createCanvas } = require('canvas');

// Konstanta dan penyimpanan data
const BOT_TOKEN = '7524016177:AAEDhnG7UZ2n8BL6dXQA66_gi1IzReTazl4';
const PUBLIC_CHANNEL_ID = '-1002857800900';
const ADMIN_ID = 6468926488; // Pastikan tipe number sama dengan ctx.from.id
const TOKEN_VALID_MS = 24 * 60 * 60 * 1000; // Token berlaku 24 jam

const bot = new Telegraf(BOT_TOKEN);
bot.use(session({ defaultSession: () => ({}) }));

// Status bot: aktif atau tidak
let botActive = true;

const blockedUsers = new Set();
const mediaStore = new Map();

// Array stiker ID untuk fitur no 9 (stiker random)
const STICKER_IDS = [
  'CAACAgUAAxkBAAEBHx5goVpuC1hy7Xy3Jm2dlwEVxmSU-wACJgADVp29CpmMGbK9REjMJAQ', // contoh stiker ID
  'CAACAgUAAxkBAAEBHx9goVpPp2Ftz6hlkYZ2y9rIap17pAACLAADVp29CmWgcxFQGvG6JAQ',
  // Tambahkan stiker lain sesuai koleksimu
];

function getRandomSticker() {
  return STICKER_IDS[Math.floor(Math.random() * STICKER_IDS.length)];
}

// Middleware global untuk cek status bot
bot.use(async (ctx, next) => {
  if (!botActive && ctx.from?.id !== ADMIN_ID) {
    try {
      await ctx.reply('🤖 Maaf, bot sedang *nonaktif* untuk sementara.', { parse_mode: 'Markdown' });
    } catch {}
    return; // tidak lanjut ke handler lain
  }
  return next();
});

// Utility Functions
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
      console.warn(`❌ User ${userId} memblokir bot.`);
      blockedUsers.add(userId);
    } else {
      console.error(`❌ Gagal kirim ke ${userId}:`, err.description || err.message);
    }
  }
}

async function safeEditMessageText(ctx, text, extra = {}) {
  try {
    const msg = ctx.update?.callback_query?.message;
    if (!msg) return;

    const sameText = msg.text === text;
    const sameMarkup = JSON.stringify(msg.reply_markup) === JSON.stringify(extra.reply_markup);

    if (!sameText || !sameMarkup) {
      await ctx.editMessageText(text, extra);
    }
  } catch (err) {
    console.error('Edit error:', err.description || err.message);
  }
}

async function showMainMenu(ctx) {
  const text = 'Selamat datang! Pilih opsi:';
  const markup = Markup.inlineKeyboard([
    [Markup.button.callback('📊 Rate Pap', 'RATE_PAP')],
    [Markup.button.callback('📸 Kirim Pap', 'KIRIM_PAP')],
    [Markup.button.callback('📨 Menfes', 'MENFES')],
    [Markup.button.url('🎥 Beli Video Premium', 'https://t.me/vvip_3_bot')],
  ]);

  if (ctx.updateType === 'callback_query') {
    await ctx.answerCbQuery().catch(() => {});
    await safeEditMessageText(ctx, text, { reply_markup: markup.reply_markup });
  } else {
    await ctx.reply(text, { reply_markup: markup.reply_markup });
  }
}

// Start Command
bot.start(async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  await showMainMenu(ctx);
});

bot.action('BACK_TO_MENU', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await showMainMenu(ctx);
});

// ------------------
// 📸 KIRIM PAP (Tanpa cooldown)
// ------------------

bot.action('KIRIM_PAP', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const text = 'Ingin kirim pap sebagai?';
  const markup = Markup.inlineKeyboard([
    [Markup.button.callback('🙈 Anonim', 'KIRIM_ANON')],
    [Markup.button.callback('🪪 Identitas', 'KIRIM_ID')],
    [Markup.button.callback('🔙 Kembali', 'BACK_TO_MENU')],
  ]);
  await safeEditMessageText(ctx, text, { reply_markup: markup.reply_markup });
});

bot.action('KIRIM_ANON', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  ctx.session.kirimPap = { mode: 'Anonim', status: 'menunggu_media' };
  await safeEditMessageText(ctx, '✅ Kamu kirim sebagai: *Anonim*\nSekarang kirim media-nya.', { parse_mode: 'Markdown' });
});

bot.action('KIRIM_ID', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const username = getUserDisplay(ctx.from);
  ctx.session.kirimPap = { mode: username, status: 'menunggu_media' };
  await safeEditMessageText(ctx, `✅ Kamu kirim sebagai: *${username}*\nSekarang kirim media-nya.`, { parse_mode: 'Markdown' });
});

bot.on(['photo', 'video', 'document'], async (ctx) => {
  const sess = ctx.session.kirimPap;
  const now = Date.now();

  if (!sess || sess.status !== 'menunggu_media') {
    return ctx.reply('⚠️ Pilih dulu menu "📸 Kirim Pap".').then(() => showMainMenu(ctx));
  }

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

  if (!file?.file_id) return ctx.reply('❌ Gagal baca file. Coba lagi.').then(() => showMainMenu(ctx));

  const token = generateToken();
  sess.token = token;
  sess.status = 'selesai';

  mediaStore.set(token, {
    fileId: file.file_id,
    fileType,
    mode: sess.mode,
    from: ctx.from.id,
    caption: ctx.message.caption || '',
    createdAt: now,
  });

  await ctx.reply('✅ Media diterima! Token sudah dikirim ke admin.');

  // Kirim stiker random sebagai balasan yang fun (fitur no 9)
  const stickerId = getRandomSticker();
  if (stickerId) {
    await ctx.replyWithSticker(stickerId).catch(() => {});
  }

  await sendSafeMessage(ADMIN_ID,
    `📥 Pap baru\n👤 Dari: ${getUserDisplay(ctx.from)}\n🔐 Token: \`${token}\``,
    { parse_mode: 'Markdown' }
  );

  await sendSafeMessage(PUBLIC_CHANNEL_ID,
    `📸 Pap baru masuk!\n🔐 Token: <code>${token}</code>\n📝 Kirim token ini ke bot`,
    { parse_mode: 'HTML' }
  );

  await showMainMenu(ctx);
});

// ------------------
// 📊 RATE PAP
// ------------------

bot.action('RATE_PAP', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  ctx.session.rating = { stage: 'menunggu_token' };
  await safeEditMessageText(ctx, '🔢 Masukkan token pap yang ingin kamu nilai:', {
    reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'BACK_TO_MENU')]]).reply_markup
  });
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();

  // Help Command
  if (text.toLowerCase() === '/help') {
    await ctx.reply(`🤖 *Bantuan*\n\n📸 /start - Mulai bot\n📩 /help - Lihat bantuan\n📊 Rate Pap - Nilai\n📸 Kirim Pap - Kirim media\n📨 Menfes - Pesan anonim`, { parse_mode: 'Markdown' });
    return showMainMenu(ctx);
  }

  // Profile Command (fitur no 10)
  if (text.toLowerCase() === '/profile') {
    const userId = ctx.from.id;
    const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || 'User';

    // Hitung jumlah pap yang dikirim user
    let papCount = 0;
    for (const [, val] of mediaStore) {
      if (val.from === userId) papCount++;
    }

    try {
      const width = 400;
      const height = 200;
      const canvas = createCanvas(width, height);
      const ctx2 = canvas.getContext('2d');

      // Background
      ctx2.fillStyle = '#2C3E50';
      ctx2.fillRect(0, 0, width, height);

      // Header
      ctx2.fillStyle = '#ECF0F1';
      ctx2.font = 'bold 26px Sans-serif';
      ctx2.fillText('Profile Card', 20, 40);

      // User info
      ctx2.font = '22px Sans-serif';
      ctx2.fillText(`User: ${username}`, 20, 80);

      ctx2.font = '20px Sans-serif';
      ctx2.fillText(`Jumlah Pap Terkirim: ${papCount}`, 20, 120);

      // Footer
      ctx2.font = 'italic 16px Sans-serif';
      ctx2.fillStyle = '#BDC3C7';
      ctx2.fillText('Terima kasih sudah aktif di bot!', 20, height - 30);

      const buffer = canvas.toBuffer();

      await ctx.replyWithPhoto({ source: buffer }, { caption: `✨ Profile card untuk ${username}` });
    } catch (err) {
      console.error('Error generate profile card:', err);
      await ctx.reply('❌ Gagal membuat profile card.');
    }
    return;
  }

  // Menfes tanpa cooldown
  if (ctx.session.menfes?.status === 'menunggu_pesan') {
    const pesan = text;
    const mode = ctx.session.menfes.mode;
    ctx.session.menfes = null;

    const markup = (mode && mode !== 'Anonim')
      ? Markup.inlineKeyboard([
          [Markup.button.url('🔗 Kirim Pesan', mode.startsWith('@') ? `https://t.me/${mode.slice(1)}` : `tg://user?id=${ctx.from.id}`)]
        ])
      : null;

    const fullMsg = `📨 Menfes dari ${mode}:\n\n${pesan}`;
    const realIdentity = `\n\n👤 Dari user: ${getUserDisplay(ctx.from)}`;

    await sendSafeMessage(PUBLIC_CHANNEL_ID, fullMsg, {
      parse_mode: 'Markdown',
      reply_markup: markup?.reply_markup,
    });

    await sendSafeMessage(ADMIN_ID, fullMsg + realIdentity, {
      parse_mode: 'Markdown',
      reply_markup: markup?.reply_markup,
    });

    await ctx.reply('✅ Menfes kamu sudah dikirim!');
    return showMainMenu(ctx);
  }

  // Token Rating
  const rating = ctx.session.rating;
  if (rating?.stage === 'menunggu_token') {
    const data = mediaStore.get(text);
    if (!data) {
      await ctx.reply('❌ Token tidak valid atau sudah kedaluwarsa.');
      return showMainMenu(ctx);
    }

    if (Date.now() - data.createdAt > TOKEN_VALID_MS) {
      mediaStore.delete(text);
      await ctx.reply('⏳ Token ini sudah kedaluwarsa.');
      return showMainMenu(ctx);
    }

    if (ctx.from.id === data.from) {
      await ctx.reply('⚠️ Kamu tidak bisa menilai pap sendiri.');
      return showMainMenu(ctx);
    }

    ctx.session.rating = { stage: 'menunggu_rating', token: text, from: data.from };

    const caption = `📸 Pap oleh: *${data.mode}*${data.caption ? `\n📝 ${data.caption}` : ''}`;
    const mediaOptions = { caption, parse_mode: 'Markdown', protect_content: true };

    if (data.fileType === 'photo') {
      await ctx.replyWithPhoto(data.fileId, mediaOptions);
    } else if (data.fileType === 'video') {
      await ctx.replyWithVideo(data.fileId, mediaOptions);
    } else {
      await ctx.replyWithDocument(data.fileId, mediaOptions);
    }

    return ctx.reply('📝 Pilih rating (1–5):', Markup.inlineKeyboard([
      [1, 2, 3, 4, 5].map(n => Markup.button.callback(`${n}`, `RATE_${n}`))
    ]));
  }

  if (rating?.stage === 'menunggu_rating') {
    return ctx.reply('⚠️ Pilih rating dengan tombol di bawah.');
  }
});

// Rate buttons handler
bot.action(/^RATE_(\d)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const val = parseInt(ctx.match[1]);
  const data = ctx.session.rating;

  if (!data || data.stage !== 'menunggu_rating') {
    await ctx.reply('⚠️ Tidak ada sesi rating aktif.');
    return showMainMenu(ctx);
  }

  ctx.session.rating = null;
  await ctx.reply(`✅ Terima kasih! Kamu memberi rating ${val}/5`);

  await sendSafeMessage(data.from, `📸 Foto anda telah diberi rating: *${val}/5*`, { parse_mode: 'Markdown' });
  await showMainMenu(ctx);
});

// ------------------
// 📨 MENFES
// ------------------

bot.action('MENFES', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const text = 'Ingin mengirim menfes sebagai siapa?';
  const markup = Markup.inlineKeyboard([
    [Markup.button.callback('🙈 Anonim', 'MENFES_ANON')],
    [Markup.button.callback('🪪 Identitas', 'MENFES_ID')],
    [Markup.button.callback('🔙 Kembali', 'BACK_TO_MENU')],
  ]);
  await safeEditMessageText(ctx, text, { reply_markup: markup.reply_markup });
});

bot.action('MENFES_ANON', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  ctx.session.menfes = { mode: 'Anonim', status: 'menunggu_pesan' };
  await safeEditMessageText(ctx, '✅ Kamu kirim menfes sebagai: *Anonim*\nSekarang kirim pesan kamu.', { parse_mode: 'Markdown' });
});

bot.action('MENFES_ID', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const username = getUserDisplay(ctx.from);
  ctx.session.menfes = { mode: username, status: 'menunggu_pesan' };
  await safeEditMessageText(ctx, `✅ Kamu kirim menfes sebagai: *${username}*\nSekarang kirim pesan kamu.`, { parse_mode: 'Markdown' });
});

// ------------------
// ADMIN COMMANDS
// ------------------

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

// ------------------
// START BOT
// ------------------

bot.launch().then(() => {
  console.log('Bot running...');
}).catch(console.error);

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));