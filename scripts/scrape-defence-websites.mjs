/** Track B — defence anchor set. orgNumbers pre-resolved from the mirror (no name-resolution guess). */
const ANCHORS = [
  { org: "978614582", company: "KONGSBERG DEFENCE & AEROSPACE AS", url: "https://www.kongsberg.com/kda/" },
  { org: "979984731", company: "NAMMO AS", url: "https://www.nammo.com/" },
  { org: "991191984", company: "CHEMRING NOBEL AS", url: "https://www.chemringnobel.no/" },
  { org: "990295697", company: "COMROD COMMUNICATION AS", url: "https://www.comrod.com/" },
  { org: "979340354", company: "KITRON AS", url: "https://www.kitron.com/" },
  { org: "918684735", company: "HAPRO ELECTRONICS AS", url: "https://haproelectronics.no/" },
  { org: "917811288", company: "FJORD DEFENCE GROUP ASA", url: "https://www.fjorddefence.com/" },
];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const LINK_HINT = /(product|solution|capabilit|system|technolog|about|defen|militar|naval|weapon|ammunition|missile|produkt|løsning|marine|segment|what-we)/i;

function textFromHtml(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&#x27;|&#39;/gi,"'")
    .replace(/&[a-z]+;/gi," ").replace(/\s+/g," ").trim();
}
function absUrl(base,href){ try{ return new URL(href,base).href; }catch{ return null; } }
async function get(url){
  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),15000);
  try{ const r=await fetch(url,{headers:{"User-Agent":UA},signal:ctrl.signal,redirect:"follow"}); return r.ok?await r.text():null; }
  catch{ return null; } finally{ clearTimeout(t); }
}
async function scrapeSite(a){
  const home=await get(a.url);
  if(!home) return {...a, ok:false, text:"", pages:0};
  const origin=new URL(a.url).origin;
  const links=[...home.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(m=>({href:absUrl(a.url,m[1]),label:textFromHtml(m[2])}))
    .filter(l=>l.href&&l.href.startsWith(origin))
    .filter(l=>LINK_HINT.test(l.href)||LINK_HINT.test(l.label));
  const seen=new Set([a.url.replace(/\/$/,"")]); const picked=[];
  for(const l of links){ const k=l.href.replace(/\/$/,""); if(seen.has(k))continue; seen.add(k); picked.push(l.href); if(picked.length>=3)break; }
  let text="[HOME] "+textFromHtml(home).slice(0,2500);
  for(const p of picked){ const html=await get(p); if(html) text+=`\n\n[${p}] `+textFromHtml(html).slice(0,2000); }
  return {...a, ok:true, pages:1+picked.length, pickedUrls:picked, text:text.slice(0,8000)};
}
const out=[];
for(const a of ANCHORS){
  const r=await scrapeSite(a); out.push(r);
  console.log(`\n########## ${r.company} (${r.ok?r.pages+" pages":"FAILED — "+r.url})`);
  if(r.ok) console.log(r.text.slice(0,1500));
}
const fs=await import("node:fs");
fs.mkdirSync("output/ai-search",{recursive:true});
fs.writeFileSync("output/ai-search/corpus-defence.json",JSON.stringify(out,null,2));
console.log("\n\n[saved corpus-defence.json — "+out.filter(o=>o.ok).length+"/"+out.length+" ok]");
