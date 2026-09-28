import { NextResponse } from "next/server";
import { z } from "zod";
import { toDatabaseCharacter, EverBondCharacterInput } from "@/lib/character-import";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const ImportRequest = z.object({
  characters: z.array(z.any()).min(1)
});

export async function POST(request: Request) {
  const importSecret = process.env.CHARACTER_IMPORT_SECRET;
  const providedSecret = request.headers.get("x-everbond-import-secret");

  if (importSecret && providedSecret !== importSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = ImportRequest.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid import payload" }, { status: 400 });

  const supabase = getSupabaseServiceClient();
  const rows = (parsed.data.characters as EverBondCharacterInput[]).map(toDatabaseCharacter);

  const { error, count } = await supabase.from("characters").upsert(rows, { onConflict: "seed_id", count: "exact" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, imported: count ?? rows.length });
}
