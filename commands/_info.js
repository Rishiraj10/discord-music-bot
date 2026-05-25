const { SlashCommandBuilder } = require('discord.js');
const { nowPlayingEmbed, queueEmbed } = require('../utils/helpers');

const nowplaying = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show the currently playing song'),
  async execute(interaction, client) {
    const queue = client.queues.get(interaction.guild.id);
    if (!queue) return interaction.reply({ content: '❌ Nothing is playing!', ephemeral: true });
    const track = queue.getCurrentTrack();
    if (!track) return interaction.reply({ content: '❌ No track loaded.', ephemeral: true });
    await interaction.reply({ embeds: [nowPlayingEmbed(track, queue)] });
  },
};

const queue = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the current queue')
    .addIntegerOption(opt =>
      opt.setName('page').setDescription('Page number').setMinValue(1)
    ),
  async execute(interaction, client) {
    const q = client.queues.get(interaction.guild.id);
    if (!q || !q.tracks.length) return interaction.reply({ content: '❌ Queue is empty!', ephemeral: true });
    const page = interaction.options.getInteger('page') ?? 1;
    await interaction.reply({ embeds: [queueEmbed(q, page)] });
  },
};

module.exports = { nowplaying, queue };
