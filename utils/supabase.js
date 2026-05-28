const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

let supabase = null;

function getSupabaseClient() {
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn('⚠️ Supabase not configured. Playlists will not persist across restarts.');
      return null;
    }

    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase connected');
  }
  return supabase;
}

/**
 * Load all playlists from Supabase
 */
async function loadPlaylists() {
  const client = getSupabaseClient();
  if (!client) return {};

  try {
    const { data, error } = await client
      .from('playlists')
      .select('*');

    if (error) {
      console.error('Error loading playlists from Supabase:', error.message);
      return {};
    }

    // Convert array to Map structure: { userId: { playlistName: [songs] } }
    const playlists = {};
    for (const row of data || []) {
      if (!playlists[row.user_id]) {
        playlists[row.user_id] = {};
      }
      playlists[row.user_id][row.playlist_name] = row.songs || [];
    }

    console.log(`✅ Loaded ${data?.length || 0} playlists from Supabase`);
    return playlists;
  } catch (err) {
    console.error('Error loading playlists:', err.message);
    return {};
  }
}

/**
 * Save a user's playlist to Supabase
 */
async function savePlaylist(userId, playlistName, songs) {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client
      .from('playlists')
      .upsert({
        user_id: userId,
        playlist_name: playlistName,
        songs: songs,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,playlist_name'
      });

    if (error) {
      console.error('Error saving playlist to Supabase:', error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error saving playlist:', err.message);
    return false;
  }
}

/**
 * Delete a user's playlist from Supabase
 */
async function deletePlaylist(userId, playlistName) {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client
      .from('playlists')
      .delete()
      .eq('user_id', userId)
      .eq('playlist_name', playlistName);

    if (error) {
      console.error('Error deleting playlist from Supabase:', error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error deleting playlist:', err.message);
    return false;
  }
}

/**
 * Save all playlists for a user to Supabase
 */
async function saveUserPlaylists(userId, playlists) {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    // Delete all existing playlists for this user
    await client
      .from('playlists')
      .delete()
      .eq('user_id', userId);

    // Insert all playlists
    const rows = Object.entries(playlists).map(([name, songs]) => ({
      user_id: userId,
      playlist_name: name,
      songs: songs,
      updated_at: new Date().toISOString()
    }));

    if (rows.length > 0) {
      const { error } = await client
        .from('playlists')
        .insert(rows);

      if (error) {
        console.error('Error saving user playlists to Supabase:', error.message);
        return false;
      }
    }

    return true;
  } catch (err) {
    console.error('Error saving user playlists:', err.message);
    return false;
  }
}

module.exports = {
  getSupabaseClient,
  loadPlaylists,
  savePlaylist,
  deletePlaylist,
  saveUserPlaylists
};
