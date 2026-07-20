import React, { useState } from "react";
import { supabase } from "./supabaseClient.js";

function Logo() {
  return (
    <div style={{ display: "flex", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 30, letterSpacing: 0.5, lineHeight: 1, justifyContent: "center" }}>
      <span style={{ color: "#111111" }}>AUTO</span>
      <span style={{ background: "#E4241B", color: "#fff", padding: "2px 8px", marginLeft: 2, transform: "skewX(-8deg)", display: "inline-block" }}>
        <span style={{ display: "inline-block", transform: "skewX(8deg)" }}>RYTET</span>
      </span>
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

        <div style={{
