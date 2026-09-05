import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient.js";
import AuthScreen from "./AuthScreen.jsx";
import CRM from "./CRM.jsx";

// Role, które mają prawo wejść do CRM. Konta klientów (rola "client")
// zakładane w panelu „Moje konto" na stronie NIE mają tu wstępu.
const ROLE_PRACOWNIKA = ["admin", "doradca"];

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = logged out
  const [profile, setProfile] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      setProfileLoaded(false);
      return;
    }
    (async () => {
      setProfileLoaded(false);
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      setProfile(data || null);
      setProfileLoaded(true);
    })();
  }, [session]);

  if (session === undefined) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif", color: "#9A9A9A" }}>
        Wczytywanie…
      </div>
    );
  }

  if (!session) return <AuthScreen />;

  if (!profile) {
    // Dopóki profil się wczytuje – komunikat jak dotąd.
    if (!profileLoaded) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif", color: "#9A9A9A" }}>
          Przygotowywanie konta…
        </div>
      );
    }
    // Profil wczytany, ale pusty – konto istnieje w logowaniu, a nie ma go
    // w tabeli profiles. Nie wpuszczamy „na wszelki wypadek".
    return (
      <BrakDostepu
        tytul="Konto niekompletne"
        opis="To konto nie ma jeszcze profilu w systemie. Skontaktuj się z administratorem CRM."
        email={session.user.email}
      />
    );
  }

  // Bramka ról: do CRM wchodzi wyłącznie pracownik.
  if (!ROLE_PRACOWNIKA.includes(profile.role)) {
    return (
      <BrakDostepu
        tytul="Brak dostępu do CRM"
        opis="To konto ma uprawnienia klienta. Panel CRM jest dostępny wyłącznie dla pracowników Autorytet."
        email={session.user.email}
      />
    );
  }

  return <CRM user={session.user} profile={profile} onLogout={() => supabase.auth.signOut()} />;
}

function BrakDostepu({ tytul, opis, email }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "'Inter', sans-serif",
        background: "#F3F3F1",
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          background: "#FFFFFF",
          border: "1px solid #E5E5E2",
          borderRadius: 12,
          padding: 28,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 700, color: "#1A1A1A" }}>{tytul}</div>
        <div style={{ fontSize: 13.5, color: "#6B6B6B", marginTop: 10, lineHeight: 1.55 }}>{opis}</div>
        {email && (
          <div style={{ fontSize: 12, color: "#9A9A9A", marginTop: 14 }}>
            Zalogowano jako: {email}
          </div>
        )}
        <button
          onClick={() => supabase.auth.signOut()}
          style={{
            marginTop: 20,
            width: "100%",
            padding: "10px 16px",
            border: "1px solid #1A1A1A",
            background: "#1A1A1A",
            color: "#FFFFFF",
            borderRadius: 8,
            fontSize: 13.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Wyloguj
        </button>
      </div>
    </div>
  );
}
