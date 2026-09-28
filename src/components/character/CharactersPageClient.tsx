"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, Sparkles, ArrowDownUp, Heart } from "lucide-react";
import type { Character, CharacterCategory } from "@/types/character";
import { CharacterGrid } from "@/components/character/CharacterGrid";
import { UgPreviewGallery } from "@/components/character/UgPreviewGallery";
import { useCharacterBrowser } from "@/components/character/useCharacterBrowser";
import { useSiteLanguage } from "@/lib/site-language";

const groups: { id: CharacterCategory; label: string }[] = [
  { id: "everbond-girls", label: "AI Girlfriends" },
  { id: "anime-fantasy", label: "Anime & Fantasy" },
  { id: "everbond-guys", label: "AI Boyfriends" },
  { id: "public-creations", label: "Community" }
];
const moods = ["Romance", "Comfort", "Protective", "Flirty", "Fantasy", "Gothic", "Mystery", "Campus", "Adventure", "Slice of Life"];

export function CharactersPageClient({ characters: initial }: { characters: Character[] }) {
  const { language } = useSiteLanguage();
  const browser = useCharacterBrowser(initial,"everbond-girls",language,"ug-explore");
  const [mobileFilters,setMobileFilters] = useState(false);
  const filterPanel = <>
    <div className="ug-filter-block"><p>Discover</p>
      <button type="button" className={!browser.tag?"selected":""} onClick={()=>browser.setTag("")}><Sparkles size={17}/> All companions</button>
      <button type="button" onClick={browser.toggleOrder}><ArrowDownUp size={17}/> {browser.order === "lowest"?"Sort: Lowest":"Sort: Highest"}</button>
    </div>
    <div className="ug-filter-block"><p>Categories</p>{groups.map(group=><button type="button" key={group.id} className={browser.category===group.id?"selected":""} onClick={()=>browser.setCategory(group.id)}><Heart size={16}/>{group.label}</button>)}</div>
    <div className="ug-filter-block"><p>Personality & vibe</p>{moods.map(mood=><button key={mood} type="button" className={browser.tag===mood?"selected":""} onClick={()=>browser.setTag(browser.tag===mood?"":mood)}>{mood}</button>)}</div>
  </>;
  return <main className="ug-explore-page" onClickCapture={(event)=>{const target=event.target;if(target instanceof Element&&target.closest('a[href^="/chat/"]'))browser.rememberPosition();}}>
    <div className="ug-explore-header"><p className="ug-kicker"><Sparkles size={15}/> MEET YOUR MATCH</p><h1>Explore <em>companions</em></h1><p>Find the personality, story and connection you're looking for.</p></div>
    <div className="ug-explore-layout"><aside className="ug-explore-filters" aria-label="Explore filters">{filterPanel}</aside>
      <section className="ug-explore-results"><div className="ug-explore-search"><label className="ug-search-field"><Search size={20}/><span className="sr-only">Search companions</span><input autoFocus={false} value={browser.query} onChange={e=>browser.setQuery(e.target.value)} placeholder="Search names, personality, or style..."/></label><button type="button" className="ug-filter-toggle" aria-expanded={mobileFilters} onClick={()=>setMobileFilters(!mobileFilters)}><SlidersHorizontal size={19}/><span>Filters</span></button></div>
      {mobileFilters&&<div className="ug-mobile-filters">{filterPanel}</div>}
      <div className="ug-results-heading"><h2>{groups.find(group=>group.id===browser.category)?.label}</h2><span>{browser.characters.length} companions</span></div>
      {browser.characters.length>0?<CharacterGrid characters={browser.characters}/>:(!browser.loading&&!browser.query&&!browser.tag&&browser.category==="everbond-girls")?<UgPreviewGallery/>:<div className="ug-empty-state"><Heart size={32}/><h3>{browser.loading?"Loading...":"No companions to display"}</h3><p>{browser.loading?"Loading your gallery":"Connect your new Supabase project or change the filters."}</p></div>}
      {browser.hasMore&&<div className="ug-load-more"><button type="button" className="ug-button-primary" disabled={browser.loading} onClick={browser.loadMore}>{browser.loading?"Loading...":"Load more"}</button></div>}
      </section></div>
  </main>;
}
