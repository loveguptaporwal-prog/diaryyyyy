import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

const mediaTypes = {
  '.3gp': 'video/3gpp',
  '.aac': 'audio/aac',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.flac': 'audio/flac',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.m4a': 'audio/mp4',
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.ogg': 'audio/ogg',
  '.ogv': 'video/ogg',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
}
function serveExportedDiaryInDevelopment() {
  return {
    name: 'serve-exported-diary-in-development',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!request.url || (request.method !== 'GET' && request.method !== 'HEAD')) {
          next()
          return
        }

        let pathname
        try {
          pathname = decodeURIComponent(new URL(request.url, 'http://vite.local').pathname)
        } catch {
          response.statusCode = 400
          response.end('Invalid diary asset path.')
          return
        }
        if (!pathname.startsWith('/diary/')) {
          next()
          return
        }

        const routePrefix = '/diary/'
        const assetRoot = resolve(server.config.root, 'public/diary')
        const assetPath = resolve(assetRoot, pathname.slice(routePrefix.length))
        if (!assetPath.startsWith(`${assetRoot}${sep}`)) {
          response.statusCode = 400
          response.end('Invalid diary asset path.')
          return
        }

        try {
          const contents = await readFile(assetPath)
          response.statusCode = 200
          response.setHeader('Content-Type', mediaTypes[extname(assetPath).toLowerCase()] || 'application/octet-stream')
          response.setHeader('Cache-Control', 'no-cache')
          response.end(request.method === 'HEAD' ? undefined : contents)
        } catch (error) {
          if (error.code === 'ENOENT' || error.code === 'EISDIR') {
            response.statusCode = 404
            response.end('Published diary asset not found.')
            return
          }
          server.config.logger.error(`Could not read published diary asset: ${error.message}`)
          response.statusCode = 500
          response.end('Could not read published diary asset.')
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  server: {
    watch: {
      ignored: ['**/public/diary/**'],
    },
  },
  plugins: [react(), serveExportedDiaryInDevelopment()],
})
