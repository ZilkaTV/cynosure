// Local layout checks with real data: starts the Vite dev server on 127.0.0.1:5174 and sends the site's /api calls
// to the live site (read-only use; see DEV_API_PROXY in vite.config.ts).
process.env.DEV_API_PROXY = 'https://cynclan.com'
const { createServer } = await import('vite')
const server = await createServer({ server: { port: 5174, host: '127.0.0.1', strictPort: true } })
await server.listen()
server.printUrls()
