/**
 * grayBackground.js
 *
 * Zamienia jednolite/studyjne tło na zdjęciu samochodu na stały szary kolor
 * marki AUTORYTET (#F3F3F1), zostawiając samochód nietknięty.
 *
 * METODA (celowo prosta i szybka, bez modelu AI / zewnętrznego API):
 * 1. Próbkujemy kolor tła z cienkiej ramki wzdłuż krawędzi zdjęcia (zakładamy,
 *    że skrajne piksele to tło, nie samochód - typowe dla zdjęć studyjnych
 *    typu "konfigurator", gdzie auto jest wycentrowane z zapasem miejsca).
 * 2. Wypełnianie floodfill (BFS, 4-sąsiedztwo) od pikseli brzegowych: piksel
 *    dołącza do "tła", jeśli jego kolor jest wystarczająco blisko koloru
 *    próbek brzegowych (próg odległości euklidesowej w RGB). Dzięki temu, że
 *    wypełnianie idzie WYŁĄCZNIE przez sąsiadujące, podobne piksele (a nie
 *    globalnie "wszystkie podobne piksele w całym kadrze"), nawet jasne/białe
 *    samochody zwykle nie zostają "zjedzone" - żeby floodfill wszedł na
 *    nadwozie, musiałby pokonać krawędź/cień/odbicie różniące się kolorem.
 * 3. Maska tła jest lekko rozmywana (feather), żeby przejście tło->auto było
 *    płynne, a nie postrzępione.
 * 4. Piksele tła zamieniane są na szary #F3F3F1, piksele auta zostają bez zmian.
 *
 * OGRANICZENIA: to klasyczna metoda "chroma-key", nie segmentacja AI - dla
 * bardzo skomplikowanych teł (odbicia, gradienty przechodzące w kolor auta)
 * może zadziałać niedoskonale. Dlatego funkcja ma wbudowany "bezpiecznik":
 * jeśli wykryte "tło" obejmuje mniej niż 8% albo więcej niż 92% powierzchni
 * zdjęcia, uznajemy wynik za niepewny i zwracamy ORYGINALNE zdjęcie bez zmian
 * (plus ostrzeżenie) - lepiej zostawić oryginał niż zepsuć zdjęcie auta.
 */

const sharp = require("sharp");

const TARGET_GRAY = { r: 0xf3, g: 0xf3, b: 0xf1 }; // var(--gray-bg) #F3F3F1 z serwisu
const COLOR_DISTANCE_THRESHOLD = 32; // 0-441 (euklidesowo w RGB) - próg "podobny do tła"
const BORDER_SAMPLE_THICKNESS = 3; // grubość ramki, z której próbkujemy kolory tła (px)
const FEATHER_BLUR_SIGMA = 2.2; // rozmycie maski dla płynnej krawędzi
const MIN_BG_FRACTION = 0.08;
const MAX_BG_FRACTION = 0.92;
const MAX_PROCESS_WIDTH = 1280; // przetwarzamy w rozsądnej rozdzielczości (szybciej, mniejszy plik)

