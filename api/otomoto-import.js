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

  // --- Strategia 1: dane strukturalne Next.js (__NEXT_DATA__) ---
  try {
    const nextMatch = html.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
    );
    if (nextMatch) {
      const data = JSON.parse(nextMatch[1]);
      const advert = findAdvertNode(data);
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
        if (Array.isArray(advert.images)) {
          result.images = advert.images
            .map((img) => (typeof img === "string" ? img : img?.url))
            .filter(Boolean);
        } else if (Array.isArray(advert.photos)) {
          result.images = advert.photos
            .map((img) => (typeof img === "string" ? img : img?.url))
            .filter(Boolean);
        }
      }
    }
  } catch (e) {
    result.warnings.push("Nie udało się odczytać danych strukturalnych strony.");
  }

  // --- Strategia 2: JSON-LD (schema.org) — uzupełnienie braków ---
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
          if (result.images.length === 0 && it.image) {
            result.images = Array.isArray(it.image) ? it.image : [it.image];
          }
        }
      } catch {}
    }
  } catch (e) {
    result.warnings.push("Nie udało się odczytać danych JSON-LD.");
  }

  // --- Strategia 3: meta Open Graph — ostatnia deska ratunku ---
  if (!result.description) {
    const ogDesc = html.match(/<meta property="og:description" content="([^"]*)"/);
    if (ogDesc) result.description = decodeHtmlEntities(ogDesc[1]);
  }
  if (result.images.length === 0) {
    const ogImg = html.match(/<meta property="og:image" content="([^"]*)"/);
    if (ogImg) result.images = [ogImg[1]];
  }
  if (!result.brand && !result.model) {
    const ogTitle = html.match(/<meta property="og:title" content="([^"]*)"/);
    if (ogTitle) {
      const title = decodeHtmlEntities(ogTitle[1]);
      const parts = title.split(" ");
      result.brand = parts[0] || "";
      result.model = parts.slice(1).join(" ") || "";
      result.warnings.push(
        "Marka i model zostały odgadnięte z tytułu ogłoszenia — sprawdź je."
      );
    }
  }

  // --- Dodatkowe zdjęcia z CDN OtoMoto (regex po całej stronie) ---
  try {
    const cdnMatches = [
      ...html.matchAll(/https:\/\/[a-z0-9.-]*olxcdn\.com\/[^"'\s\\]+\.(?:jpg|jpeg|webp)/gi),
    ];
    const found = [...new Set(cdnMatches.map((m) => m[0]))];
    if (found.length > result.images.length) {
      result.images = found;
    }
  } catch {}

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
