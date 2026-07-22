// Serverless function (deploys automatically on Vercel as /api/otomoto-import)
// Pobiera dane z JEDNEGO wskazanego ogłoszenia OtoMoto (link wklejony przez admina
// w panelu CRM) — tytuł, opis, cenę, rok, przebieg, paliwo, skrzynię i zdjęcia.
//
// UWAGA: OtoMoto nie udostępnia oficjalnego publicznego API do odczytu ogłoszeń,
// więc ta funkcja parsuje HTML strony ogłoszenia. Może wymagać poprawek, jeśli
// OtoMoto zmieni strukturę swojej strony.

export default async function handler(req, res) {
  const url = (req.query.url || "").toString().trim();

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    res.status(400).json({ error: "Nieprawidłowy adres URL." });
    return;
  }

  const allowedHosts = ["otomoto.pl", "www.otomoto.pl", "autorytet.otomoto.pl"];
  const hostOk = allowedHosts.some(
    (h) => parsed.hostname === h || parsed.hostname.endsWith("." + h)
  );
  if (!hostOk) {
    res.status(400).json({ error: "Ten link nie prowadzi do otomoto.pl." });
    return;
  }

  let html;
  try {
    const r = await fetch(parsed.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "pl-PL,pl;q=0.9",
      },
    });
    if (!r.ok) {
      res.status(502).json({ error: `OtoMoto zwróciło błąd (status ${r.status}).` });
      return;
    }
    html = await r.text();
  } catch (e) {
    res.status(502).json({ error: "Nie udało się pobrać strony ogłoszenia." });
    return;
  }

  const result = {
    brand: "",
    model: "",
    year: "",
    price: "",
    mileage: "",
    fuel: "",
    gearbox: "",
    bodyType: "",
    description: "",
    images: [],
    sourceUrl: parsed.toString(),
    warnings: [],
  };

  let nextData = null;
  try {
    const nextMatch = html.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
    );
    if (nextMatch) nextData = JSON.parse(nextMatch[1]);
  } catch (e) {
    result.warnings.push("Nie udało się odczytać danych strukturalnych strony (__NEXT_DATA__).");
  }

  // --- Strategia 1: pierwszy węzeł z make/model/price (dane podstawowe) ---
  if (nextData) {
    const advert = findAdvertNode(nextData);
    if (advert) {
      result.brand = advert.make || advert.brand || result.brand;
      result.model = advert.model || result.model;
      result.year = advert.year || advert.productionYear || result.year;
      result.price = advert.price?.value || advert.price || result.price;
      result.mileage = advert.mileage || result.mileage;
      result.fuel = advert.fuelType || advert.fuel || result.fuel;
      result.gearbox = advert.gearbox || advert.transmission || result.gearbox;
      result.bodyType = advert.bodyType || result.bodyType;
      result.description = stripHtml(advert.description || "") || result.description;
    }
  }

  // --- Strategia 2: ogólne skanowanie drzewa JSON w poszukiwaniu par klucz/wartość ---
  // Wiele serwisów ogłoszeniowych trzyma parametry (rok, paliwo, skrzynia, nadwozie)
  // jako tablicę obiektów {key/name, value/localizedValue}, niezależnie od tego,
  // gdzie w strukturze się znajdują. To pozwala uzupełnić braki bez znajomości
  // dokładnej ścieżki w danych OtoMoto.
  if (nextData) {
    const paramMap = {};
    collectKeyValuePairs(nextData, paramMap);

    if (!result.year) result.year = pickParam(paramMap, ["rok produkcji", "rok-produkcji", "year", "production_year", "productionyear"]);
    if (!result.fuel) result.fuel = pickParam(paramMap, ["rodzaj paliwa", "fuel_type", "fuel", "paliwo"]);
    if (!result.gearbox) result.gearbox = pickParam(paramMap, ["skrzynia biegów", "skrzynia-biegow", "gearbox", "transmission"]);
    if (!result.bodyType) result.bodyType = pickParam(paramMap, ["typ nadwozia", "body_type", "bodytype", "nadwozie"]);
    if (!result.mileage) result.mileage = pickParam(paramMap, ["przebieg", "mileage"]);

    // Długi opis — szukamy dowolnego pola "description" w całym drzewie
    if (!result.description) {
      const desc = findLongTextField(nextData, ["description", "opis"]);
      if (desc) result.description = stripHtml(desc);
    }
  }

  // --- Strategia 3: JSON-LD (schema.org) — uzupełnienie braków ---
  try {
    const ldMatches = [
      ...html.matchAll(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
      ),
    ];
    for (const m of ldMatches) {
      try {
        const obj = JSON.parse(m[1]);
        const items = Array.isArray(obj) ? obj : [obj];
        for (const it of items) {
          if (!result.description && it.description) result.description = it.description;
          if (!result.price && it.offers?.price) result.price = it.offers.price;
        }
      } catch {}
    }
  } catch (e) {
    result.warnings.push("Nie udało się odczytać danych JSON-LD.");
  }

  // --- Strategia 4: meta Open Graph — ostatnia deska ratunku dla opisu/tytułu ---
  if (!result.description) {
    const ogDesc = html.match(/<meta property="og:description" content="([^"]*)"/);
    if (ogDesc) result.description = decodeHtmlEntities(ogDesc[1]);
  }
  if (!result.brand && !result.model) {
    const ogTitle = html.match(/<meta property="og:title" content="([^"]*)"/);
    if (ogTitle) {
      const title = decodeHtmlEntities(ogTitle[1]);
      // Tytuł ma zwykle postać: "[Nowy/Używany] Marka Model Rok - Cena PLN, Przebieg km - Otomoto.pl"
      let namePart = title.split(" - ")[0].trim();

      // Wyciągnij rok (4 cyfry na końcu), jeśli jeszcze go nie mamy
      const yearMatch = namePart.match(/\s(\d{4})$/);
      if (yearMatch) {
        if (!result.year) result.year = yearMatch[1];
        namePart = namePart.slice(0, yearMatch.index).trim();
      }

      // Usuń przedrostek określający stan pojazdu (Nowy / Używany)
      namePart = namePart.replace(/^(Nowy|Używany|Uzywany)\s+/i, "");

      const parts = namePart.split(" ");
      result.brand = parts[0] || "";
      result.model = parts.slice(1).join(" ") || "";
      result.warnings.push(
        "Marka i model zostały odgadnięte z tytułu ogłoszenia — sprawdź je."
      );
    }
  }

  // --- Zdjęcia: adresy CDN OtoMoto (ireland.apollo.olxcdn.com/v1/files/<token>/image) ---
  // Uwaga: te adresy NIE mają rozszerzenia pliku (.jpg itp.) — kończą się na "/image"
  // i opcjonalnie parametrami rozmiaru po średniku, np. ";s=5120x0;q=80".
  try {
    const cdnMatches = [
      ...html.matchAll(/https:\/\/[a-z0-9.-]*olxcdn\.com\/v1\/files\/[^"'\s\\<>]+?\/image(?:;[^"'\s\\<>]*)?/gi),
    ];
    const seenTokens = new Set();
    const images = [];
    for (const m of cdnMatches) {
      const full = m[0];
      const base = full.split(";")[0]; // ścieżka bez parametrów rozmiaru
      if (seenTokens.has(base)) continue;
      seenTokens.add(base);
      images.push(base + ";s=1280x0;q=80");
    }
    if (images.length > 0) result.images = images;
  } catch {}

  // Fallback: pojedyncze zdjęcie z og:image, jeśli nic innego nie znaleziono
  if (result.images.length === 0) {
    const ogImg = html.match(/<meta property="og:image" content="([^"]*)"/);
    if (ogImg) result.images = [ogImg[1]];
  }

  if (!result.description && result.images.length === 0) {
    result.warnings.push(
      "Nie udało się wyciągnąć danych z tego ogłoszenia. Sprawdź link lub uzupełnij pola ręcznie."
    );
  }

  res.status(200).json(result);
}

