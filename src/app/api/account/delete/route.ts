import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import {
  getSupabaseServiceClient
} from "@/lib/supabase/server";

export const runtime = "nodejs";

type CharacterStorageRow = {
  image_storage_bucket: string | null;
  image_storage_path: string | null;
};

export async function DELETE(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "SIGNUP_REQUIRED" },
        { status: 401 }
      );
    }

    const supabase = getSupabaseServiceClient();
    const { data: ownedCharacters, error: characterError } =
      await supabase
        .from("characters")
        .select(
          "image_storage_bucket,image_storage_path"
        )
        .eq("creator_id", user.id);

    if (characterError) throw characterError;

    const storageByBucket = new Map<string, string[]>();

    for (
      const character of
      (ownedCharacters ?? []) as CharacterStorageRow[]
    ) {
      if (!character.image_storage_path) continue;

      const bucket =
        character.image_storage_bucket ||
        "character-images";
      const paths = storageByBucket.get(bucket) ?? [];
      paths.push(character.image_storage_path);
      storageByBucket.set(bucket, paths);
    }

    for (const [bucket, paths] of storageByBucket) {
      for (let index = 0; index < paths.length; index += 100) {
        const batch = paths.slice(index, index + 100);
        const { error } = await supabase.storage
          .from(bucket)
          .remove(batch);

        if (error) throw error;
      }
    }

    const { error: cleanupError } = await supabase.rpc(
      "delete_everbond_account_data",
      {
        target_user_id: user.id
      }
    );

    if (cleanupError) throw cleanupError;

    const { error: authError } =
      await supabase.auth.admin.deleteUser(
        user.id,
        false
      );

    if (authError) throw authError;

    return NextResponse.json(
      { deleted: true },
      {
        headers: {
          "Cache-Control": "private, no-store"
        }
      }
    );
  } catch (error) {
    console.error("Account deletion failed:", error);

    return NextResponse.json(
      {
        error: "ACCOUNT_DELETE_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Account deletion failed"
      },
      { status: 500 }
    );
  }
}
