/**
 * api/otomoto-import.js
 *
 * Endpoint wywoływany przez przycisk "Pobierz dane" w CRM (Pojazdy -> Nowy/
 * Edytuj pojazd), gdy wklejony link prowadzi do otomoto.pl. Wcześniej ten
 * plik NIE ISTNIAŁ w projekcie (front-end już go wywoływał, ale brakowało
 * kodu po stronie serwera) - stąd przycisk dla linków OTOMOTO nie działał.
 * Ten plik go uzupełnia, w tym samym duchu co siostrzany skrypt
 * fill_car_details_from_otomoto.js (te same, potwierdzone realnymi
 * zrzutami ekranu etykiety pól technicznych: Przebieg, Rodzaj paliwa,
 * Skrzynia biegów, Pojemność skokowa, Moc, Liczba drzwi, Liczba miejsc,
 * Kolor, Stan, Bezwypadkowy).
 *
 * ZWRACANY KONTRAKT (identyczny jak /api/audi-import):
 *   { brand, model, year, price, monthlyPayment, bodyType, description,
 *     images: string[], sourceUrl, warnings: string[] }
 *
 * Zdjęcia z OTOMOTO to prawdziwe zdjęcia konkretnego egzemplarza (nie
 * studyjne renderowanie jak audi.pl) - NIE są tu przetwarzane (bez zmiany
 * tła), zwracane są bezpośrednio jako linki do CDN OTOMOTO/OLX
 * (apollo.olxcdn.com), dokładnie tak jak to widać na screenach z Twojego
 * CRM (pole "LINK DO ZDJĘCIA (URL)").
 *
 * WAŻNE OGRANICZENIE - PRZECZYTAJ PRZED PIERWSZYM UŻYCIEM
 * ---------------------------------------------------------
 * Etykiety pól technicznych (Przebieg, Rodzaj paliwa, itd.) są sprawdzone na
 * realnych zrzutach ekranu OTOMOTO (patrz fill_car_details_from_otomoto.js).
 * Ekstrakcja marki/modelu/roku/ceny/rat jest jednak MOIM NAJLEPSZYM
 * przybliżeniem - środowisko, w którym to pisałem, nie ma dostępu do
 * internetu, więc nie mogłem przetestować tego na żywym ogłoszeniu. Dodaj
 * do linku "&debug=1", żeby zamiast normalnej odpowiedzi zobaczyć surowe
 * dane pomocnicze - jeśli czegoś zabraknie po pierwszym teście, wyślij mi
 * to, a dopasuję wzorce.
 */

import * as cheerio from "cheerio";

const BODY_TYPE_PATTERNS = [
  { re: /limuzyn|sedan/i, val: "Sedan" },
  { re: /kombi/i, val: "Kombi" },
  { re: /\bsuv\b/i, val: "SUV" },
  { re: /coup[eé]/i, val: "Coupe" },
  { re: /cabrio|kabriolet/i, val: "Cabrio" },
  { re: /\bvan\b|dostawcz/i, val: "Van" },
  { re: /hatchback/i, val: "Hatchback" },
];

// Etykiety potwierdzone realnymi zrzutami ekranu OTOMOTO (panel "Szczegóły") —
// patrz fill_car_details_from_otomoto.js — plus kilka dodatkowych (cena/rata/
// marka/model/rok), które są moim najlepszym przybliżeniem (nieprzetestowane
// na żywo, patrz komentarz na górze pliku).
const LABEL_MAP = {
  "Cena": { field: "price", parse: parsePrice },
  "Cena brutto": { field: "price", parse: parsePrice },
  "Rata": { field: "monthlyPayment", parse: parsePrice },
  "Rata miesięczna": { field: "monthlyPayment", parse: parsePrice },
  "Marka pojazdu": { field: "brand", parse: parseText },
  "Model pojazdu": { field: "model", parse: parseText },
  "Rok produkcji": { field: "year", parse: parseYear },
  "Nadwozie": { field: "bodyTypeRaw", parse: parseText },
  "Przebieg": { field: "mileage", parse: parseMileage },
  "Rodzaj paliwa": { field: "fuelType", parse: parseText },
  "Skrzynia biegów": { field: "gearbox", parse: parseText },
  "Pojemność skokowa": { field: "engineCapacity", parse: parseText },
  "Moc": { field: "power", parse: parsePower },
  "Liczba drzwi": { field: "doors", parse: parseIntSafe },
  "Liczba miejsc": { field: "seats", parse: parseIntSafe },
  "Kolor": { field: "color", parse: parseText },
  "Stan": { field: "condition", parse: parseText },
  "Bezwypadkowy": { field: "accidentFree", parse: parseYesNo },
};

function parseText(v) { return v && v.trim() ? v.trim() : null; }
function parseIntSafe(v) { const n = parseInt(String(v).replace(/\D/g, ""), 10); return isNaN(n) ? null : n; }
function parseMileage(v) { const n = parseInt(String(v).replace(/[^\d]/g, ""), 10); return isNaN(n) ? null : n; }
function parsePower(v) { const m = String(v).match(/(\d+)/); return m ? m[1] : null; }
function parsePrice(v) { const n = parseInt(String(v).replace(/[^\d]/g, ""), 10); return isNaN(n) ? null : n; }
function parseYear(v) { const m = String(v).match(/20\d{2}|19\d{2}/); return m ? parseInt(m[0], 10) : null; }
function parseYesNo(v) {
  const t = String(v).trim().toLowerCase();
  if (t === "tak") return true;
  if (t === "nie") return false;
  return null;
}

