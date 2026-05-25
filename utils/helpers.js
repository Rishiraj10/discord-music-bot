const { EmbedBuilder } = require('discord.js');
const { VoiceConnectionStatus } = require('@discordjs/voice');
const MusicQueue = require('../MusicQueue');

/**
 * Gets or creates a MusicQueue for a guild.
 */
async function getOrCreateQueue(interaction) {
  const { client, guild, channel } = interaction;
  const member = interaction.member;

  const voiceChannel = member?.voice?.channel;
  if (!voiceChannel) {
    await replyOrEdit(interaction, { content: '❌ You must be in a voice channel!', ephemeral: true });
    return { queue: null };
  }

  let queue = client.queues.get(guild.id);
  let created = false;

  if (!queue) {
    queue = new MusicQueue(guild.id, channel, voiceChannel);
    client.queues.set(guild.id, queue);
    created = true;
    try {
      await queue.connect();
    } catch (e) {
      client.queues.delete(guild.id);
      await replyOrEdit(interaction, { content: `❌ ${e.message}`, ephemeral: true });
      return { queue: null };
    }
  } else {
    const needsReconnect = !queue.connection || queue.connection.state.status !== VoiceConnectionStatus.Ready;
    if (queue.voiceChannel.id !== voiceChannel.id || needsReconnect) {
      queue.voiceChannel = voiceChannel;
      queue.textChannel = channel;
      queue.connection?.destroy();
      try {
        await queue.connect();
      } catch (e) {
        await replyOrEdit(interaction, { content: `❌ ${e.message}`, ephemeral: true });
        return { queue: null };
      }
    }
  }

  return { queue, created };
}

async function replyOrEdit(interaction, response) {
  if (interaction.deferred || interaction.replied) {
    try {
      return await interaction.editReply(response);
    } catch {
      return interaction.followUp(response);
    }
  }
  return interaction.reply(response);
}

function nowPlayingEmbed(track, queue) {
  const bar = progressBar(0, 1); // Can't get real time from ytdl stream easily
  return new EmbedBuilder()
    .setColor(0x1DB954)
    .setTitle('🎵 Now Playing')
    .setDescription(`**[${track.title}](${track.url})**`)
    .setThumbnail(track.thumbnail || null)
    .addFields(
      { name: '⏱ Duration', value: track.duration || 'Live', inline: true },
      { name: '👤 Requested by', value: track.requester, inline: true },
      { name: '🔊 Volume', value: `${Math.round(queue.volume * 100)}%`, inline: true },
      { name: '🔁 Loop', value: queue.loopMode === 'none' ? 'Off' : queue.loopMode === 'track' ? '🔂 Track' : '🔁 Queue', inline: true },
      { name: '📋 Queue', value: `${queue.tracks.length} track(s)`, inline: true },
    )
    .setFooter({ text: `Track ${queue.currentIndex + 1} of ${queue.tracks.length}` });
}

function queueEmbed(queue, page = 1) {
  const perPage = 10;
  const total = queue.tracks.length;
  const pages = Math.ceil(total / perPage);
  const start = (page - 1) * perPage;
  const end = Math.min(start + perPage, total);

  const lines = queue.tracks.slice(start, end).map((t, i) => {
    const idx = start + i;
    const prefix = idx === queue.currentIndex ? '▶️' : `\`${idx + 1}.\``;
    return `${prefix} **${t.title}** — ${t.duration} *(${t.requester})*`;
  });

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`📋 Queue — ${total} track(s)`)
    .setDescription(lines.join('\n') || 'Empty queue')
    .setFooter({ text: `Page ${page}/${pages} • Loop: ${queue.loopMode} • Vol: ${Math.round(queue.volume * 100)}%` });
}

function progressBar(current, total, length = 15) {
  const filled = Math.round((current / total) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

function savePlaylists(client) {
  const fs = require('fs');
  const obj = {};
  for (const [userId, playlists] of client.playlists.entries()) {
    obj[userId] = playlists;
  }
  fs.mkdirSync('./data', { recursive: true });
  fs.writeFileSync('./data/playlists.json', JSON.stringify(obj, null, 2));
}

module.exports = { getOrCreateQueue, nowPlayingEmbed, queueEmbed, savePlaylists };