function findAdvertNode(obj, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 6) return null;
  if (obj.make || obj.model || obj.price) return obj;
  for (const key of Object.keys(obj)) {
    const found = findAdvertNode(obj[key], depth + 1);
    if (found) return found;
  }
  return null;
}

// Rekurencyjnie zbiera pary klucz/wartość z tablic obiektów typu
// {key|name: "...", value|values|localizedValue: "..."} znalezionych
// w dowolnym miejscu drzewa JSON. Klucze są normalizowane do małych liter.
function collectKeyValuePairs(node, map, depth = 0) {
  if (!node || typeof node !== "object" || depth > 10) return;
  if (Array.isArray(node)) {
    for (const item of node) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const k = item.key || item.name || item.parameterKey || item.label;
        const v = item.value ?? item.values ?? item.localizedValue ?? item.displayValue;
        if (k && v !== undefined && v !== null) {
          const kk = String(k).toLowerCase().trim();
          if (!(kk in map)) {
            map[kk] = Array.isArray(v) ? v.join(", ") : String(v);
          }
        }
      }
      collectKeyValuePairs(item, map, depth + 1);
    }
  } else {
    for (const key of Object.keys(node)) {
      collectKeyValuePairs(node[key], map, depth + 1);
    }
  }
}

function pickParam(map, candidateKeys) {
  for (const c of candidateKeys) {
    if (map[c] !== undefined) return map[c];
  }
  // dopasowanie częściowe (np. klucz zawiera "rok" albo "paliwo")
  for (const key of Object.keys(map)) {
    for (const c of candidateKeys) {
      if (key.includes(c)) return map[key];
    }
  }
  return "";
}

// Szuka dowolnego stringa dłuższego niż 40 znaków pod kluczem pasującym
// do jednej z podanych nazw (np. "description", "opis").
function findLongTextField(node, keyNames, depth = 0) {
  if (!node || typeof node !== "object" || depth > 10) return null;
  if (!Array.isArray(node)) {
    for (const key of Object.keys(node)) {
      if (
        keyNames.some((k) => key.toLowerCase() === k) &&
        typeof node[key] === "string" &&
        node[key].length > 40
      ) {
        return node[key];
      }
    }
  }
  const items = Array.isArray(node) ? node : Object.values(node);
  for (const item of items) {
    const found = findLongTextField(item, keyNames, depth + 1);
    if (found) return found;
  }
  return null;
}

function stripHtml(str) {
  return str.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
