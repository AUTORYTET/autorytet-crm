import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient.js";
import AuthScreen from "./AuthScreen.jsx";
import CRM from "./CRM.jsx";

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = logged out
  const [profile, setProfile] = useState(null);

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
      return;
    }
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      setProfile(data || null);
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
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif", color: "#9A9A9A" }}>
        Przygotowywanie konta…
      </div>
    );
  }

  return <CRM user={session.user} profile={profile} onLogout={() => supabase.auth.signOut()} />;
}