function colorDist(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * @param {Buffer} inputBuffer - oryginalne zdjęcie (dowolny format obsługiwany przez sharp)
 * @returns {Promise<{ buffer: Buffer, processed: boolean, note: string|null }>}
 */
async function grayOutBackground(inputBuffer) {
  const image = sharp(inputBuffer).rotate(); // .rotate() bez argumentów = auto-orientacja wg EXIF
  const meta = await image.metadata();

  const scale = meta.width && meta.width > MAX_PROCESS_WIDTH ? MAX_PROCESS_WIDTH / meta.width : 1;
  const workImage = scale < 1 ? image.resize({ width: MAX_PROCESS_WIDTH }) : image;

  const { data, info } = await workImage.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info; // channels === 4 (RGBA) dzięki ensureAlpha()

  // 1) Próbki koloru tła z ramki brzegowej.
  const borderSamples = [];
  const addSample = (x, y) => {
    const idx = (y * width + x) * channels;
    borderSamples.push([data[idx], data[idx + 1], data[idx + 2]]);
  };
  for (let t = 0; t < BORDER_SAMPLE_THICKNESS; t++) {
    for (let x = 0; x < width; x += 4) {
      addSample(x, t);
      addSample(x, height - 1 - t);
    }
    for (let y = 0; y < height; y += 4) {
      addSample(t, y);
      addSample(width - 1 - t, y);
    }
  }

  // 2) Floodfill BFS od pikseli brzegowych.
  const isBg = new Uint8Array(width * height); // 0 = nieznane/auto, 1 = tło
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let qHead = 0, qTail = 0;

  const pixelColor = (x, y) => {
    const idx = (y * width + x) * channels;
    return [data[idx], data[idx + 1], data[idx + 2]];
  };

  const nearAnySample = (r, g, b) => {
    // Dla wydajności: porównujemy tylko z podzbiorem próbek (co 3-cia), tego
    // typu heurystyka jest wystarczająca przy setkach próbek brzegowych.
    for (let i = 0; i < borderSamples.length; i += 3) {
      const s = borderSamples[i];
      if (colorDist(r, g, b, s[0], s[1], s[2]) <= COLOR_DISTANCE_THRESHOLD) return true;
    }
    return false;
  };

  const pushIfBg = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (visited[p]) return;
    visited[p] = 1;
    const [r, g, b] = pixelColor(x, y);
    if (nearAnySample(r, g, b)) {
      isBg[p] = 1;
      queue[qTail++] = p;
    }
  };

  // Start: wszystkie piksele brzegowe (nie tylko próbkowane co 4) sprawdzamy realnie.
  for (let x = 0; x < width; x++) {
    pushIfBg(x, 0);
    pushIfBg(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushIfBg(0, y);
    pushIfBg(width - 1, y);
  }

  while (qHead < qTail) {
    const p = queue[qHead++];
    const x = p % width;
    const y = (p - x) / width;
    pushIfBg(x + 1, y);
    pushIfBg(x - 1, y);
    pushIfBg(x, y + 1);
    pushIfBg(x, y - 1);
  }

  let bgCount = 0;
  for (let i = 0; i < isBg.length; i++) bgCount += isBg[i];
  const bgFraction = bgCount / (width * height);

  if (bgFraction < MIN_BG_FRACTION || bgFraction > MAX_BG_FRACTION) {
    // Niepewny wynik - nie ryzykujemy zepsucia zdjęcia, zwracamy oryginał.
    const originalBuffer = await sharp(inputBuffer).rotate().jpeg({ quality: 90 }).toBuffer();
    return {
      buffer: originalBuffer,
      processed: false,
      note:
        `Nie udało się bezpiecznie wykryć tła na jednym ze zdjęć (wykryto ${Math.round(bgFraction * 100)}% ` +
        `powierzchni jako tło) - zostawiono oryginalne zdjęcie bez zmiany tła.`,
    };
  }

  // 3) Maska -> osobny bufor jednokanałowy (0/255), rozmycie (feather).
  const maskRaw = Buffer.alloc(width * height);
  for (let i = 0; i < isBg.length; i++) maskRaw[i] = isBg[i] ? 255 : 0;
  // WAŻNE: .toColourspace("b-w") jest konieczne, bo inaczej sharp po .blur()
  // potrafi po cichu zwrócić bufor 3-kanałowy (RGB) zamiast 1-kanałowego,
  // co przesuwa indeksy i psuje całą maskę (sprawdzone empirycznie).
  const { data: featheredMask, info: featheredInfo } = await sharp(maskRaw, {
    raw: { width, height, channels: 1 },
  })
    .toColourspace("b-w")
    .blur(FEATHER_BLUR_SIGMA)
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (featheredInfo.channels !== 1) {
    throw new Error(`Nieoczekiwana liczba kanałów maski po rozmyciu: ${featheredInfo.channels}`);
  }

  // 4) Kompozycja: piksel_wynik = oryginał*(1-a) + szary*a, gdzie a = maska/255.
  const out = Buffer.alloc(width * height * 3); // RGB, bez alfy na wyjściu
  for (let i = 0; i < width * height; i++) {
    const a = featheredMask[i] / 255;
    const srcIdx = i * channels;
    const dstIdx = i * 3;
    out[dstIdx] = Math.round(data[srcIdx] * (1 - a) + TARGET_GRAY.r * a);
    out[dstIdx + 1] = Math.round(data[srcIdx + 1] * (1 - a) + TARGET_GRAY.g * a);
    out[dstIdx + 2] = Math.round(data[srcIdx + 2] * (1 - a) + TARGET_GRAY.b * a);
  }

  const finalBuffer = await sharp(out, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 90 })
    .toBuffer();

  return { buffer: finalBuffer, processed: true, note: null };
}

module.exports = { grayOutBackground, TARGET_GRAY, COLOR_DISTANCE_THRESHOLD };
