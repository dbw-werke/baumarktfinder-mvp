import { materials } from "../data/materials";

export function normalize(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string) {
  return normalize(value).replace(/\s+/g, "");
}

function levenshtein(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[a.length][b.length];
}

export function findMaterial(input: string) {
  const q = normalize(input);
  const qc = compact(input);

  if (!q) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const material of materials) {
    if (material.active === false) continue;

    const terms = [
      material.name,
      material.id,
      material.slug,
      material.searchTerm,
      material.trade,
      material.category,
      material.subcategory,
      ...material.aliases,
    ];

    for (const term of terms) {
      const t = normalize(term);
      const tc = compact(term);

      if (!t) continue;

      let score = 0;

      if (t === q || tc === qc) score = 100;
      else if (t.includes(q) || q.includes(t)) score = 85;
      else if (tc.includes(qc) || qc.includes(tc)) score = 80;
      else {
        const distance = levenshtein(qc, tc);
        const maxLen = Math.max(qc.length, tc.length);

        if (maxLen > 0) {
          const similarity = 1 - distance / maxLen;
          if (similarity >= 0.72) score = Math.round(similarity * 70);
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = material;
      }
    }
  }

  return bestScore >= 50 ? bestMatch : null;
}

function buildStoreSearchUrl(storeId: string, searchTerm: string) {
  const q = encodeURIComponent(searchTerm);

  const urls: Record<string, string> = {
    obi: `https://www.obi.de/search/${q}/`,
    bauhaus: `https://www.bauhaus.info/search?q=${q}`,
    hornbach: `https://www.hornbach.de/suche/sortiment/${q}/`,
    toom: `https://toom.de/suche/?q=${q}`,
    hagebau: `https://www.hagebau.de/suche/?q=${q}`,
    raabkarcher: `https://www.raabkarcher.de/suche?text=${q}`,
    baywa: `https://www.baywa-baustoffe.de/suche?q=${q}`,
    wuerth: `https://eshop.wuerth.de/Suche?text=${q}`,

  };

  return urls[storeId] ?? `https://www.google.com/search?q=${q}`;
}

export function getStoreUrl(storeId: string, input: string) {
  const material = findMaterial(input);
  const searchTerm = material?.searchTerm ?? material?.name ?? input;

  return buildStoreSearchUrl(storeId, searchTerm);
}