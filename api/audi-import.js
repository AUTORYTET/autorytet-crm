/**
 * api/audi-import.js
 *
 * Odpowiednik istniejącego "/api/otomoto-import", ale dla ogłoszeń/aut ze
 * strony audi.pl (wyszukiwarka samochodów nowych - konfigurator/oferty
 * dostępne od ręki). Wywoływane z panelu CRM przyciskiem "Pobierz dane" w
 * formularzu pojazdu, gdy wklejony link prowadzi do audi.pl (patrz zmiana w
 * CRM.jsx: funkcja importFromListing wybiera ten endpoint automatycznie na
 * podstawie domeny w linku).
 *
 * ZWRACANY KONTRAKT (identyczny jak /api/otomoto-import, żeby front-end mógł
 * używać jednego i tego samego kodu obsługi odpowiedzi dla obu źródeł):
 *   {
 *     brand, model, year, price, bodyType, description,
 *     images: string[],       // publiczne URL-e już PRZETWORZONYCH zdjęć (szare tło)
 *     sourceUrl,
 *     warnings: string[]      // ostrzeżenia (np. czego nie udało się znaleźć/przetworzyć)
 *   }
 *
 * ZDJĘCIA - SZARE TŁO
 * -------------------
 * Zdjęcia z audi.pl (mediaservice.audi.com) to studyjne renderowane obrazy z
 * jednolitym/gradientowym tłem. Każde zdjęcie jest tu automatycznie
 * przetwarzane funkcją grayOutBackground() z "../lib/grayBackground.js"
 * (metoda: wypełnianie floodfill od brzegów obrazu + zamiana wykrytego tła na
 * szary #F3F3F1 z palety strony) i wgrywane do Supabase Storage (bucket
 * "car-photos"), skąd front-end i strona główna mogą je normalnie wyświetlać
 * (publiczny odczyt). Oryginalne zdjęcia z audi.pl NIE są linkowane
 * bezpośrednio (część CDN-ów blokuje hotlinking, a poza tym mielibyśmy wtedy
 * niezmienione, kolorowe tło).
 *
 * WYMAGANE ZMIENNE ŚRODOWISKOWE (Vercel -> Project Settings -> Environment
 * Variables - TYLKO po stronie serwera, nigdy z prefiksem NEXT_PUBLIC_/VITE_):
 *   SUPABASE_URL          - adres projektu Supabase (ten sam co wszędzie indziej)
 *   SUPABASE_SERVICE_KEY  - klucz "service_role" (Project Settings -> API) -
 *                           potrzebny do wgrywania plików do Storage z
 *                           pominięciem RLS. NIGDY nie używaj go w kodzie
 *                           front-endowym ani nie commituj do repo - tylko
 *                           jako sekret w ustawieniach Vercel.
 *
 * WYMAGANE PAKIETY (dopisz w package.json / zainstaluj):
 *   npm install cheerio sharp @supabase/supabase-js
 *
 * WAŻNE OGRANICZENIE - PRZECZYTAJ PRZED PIERWSZYM UŻYCIEM
 * ---------------------------------------------------------
 * Środowisko, w którym to pisałem, nie ma dostępu do internetu na zewnątrz,
 * więc NIE MIAŁEM MOŻLIWOŚCI przetestowania tego na żywej stronie audi.pl.
 * Etykiety pól (np. "Cena katalogowa", "Rata") są moim najlepszym
 * przybliżeniem na podstawie tego, co widać na typowych stronach ofert
 * audi.pl - mogą się nie zgadzać 1:1 z rzeczywistym układem strony. Dlatego:
 *   - Wyciąganie danych (extractListingData) jest napisane odpornie - szuka
 *     wzorców w całym tekście strony, a nie sztywnych selektorów CSS - więc
 *     nawet jeśli pojedyncza etykieta się nie zgadza, reszta pól powinna się
 *     znaleźć.
 *   - Ekstrakcja zdjęć (regex na mediaservice.audi.com) jest niezależna od
 *     układu strony i powinna działać niezawodnie.
 *   - Dodaj do linku "&debug=1", żeby zamiast normalnej odpowiedzi dostać
 *     surowe dane pomocnicze (znalezione pary etykieta/wartość, lista
 *     znalezionych zdjęć) - jeśli po pierwszym teście czegoś zabraknie,
 *     wyślij mi to, a dopasuję wzorce do rzeczywistej strony.
 *   - Braki w danych NIE blokują importu - formularz w CRM wypełni się tym,
 *     co się udało znaleźć, a resztę uzupełnisz ręcznie (tak jak zawsze).
 */

