import React from "react";
import { LogOut } from "lucide-react";
import logo from "./assets/logo.png";

const RED = "#E4241B";
const GRAY = "#9A9A9A";
const BG = "#F3F3F1";
const WHITE = "#FFFFFF";
const BORDER = "#E7E5E2";

// Logo bierzemy z tego samego pliku co CRM (src/assets/logo.png). Nagłówek
// jest biały — tak samo jak na stronie (header{background:var(--white)})
// i w CRM. Wersja logo z czarnym napisem "AUTO" wymaga jasnego tła, więc
// czarny pasek, który był tu wcześniej, nie mógł jej pokazać.
export default function ClientAccount({ user, profile, onLogout }) {
  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Inter', sans-serif" }}>
      <header
        style={{
          background: WHITE,
          padding: "14px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <img src={logo} alt="AUTORYTET" style={{ height: 42, display: "block" }} />
        <button
          onClick={onLogout}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: "1px solid " + BORDER,
            color: "#111111",
            padding: "8px 14px",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <LogOut size={14} /> Wyloguj
        </button>
      </header>
      {/* Ten sam czarno-czerwony pasek pod nagłówkiem co w CRM. */}
      <div style={{ height: 4, background: "linear-gradient(90deg, #111111 50%, " + RED + " 50%)" }} />

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
        <h1 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 28, marginBottom: 8 }}>
          Witaj, {profile.full_name || user.email}
        </h1>
        <p style={{ color: GRAY, marginBottom: 32 }}>
          To jest Twoje konto klienta AUTORYTET.
        </p>

        <div style={{ background: WHITE, border: "1px solid " + BORDER, borderRadius: 8, padding: 24 }}>
          <h2 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 16, marginBottom: 16, color: RED }}>
            Twoje dane
          </h2>
          <p style={{ marginBottom: 8 }}><strong>E-mail:</strong> {user.email}</p>
          {profile.phone && <p style={{ marginBottom: 8 }}><strong>Telefon:</strong> {profile.phone}</p>}
        </div>

        <div style={{ marginTop: 24, color: GRAY, fontSize: 14 }}>
          Wkrótce znajdziesz tutaj status swojego zamówienia, finansowania oraz wynajmu.
        </div>
      </main>
    </div>
  );
}
