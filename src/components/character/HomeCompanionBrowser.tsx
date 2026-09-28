"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Brain, ChevronDown, Coins, Gift, Heart, Image, MessageCircle, Mic2, Search, Sparkles, WandSparkles } from "lucide-react";
import type { Character, CharacterCategory } from "@/types/character";
import { CharacterGrid } from "@/components/character/CharacterGrid";
import { UgPreviewGallery } from "@/components/character/UgPreviewGallery";
import { useCharacterBrowser } from "@/components/character/useCharacterBrowser";
import { useSiteLanguage } from "@/lib/site-language";

const groups: { id: CharacterCategory; title: string }[] = [
  { id: "everbond-girls", title: "AI Girlfriends" },
  { id: "anime-fantasy", title: "Anime & Fantasy" },
  { id: "everbond-guys", title: "AI Boyfriends" },
  { id: "public-creations", title: "Community" }
];
const moods = ["Romance", "Comfort", "Protective", "Flirty", "Fantasy", "Gothic", "Adventure", "Mystery"];
const features = [
  { icon: MessageCircle, title: "Chat & Roleplay" },
  { icon: Image, title: "Generate Images" },
  { icon: Mic2, title: "Video & Voice" },
  { icon: Brain, title: "Memory" },
  { icon: Coins, title: "KissCoins" },
  { icon: Gift, title: "Gift Shop" }
];

export function HomeCompanionBrowser({ characters: initial }: { characters: Character[] }) {
  const { language } = useSiteLanguage();
  const browser = useCharacterBrowser(initial, "everbond-girls", language, "ug-home-discover");
  const [showAllTags, setShowAllTags] = useState(false);
  return (
    <main className="ug-home" onClickCapture={(event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('a[href^="/chat/"]')) browser.rememberPosition();
    }}>
      <section className="ug-hero">
        <div className="ug-hero-orbit ug-orbit-one" aria-hidden="true"><Heart size={33}/></div>
        <div className="ug-hero-orbit ug-orbit-two" aria-hidden="true"><Heart size={23}/></div>
        <div className="ug-hero-orbit ug-orbit-three" aria-hidden="true"><Sparkles size={29}/></div>
        <div className="ug-hero-portrait">
          <img src="/ug-hero-portrait.webp" alt="Portrait illustration of an AI companion" />
        </div>
        <div className="ug-hero-content">
          <div className="ug-hero-eyebrow"><span className="ug-mini-heart">♥</span> YOUR WORLD. YOUR STORY.</div>
          <img className="ug-hero-logo" src="/ug-lips-logo.svg" alt="" width="108" height="85" />
          <h1>Uncensored<br /><em>Girlfriend</em></h1>
          <p className="ug-hero-script">Your companion. Your imagination.</p>
          <p className="ug-hero-description">Meet a companion who feels like your own. Chat, roleplay, share images and videos, and connect through voice — all in a world you create.</p>
          <div className="ug-hero-buttons">
            <Link className="ug-button-primary" href="/characters">Explore AI Girlfriends <ArrowRight size={18}/></Link>
            <Link className="ug-button-outline" href="/create">Create Your Girlfriend</Link>
          </div>
          <div className="ug-feature-list">{features.map(({ icon:Icon,title }) => <span key={title}><Icon size={18}/>{title}</span>)}</div>
        </div>
      </section>

      <section className="ug-discover-section" id="discover">
        <div className="ug-section-top">
          <div><p className="ug-kicker"><Sparkles size={15}/> FIND YOUR PERSON</p><h2>Explore <span>companions</span></h2><p className="ug-section-sub">Every connection starts somewhere. Find yours.</p></div>
          <Link href="/create" className="ug-button-outline ug-create-shortcut"><WandSparkles size={16}/> Create your own</Link>
        </div>
        <div className="ug-discover-controls">
          <div className="ug-category-tabs" role="group" aria-label="Companion categories">
            {groups.map((group)=><button key={group.id} type="button" onClick={()=>browser.setCategory(group.id)} className={browser.category===group.id?"active":""}>{group.title}</button>)}
          </div>
          <label className="ug-search-field"><Search size={18}/><span className="sr-only">Search characters</span><input value={browser.query} onChange={(e)=>browser.setQuery(e.target.value)} placeholder="Search companions..." /></label>
        </div>
        <div className="ug-mood-row" role="group" aria-label="Filter by personality">
          <span>Explore by vibe:</span>
          {moods.slice(0,showAllTags?moods.length:4).map((mood)=><button key={mood} type="button" onClick={()=>browser.setTag(browser.tag===mood?"":mood)} className={browser.tag===mood?"active":""}>{mood}</button>)}
          <button type="button" className="ug-mood-more" onClick={()=>setShowAllTags(!showAllTags)} aria-expanded={showAllTags}>{showAllTags?"Less":"More"}<ChevronDown size={14}/></button>
          <button type="button" className="ug-sort" onClick={browser.toggleOrder}>Sort: {browser.order === "lowest" ? "Lowest" : "Highest"}</button>
        </div>
        {browser.characters.length > 0 ? <CharacterGrid characters={browser.characters} /> :
          !browser.loading && !browser.query && !browser.tag && browser.category === "everbond-girls" ? <UgPreviewGallery /> :
          <div className="ug-empty-state"><Heart size={30}/><h3>{browser.loading?"Finding your companions...":"Gallery preview"}</h3><p>{browser.loading?"Just a moment.":"Connect your separate Supabase database to load real companions."}</p><Link href="/create" className="ug-button-primary">Create a companion <ArrowRight size={17}/></Link></div>}
        {browser.hasMore && <div className="ug-load-more"><button type="button" disabled={browser.loading} onClick={browser.loadMore} className="ug-button-outline">{browser.loading?"Loading...":"Discover more companions"}</button></div>}
      </section>
    </main>
  );
}
