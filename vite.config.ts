import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import type { IncomingMessage } from "node:http";

// Serves /api/* locally with the same handlers Vercel uses, so `npm run dev` just works.
function devApi(): Plugin {
  return {
    name: "dev-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const route = req.url?.split("?")[0];
        if (req.method !== "POST" || (route !== "/api/transcribe" && route !== "/api/reply")) return next();
        try {
          const h = await server.ssrLoadModule("/server/handlers.ts");
          const request = await toRequest(req);
          const response: Response = await (route === "/api/transcribe" ? h.transcribe : h.reply)(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
    },
  };
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  return new Request(`http://localhost${req.url}`, { method: req.method, headers, body: Buffer.concat(chunks) });
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), "")); // expose .env to server handlers
  return {
    plugins: [react(), tailwindcss(), devApi()],
    resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  };
});
