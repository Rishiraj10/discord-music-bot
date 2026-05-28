# Supabase Setup Guide

This guide will help you set up Supabase for persistent playlist storage (100% FREE).

## Step 1: Create a Supabase Account

1. Go to [https://supabase.com](https://supabase.com)
2. Click **"Start your project"**
3. Sign up with GitHub, Google, or email
4. It's completely free - no credit card required!

## Step 2: Create a New Project

1. Click **"New Project"**
2. Fill in:
   - **Name**: `discord-music-bot` (or any name you like)
   - **Database Password**: Create a strong password (save it somewhere safe)
   - **Region**: Choose the closest region to your Render server
3. Click **"Create new project"**
4. Wait 1-2 minutes for the project to be created

## Step 3: Create the Playlists Table

1. In your Supabase project, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Copy and paste this SQL code:

```sql
-- Create playlists table
CREATE TABLE playlists (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  playlist_name TEXT NOT NULL,
  songs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, playlist_name)
);

-- Create index for faster queries
CREATE INDEX idx_playlists_user_id ON playlists(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (since this is a bot, not user-facing)
CREATE POLICY "Allow all operations" ON playlists
  FOR ALL
  USING (true)
  WITH CHECK (true);
```

4. Click **"Run"** (or press Ctrl+Enter)
5. You should see "Success. No rows returned"

## Step 4: Get Your API Credentials

1. Click **"Settings"** (gear icon) in the left sidebar
2. Click **"API"** under Project Settings
3. You'll see two important values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public** key (under "Project API keys")
4. Copy both values - you'll need them next

## Step 5: Add Credentials to Render

1. Go to your Render dashboard
2. Click on your `discord-music-bot` service
3. Click **"Environment"** in the left sidebar
4. Add these two new environment variables:
   - **Key**: `SUPABASE_URL`  
     **Value**: Your Project URL from Step 4
   - **Key**: `SUPABASE_ANON_KEY`  
     **Value**: Your anon public key from Step 4
5. Click **"Save Changes"**
6. Render will automatically redeploy your bot

## Step 6: Test It!

1. Wait for the bot to redeploy (1-2 minutes)
2. In Discord, create a playlist:
   ```
   /playlist create my-favorites
   ```
3. Add a song:
   ```
   /playlist addurl name:my-favorites url:https://youtube.com/watch?v=...
   ```
4. Restart your bot on Render (or wait for it to restart naturally)
5. Check if your playlist is still there:
   ```
   /playlist list
   ```

If you see your playlist after restart, **it's working!** 🎉

## Troubleshooting

### "Supabase not configured" warning
- Make sure you added both `SUPABASE_URL` and `SUPABASE_ANON_KEY` to Render
- Check that there are no extra spaces in the values
- Redeploy the bot after adding the variables

### Playlists not saving
- Check the Render logs for any Supabase errors
- Verify the SQL table was created correctly in Supabase
- Make sure RLS policies are set up (Step 3)

### Can't see playlists in Supabase dashboard
- Go to Supabase → Table Editor → playlists
- You should see your playlists there
- If empty, the bot might not be saving correctly (check logs)

## Free Tier Limits

Supabase free tier includes:
- ✅ 500 MB database storage (plenty for playlists!)
- ✅ Unlimited API requests
- ✅ No credit card required
- ✅ Never expires

Your playlists will now persist forever, even when the bot restarts! 🎵
