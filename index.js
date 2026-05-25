process.on('uncaughtException', err => console.error('Uncaught Exception:', err));
process.on('unhandledRejection', err => console.error('Unhandled Rejection:', err));

const { Client, GatewayIntentBits, Collection, ActivityType } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
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

client.commands = new Collection();
client.queues = new Map();      // guildId -> MusicQueue
client.playlists = new Map();   // userId -> { name: [tracks] }

// Load playlist data from JSON
const PLAYLIST_FILE = './data/playlists.json';
if (fs.existsSync(PLAYLIST_FILE)) {
  const data = JSON.parse(fs.readFileSync(PLAYLIST_FILE, 'utf8'));
  for (const [userId, playlists] of Object.entries(data)) {
    client.playlists.set(userId, playlists);
  }
}

// Load all commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
const commandsData = [];

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
  commandsData.push(command.data.toJSON());
}

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Set bot activity
  client.user.setPresence({
    activities: [{ name: '🎵 /play to start music!', type: ActivityType.Listening }],
    status: 'online',
  });

  // Register slash commands
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commandsData }
    );
    console.log('✅ Slash commands registered globally.');
  } catch (err) {
    console.error('Error registering commands:', err);
  }
});

client.on('interactionCreate', async interaction => {
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

// Keep-alive for free hosting (UptimeRobot ping)
const http = require('http');
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is alive!');
}).listen(process.env.PORT || 3000, () => {
  console.log(`🌐 Keep-alive server running on port ${process.env.PORT || 3000}`);
});

client.login(process.env.BOT_TOKEN);
