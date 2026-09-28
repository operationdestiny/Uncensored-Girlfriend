import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const secret = request.headers.get("x-import-secret");
  if (!process.env.CHARACTER_IMPORT_SECRET || secret !== process.env.CHARACTER_IMPORT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: false,
    message: "Use `npm run import:characters` locally or in a trusted one-off job. Serverless imports of 2,864 images/records can time out."
  }, { status: 400 });
}