import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";
import { grayOutBackground } from "../lib/grayBackground.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STORAGE_BUCKET = "car-photos";
const MAX_IMAGES = 12;

const BODY_TYPE_PATTERNS = [
  { re: /limuzyn|sedan/i, val: "Sedan" },
  { re: /kombi|avant/i, val: "Kombi" },
  { re: /\bsuv\b/i, val: "SUV" },
  { re: /coup[eé]/i, val: "Coupe" },
  { re: /cabrio|kabriolet/i, val: "Cabrio" },
  { re: /\bvan\b/i, val: "Van" },
  { re: /hatchback|sportback/i, val: "Hatchback" },
];

// Etykieta (dokładna, z wielkością liter jak na stronie) -> nazwa pola w
// odpowiedzi + funkcja parsująca. Podobnie jak w fill_car_details_from_otomoto.js.
const LABEL_MAP = {
  "Cena specjalna": { field: "priceSpecial", parse: parsePrice },
  "Cena promocyjna": { field: "priceSpecial", parse: parsePrice },
  "Cena katalogowa": { field: "priceCatalog", parse: parsePrice },
  "Cena": { field: "priceGeneric", parse: parsePrice },
  "Rata": { field: "monthlyPayment", parse: parsePrice },
  "Rok produkcji": { field: "year", parse: parseYear },
  "Rocznik": { field: "year", parse: parseYear },
  "Kolor nadwozia": { field: "color", parse: parseText },
  "Kolor lakieru": { field: "color", parse: parseText },
  "Nadwozie": { field: "bodyTypeRaw", parse: parseText },
  "Pojemność skokowa": { field: "engineCapacity", parse: parseText },
  "Moc": { field: "power", parse: parseText },
  "Skrzynia biegów": { field: "gearbox", parse: parseText },
  "Napęd": { field: "drivetrain", parse: parseText },
  "Przyspieszenie 0-100 km/h": { field: "acceleration", parse: parseText },
  "Zużycie paliwa": { field: "fuelConsumption", parse: parseText },
  "Emisja CO2": { field: "co2", parse: parseText },
};

function parseText(v) {
  return v && v.trim() ? v.trim() : null;
}
function parsePrice(v) {
  const n = parseInt(String(v).replace(/[^\d]/g, ""), 10);
  return isNaN(n) ? null : n;
}
function parseYear(v) {
  const m = String(v).match(/20\d{2}/);
  return m ? parseInt(m[0], 10) : null;
}

// Wszystkie "liściowe" fragmenty tekstu ze strony, w kolejności występowania
// (patrz identyczna metoda i uzasadnienie w fill_car_details_from_otomoto.js).
function extractLeafTexts($) {
  const texts = [];
  $("body")
    .find("*")
    .each(function () {
      const el = $(this);
      if (el.children().length > 0) return;
      const t = el.text().replace(/\s+/g, " ").trim();
      if (t) texts.push(t);
    });
  return texts;
}

function extractLabelValuePairs(texts) {
  const found = {};
  for (let i = 0; i < texts.length - 1; i++) {
    const mapping = LABEL_MAP[texts[i]];
    if (mapping && found[mapping.field] === undefined) {
      const value = mapping.parse(texts[i + 1]);
      if (value !== null) found[mapping.field] = value;
    }
  }
  Object.keys(LABEL_MAP).forEach((label) => {
    const mapping = LABEL_MAP[label];
    if (found[mapping.field] !== undefined) return;
    const re = new RegExp("^" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:?\\s*(.+)$");
    for (const t of texts) {
      const m = t.match(re);
      if (m && m[1]) {
        const value = mapping.parse(m[1]);
        if (value !== null) {
          found[mapping.field] = value;
          break;
        }
      }
    }
  });
  return found;
}

function extractModelFromTitle($) {
  let title = ($("title").first().text() || "").trim();
  if (!title) title = ($('meta[property="og:title"]').attr("content") || "").trim();
  if (!title) return null;
  title = title.split("|")[0].trim();
  title = title.replace(/^Audi\s+/i, "").trim();
  return title || null;
}

function extractBodyType(fullText, bodyTypeRaw) {
  const haystack = (bodyTypeRaw || "") + " " + fullText;
  for (const p of BODY_TYPE_PATTERNS) {
    if (p.re.test(haystack)) return p.val;
  }
  return null;
}

function extractImageUrls(html) {
  const matches = html.match(/https:\/\/mediaservice\.audi\.com\/media\/[^"'\s)\\]+/g) || [];
  const seen = new Set();
  const urls = [];
  for (const raw of matches) {
    // ujednolicamy szerokość renderowanego obrazu, jeśli parametr już jest w URL-u
    const clean = raw.replace(/&amp;/g, "&");
    const withWidth = /[?&]wid=/.test(clean) ? clean.replace(/([?&])wid=\d+/, "$1wid=1600") : clean + (clean.includes("?") ? "&" : "?") + "wid=1600";
    if (!seen.has(withWidth)) {
      seen.add(withWidth);
      urls.push(withWidth);
    }
    if (urls.length >= MAX_IMAGES) break;
  }
  return urls;
}

function buildDescription(fields) {
  const lines = [];
  const specLine = [fields.engineCapacity, fields.power, fields.gearbox, fields.drivetrain]
    .filter(Boolean)
    .join(" · ");
  if (specLine) lines.push(specLine);
  if (fields.acceleration) lines.push(`Przyspieszenie 0-100 km/h: ${fields.acceleration}`);
  if (fields.fuelConsumption) lines.push(`Zużycie paliwa: ${fields.fuelConsumption}`);
  if (fields.co2) lines.push(`Emisja CO2: ${fields.co2}`);
  if (fields.color) lines.push(`Kolor: ${fields.color}`);
  return lines.join("\n");
}

async function fetchListingHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "pl-PL,pl;q=0.9",
    },
  });
  if (!res.ok) throw new Error("HTTP " + res.status + " dla " + url);
  return await res.text();
}

