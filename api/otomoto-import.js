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

    if (!result.brand) result.brand = pickParam(paramMap, ["marka pojazdu", "marka", "make", "brand"]);
    if (!result.model) result.model = pickParam(paramMap, ["model pojazdu", "model"]);
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

  // ---------------------------------------------------------------------------
  // DODANE 2026-09-09 — pola, ktore formularz CRM czyta pod innymi nazwami.
  //
  // Blok jest WYLACZNIE DODAJACY: nie zmienia zadnego pola ustawionego wyzej
  // (marka, model, rok, cena, opis, zdjecia zostaja dokladnie takie, jakie
  // byly). Calosc siedzi w try/catch, wiec gdyby cokolwiek tu zawiodlo,
  // odpowiedz jest identyczna jak przed ta zmiana.
  //
  // Dopasowania sa DOKLADNE (bez czesciowego trafiania kluczy) - lepiej
  // zostawic pole puste niz wpisac do niego wartosc z innego parametru.
  // ---------------------------------------------------------------------------
  try {
    const extraParams = {};
    if (nextData) collectKeyValuePairs(nextData, extraParams);

    // CRM czyta "fuelType", ta funkcja zwraca "fuel" — stad alias.
    result.fuelType =
      result.fuel || pickExactParam(extraParams, ["rodzaj paliwa", "fuel_type", "fuel", "paliwo"]);

    result.power = onlyDigits(
      pickExactParam(extraParams, ["moc", "moc silnika", "power", "engine_power", "engine_power_hp"])
    );
    result.engineCapacity = pickExactParam(extraParams, [
      "pojemność skokowa", "pojemnosc skokowa", "engine_capacity", "engine_displacement",
    ]);
    result.color = pickExactParam(extraParams, ["kolor", "color", "kolor nadwozia"]);
    result.drivetrain = pickExactParam(extraParams, ["napęd", "naped", "drive", "drive_type"]);
    result.upholstery = pickExactParam(extraParams, ["tapicerka", "upholstery", "rodzaj tapicerki"]);
    result.location = pickExactParam(extraParams, ["lokalizacja", "location", "miasto", "city"]);
    result.monthlyPayment = onlyDigits(
      pickExactParam(extraParams, ["rata", "rata miesięczna", "monthly_payment", "installment"])
    );

    // Wyposazenie: OTOMOTO trzyma je jako tablice krotkich tekstow.
    const wyposazenie = findStringList(nextData, [
      "equipment", "features", "wyposazenie", "wyposażenie",
    ]);
    if (wyposazenie && wyposazenie.length) result.equipmentStandard = wyposazenie;
  } catch (e) {
    result.warnings.push(
      "Nie udało się odczytać dodatkowych parametrów (moc, kolor, wyposażenie) — uzupełnij ręcznie."
    );
  }

  res.status(200).json(result);
}

// Dopasowanie WYLACZNIE po dokladnej nazwie klucza. Swiadomie bez dopasowania
// czesciowego (jak w pickParam), zeby np. "kolor" nie zlapalo "kolor wnetrza",
// a "rata" czegokolwiek z oferty finansowania.
function pickExactParam(map, candidateKeys) {
  for (const c of candidateKeys) {
    const v = map[c];
    if (v !== undefined && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function onlyDigits(v) {
  const m = String(v || "").match(/\d[\d\s]*/);
  return m ? m[0].replace(/\s/g, "") : "";
}

// Szuka w drzewie JSON tablicy krotkich tekstow pod kluczem pasujacym do
// jednej z podanych nazw (np. "equipment"). Wymaga co najmniej 3 pozycji,
// zeby nie wziac przypadkowej dwuelementowej listy.
function findStringList(node, keyNames, depth = 0) {
  if (!node || typeof node !== "object" || depth > 10) return null;
  if (!Array.isArray(node)) {
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (Array.isArray(v) && keyNames.some((k) => key.toLowerCase().includes(k))) {
        const list = v
          .map((x) => (typeof x === "string" ? x : (x && (x.label || x.name || x.value)) || ""))
          .map((x) => String(x).trim())
          .filter((x) => x && x.length <= 80);
        if (list.length >= 3) return Array.from(new Set(list)).slice(0, 200);
      }
    }
  }
  const items = Array.isArray(node) ? node : Object.values(node);
  for (const item of items) {
    const found = findStringList(item, keyNames, depth + 1);
    if (found) return found;
  }
  return null;
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
