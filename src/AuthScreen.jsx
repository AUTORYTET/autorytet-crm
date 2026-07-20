import React, { useState } from "react";
import { supabase } from "./supabaseClient.js";
import logo from "./assets/logo.png";

function Logo() {
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <img src={logo} alt="Autorytet" style={{ height: 56, display: "block" }} />
    </div>
  );
}

export default function AuthScreen() {
  const [mode, setMode] = useState("login"); // login | register
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "register") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name } },
        });
        if (error) throw error;
        setInfo("Konto utworzone! Sprawdź e-mail, jeśli wymagane jest potwierdzenie, albo po prostu się zaloguj.");
        setMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(err.message || "Coś poszło nie tak.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F3F3F1", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 12, border: "1px solid #E7E5E2", padding: 32 }}>
        <div style={{ marginBottom: 6 }}><Logo /></div>
        <div style={{ textAlign: "center", fontSize: 11, letterSpacing: 1.5, color: "#9A9A9A", fontWeight: 600, textTransform: "uppercase", marginBottom: 24 }}>
          Certyfikowani Doradcy Motoryzacyjni
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 20, background: "#F0EFEC", borderRadius: 8, padding: 4 }}>
          <button
            onClick={() => setMode("login")}
            style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", background: mode === "login" ? "#111111" : "transparent", color: mode === "login" ? "#fff" : "#111111" }}
          >
            Logowanie
          </button>
          <button
            onClick={() => setMode("register")}
            style={{ flex: 1, padding: "8px 0", borderRadius: 6, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", background: mode === "register" ? "#111111" : "transparent", color: mode === "register" ? "#fff" : "#111111" }}
          >
            Rejestracja
          </button>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mode === "register" && (
            <div>
              <label style={label}>Imię i nazwisko</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required style={input} />
            </div>
          )}
          <div>
            <label style={label}>E-mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={input} />
          </div>
          <div>
            <label style={label}>Hasło</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} style={input} />
          </div>

          {error && <div style={{ background: "#FCEBEA", color: "#E4241B", fontSize: 12.5, padding: "8px 10px", borderRadius: 6 }}>{error}</div>}
          {info && <div style={{ background: "#EAF5EE", color: "#1C8A4B", fontSize: 12.5, padding: "8px 10px", borderRadius: 6 }}>{info}</div>}

          <button type="submit" disabled={loading} style={{ marginTop: 6, background: "#E4241B", color: "#fff", border: "none", borderRadius: 8, padding: "11px 0", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
            {loading ? "Chwileczkę…" : mode === "login" ? "Zaloguj się" : "Utwórz konto"}
          </button>
        </form>

        {mode === "register" && (
          <div style={{ marginTop: 14, fontSize: 11.5, color: "#9A9A9A", textAlign: "center" }}>
            Pierwsza osoba, która się zarejestruje, automatycznie zostaje administratorem.
          </div>
        )}
      </div>
    </div>
  );
}

const label = { fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "#9A9A9A", display: "block", marginBottom: 4 };
const input = { border: "1px solid #E7E5E2", borderRadius: 8, padding: "9px 10px", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box" };
