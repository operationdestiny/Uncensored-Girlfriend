import { Heart, Sparkles } from "lucide-react";

const images = [
  "0033e195aefedd883962410199b612d0.webp",
  "005c39ba8a1739bf1db5f5b1097f382d.webp",
  "00905bbcacb3d11862b219f108d2f942.webp",
  "00d8e0708c37557ad14b5741fd184d55.webp",
  "00db4082f46731b7de136d566b1d3adf.webp",
  "00e88805fed395852e4651d9135e7d8f.webp"
];
/** Display-only design preview; never implies demo profiles are real or clickable. */
export function UgPreviewGallery() {
  return <div className="ug-preview-wrap">
    <p className="ug-preview-note"><Sparkles size={15}/> Gallery preview — connect your own Supabase database to show live companions</p>
    <div className="v18-card-grid ug-preview-grid">{images.map((file,index)=><div key={file} className="ug-character-card ug-preview-card">
      <img src={`/character-assets/everbond-girls/${file}`} alt={`Gallery layout preview ${index+1}`} loading="lazy" />
      <div className="ug-card-shade"/><span className="ug-preview-like"><Heart size={17}/></span>
      <div className="ug-card-copy"><h3>Preview {String(index+1).padStart(2,"0")}</h3><p>Visual layout only</p></div>
    </div>)}</div>
  </div>;
}
