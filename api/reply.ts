import { reply } from "../server/handlers";

export const config = { runtime: "nodejs" };

export function POST(request: Request) {
  return reply(request);
}
