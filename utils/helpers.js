const { EmbedBuilder } = require('discord.js');
const MusicQueue = require('../MusicQueue');

/**
 * Gets or creates a MusicQueue for a guild.
 */
async function getOrCreateQueue(interaction) {
  const { client, guild, channel } = interaction;

  if (!client.shoukaku) {
    await replyOrEdit(interaction, {
      content: '❌ Lavalink is not configured. Set **LAVALINK_HOST** and **LAVALINK_PASSWORD** in Render → Environment (see README).',
      ephemeral: true,
    });
    return { queue: null };
  }

  const member = interaction.member;
  const voiceChannel = member?.voice?.channel;
  if (!voiceChannel) {
    await replyOrEdit(interaction, { content: '❌ You must be in a voice channel!', ephemeral: true });
    return { queue: null };
  }

  let queue = client.queues.get(guild.id);
  let created = false;

  if (!queue) {
    queue = new MusicQueue(guild.id, channel, voiceChannel, client.shoukaku);
    client.queues.set(guild.id, queue);
    created = true;
    try {
      await queue.connect();
    } catch (e) {
      client.queues.delete(guild.id);
      await replyOrEdit(interaction, { content: `❌ ${e.message}`, ephemeral: true });
      return { queue: null };
    }
  } else if (queue.voiceChannel.id !== voiceChannel.id) {
    queue.destroy();
    client.queues.delete(guild.id);
    queue = new MusicQueue(guild.id, channel, voiceChannel, client.shoukaku);
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
    queue.textChannel = channel;
  }

  return { queue, created };
}

async function replyOrEdit(interaction, response) {
  const payload = { ...response };
  // ephemeral is only valid on the initial reply, not on editReply/followUp for public messages
  if (interaction.deferred || interaction.replied) {
    delete payload.ephemeral;
    try {
      return await interaction.editReply(payload);
    } catch {
      return interaction.followUp(payload);
    }
  }
  return interaction.reply(response);
}

function nowPlayingEmbed(track, queue) {
  const { musicPanelEmbed } = require('./playerUI');
  return musicPanelEmbed(track, queue, null);
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
    .setColor(0x3b82f6)
    .setAuthor({ name: 'PLAYLIST / QUEUE' })
    .setTitle(`${total} track(s)`)
    .setDescription(lines.join('\n') || 'Empty queue')
    .setFooter({ text: `Page ${page}/${pages} • Loop: ${queue.loopMode} • Vol: ${queue.volume}%` });
}

function progressBar(current, total, length = 15) {
  const filled = Math.round((current / total) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

function savePlaylists(client) {
  const { saveUserPlaylists } = require('./supabase');
  
  // Save each user's playlists to Supabase
  for (const [userId, playlists] of client.playlists.entries()) {
    saveUserPlaylists(userId, playlists).catch(err => {
      console.error(`Failed to save playlists for user ${userId}:`, err.message);
    });
  }
  
  // Also save to local file as backup (if filesystem persists)
  try {
    const fs = require('fs');
    const obj = {};
    for (const [userId, playlists] of client.playlists.entries()) {
      obj[userId] = playlists;
    }
    fs.mkdirSync('./data', { recursive: true });
    fs.writeFileSync('./data/playlists.json', JSON.stringify(obj, null, 2));
  } catch (err) {
    // Ignore file system errors on ephemeral storage
  }
}

module.exports = { getOrCreateQueue, nowPlayingEmbed, queueEmbed, savePlaylists };
