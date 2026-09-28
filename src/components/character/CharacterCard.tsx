import Link from "next/link";
import { MessageCircle, Sparkles } from "lucide-react";
import { FavoriteButton } from "@/components/character/FavoriteButton";
import type { Character } from "@/types/character";

/** Portrait-first gallery card; uses the existing character record and routes. */
export function CharacterCard({ character, priority = false }: {
  character: Character; priority?: boolean; compact?: boolean;
}) {
  const excerpt = character.tagline?.trim() || character.archetype?.trim() ||
    character.description?.trim() || "Start a conversation";
  return (
    <article className="ug-character-card group">
      <Link href={`/chat/${character.slug}`} className="ug-card-link" aria-label={`Chat with ${character.name}`}>
        <img src={character.image} alt={character.name} loading={priority ? "eager" : "lazy"} />
        <div className="ug-card-shade" />
        <span className="ug-card-sparkle" aria-hidden="true"><Sparkles size={17}/></span>
        <div className="ug-card-copy">
          <div className="ug-card-name"><h3>{character.name}</h3><MessageCircle size={17}/></div>
          <p>{excerpt}</p>
        </div>
      </Link>
      <FavoriteButton characterId={character.id} characterName={character.name}
        characterImage={character.image} className="ug-card-favorite" iconSize={20} />
    </article>
  );
}
