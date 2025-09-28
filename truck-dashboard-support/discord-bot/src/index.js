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
  MessageFlags,
  ComponentType,
} from 'discord.js';

const {
  DISCORD_TOKEN,
  API_BASE = 'http://localhost:4000',
} = process.env;

if (!DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN missing in .env');
  process.exit(1);
}

// In-memory user JWTs set via /token (and used by buttons)
const userTokens = new Map(); // key `${guildId}:${userId}` -> token

// ---------- helpers ----------
const keyFor = (i) => `${i.guildId}:${i.user.id}`;

async function api(i, method, path, bodyOrForm) {
  const token = userTokens.get(keyFor(i));
  if (!token) {
    throw new Error('No API token set. Use /token first.');
  }

  const url = `${API_BASE}${path}`;
  const headers = { Authorization: `Bearer ${token}` };
  let body;

  if (bodyOrForm instanceof FormData) {
    body = bodyOrForm;
    // fetch will set multipart boundary automatically; don't set Content-Type
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

function pickDisplayName(user) {
  const base = (user?.username || user?.globalName || 'Driver')
    .toString()
    .replace(/[^a-zA-Z]/g, '');
  return base || 'Driver';
}

function dollar(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n));
}

// Build the purple card after extraction
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

  if (doc?.id) {
    embed.setFooter({ text: `Doc ID: ${doc.id}` });
  }
  return embed;
}

function buildActionRows(docId) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`doc:extract:${docId}`)
      .setLabel('Extract')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`doc:attach:${docId}`)
      .setLabel('Attach to Load')
      .setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`doc:create-load:${docId}`)
      .setLabel('Create/Update Load')
      .setStyle(ButtonStyle.Success),
  );
  return [row1, row2];
}

