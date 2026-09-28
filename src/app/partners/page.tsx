import Link from "next/link";

export default function PartnersPage() {
  return <main style={{minHeight:"100vh",background:"#0b0709",color:"white",padding:"64px 20px",fontFamily:"inherit"}}><div style={{maxWidth:900,margin:"0 auto"}}>
    <div style={{color:"#ff78b2",fontWeight:900,letterSpacing:".16em",textTransform:"uppercase",fontSize:12}}>Uncensored Girlfriend Partner Program</div>
    <h1 style={{fontSize:"clamp(38px,7vw,72px)",lineHeight:1,margin:"14px 0"}}>100% → 80% → 50% for life.</h1>
    <p style={{fontSize:20,color:"#d2bec7",lineHeight:1.6,maxWidth:760}}>Share Uncensored Girlfriend with your audience using one permanent referral link. Keep 100% of Eligible Partner Profit for your first 30 earning days, 80% through day 180, and 50% for life after that.</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,margin:"32px 0"}}>{[
      ["Days 1–30","100%"],["Days 31–180","80%"],["Day 181+","50% lifetime"]
    ].map(([label,value])=><div key={label} style={{border:"1px solid #39202d",background:"#171016",borderRadius:20,padding:22}}><div style={{color:"#bca7b1"}}>{label}</div><div style={{fontSize:42,fontWeight:900,color:"#ff68aa"}}>{value}</div></div>)}</div>
    <h2>How earnings work</h2><p style={{color:"#d2bec7",lineHeight:1.7}}>Commission is not a percentage of gross purchases. It is a share of positive Eligible Partner Profit created after referred customers actually consume paid KissCoins, Uncensored Girlfriend knows the service-delivery costs, Dropp net cash is reconciled, and the platform protection reserve is applied. If positive eligible profit has not been created, no commission is created.</p>
    <h2>No application maze</h2><p style={{color:"#d2bec7",lineHeight:1.7}}>Partners Uncensored Girlfriend contacts receive a referral link and private dashboard already prepared. Activation is one click: accept the Partner Agreement and confirm you are 18+. Payout/KYC details are only needed when you actually want to withdraw.</p>
    <h2>Safe-to-Pay, not a fake timer</h2><p style={{color:"#d2bec7",lineHeight:1.7}}>Your dashboard shows calculating, pending and available money. Earnings become withdrawable when the underlying Uncensored Girlfriend economics and backing cash are actually safe to pay—not because an arbitrary number of calendar days passed.</p>
    <p><Link href="/partners/agreement" style={{color:"#ff83ba"}}>Read the Uncensored Girlfriend Partner Agreement</Link></p>
  </div></main>;
}
