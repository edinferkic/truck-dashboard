// discord-bot/src/deploy-commands.js
import 'dotenv/config';
import { REST } from '@discordjs/rest';
import { Routes, ApplicationCommandOptionType as Opt } from 'discord-api-types/v10';

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  console.error('❌ Missing env: DISCORD_TOKEN, DISCORD_CLIENT_ID');
  process.exit(1);
}

/**
 * NOTE: All required options must come before optional ones.
 * This set matches src/index.js: /token, /health, /docs, /upload
 */
const commands = [
  {
    name: 'token',
    description: 'Save your API JWT (ephemeral).',
    type: 1,
    options: [
      {
        name: 'jwt',
        description: 'Your API token from truck-dashboard',
        type: Opt.String,
        required: true,
      },
    ],
  },
  {
    name: 'health',
    description: 'Ping the truck API (/healthz/ping).',
    type: 1,
  },
  {
    name: 'docs',
    description: 'List your documents and pick one to act on.',
    type: 1,
  },
  {
    name: 'upload',
    description: 'Upload a document (rate/bol/other). Attach a file.',
    type: 1,
    options: [
      {
        name: 'file',
        description: 'PDF/JPG/PNG to upload',
        type: Opt.Attachment,
        required: true,
      },
      {
        name: 'type',
        description: 'Document type',
        type: Opt.String,
        required: true,
        choices: [
          { name: 'rate', value: 'rate' },
          { name: 'bol', value: 'bol' },
          { name: 'other', value: 'other' },
        ],
      },
    ],
  },
  // If you later add explicit commands for extract/attach/create-load,
  // you can re-enable those here and handle them in index.js.
];

async function main() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  if (GUILD_ID) {
    console.log('🚀 Deploying GUILD commands…');
    await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, GUILD_ID), { body: commands });
    console.log(`✅ Deployed to guild ${GUILD_ID}: ${commands.map(c => c.name).join(', ')}`);
  } else {
    console.log('🌎 Deploying GLOBAL commands (may take up to ~1 hour)…');
    await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: commands });
    console.log(`✅ Deployed globally: ${commands.map(c => c.name).join(', ')}`);
  }
}

main().catch((err) => {
  console.error('❌ Deploy failed:', err);
  process.exit(1);
});
