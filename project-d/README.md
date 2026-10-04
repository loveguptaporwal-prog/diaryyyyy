# Project D — Diary

## Publish the diary

1. Edit the diary on localhost. Photos, videos, audio, text, formatting, page layouts, profile details, and the ink theme continue to be stored by the editor as before.
   - Use the existing **Add photo** / **Add video** controls to select files from `image/`. Selected media is saved with the diary and included in export; files not used by a diary page are not exported. Re-exporting removes media files that are no longer referenced.
2. Open the bottom `⋯` menu and choose **Export for publishing**.
   - In Chrome or Edge, choose the project's `public` folder (not the project root or `src/publishing`) the first time. The export creates or updates `public/diary/` and remembers the folder for later exports.
   - In other browsers, download `diary-publish.zip` and extract its `diary` folder into `project-d/public/`.
   - Files over 50 MB are listed. Any individual media file over 95 MB stops the export; reduce or remove that file before trying again.
3. Commit and push the exported diary:

   ```sh
   git add . && git commit -m "Update diary" && git push
   ```

4. Configure Render as a **Static Site** with build command `npm install && npm run build` and publish directory `dist`. Render redeploys automatically after a push.

Vite copies `public/diary/` into `dist/diary/` during `npm run build`. The deployed site fetches that published diary and media directly and is read-only. In development, use **Preview published version** in the `⋯` menu to check the exported diary before publishing.
