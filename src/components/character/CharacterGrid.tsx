import { Character } from "@/types/character";
import { CharacterCard } from "./CharacterCard";

export function CharacterGrid({ characters }: { characters?: Character[]; compact?: boolean }) {
  const items = characters ?? [];
  return (
    <div className="v18-card-grid">
      {items.map((character, index) => (
        <CharacterCard key={character.id} character={character} priority={index < 5} />
      ))}
    </div>
  );
}
