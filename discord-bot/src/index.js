// discord-bot/src/index.js
import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
} from 'discord.js';

// Polyfill Web APIs (Node)
import { fetch as undiciFetch, FormData as UndiciFormData, File as UndiciFile } from 'undici';
globalThis.fetch ??= undiciFetch;
globalThis.FormData ??= UndiciFormData;
globalThis.File ??= UndiciFile;

const {
  DISCORD_TOKEN,
  API_BASE = 'http://localhost:4000',
  GUILD_ID, // optional for instant guild registration
} = process.env;

if (!DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN missing in .env');
  process.exit(1);
}

// In-memory user JWTs; set via /token
const userTokens = new Map(); // key `${guildId||dm}:${userId}` -> token
const keyFor = (i) => `${i.guildId || 'dm'}:${i.user.id}`;

// ---------------- helpers ----------------
async function api(i, method, path, bodyOrForm) {
  const token = userTokens.get(keyFor(i));
  if (!token) throw new Error('No API token set. Use /token first.');

  const url = `${API_BASE}${path}`;
  const headers = { Authorization: `Bearer ${token}` };
  let body;

  if (bodyOrForm instanceof FormData) {
    body = bodyOrForm; // boundary set by undici
  } else if (bodyOrForm && typeof bodyOrForm === 'object') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(bodyOrForm);
  }

  const res = await fetch(url, { method, headers, body });
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const payload = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = isJson ? JSON.stringify(payload) : String(payload);
    throw new Error(`API ${res.status}: ${msg}`);
  }
  return payload;
}

function dollar(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n));
}

function buildExtractEmbed({ doc, suggested_label, extracted }) {
  const title = doc?.original_name ?? 'Document';
  const fields = [
    { name: 'Gross Pay', value: dollar(extracted?.gross_pay), inline: true },
    { name: 'Miles', value: extracted?.miles != null ? String(extracted.miles) : '—', inline: true },
    { name: '\u200B', value: '\u200B', inline: true },

    { name: 'Pickup Date', value: extracted?.pickup_date || '—', inline: true },
    { name: 'Delivery Date', value: extracted?.delivery_date || '—', inline: true },
    { name: '\u200B', value: '\u200B', inline: true },

    { name: 'Origin', value: extracted?.origin || '—', inline: true },
    { name: 'Destination', value: extracted?.destination || '—', inline: true },
    { name: '\u200B', value: '\u200B', inline: true },

    { name: 'Pickup State', value: extracted?.pickup_state || '—', inline: true },
    { name: 'Drop State', value: extracted?.drop_state || '—', inline: true },
    { name: 'Status', value: extracted?.status || 'planned', inline: true },
  ];

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(`**Suggested label:** ${suggested_label || '—'}`)
    .setColor(0x6f42c1)
    .addFields(fields);

  if (doc?.id) embed.setFooter({ text: `Doc ID: ${doc.id}` });
  return embed;
}

function buildActionRows(docId) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`doc:extract:${docId}`).setLabel('Extract').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`doc:attach:${docId}`).setLabel('Attach to Load').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`doc:create-load:${docId}`).setLabel('Create/Update Load').setStyle(ButtonStyle.Success),
  );
  return [row1, row2];
}

async function listDocs(i) {
  const data = await api(i, 'GET', `/documents`);
  return Array.isArray(data) ? data : [];
}

function buildDocPicker(docs) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('doc:pick')
    .setPlaceholder('Pick a document to view actions')
    .addOptions(
      ...docs.slice(0, 25).map((d) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`${(d.doc_type || 'other').toUpperCase()} • ${d.original_name}`.slice(0, 100))
          .setValue(d.id)
      )
    );
  return new ActionRowBuilder().addComponents(menu);
}

async function doExtract(i, docId) {
  const payload = await api(i, 'POST', `/documents/${docId}/extract`);
  const docList = await api(i, 'GET', `/documents`);
  const doc = (Array.isArray(docList) ? docList : []).find((d) => d.id === docId);

  return {
    embed: buildExtractEmbed({
      doc,
      suggested_label: payload?.suggested_label,
      extracted: payload?.extracted,
    }),
    components: buildActionRows(docId),
  };
}

// --------------- discord client ---------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,   // needed for awaitMessages
    GatewayIntentBits.MessageContent,  // needed to read user reply with Load ID
  ],
});