function extractLeafTexts($) {
  const texts = [];
  $("body").find("*").each(function () {
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

// Zapasowe źródło marki/modelu: slug w adresie URL, np.
// ".../oferta/audi-q8-50-tdi-ID6l6qLL.html" -> "Audi Q8 50 Tdi"
function guessBrandModelFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const slug = path.split("/").filter(Boolean).pop() || "";
    const withoutId = slug.replace(/-ID[\w]+\.html?$/i, "").replace(/\.html?$/i, "");
    const words = withoutId.split("-").filter(Boolean);
    if (words.length === 0) return { brand: null, model: null };
    const brand = words[0].charAt(0).toUpperCase() + words[0].slice(1);
    const model = words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return { brand, model: model || null };
  } catch (e) {
    return { brand: null, model: null };
  }
}

function extractTitle($) {
  let title = ($("title").first().text() || "").trim();
  if (!title) title = ($('meta[property="og:title"]').attr("content") || "").trim();
  return title ? title.split("|")[0].trim() : null;
}

function extractBodyType(fullText, bodyTypeRaw) {
  const haystack = (bodyTypeRaw || "") + " " + fullText;
  for (const p of BODY_TYPE_PATTERNS) {
    if (p.re.test(haystack)) return p.val;
  }
  return null;
}

function extractImageUrls(html) {
  const matches = html.match(/https:\/\/ireland\.apollo\.olxcdn\.com\/v1\/files\/[^"'\s)\\]+/g) || [];
  const seen = new Set();
  const urls = [];
  for (const raw of matches) {
    const clean = raw.replace(/&amp;/g, "&");
    if (!seen.has(clean)) {
      seen.add(clean);
      urls.push(clean);
    }
    if (urls.length >= 16) break;
  }
  return urls;
}

function buildDescription(fields) {
  const lines = [];
  const specLine = [fields.engineCapacity, fields.power && `${fields.power} KM`, fields.gearbox]
    .filter(Boolean)
    .join(" · ");
  if (specLine) lines.push(specLine);
  if (fields.mileage) lines.push(`Przebieg: ${fields.mileage.toLocaleString("pl-PL")} km`);
  if (fields.fuelType) lines.push(`Rodzaj paliwa: ${fields.fuelType}`);
  if (fields.color) lines.push(`Kolor: ${fields.color}`);
  if (fields.condition) lines.push(`Stan: ${fields.condition}`);
  if (fields.accidentFree === true) lines.push("Bezwypadkowy: tak");
  if (fields.accidentFree === false) lines.push("Bezwypadkowy: nie");
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

export default async function handler(req, res) {
  const url = req.query && req.query.url;
  const debug = req.query && (req.query.debug === "1" || req.query.debug === "true");

  if (!url || !/^https?:\/\/(www\.)?otomoto\.pl\//i.test(url)) {
    res.status(400).json({ error: "Podaj prawidłowy link do oferty na otomoto.pl." });
    return;
  }

  const warnings = [];

  try {
    const html = await fetchListingHtml(url);
    const $ = cheerio.load(html);
    const texts = extractLeafTexts($);
    const fields = extractLabelValuePairs(texts);
    const fullText = texts.join(" ");
    const title = extractTitle($);
    const urlGuess = guessBrandModelFromUrl(url);
    const bodyType = extractBodyType(fullText, fields.bodyTypeRaw);
    const imageUrls = extractImageUrls(html);

    if (debug) {
      res.status(200).json({
        debug: true,
        title,
        urlGuess,
        bodyType,
        fields,
        imageUrlsFound: imageUrls,
        leafTextsSample: texts.slice(0, 400),
      });
      return;
    }

    const brand = fields.brand || urlGuess.brand || null;
    const model = fields.model || urlGuess.model || null;

    if (!brand) warnings.push("Nie udało się rozpoznać marki - uzupełnij ręcznie.");
    if (!model) warnings.push("Nie udało się rozpoznać modelu - uzupełnij ręcznie.");
    if (!fields.price) warnings.push("Nie udało się rozpoznać ceny - uzupełnij ręcznie.");
    if (!fields.year) warnings.push("Nie udało się rozpoznać roku produkcji - uzupełnij ręcznie.");
    if (!bodyType) warnings.push("Nie udało się rozpoznać typu nadwozia - wybierz ręcznie z listy.");
    if (imageUrls.length === 0) warnings.push("Nie znaleziono zdjęć na tej stronie.");

    res.status(200).json({
      brand,
      model,
      year: fields.year || null,
      price: fields.price || null,
      monthlyPayment: fields.monthlyPayment || null,
      bodyType,
      description: buildDescription(fields),
      images: imageUrls,
      sourceUrl: url,
      warnings,
    });
  } catch (e) {
    res.status(500).json({ error: "Nie udało się pobrać/przetworzyć ogłoszenia: " + e.message });
  }
}