async function listDocs(i) {
  const data = await api(i, 'GET', `/documents`);
  const items = Array.isArray(data) ? data : [];
  return items;
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
  // fetch the doc so we have original_name for the embed
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

// ---------- discord client ----------
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// Ready
client.on('ready', (c) => {
  console.log(`🤖 Logged in as ${c.user.tag}`);
});

// Slash commands & component handlers
client.on('interactionCreate', async (interaction) => {
  try {
    // ----- slash: /token -----
    if (interaction.isChatInputCommand() && interaction.commandName === 'token') {
      const token = interaction.options.getString('jwt', true).trim();
      userTokens.set(keyFor(interaction), token);
      await interaction.reply({ content: '🔐 Token saved for this server/user.', flags: MessageFlags.Ephemeral });
      return;
    }

    // ----- slash: /health -----
    if (interaction.isChatInputCommand() && interaction.commandName === 'health') {
      const res = await api(interaction, 'GET', '/health');
      await interaction.reply({
        content: `API ok: \`${JSON.stringify(res)}\``,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // ----- slash: /docs -----
    if (interaction.isChatInputCommand() && interaction.commandName === 'docs') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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

    // ----- component: pick a doc -----
    if (interaction.isStringSelectMenu() && interaction.customId === 'doc:pick') {
      const docId = interaction.values?.[0];
      if (!docId) {
        await interaction.reply({ content: 'No doc selected.', flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const { embed, components } = await doExtract(interaction, docId);
      await interaction.editReply({ embeds: [embed], components });
      return;
    }

    // ----- component: Extract button -----
    if (interaction.isButton() && interaction.customId.startsWith('doc:extract:')) {
      const docId = interaction.customId.split(':')[2];
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const { embed, components } = await doExtract(interaction, docId);
      await interaction.editReply({ embeds: [embed], components });
      return;
    }

    // ----- component: Attach to Load (prompts for load id) -----
    if (interaction.isButton() && interaction.customId.startsWith('doc:attach:')) {
      const docId = interaction.customId.split(':')[2];
      // Ask user for Load ID via modal-like flow; simple prompt here:
      await interaction.reply({
        content: 'Reply with the Load ID (UUID) to attach this document to. (This will time out after 60s.)',
        flags: MessageFlags.Ephemeral,
      });

      const msg = await interaction.fetchReply();
      const filter = (m) => m.author.id === interaction.user.id;
      const collected = await interaction.channel?.awaitMessages({ filter, max: 1, time: 60_000 }).catch(() => null);
      const reply = collected?.first();
      if (!reply) {
        await interaction.followUp({ content: 'Timed out waiting for Load ID.', flags: MessageFlags.Ephemeral });
        return;
      }
      const loadId = reply.content.trim();

      try {
        const res = await api(interaction, 'POST', `/documents/${docId}/attach`, { load_id: loadId });
        await interaction.followUp({ content: `✅ Attached to load: \`${res.document?.load_id || loadId}\``, flags: MessageFlags.Ephemeral });
      } catch (e) {
        await interaction.followUp({ content: `❌ Attach failed: ${e.message}`, flags: MessageFlags.Ephemeral });
      }
      return;
    }

    // ----- component: Create/Update Load -----
    if (interaction.isButton() && interaction.customId.startsWith('doc:create-load:')) {
      const docId = interaction.customId.split(':')[2];
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const payload = await api(interaction, 'POST', `/documents/${docId}/extract`);
      const x = payload?.extracted || {};

      // Create/Update via your loads POST (idempotent signature handled server-side)
      const created = await api(interaction, 'POST', `/loads`, {
        pickup_date: x.pickup_date,
        delivery_date: x.delivery_date,
        origin: x.origin,
        destination: x.destination,
        miles: x.miles,
        gross_pay: x.gross_pay,
        broker_fee: 0,
        fuel_cost: 0,
        tolls: 0,
        maintenance_cost: 0,
        other_costs: 0,
        notes: `Created from doc ${docId}`,
        status: x.pickup_date && x.delivery_date ? 'planned' : 'planned',
      });

      // Attach the document to the created load
      try {
        await api(interaction, 'POST', `/documents/${docId}/attach`, { load_id: created.id });
      } catch { /* ignore */ }

      await interaction.editReply({
        content: `✅ Load created/updated: \`${created.id}\` (${created.origin || '??'} → ${created.destination || '??'})`,
      });
      return;
    }

    // ----- slash: /upload (attachment + type) -----
    if (interaction.isChatInputCommand() && interaction.commandName === 'upload') {
      const attachment = interaction.options.getAttachment('file', true);
      const docType = interaction.options.getString('type', true); // 'rate' | 'bol' | 'other'

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const buf = await fetch(attachment.url).then((r) => r.arrayBuffer());
      const file = new File([buf], attachment.name || 'upload', { type: attachment.contentType || 'application/octet-stream' });
      const form = new FormData();
      form.set('doc_type', docType);
      form.append('files', file, file.name);

      let uploaded;
      try {
        uploaded = await api(interaction, 'POST', `/documents/upload`, form);
      } catch (e) {
        await interaction.editReply({ content: `❌ Upload failed: ${e.message}` });
        return;
      }

      const doc = uploaded?.documents?.[0];
      if (!doc) {
        await interaction.editReply({ content: '✅ Uploaded, but no document returned.' });
        return;
      }

      // Auto-extract + show card
      let extracted;
      try {
        extracted = await api(interaction, 'POST', `/documents/${doc.id}/extract`);
      } catch (e) {
        await interaction.editReply({
          content: `✅ Uploaded as ${doc.original_name}\n⚠️ Extract failed: ${e.message}`,
        });
        return;
      }

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

    // Unknown command/component
    if (interaction.isChatInputCommand()) {
      await interaction.reply({ content: `Unknown command: ${interaction.commandName}`, flags: MessageFlags.Ephemeral });
    }
  } catch (err) {
    console.error('Interaction error:', err);
    // Best effort safe reply
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: `❌ ${err.message || 'Something went wrong.'}` }).catch(() => {});
    } else {
      await interaction.reply({ content: `❌ ${err.message || 'Something went wrong.'}`, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

client.on('error', (e) => console.error('Client error:', e));
client.login(DISCORD_TOKEN);
