import React from "react";
import { LogOut } from "lucide-react";

const RED = "#E4241B";
const BLACK = "#111111";
const GRAY = "#9A9A9A";
const BG = "#F3F3F1";

export default function ClientAccount({ user, profile, onLogout }) {
  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Inter', sans-serif" }}>
      <header
        style={{
          background: BLACK,
          padding: "18px 32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ color: "#fff", fontFamily: "'Oswald', sans-serif", fontWeight: 600, letterSpacing: "0.05em" }}>
          AUTORYTET
        </div>
        <button
          onClick={onLogout}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: "1px solid #444",
            color: "#fff",
            padding: "8px 14px",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          <LogOut size={14} /> Wyloguj
        </button>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
        <h1 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 28, marginBottom: 8 }}>
          Witaj, {profile.full_name || user.email}
        </h1>
        <p style={{ color: GRAY, marginBottom: 32 }}>
          To jest Twoje konto klienta AUTORYTET.
        </p>

        <div style={{ background: "#fff", border: "1px solid #E7E5E2", borderRadius: 8, padding: 24 }}>
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