async function downloadAndProcessImage(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error("Nie udało się pobrać zdjęcia: HTTP " + res.status);
  const arrayBuffer = await res.arrayBuffer();
  return grayOutBackground(Buffer.from(arrayBuffer));
}

async function uploadProcessedImage(supabase, buffer, index) {
  const path = `audi-import/${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, buffer, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) throw new Error("Błąd wgrywania zdjęcia do Supabase Storage: " + error.message);
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export default async function handler(req, res) {
  const url = req.query && req.query.url;
  const debug = req.query && (req.query.debug === "1" || req.query.debug === "true");

  if (!url || !/^https?:\/\/(www\.)?audi\.pl\//i.test(url)) {
    res.status(400).json({ error: "Podaj prawidłowy link do oferty na audi.pl." });
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    res.status(500).json({
      error:
        "Brak konfiguracji serwera (SUPABASE_URL / SUPABASE_SERVICE_KEY). Ustaw te zmienne środowiskowe w Vercel -> Project Settings -> Environment Variables.",
    });
    return;
  }

  const warnings = [];

  try {
    const html = await fetchListingHtml(url);
    const $ = cheerio.load(html);
    const texts = extractLeafTexts($);
    const fields = extractLabelValuePairs(texts);
    const fullText = texts.join(" ");
    const model = extractModelFromTitle($);
    const bodyType = extractBodyType(fullText, fields.bodyTypeRaw);
    const imageUrls = extractImageUrls(html);

    if (debug) {
      res.status(200).json({
        debug: true,
        model,
        bodyType,
        fields,
        imageUrlsFound: imageUrls,
        leafTextsSample: texts.slice(0, 400),
      });
      return;
    }

    if (!model) warnings.push("Nie udało się rozpoznać modelu z tytułu strony - uzupełnij ręcznie.");
    const price = fields.priceSpecial || fields.priceCatalog || fields.priceGeneric || null;
    if (!price) warnings.push("Nie udało się rozpoznać ceny - uzupełnij ręcznie.");
    if (!fields.year) warnings.push("Nie udało się rozpoznać roku produkcji - uzupełnij ręcznie.");
    if (!bodyType) warnings.push("Nie udało się rozpoznać typu nadwozia - wybierz ręcznie z listy.");
    if (imageUrls.length === 0) warnings.push("Nie znaleziono zdjęć na tej stronie.");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const processedImages = [];
    for (let i = 0; i < imageUrls.length; i++) {
      try {
        const { buffer, processed, note } = await downloadAndProcessImage(imageUrls[i]);
        if (!processed && note) warnings.push(`Zdjęcie ${i + 1}: ${note}`);
        const publicUrl = await uploadProcessedImage(supabase, buffer, i);
        processedImages.push(publicUrl);
      } catch (e) {
        warnings.push(`Zdjęcie ${i + 1}: nie udało się przetworzyć/wgrać (${e.message}).`);
      }
    }

    res.status(200).json({
      brand: "Audi",
      model,
      year: fields.year || null,
      price,
      monthlyPayment: fields.monthlyPayment || null,
      bodyType,
      description: buildDescription(fields),
      images: processedImages,
      sourceUrl: url,
      warnings,
    });
  } catch (e) {
    res.status(500).json({ error: "Nie udało się pobrać/przetworzyć ogłoszenia: " + e.message });
  }
}
