// discord-bot/src/deploy-commands.js
import 'dotenv/config';
import { REST } from '@discordjs/rest';
import {
  Routes,
  ApplicationCommandOptionType as Opt,
} from 'discord-api-types/v10';

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID || !GUILD_ID) {
  console.error('❌ Missing env: DISCORD_TOKEN, DISCORD_CLIENT_ID, GUILD_ID');
  process.exit(1);
}

/**
 * IMPORTANT: In Discord, all required options must come before any optional options.
 * Keep that ordering below.
 */
const commands = [
  {
    name: 'health',
    description: 'Bot/connection check (ephemeral).',
    type: 1,
  },
  {
    name: 'token',
    description: 'Show whether you are logged in (ephemeral).',
    type: 1,
  },
  {
    name: 'register',
    description: 'Create a new account on the truck API (ephemeral).',
    type: 1,
    options: [
      {
        name: 'email',
        description: 'Your email',
        type: Opt.String,
        required: true,
      },
      {
        name: 'password',
        description: 'Your password',
        type: Opt.String,
        required: true,
      },
    ],
  },
  {
    name: 'login',
    description: 'Login to the truck API (ephemeral).',
    type: 1,
    options: [
      {
        name: 'email',
        description: 'Your email',
        type: Opt.String,
        required: true,
      },
      {
        name: 'password',
        description: 'Your password',
        type: Opt.String,
        required: true,
      },
    ],
  },
  {
    name: 'upload',
    description:
      'Upload a document (rate/bol). Attach a file to this command.',
    type: 1,
    options: [
      {
        name: 'doc_type',
        description: 'Type of document',
        type: Opt.String,
        required: true,
        choices: [
          { name: 'rate', value: 'rate' },
          { name: 'bol', value: 'bol' },
          { name: 'other', value: 'other' },
        ],
      },
      {
        name: 'file',
        description: 'The PDF/JPG/PNG to upload',
        type: Opt.Attachment,
        required: true,
      },
      {
        name: 'load_id',
        description: 'Optionally attach to an existing load',
        type: Opt.String,
        required: false,
      },
    ],
  },
  {
    name: 'docs',
    description: 'Show your recent documents with actions (ephemeral).',
    type: 1,
  },
  {
    name: 'doc-extract',
    description: 'Run OCR/extraction on a document (ephemeral).',
    type: 1,
    options: [
      {
        name: 'doc_id',
        description: 'Document ID',
        type: Opt.String,
        required: true,
      },
    ],
  },
  {
    name: 'doc-attach',
    description: 'Attach a document to a load (ephemeral).',
    type: 1,
    options: [
      {
        name: 'doc_id',
        description: 'Document ID',
        type: Opt.String,
        required: true,
      },
      {
        name: 'load_id',
        description: 'Load ID',
        type: Opt.String,
        required: true,
      },
    ],
  },
  {
    name: 'create-load-from-doc',
    description: 'Create/Upsert a load from a document (ephemeral).',
    type: 1,
    options: [
      {
        name: 'doc_id',
        description: 'Document ID',
        type: Opt.String,
        required: true,
      },
    ],
  },
];

async function main() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  console.log('🚀 Deploying guild commands…');
  await rest.put(
    Routes.applicationGuildCommands(DISCORD_CLIENT_ID, GUILD_ID),
    { body: commands }
  );
  console.log(
    `✅ Deployed: ${commands.map((c) => c.name).join(', ')}`
  );
}

main().catch((err) => {
  console.error('❌ Deploy failed:', err);
  process.exit(1);
});
