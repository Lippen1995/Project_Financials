/**
 * Track B: scrape each anchor's site (homepage + a few product/about pages), extract clean
 * visible text, and write a corpus JSON. No OpenAI. The reasoning step happens after (a human/LLM
 * reads this text and writes the businessSummary).
 */
const ANCHORS = [
  { name: "Kongsberg Maritime", url: "https://www.kongsberg.com/maritime/" },
  { name: "Brunvoll", url: "https://www.brunvoll.no/" },
  { name: "Servogear", url: "https://servogear.com/" },
  { name: "Scana Propulsion", url: "https://scana.no/" },
  { name: "Ulstein Group", url: "https://ulstein.com/" },
  { name: "Nogva Motorfabrikk", url: "https://www.nogva.no/" },
  { name: "Frydenbo", url: "https://frydenbo.no/" },
];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const LINK_HINT = /(product|solution|propuls|thruster|system|technolog|about|teknolog|produkt|løsning|fremdrift|marine|segment)/i;

function textFromHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#x27;|&#39;/gi, "'")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function absUrl(base, href) { try { return new URL(href, base).href; } catch { return null; } }

async function get(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal, redirect: "follow" });
    return r.ok ? await r.text() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

async function scrapeSite(anchor) {
  const home = await get(anchor.url);
  if (!home) return { ...anchor, ok: false, text: "", pages: 0 };
  const origin = new URL(anchor.url).origin;
  const links = [...home.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({ href: absUrl(anchor.url, m[1]), label: textFromHtml(m[2]) }))
    .filter((l) => l.href && l.href.startsWith(origin))
    .filter((l) => LINK_HINT.test(l.href) || LINK_HINT.test(l.label));
  const seen = new Set([anchor.url.replace(/\/$/, "")]);
  const picked = [];
  for (const l of links) {
    const key = l.href.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key); picked.push(l.href);
    if (picked.length >= 3) break;
  }
  let text = "[HOME] " + textFromHtml(home).slice(0, 2500);
  for (const p of picked) {
    const html = await get(p);
    if (html) text += `\n\n[${p}] ` + textFromHtml(html).slice(0, 2000);
  }
  return { ...anchor, ok: true, pages: 1 + picked.length, pickedUrls: picked, text: text.slice(0, 8000) };
}

const out = [];
for (const a of ANCHORS) {
  const r = await scrapeSite(a);
  out.push(r);
  console.log(`\n########## ${r.name} (${r.ok ? r.pages + " pages" : "FAILED"})`);
  console.log(r.text.slice(0, 1400));
}
const fs = await import("node:fs");
fs.mkdirSync("output/ai-search", { recursive: true });
fs.writeFileSync("output/ai-search/corpus.json", JSON.stringify(out, null, 2));
console.log("\n\n[saved corpus.json — " + out.filter(o=>o.ok).length + "/" + out.length + " ok]");
