import { google } from 'googleapis';
import fs from 'fs';
import express from 'express';

const SCOPES = ['https://www.googleapis.com/auth/youtube.force-ssl'];
const TOKEN_PATH = 'token.json';
const PORT = 3000;

main();

async function main() {
  const authClient = await authenticateYouTube();
  const youtube = google.youtube({ version: 'v3', auth: authClient });
  const channel = await youtube.channels.list({
    part: 'contentDetails',
    mine: true,
  });

  // const channelId = channel.data.items[0].id;
  const uploadsId =
    channel.data.items[0].contentDetails.relatedPlaylists.uploads;

  let nextPage;
  do {
    const videos = await youtube.playlistItems.list({
      part: 'snippet',
      playlistId: uploadsId,
      maxResults: 50,
      pageToken: nextPage,
    });

    for (let item of videos.data.items) {
      const id = item.snippet.resourceId.videoId;
      const title = item.snippet.title;
      await getCaptions(id, title);
    }

    nextPage = videos.data.nextPageToken;
  } while (nextPage);

  async function getCaptions(id, title) {
    const captionsList = await youtube.captions.list({
      part: 'snippet',
      videoId: id,
    });
    const captions = captionsList.data.items;
    if (captions.length === 0) {
      console.log(`No captions available ${videoId}`);
      return;
    }
    // Just get first captions for now?
    const captionId = captions[0].id;
    const download = await youtube.captions.download({
      id: captionId,
      tfmt: 'srt',
    });

    const dir = 'captions';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    const fileTitle = title.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    const filename = `${dir}/${fileTitle}_${id}.srt`;

    const arrayBuffer = await download.data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filename, buffer);
    console.log(`Captions saved to ${filename}`);
  }
}

// First:
// Go to the Google Developers Console.
// Create a new project.
// Enable the YouTube Data API v3 for that project.
// Go to the "Credentials" tab and click "Create Credentials". Choose "OAuth 2.0 Client ID".
// For the application type, choose "Desktop app" (for testing purposes).
// Download the credentials JSON file.

async function authenticateYouTube() {
  return new Promise((resolve, reject) => {
    let oAuth2Client = createOAuthClient();

    const app = express();

    app.get('/', async (req, res) => {
      if (req.query.code) {
        const { tokens } = await oAuth2Client.getToken(req.query.code);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        oAuth2Client.setCredentials(tokens);
        res.send('Token stored to token.json');
        resolve(oAuth2Client);
      } else if (!oAuth2Client.credentials.access_token) {
        const authUrl = oAuth2Client.generateAuthUrl({
          access_type: 'offline',
          scope: SCOPES,
        });
        res.send(
          `<a href="${authUrl}">Authorize this app by visiting this link</a>`
        );
      } else {
        res.send('Already authenticated with YouTube.');
        resolve(oAuth2Client);
      }
    });

    app.listen(PORT, () => {
      if (!oAuth2Client.credentials.access_token) {
        console.log(`Authorize app at: http://localhost:${PORT}`);
      } else {
        console.log(
          `App is already authorized. Listening at: http://localhost:${PORT}`
        );
        resolve(oAuth2Client);
      }
    });
  });
}

function createOAuthClient() {
  const content = fs.readFileSync('credentials.json', 'utf-8');
  const credentials = JSON.parse(content);
  const { client_secret, client_id, redirect_uris } = credentials.installed;

  const client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );
  try {
    const token = fs.readFileSync(TOKEN_PATH, 'utf-8');
    client.setCredentials(JSON.parse(token));
  } catch (error) {
    console.log('No token found.');
  }
  return client;
}