// register slash commands (global or per-guild)
async function registerCommands(appId) {
  const commands = [
    new SlashCommandBuilder()
      .setName('token')
      .setDescription('Save your API JWT (for truck-dashboard server requests)')
      .addStringOption(o => o.setName('jwt').setDescription('Your API token').setRequired(true)),
    new SlashCommandBuilder()
      .setName('health')
      .setDescription('Call server /health'),
    new SlashCommandBuilder()
      .setName('docs')
      .setDescription('List your uploaded documents and take actions'),
    new SlashCommandBuilder()
      .setName('upload')
      .setDescription('Upload a doc to the API and extract it')
      .addAttachmentOption(o => o.setName('file').setDescription('PDF/JPG/PNG').setRequired(true))
      .addStringOption(o =>
        o.setName('type')
          .setDescription('Document type')
          .setRequired(true)
          .addChoices(
            { name: 'rate', value: 'rate' },
            { name: 'bol', value: 'bol' },
            { name: 'other', value: 'other' },
          )
      ),
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  if (GUILD_ID) {
    console.log('📋 Registering guild commands (instant)…');
    await rest.put(Routes.applicationGuildCommands(appId, GUILD_ID), { body: commands });
  } else {
    console.log('📋 Registering global commands (can take time)…');
    await rest.put(Routes.applicationCommands(appId), { body: commands });
  }
}

client.once('ready', async (c) => {
  console.log(`🤖 Logged in as ${c.user.tag}`);
  try {
    await registerCommands(c.user.id);
    console.log('✅ Slash commands registered');
  } catch (e) {
    console.error('⚠️ Command registration failed:', e);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    // /token
    if (interaction.isChatInputCommand() && interaction.commandName === 'token') {
      const token = interaction.options.getString('jwt', true).trim();
      userTokens.set(keyFor(interaction), token);
      await interaction.reply({ content: '🔐 Token saved for this server/user.', ephemeral: true });
      return;
    }

    // /health
    if (interaction.isChatInputCommand() && interaction.commandName === 'health') {
      const res = await api(interaction, 'GET', '/health');
      await interaction.reply({ content: `API ok: \`${JSON.stringify(res)}\``, ephemeral: true });
      return;
    }

    // /docs
    if (interaction.isChatInputCommand() && interaction.commandName === 'docs') {
      await interaction.deferReply({ ephemeral: true });
      const docs = await listDocs(interaction);
      if (!docs.length) {
        await interaction.editReply({ content: 'No documents yet. Use **/upload** first.' });
        return;
      }
      await interaction.editReply({
        content: 'Pick a document to view actions:',
        components: [buildDocPicker(docs)],
      });
      return;
    }

    // picker -> extract + show card
    if (interaction.isStringSelectMenu() && interaction.customId === 'doc:pick') {
      const docId = interaction.values?.[0];
      if (!docId) {
        await interaction.reply({ content: 'No doc selected.', ephemeral: true });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      const { embed, components } = await doExtract(interaction, docId);
      await interaction.editReply({ embeds: [embed], components });
      return;
    }

    // button: Extract
    if (interaction.isButton() && interaction.customId.startsWith('doc:extract:')) {
      const docId = interaction.customId.split(':')[2];
      await interaction.deferReply({ ephemeral: true });
      const { embed, components } = await doExtract(interaction, docId);
      await interaction.editReply({ embeds: [embed], components });
      return;
    }

    // button: Attach -> prompt for load id
    if (interaction.isButton() && interaction.customId.startsWith('doc:attach:')) {
      const docId = interaction.customId.split(':')[2];
      await interaction.reply({
        content: 'Reply in this channel with the **Load ID (UUID)** to attach this document. (Timeout: 60s)',
        ephemeral: true,
      });

      const filter = (m) => m.author.id === interaction.user.id;
      const collected = await interaction.channel?.awaitMessages({ filter, max: 1, time: 60_000 }).catch(() => null);
      const reply = collected?.first();
      if (!reply) {
        await interaction.followUp({ content: '⏱️ Timed out waiting for Load ID.', ephemeral: true });
        return;
      }
      const loadId = reply.content.trim();

      try {
        const res = await api(interaction, 'POST', `/documents/${docId}/attach`, { load_id: loadId });
        await interaction.followUp({ content: `✅ Attached to load: \`${res.document?.load_id || loadId}\``, ephemeral: true });
      } catch (e) {
        await interaction.followUp({ content: `❌ Attach failed: ${e.message}`, ephemeral: true });
      }
      return;
    }

    // button: Create/Update Load via /documents/:id/to-load
    if (interaction.isButton() && interaction.customId.startsWith('doc:create-load:')) {
      const docId = interaction.customId.split(':')[2];
      await interaction.deferReply({ ephemeral: true });

      // ensure latest extraction
      await api(interaction, 'POST', `/documents/${docId}/extract`);
      const created = await api(interaction, 'POST', `/documents/${docId}/to-load`, {});

      const load = created?.load || created;
      await interaction.editReply({
        content: `✅ Load created/updated: \`${load.id}\`\n${load.origin || '??'} → ${load.destination || '??'}\nPickup: ${load.pickup_date?.slice(0,10) || '—'} | Delivery: ${load.delivery_date?.slice(0,10) || '—'}`,
      });
      return;
    }

    // /upload (attachment + type)
    if (interaction.isChatInputCommand() && interaction.commandName === 'upload') {
      const attachment = interaction.options.getAttachment('file', true);
      const docType = interaction.options.getString('type', true);

      await interaction.deferReply({ ephemeral: true });

      const buf = await fetch(attachment.url).then((r) => r.arrayBuffer());
      const file = new File([Buffer.from(buf)], attachment.name || 'upload', {
        type: attachment.contentType || 'application/octet-stream',
      });
      const form = new FormData();
      form.set('doc_type', docType);
      form.append('files', file, file.name);

      // upload
      const uploaded = await api(interaction, 'POST', `/documents/upload`, form);
      const doc = uploaded?.documents?.[0];

      if (!doc) {
        await interaction.editReply({ content: '✅ Uploaded, but no document returned.' });
        return;
      }

      // extract & show card
      const extracted = await api(interaction, 'POST', `/documents/${doc.id}/extract`);
      const embed = buildExtractEmbed({
        doc,
        suggested_label: extracted?.suggested_label,
        extracted: extracted?.extracted,
      });

      await interaction.editReply({
        content: `Uploaded **${doc.doc_type.toUpperCase()}** as *${doc.original_name}* (id: \`${doc.id}\`).`,
        embeds: [embed],
        components: buildActionRows(doc.id),
      });
      return;
    }

    // unknown
    if (interaction.isChatInputCommand()) {
      await interaction.reply({ content: `Unknown command: ${interaction.commandName}`, ephemeral: true });
    }
  } catch (err) {
    console.error('Interaction error:', err);
    const msg = `❌ ${err.message || 'Something went wrong.'}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: msg }).catch(() => {});
    } else {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
  }
});

client.on('error', (e) => console.error('Client error:', e));
client.login(DISCORD_TOKEN);
