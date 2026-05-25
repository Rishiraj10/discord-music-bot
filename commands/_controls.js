const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { updatePlayerPanel, destroyPlayerPanel } = require('../utils/playerUI');

function getQueue(interaction, client) {
  const queue = client.queues.get(interaction.guild.id);
  if (!queue) {
    interaction.reply({ content: '❌ Nothing is playing right now!', ephemeral: true });
    return null;
  }
  return queue;
}

// ─────────────── SKIP ───────────────
const skip = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current song or multiple songs')
    .addIntegerOption(opt =>
      opt.setName('count').setDescription('Number of songs to skip (default: 1)').setMinValue(1)
    ),
  async execute(interaction, client) {
    const queue = getQueue(interaction, client);
    if (!queue) return;
    const count = interaction.options.getInteger('count') ?? 1;
    const track = queue.getCurrentTrack();
    queue.skip(count);
    await updatePlayerPanel(queue, client);
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xFFA500)
        .setDescription(`⏭ Skipped **${count}** song(s). Was playing: **${track?.title || 'Unknown'}**`)],
    });
  },
};

// ─────────────── PAUSE ───────────────
const pause = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the current song'),
  async execute(interaction, client) {
    const queue = getQueue(interaction, client);
    if (!queue) return;
    if (queue.paused) return interaction.reply({ content: '⏸ Already paused!', ephemeral: true });
    queue.pause();
    await updatePlayerPanel(queue, client);
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription('⏸ Paused the music.')] });
  },
};

// ─────────────── RESUME ───────────────
const resume = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume the paused song'),
  async execute(interaction, client) {
    const queue = getQueue(interaction, client);
    if (!queue) return;
    if (!queue.paused) return interaction.reply({ content: '▶️ Already playing!', ephemeral: true });
    queue.resume();
    await updatePlayerPanel(queue, client);
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setDescription('▶️ Resumed the music.')] });
  },
};

// ─────────────── STOP ───────────────
const stop = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop music and clear the queue'),
  async execute(interaction, client) {
    const queue = getQueue(interaction, client);
    if (!queue) return;
    queue.tracks = [];
    await destroyPlayerPanel(queue);
    queue.destroy();
    client.queues.delete(interaction.guild.id);
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('⏹ Stopped music and cleared the queue.')] });
  },
};

// ─────────────── VOLUME ───────────────
const volume = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set the playback volume')
    .addIntegerOption(opt =>
      opt.setName('level').setDescription('Volume (0–200)').setRequired(true).setMinValue(0).setMaxValue(200)
    ),
  async execute(interaction, client) {
    const queue = getQueue(interaction, client);
    if (!queue) return;
    const level = interaction.options.getInteger('level');
    queue.setVolume(level);
    await updatePlayerPanel(queue, client);
    const emoji = level === 0 ? '🔇' : level < 50 ? '🔈' : level < 100 ? '🔉' : '🔊';
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865F2)
        .setDescription(`${emoji} Volume set to **${level}%**`)],
    });
  },
};

// ─────────────── PREVIOUS ───────────────
const previous = {
  data: new SlashCommandBuilder()
    .setName('previous')
    .setDescription('Go back to the previous song'),
  async execute(interaction, client) {
    const queue = getQueue(interaction, client);
    if (!queue) return;
    queue.previous();
    await updatePlayerPanel(queue, client);
    const track = queue.getCurrentTrack();
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865F2)
        .setDescription(`⏮ Now playing: **${track?.title || 'Unknown'}**`)],
    });
  },
};

// ─────────────── LOOP ───────────────
const loop = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Set loop mode')
    .addStringOption(opt =>
      opt.setName('mode')
        .setDescription('Loop mode')
        .setRequired(true)
        .addChoices(
          { name: '🚫 Off', value: 'none' },
          { name: '🔂 Loop Current Track', value: 'track' },
          { name: '🔁 Loop Queue', value: 'queue' },
        )
    ),
  async execute(interaction, client) {
    const queue = getQueue(interaction, client);
    if (!queue) return;
    const mode = interaction.options.getString('mode');
    queue.setLoopMode(mode);
    await updatePlayerPanel(queue, client);
    const labels = { none: '🚫 Loop Off', track: '🔂 Looping current track', queue: '🔁 Looping entire queue' };
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription(`${labels[mode]}`)],
    });
  },
};

// ─────────────── SHUFFLE ───────────────
const shuffle = {
  data: new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Shuffle the queue'),
  async execute(interaction, client) {
    const queue = getQueue(interaction, client);
    if (!queue) return;
    queue.shuffle();
    await updatePlayerPanel(queue, client);
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x1DB954).setDescription('🔀 Queue shuffled!')],
    });
  },
};

// ─────────────── REMOVE ───────────────
const remove = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a song from the queue by position')
    .addIntegerOption(opt =>
      opt.setName('position').setDescription('Position in queue (1-based)').setRequired(true).setMinValue(1)
    ),
  async execute(interaction, client) {
    const queue = getQueue(interaction, client);
    if (!queue) return;
    const pos = interaction.options.getInteger('position') - 1;
    const removed = queue.remove(pos);
    if (!removed) return interaction.reply({ content: '❌ Invalid position!', ephemeral: true });
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xFF5733).setDescription(`🗑 Removed **${removed.title}** from the queue.`)],
    });
  },
};

// ─────────────── CLEAR ───────────────
const clear = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear the queue (keeps current song playing)'),
  async execute(interaction, client) {
    const queue = getQueue(interaction, client);
    if (!queue) return;
    queue.clear();
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xFF5733).setDescription('🧹 Queue cleared! Current song continues.')],
    });
  },
};

// ─────────────── JOIN / LEAVE ───────────────
const join = {
  data: new SlashCommandBuilder()
    .setName('join')
    .setDescription('Make the bot join your voice channel (24/7 mode)'),
  async execute(interaction, client) {
    await interaction.deferReply();
    const { getOrCreateQueue } = require('../utils/helpers');
    const { updatePlayerPanel } = require('../utils/playerUI');
    const { queue } = await getOrCreateQueue(interaction);
    if (!queue) return;
    queue.stay247 = true;
    queue._clearIdleTimeout();
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0x1DB954)
        .setDescription(
          `✅ Joined **${interaction.member.voice.channel.name}** in **24/7 mode**.\n` +
          'The bot stays in voice even when nothing is playing. Use `/play` or the buttons below.\n' +
          'Use `/leave` to disconnect.'
        )],
    });
    await updatePlayerPanel(queue, client);
  },
};

const leave = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Make the bot leave the voice channel'),
  async execute(interaction, client) {
    const queue = client.queues.get(interaction.guild.id);
    if (queue) {
      await destroyPlayerPanel(queue);
      queue.destroy();
      client.queues.delete(interaction.guild.id);
    }
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('👋 Left the voice channel.')],
    });
  },
};

module.exports = { skip, pause, resume, stop, volume, previous, loop, shuffle, remove, clear, join, leave };
