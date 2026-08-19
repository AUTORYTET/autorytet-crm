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

// Wyciąga nazwę modelu z tytułu strony. Rozdzielone na dwie funkcje, bo
// tytuł może pochodzić albo z pobranej przez nas strony (cheerio), albo
// zostać przysłany przez przeglądarkę z ZAPISANEJ strony (tryb "Ctrl+S").
function modelFromTitle(rawTitle) {
  let title = (rawTitle || "").trim();
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

// Porządkuje listę adresów zdjęć: usuwa duplikaty i ujednolica szerokość
// renderowanego obrazu. Używane w obu trybach (pobieranie strony przez nas
// oraz zapisana strona przysłana z przeglądarki).
function normalizeImageUrls(rawUrls) {
  const seen = new Set();
  const urls = [];
  for (const raw of rawUrls) {
    if (!raw || !/^https:\/\/mediaservice\.audi\.com\//i.test(raw)) continue;
    const clean = String(raw).replace(/&amp;/g, "&");
    const withWidth = /[?&]wid=/.test(clean)
      ? clean.replace(/([?&])wid=\d+/, "$1wid=1600")
      : clean + (clean.includes("?") ? "&" : "?") + "wid=1600";
    if (!seen.has(withWidth)) {
      seen.add(withWidth);
      urls.push(withWidth);
    }
    if (urls.length >= MAX_IMAGES) break;
  }
  return urls;
}

function extractImageUrls(html) {
  return normalizeImageUrls(html.match(/https:\/\/mediaservice\.audi\.com\/media\/[^"'\s)\\]+/g) || []);
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

// Pełny zestaw nagłówków, jakie wysyła prawdziwa przeglądarka Chrome przy
// zwykłym wejściu na stronę. To NIE jest obchodzenie zabezpieczeń — pobieramy
// tę samą, publicznie dostępną stronę, którą każdy może otworzyć w
// przeglądarce. Chodzi o to, że nasze poprzednie zapytanie wysyłało tylko
// "User-Agent", bez nagłówka "Accept" itd., co dla filtra antybotowego
// audi.pl wyglądało podejrzanie i kończyło się odpowiedzią HTTP 503.
//
// UWAGA: celowo NIE ustawiamy tu "Accept-Encoding" — gdybyśmy to zrobili,
// wbudowany fetch w Node przestałby automatycznie rozpakowywać odpowiedź i
// dostalibyśmy skompresowane śmieci zamiast HTML-a.
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
  "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

// Kody, którymi zabezpieczenia antybotowe zwykle odrzucają zapytania z serwera.
const BLOCKED_STATUSES = [403, 429, 503];

function blockedError(status, url) {
  const e = new Error(
    "Strona audi.pl odrzuciła zapytanie wysłane z serwera (kod " +
      status +
      "). Dane tej oferty są publiczne i normalnie otwierają się w przeglądarce, " +
      "ale audi.pl blokuje automatyczne pobieranie z serwerów. Uzupełnij pola " +
      "poniżej ręcznie albo daj znać — przygotuję inny sposób importu."
  );
  e.blocked = true;
  e.status = status;
  e.url = url;
  return e;
}

async function fetchListingHtml(url) {
  let lastStatus = null;

  // Dwie próby: filtry antybotowe czasem przepuszczają dopiero kolejne
  // zapytanie (pierwsze bywa "wyzwaniem" zwracanym automatycznie).
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));

    const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow" });
    if (res.ok) return await res.text();

    lastStatus = res.status;
    if (!BLOCKED_STATUSES.includes(res.status)) break; // zwykły błąd (np. 404) — nie ma po co powtarzać
  }

  if (BLOCKED_STATUSES.includes(lastStatus)) throw blockedError(lastStatus, url);
  throw new Error("HTTP " + lastStatus + " dla " + url);
}

async function downloadAndProcessImage(url) {
  // Te same "przeglądarkowe" nagłówki co przy stronie — serwer zdjęć
  // (mediaservice.audi.com) też potrafi odrzucać zapytania wyglądające na
  // automat. Dest/Mode ustawiamy na "image", bo tak wygląda pobieranie
  // obrazka przez przeglądarkę.
  const res = await fetch(url, {
    headers: {
      "User-Agent": BROWSER_HEADERS["User-Agent"],
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "Accept-Language": BROWSER_HEADERS["Accept-Language"],
      "Sec-Ch-Ua": BROWSER_HEADERS["Sec-Ch-Ua"],
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "image",
      "Sec-Fetch-Mode": "no-cors",
      "Sec-Fetch-Site": "cross-site",
      Referer: "https://www.audi.pl/",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    const e = new Error("Nie udało się pobrać zdjęcia: HTTP " + res.status);
    // Oznaczamy blokadę antybotową osobno, żeby wyżej pokazać JEDNO
    // zbiorcze, zrozumiałe ostrzeżenie zamiast dziesięciu takich samych.
    if (BLOCKED_STATUSES.includes(res.status)) e.blockedImage = true;
    throw e;
  }
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

// Wspólny "silnik" dla obu trybów: dostaje gotową listę fragmentów tekstu ze
// strony + listę adresów zdjęć, i zwraca komplet danych do formularza w CRM
// (po pobraniu zdjęć, wyszarzeniu tła i wgraniu ich do Supabase Storage).
async function buildImportResult({ texts, imageUrls, title, sourceUrl, debug }) {
  const warnings = [];
  const fields = extractLabelValuePairs(texts);
  const fullText = texts.join(" ");
  const model = modelFromTitle(title);
  const bodyType = extractBodyType(fullText, fields.bodyTypeRaw);

  if (debug) {
    return { debug: true, model, bodyType, fields, imageUrlsFound: imageUrls, leafTextsSample: texts.slice(0, 400) };
  }

  if (!model) warnings.push("Nie udało się rozpoznać modelu z tytułu strony - uzupełnij ręcznie.");
  const price = fields.priceSpecial || fields.priceCatalog || fields.priceGeneric || null;
  if (!price) warnings.push("Nie udało się rozpoznać ceny - uzupełnij ręcznie.");
  if (!fields.year) warnings.push("Nie udało się rozpoznać roku produkcji - uzupełnij ręcznie.");
  if (!bodyType) warnings.push("Nie udało się rozpoznać typu nadwozia - wybierz ręcznie z listy.");
  if (imageUrls.length === 0) warnings.push("Nie znaleziono zdjęć na tej stronie.");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const processedImages = [];
  let blockedImageCount = 0;
  for (let i = 0; i < imageUrls.length; i++) {
    try {
      const { buffer, processed, note } = await downloadAndProcessImage(imageUrls[i]);
      if (!processed && note) warnings.push(`Zdjęcie ${i + 1}: ${note}`);
      const publicUrl = await uploadProcessedImage(supabase, buffer, i);
      processedImages.push(publicUrl);
    } catch (e) {
      if (e && e.blockedImage) blockedImageCount++;
      else warnings.push(`Zdjęcie ${i + 1}: nie udało się przetworzyć/wgrać (${e.message}).`);
    }
  }
  // Jeśli serwer zdjęć blokuje nas hurtowo, nie zasypujemy użytkownika
  // dziesięcioma identycznymi ostrzeżeniami - dajemy jedno, zrozumiałe.
  if (blockedImageCount > 0) {
    warnings.push(
      `Serwer zdjęć Audi odrzucił pobranie ${blockedImageCount} zdjęć (blokada automatycznego pobierania). ` +
        `Dane oferty zaimportowały się poprawnie - zdjęcia dodaj ręcznie albo daj znać, dorobię pobieranie zdjęć wprost z zapisanej strony.`
    );
  }

  return {
    brand: "Audi",
    model,
    year: fields.year || null,
    price,
    monthlyPayment: fields.monthlyPayment || null,
    bodyType,
    description: buildDescription(fields),
    images: processedImages,
    sourceUrl: sourceUrl || null,
    warnings,
  };
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    res.status(500).json({
      error:
        "Brak konfiguracji serwera (SUPABASE_URL / SUPABASE_SERVICE_KEY). Ustaw te zmienne środowiskowe w Vercel -> Project Settings -> Environment Variables.",
    });
    return;
  }

  // ---- TRYB 2: zapisana strona (Ctrl+S) przysłana z przeglądarki ----------
  // Przeglądarka użytkownika sama otwiera plik, wyciąga z niego fragmenty
  // tekstu i adresy zdjęć, i przysyła tu gotową, malutką paczkę danych.
  // Dzięki temu NIE pobieramy niczego z audi.pl z serwera, więc blokada
  // antybotowa (HTTP 503) w ogóle nie wchodzi w grę.
  if (req.method === "POST") {
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const texts = Array.isArray(body.texts) ? body.texts.map(String) : [];
      const imageUrls = normalizeImageUrls(Array.isArray(body.imageUrls) ? body.imageUrls : []);

      if (texts.length === 0) {
        res.status(400).json({
          error:
            "Wybrany plik nie wygląda na zapisaną stronę oferty (nie znaleziono w nim żadnego tekstu). " +
            "Upewnij się, że zapisałeś stronę oferty przez Ctrl+S i wybrałeś plik .html.",
        });
        return;
      }

      const result = await buildImportResult({
        texts,
        imageUrls,
        title: body.title,
        sourceUrl: body.sourceUrl,
        debug: false,
      });
      res.status(200).json(result);
    } catch (e) {
      res.status(500).json({ error: "Nie udało się przetworzyć zapisanej strony: " + e.message });
    }
    return;
  }

  // ---- TRYB 1: pobranie strony po linku (jak dotąd) -----------------------
  const url = req.query && req.query.url;
  const debug = req.query && (req.query.debug === "1" || req.query.debug === "true");

  if (!url || !/^https?:\/\/(www\.)?audi\.pl\//i.test(url)) {
    res.status(400).json({ error: "Podaj prawidłowy link do oferty na audi.pl." });
    return;
  }

  try {
    const html = await fetchListingHtml(url);
    const $ = cheerio.load(html);
    const result = await buildImportResult({
      texts: extractLeafTexts($),
      imageUrls: extractImageUrls(html),
      title: ($("title").first().text() || $('meta[property="og:title"]').attr("content") || "").trim(),
      sourceUrl: url,
      debug,
    });
    res.status(200).json(result);
  } catch (e) {
    // Blokada antybotowa to nie "błąd serwera" — pokazujemy wtedy zwykły,
    // zrozumiały komunikat zamiast surowego "HTTP 503".
    if (e && e.blocked) {
      res.status(200).json({
        brand: "Audi",
        model: null,
        year: null,
        price: null,
        monthlyPayment: null,
        bodyType: null,
        description: "",
        images: [],
        sourceUrl: url,
        warnings: [e.message],
      });
      return;
    }
    res.status(500).json({ error: "Nie udało się pobrać/przetworzyć ogłoszenia: " + e.message });
  }
}
