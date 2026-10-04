# Project D — Diary

## Publish the diary

1. Edit the diary on localhost. Photos, videos, audio, text, formatting, page layouts, profile details, and the ink theme continue to be stored by the editor as before.
   - Use the existing **Add photo** / **Add video** controls to select files from `image/`. Selected media is saved with the diary and included in export; files not used by a diary page are not exported. Re-exporting removes media files that are no longer referenced.
2. Open the bottom `⋯` menu and choose **Export for publishing**.
   - In Chrome or Edge, choose the Project D folder that contains its `package.json` (`"name": "project-d"`). The app verifies that folder, then exports to its `public/diary/`. It asks you to choose the project folder on every export to avoid silently writing into an old or different checkout; the last folder is only used as the picker's starting location.
   - In other browsers, download `diary-publish.zip` and extract its `diary` folder into `project-d/public/`.
   - Files over 50 MB are listed. Any individual media file over 95 MB stops the export; reduce or remove that file before trying again.
3. On another computer or localhost origin, receive the project files and open the app in development. Choose **Load published version into editor** from the `⋯` menu to copy the published pages and media into that browser's editable diary. Confirm the prompt first: the current diary pages on that computer will be replaced, but existing media records will not be deleted.
4. Commit and push the exported diary:

   ```sh
   git add . && git commit -m "Update diary" && git push
   ```

5. Configure Render as a **Static Site** with build command `npm install && npm run build` and publish directory `dist`. Render redeploys automatically after a push.

Vite copies `public/diary/` into `dist/diary/` during `npm run build`. The deployed site fetches that published diary and media directly and is read-only. In development, use **Preview published version** in the `⋯` menu to check the exported diary before publishing.
