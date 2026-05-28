process.on('uncaughtException', err => console.error('Uncaught Exception:', err));
process.on('unhandledRejection', err => console.error('Unhandled Rejection:', err));

// Disable SSL certificate validation (for expired Lavalink certificates)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { Client, GatewayIntentBits, Collection, ActivityType } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const { Shoukaku, Connectors } = require('shoukaku');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

function cleanEnv(value) {
  if (!value) return value;
  return value.trim().replace(/^['"]|['"]$/g, '').replace(/^host\s*:\s*/i, '').trim();
}

function getLavalinkNodes() {
  const host = cleanEnv(process.env.LAVALINK_HOST);
  const password = cleanEnv(process.env.LAVALINK_PASSWORD);
  if (!host || !password) return [];

  const secure = process.env.LAVALINK_SECURE !== 'false';
  const port = cleanEnv(process.env.LAVALINK_PORT) || (secure ? '443' : '2333');
  return [{
    name: 'main',
    url: `${host}:${port}`,
    auth: password,
    secure,
  }];
}

const lavalinkNodes = getLavalinkNodes();
if (!lavalinkNodes.length) {
  console.error(
    '❌ Missing LAVALINK_HOST and LAVALINK_PASSWORD.',
    'Add them in Render → Environment (see README for free Lavalink nodes).'
  );
} else {
  client.shoukaku = new Shoukaku(new Connectors.DiscordJS(client), lavalinkNodes, {
    moveOnDisconnect: false,
    resume: false,
    reconnectTries: 5,
    reconnectInterval: 5000,
  });

  client.shoukaku.on('ready', name => console.log(`✅ Lavalink node "${name}" connected`));
  client.shoukaku.on('error', (name, err) => console.error(`Lavalink "${name}" error:`, err?.message || err));
  client.shoukaku.on('close', (name, code, reason) => console.warn(`Lavalink "${name}" closed (${code}):`, reason));
}

client.commands = new Collection();
client.queues = new Map();
client.playlists = new Map();

// Load playlists from Supabase (async, happens in background)
(async () => {
  const { loadPlaylists } = require('./utils/supabase');
  const playlists = await loadPlaylists();
  
  for (const [userId, userPlaylists] of Object.entries(playlists)) {
    client.playlists.set(userId, userPlaylists);
  }
  
  // Fallback: Try loading from local file if Supabase fails
  if (Object.keys(playlists).length === 0) {
    const PLAYLIST_FILE = './data/playlists.json';
    if (fs.existsSync(PLAYLIST_FILE)) {
      try {
        const data = JSON.parse(fs.readFileSync(PLAYLIST_FILE, 'utf8'));
        for (const [userId, userPlaylists] of Object.entries(data)) {
          client.playlists.set(userId, userPlaylists);
        }
        console.log('✅ Loaded playlists from local file (fallback)');
      } catch (err) {
        console.error('Failed to load local playlists:', err.message);
      }
    }
  }
})();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js') && !f.startsWith('_'));
const commandsData = [];

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
  commandsData.push(command.data.toJSON());
}

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setPresence({
    activities: [{ name: '🎵 /play to start music!', type: ActivityType.Listening }],
    status: 'online',
  });

  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commandsData });
    console.log('✅ Slash commands registered globally.');
  } catch (err) {
    console.error('Error registering commands:', err);
  }
});

const { handleMusicButton } = require('./utils/playerUI');

client.on('interactionCreate', async interaction => {
  if (interaction.isButton() && interaction.customId.startsWith('music_')) {
    try {
      await handleMusicButton(interaction, client);
    } catch (error) {
      console.error('Button error:', error);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error(`Error in /${interaction.commandName}:`, error);
    const msg = { content: '❌ An error occurred while running this command.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg);
    } else {
      await interaction.reply(msg);
    }
  }
});

const http = require('http');
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is alive!');
}).listen(process.env.PORT || 3000, () => {
  console.log(`🌐 Keep-alive server on port ${process.env.PORT || 3000}`);
});

client.login(process.env.BOT_TOKEN);
