// ============================================================================
// AUTORYTET — zakładanie kont pracowników (funkcja serwerowa Vercel)
// Adres: /api/team-access
// ============================================================================
// DLACZEGO TO MUSI BYĆ NA SERWERZE:
// Założenie konta w Supabase wymaga klucza service_role — klucza, który
// omija wszystkie zabezpieczenia bazy. Takiego klucza NIE WOLNO trzymać
// w kodzie strony, bo każdy odwiedzający mógłby go odczytać ze źródła.
// Dlatego klucz siedzi wyłącznie w zmiennych środowiskowych Vercela, a
// przeglądarka prosi tę funkcję o wykonanie operacji w swoim imieniu.
//
// KTO MOŻE Z TEGO SKORZYSTAĆ:
// Funkcja nie wierzy przeglądarce na słowo. Bierze token zalogowanej osoby,
// pyta Supabase kim ona jest, a potem sprawdza w tabeli profiles, czy ta
// osoba ma rolę 'admin'. Doradca albo klient dostanie odmowę, nawet gdyby
// wywołał ten adres ręcznie.
//
// ZMIENNE ŚRODOWISKOWE (są już ustawione w Vercel na potrzeby importu Audi):
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";

const ROLE_PRACOWNIKA = ["admin", "doradca"];

// Hasło tymczasowe bez znaków, które łatwo pomylić przy przepisywaniu
// (0/O, 1/l/I). Ma być podyktowane przez telefon i od razu zmienione.
const ZNAKI = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function losoweHaslo(dlugosc = 14) {
  let out = "";
  for (let i = 0; i < dlugosc; i += 1) out += ZNAKI[randomInt(ZNAKI.length)];
  return out;
}

function odczytajBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Dozwolona jest tylko metoda POST." });
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SERVICE_KEY) {
    res.status(500).json({
      error:
        "Brak konfiguracji serwera (SUPABASE_URL / SUPABASE_SERVICE_KEY). " +
        "Uzupełnij je w Vercel → Project Settings → Environment Variables.",
    });
    return;
  }

  // Token zalogowanej osoby, przysłany przez CRM.
  const naglowek = req.headers.authorization || "";
  const token = naglowek.startsWith("Bearer ") ? naglowek.slice(7).trim() : "";
  if (!token) {
    res.status(401).json({ error: "Brak tokenu logowania. Zaloguj się ponownie w CRM." });
    return;
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // --- Kto pyta? ---
  const { data: whoami, error: whoamiError } = await admin.auth.getUser(token);
  if (whoamiError || !whoami || !whoami.user) {
    res.status(401).json({ error: "Sesja wygasła. Zaloguj się ponownie w CRM." });
    return;
  }
  const proszacy = whoami.user;

  // --- Czy to administrator? ---
  const { data: profilProszacego, error: profilError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", proszacy.id)
    .maybeSingle();

  if (profilError) {
    res.status(500).json({ error: "Nie udało się sprawdzić uprawnień: " + profilError.message });
    return;
  }
  if (!profilProszacego || profilProszacego.role !== "admin") {
    res.status(403).json({ error: "Tę operację może wykonać wyłącznie administrator." });
    return;
  }

  const body = odczytajBody(req);
  const akcja = (body.action || "").toString();

  // ==========================================================================
  // AKCJA: utworzenie konta pracownika
  // ==========================================================================
  if (akcja === "create") {
    const email = (body.email || "").toString().trim().toLowerCase();
    const fullName = (body.fullName || "").toString().trim();
    const role = (body.role || "doradca").toString();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Podaj poprawny adres e-mail." });
      return;
    }
    if (!ROLE_PRACOWNIKA.includes(role)) {
      res.status(400).json({ error: "Rola musi być jedną z: administrator, doradca." });
      return;
    }

    const haslo = losoweHaslo();

    const { data: utworzony, error: createError } = await admin.auth.admin.createUser({
      email,
      password: haslo,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : {},
    });

    if (createError) {
      const komunikat = /already|registered|exists/i.test(createError.message || "")
        ? "Konto o tym adresie e-mail już istnieje. Zmień jego rolę w zakładce „Zespół” zamiast zakładać nowe."
        : "Nie udało się założyć konta: " + createError.message;
      res.status(400).json({ error: komunikat });
      return;
    }

    const nowyId = utworzony && utworzony.user && utworzony.user.id;
    if (!nowyId) {
      res.status(500).json({ error: "Konto powstało, ale Supabase nie zwrócił jego identyfikatora." });
      return;
    }

    // Automat w bazie zakłada profil z rolą 'client' — podnosimy go do roli
    // pracownika. Idzie to kluczem serwerowym, więc blokada zmiany roli
    // (protect_profile_role) tego nie zatrzyma; to jest zaufany kanał.
    const wiersz = { id: nowyId, email, role };
    if (fullName) wiersz.full_name = fullName;

    const { error: profileError } = await admin
      .from("profiles")
      .upsert(wiersz, { onConflict: "id" });

    if (profileError) {
      res.status(500).json({
        error:
          "Konto zostało założone, ale nie udało się nadać roli: " +
          profileError.message +
          ". Ustaw rolę ręcznie w zakładce „Zespół”.",
      });
      return;
    }

    res.status(200).json({
      ok: true,
      email,
      role,
      tempPassword: haslo,
      info:
        "Konto gotowe. Przekaż hasło tymczasowe tej osobie bezpiecznie (np. telefonicznie) " +
        "i poproś, żeby zmieniła je po pierwszym zalogowaniu w Ustawienia → Hasło.",
    });
    return;
  }

  res.status(400).json({ error: "Nieznana operacja." });
}
