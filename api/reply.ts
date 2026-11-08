import { reply } from "../server/handlers.js";

export const config = { runtime: "nodejs" };

export function POST(request: Request) {
  return reply(request);
}
