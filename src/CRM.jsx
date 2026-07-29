import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Phone, Mail, MapPin, Building2, Car, Wallet, CalendarClock, Plus,
  Search, CheckCircle2, Circle, X, LayoutGrid, Users, ListChecks,
  Handshake, Bell, Trash2, ChevronRight, LogOut, Loader2, Settings, UserPlus, Edit2,
  Tag, Pin, Send
} from "lucide-react";
import { supabase } from "./supabaseClient.js";

/* ---------- Design tokens ----------
  Black  #111111   Red  #E4241B   White #FFFFFF
  Grey (label)  #9A9A9A   Grey (bg) #F3F3F1   Line #E7E5E2
--------------------------------------*/

const FONT_LINK_ID = "autorytet-fonts";
function useFonts() {
  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return;
    const link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
  }, []);
}

const STATUSES = [
  { key: "nowy", label: "Nowy kontakt", color: "#9A9A9A" },
  { key: "kontakt", label: "W kontakcie", color: "#2F6FED" },
  { key: "negocjacje", label: "Negocjacje", color: "#E4241B" },
  { key: "sprzedane", label: "Sprzedane", color: "#1C8A4B" },
  { key: "utracony", label: "Utracony", color: "#6B6B6B" },
];

const FINANCING = ["Gotówka", "Kredyt", "Leasing", "Raty"];

const VEHICLE_STATUSES = [
  { key: "dostepny", label: "Dostępny", color: "#1C8A4B" },
  { key: "rezerwacja", label: "Zarezerwowany", color: "#E4A400" },
  { key: "sprzedany", label: "Sprzedany", color: "#6B6B6B" },
];

const BODY_TYPES = ["SUV", "Sedan", "Kombi", "Coupe", "Hatchback", "Cabrio", "Van"];

const TASK_TYPES = {
  call: { label: "Telefon", icon: Phone },
  email: { label: "E-mail", icon: Mail },
  meeting: { label: "Spotkanie", icon: Handshake },
  note: { label: "Przypomnienie", icon: Bell },
};

const LEAD_SOURCES = ["Telefon", "Formularz WWW", "Polecenie", "Media społecznościowe", "Salon / wizyta", "Inne"];

const STATUS_PROBABILITY = {
  nowy: 10,
  kontakt: 30,
  negocjacje: 60,
  sprzedane: 100,
  utracony: 0,
};

function daysLeftInMonth() {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return Math.max(0, Math.round((end - now) / 86400000) + 1);
}

function fmtDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return d;
  }
}

function fmtDateTime(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return d;
  }
}

function daysUntil(d) {
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

/* ---------- DB <-> UI mapping ---------- */
function clientFromDb(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    nip: row.nip,
    carInterest: row.car_model,
    budget: row.budget,
    financing: row.financing_type,
    decisionDate: row.deadline,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    contactPerson: row.contact_person || "",
    source: row.source || "",
    tags: Array.isArray(row.tags) ? row.tags : [],
    pinnedNote: row.pinned_note || "",
    statusChangedAt: row.status_changed_at || row.created_at,
  };
}
function clientToDb(c, fallbackOwnerId) {
  return {
    name: c.name, phone: c.phone, email: c.email, address: c.address, nip: c.nip,
    car_model: c.carInterest, budget: c.budget ? Number(c.budget) : null,
    financing_type: c.financing, deadline: c.decisionDate || null,
    status: c.status, notes: c.notes, owner_id: c.ownerId || fallbackOwnerId,
    contact_person: c.contactPerson || null,
    source: c.source || null,
    tags: Array.isArray(c.tags) && c.tags.length ? c.tags : null,
    pinned_note: c.pinnedNote || null,
  };
}
function taskFromDb(row) {
  return {
    id: row.id, clientId: row.client_id, ownerId: row.owner_id,
    type: row.type, title: row.title, dueDate: row.due_date, done: row.done, createdAt: row.created_at,
  };
}
function taskToDb(t, ownerId) {
  return {
    client_id: t.clientId, type: t.type, title: t.title,
    due_date: t.dueDate || null, done: !!t.done, owner_id: ownerId,
  };
}
function activityFromDb(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    ownerId: row.owner_id,
    type: row.type,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
  };
}
function activityToDb(a, ownerId) {
  return {
    client_id: a.clientId, type: a.type, title: a.title, body: a.body, owner_id: ownerId,
  };
}

/* ---------- Logo ---------- */
import logo from "./assets/logo.png";

function vehicleFromDb(row) {
  return {
    id: row.id,
    brand: row.brand || "",
    model: row.model || "",
    year: row.year || "",
    price: row.price || "",
    monthlyPayment: row.monthly_payment || "",
    bodyType: row.body_type || "",
    description: row.description || "",
    status: row.status || "dostepny",
    imageUrl: row.image_url || "",
    imageUrls: Array.isArray(row.image_urls) ? row.image_urls : [],
    sourceUrl: row.source_url || "",
    createdAt: row.created_at,
  };
}
function vehicleToDb(v) {
  return {
    brand: v.brand,
    model: v.model,
    year: v.year ? Number(v.year) : null,
    price: v.price ? Number(v.price) : null,
    monthly_payment: v.monthlyPayment ? Number(v.monthlyPayment) : null,
    body_type: v.bodyType,
    description: v.description,
    status: v.status || "dostepny",
    image_url: v.imageUrl || null,
    image_urls: v.imageUrls && v.imageUrls.length ? v.imageUrls : null,
    source_url: v.sourceUrl || null,
  };
}

function Logo({ compact }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <img src={logo} alt="Autorytet" style={{ height: compact ? 32 : 42, display: "block" }} />
    </div>
  );
}

function StatusPill({ statusKey }) {
  const s = STATUSES.find((x) => x.key === statusKey) || STATUSES[0];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600,
      textTransform: "uppercase", letterSpacing: 0.4, color: s.color, background: `${s.color}14`,
      padding: "4px 9px", borderRadius: 20,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color }} />
      {s.label}
    </span>
  );
}

/* ---------- Main App ---------- */
export default function CRM({ user, profile, onLogout }) {
  useFonts();
  const [clients, setClients] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [activities, setActivities] = useState([]);
  const [staff, setStaff] = useState([]);
  const [goals, setGoals] = useState({ contactsTarget: 10, dealsTarget: 5, valueTarget: 100000 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [showClientForm, setShowClientForm] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [vehicleStatusFilter, setVehicleStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [
        { data: clientRows, error: e1 },
        { data: taskRows, error: e2 },
        { data: vehicleRows, error: e3 },
        activityRes,
        staffRes,
        goalsRes,
      ] = await Promise.all([
        supabase.from("clients").select("*").order("created_at", { ascending: false }),
        supabase.from("tasks").select("*").order("due_date", { ascending: true }),
        supabase.from("cars").select("*").order("created_at", { ascending: false }),
        supabase.from("client_activities").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("*"),
        supabase.from("goals").select("*").eq("id", 1).maybeSingle(),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      setClients((clientRows || []).map(clientFromDb));
      setTasks((taskRows || []).map(taskFromDb));
      setVehicles((vehicleRows || []).map(vehicleFromDb));
      // client_activities / profiles / goals to nowe tabele — jeśli migration.sql
      // nie został jeszcze uruchomiony, ich błąd jest ignorowany i nie blokuje reszty CRM.
      setActivities(activityRes.error ? [] : (activityRes.data || []).map(activityFromDb));
      setStaff(staffRes.error ? [] : (staffRes.data || []));
      if (!goalsRes.error && goalsRes.data) {
        setGoals({
          contactsTarget: goalsRes.data.contacts_target,
          dealsTarget: goalsRes.data.deals_target,
          valueTarget: goalsRes.data.value_target,
        });
      }
    } catch (e) {
      setError("Nie udało się wczytać danych: " + (e.message || ""));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const upsertClient = useCallback(async (client) => {
    try {
      if (client.id) {
        const { data, error } = await supabase.from("clients").update(clientToDb(client, user.id)).eq("id", client.id).select().single();
        if (error) throw error;
        setClients((prev) => prev.map((c) => (c.id === data.id ? clientFromDb(data) : c)));
        return clientFromDb(data);
      } else {
        const { data, error } = await supabase.from("clients").insert(clientToDb(client, user.id)).select().single();
        if (error) throw error;
        setClients((prev) => [clientFromDb(data), ...prev]);
        return clientFromDb(data);
      }
    } catch (e) {
      setError("Nie udało się zapisać klienta: " + (e.message || ""));
      return null;
    }
  }, [user.id]);

  const removeClient = useCallback(async (id) => {
    const prevClients = clients;
    const prevTasks = tasks;
    setClients((prev) => prev.filter((c) => c.id !== id));
    setTasks((prev) => prev.filter((t) => t.clientId !== id));
    if (selectedClientId === id) setSelectedClientId(null);
    try {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    } catch (e) {
      setClients(prevClients);
      setTasks(prevTasks);
      setError("Nie udało się usunąć klienta: " + (e.message || ""));
    }
  }, [selectedClientId, clients, tasks]);

  const upsertTask = useCallback(async (task) => {
    try {
      if (task.id) {
        const { data, error } = await supabase.from("tasks").update(taskToDb(task, user.id)).eq("id", task.id).select().single();
        if (error) throw error;
        setTasks((prev) => prev.map((t) => (t.id === data.id ? taskFromDb(data) : t)));
      } else {
        const { data, error } = await supabase.from("tasks").insert(taskToDb(task, user.id)).select().single();
        if (error) throw error;
        setTasks((prev) => [taskFromDb(data), ...prev]);
      }
    } catch (e) {
      setError("Nie udało się zapisać zadania: " + (e.message || ""));
    }
  }, [user.id]);

  const removeTask = useCallback(async (id) => {
    const prevTasks = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    } catch (e) {
      setTasks(prevTasks);
      setError("Nie udało się usunąć zadania: " + (e.message || ""));
    }
  }, [tasks]);

  const upsertVehicle = useCallback(async (vehicle) => {
    try {
      if (vehicle.id) {
        const { data, error } = await supabase.from("cars").update(vehicleToDb(vehicle)).eq("id", vehicle.id).select().single();
        if (error) throw error;
        setVehicles((prev) => prev.map((v) => (v.id === data.id ? vehicleFromDb(data) : v)));
      } else {
        const { data, error } = await supabase.from("cars").insert(vehicleToDb(vehicle)).select().single();
        if (error) throw error;
        setVehicles((prev) => [vehicleFromDb(data), ...prev]);
      }
    } catch (e) {
      setError("Nie udało się zapisać pojazdu: " + (e.message || ""));
    }
  }, []);

  const removeVehicle = useCallback(async (id) => {
    const prevVehicles = vehicles;
    setVehicles((prev) => prev.filter((v) => v.id !== id));
    try {
      const { error } = await supabase.from("cars").delete().eq("id", id);
      if (error) throw error;
    } catch (e) {
      setVehicles(prevVehicles);
      setError("Nie udało się usunąć pojazdu: " + (e.message || ""));
    }
  }, [vehicles]);

  const addActivity = useCallback(async (activity) => {
    try {
      const { data, error } = await supabase.from("client_activities").insert(activityToDb(activity, user.id)).select().single();
      if (error) throw error;
      setActivities((prev) => [activityFromDb(data), ...prev]);
    } catch (e) {
      setError("Nie udało się zapisać wpisu historii kontaktu: " + (e.message || ""));
    }
  }, [user.id]);

  const removeActivity = useCallback(async (id) => {
    const prevActivities = activities;
    setActivities((prev) => prev.filter((a) => a.id !== id));
    try {
      const { error } = await supabase.from("client_activities").delete().eq("id", id);
      if (error) throw error;
    } catch (e) {
      setActivities(prevActivities);
      setError("Nie udało się usunąć wpisu: " + (e.message || ""));
    }
  }, [activities]);

  const updateGoals = useCallback(async (nextGoals) => {
    try {
      const { error } = await supabase.from("goals").update({
        contacts_target: nextGoals.contactsTarget,
        deals_target: nextGoals.dealsTarget,
        value_target: nextGoals.valueTarget,
      }).eq("id", 1);
      if (error) throw error;
      setGoals(nextGoals);
    } catch (e) {
      setError("Nie udało się zapisać celów: " + (e.message || ""));
    }
  }, []);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => vehicleStatusFilter === "all" || v.status === vehicleStatusFilter);
  }, [vehicles, vehicleStatusFilter]);

  const clientNameById = useMemo(() => {
    const map = {};
    clients.forEach((c) => { map[c.id] = c.name; });
    return map;
  }, [clients]);

  const staffNameById = useMemo(() => {
    const map = {};
    staff.forEach((p) => { map[p.id] = p.full_name || p.email || "—"; });
    return map;
  }, [staff]);

  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      const matchesSearch =
        !search ||
        [c.name, c.phone, c.email, c.carInterest, c.nip].join(" ").toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [clients, search, statusFilter]);

  const upcomingTasks = useMemo(() => {
    return tasks
      .filter((t) => !t.done)
      .map((t) => ({ ...t, days: daysUntil(t.dueDate), clientName: clientNameById[t.clientId] || "—" }))
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }, [tasks, clientNameById]);

  const doneTasksWithNames = useMemo(() => {
    return tasks.filter((t) => t.done).map((t) => ({ ...t, clientName: clientNameById[t.clientId] || "—" }));
  }, [tasks, clientNameById]);

  const selectedClient = clients.find((c) => c.id === selectedClientId) || null;

  if (loading) {
    return (
      <div style={{ ...S.appShell, alignItems: "center", justifyContent: "center", minHeight: 420, display: "flex" }}>
        <div style={{ fontFamily: "'Inter', sans-serif", color: "#9A9A9A", display: "flex", alignItems: "center", gap: 8 }}>
          <Loader2 size={16} className="spin" /> Wczytywanie danych…
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F3F3F1", padding: 20 }}>
      <div style={S.appShell}>
        <style>{`
          * { box-sizing: border-box; }
          button { font-family: 'Inter', sans-serif; cursor: pointer; }
          input, select, textarea { font-family: 'Inter', sans-serif; }
          ::placeholder { color: #B7B5B1; }
          .hoverRow:hover { background: #FAFAF9; }
          .navBtn:hover { background: #1c1c1c; }
          .iconBtn:hover { background: #F0EFEC; }
          .spin { animation: spin 1s linear infinite; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>

        <header style={S.header}>
          <Logo />
          <nav style={{ display: "flex", gap: 6 }}>
            <NavBtn active={tab === "dashboard"} onClick={() => setTab("dashboard")} icon={LayoutGrid} label="Pulpit" />
            <NavBtn active={tab === "clients"} onClick={() => { setTab("clients"); setSelectedClientId(null); }} icon={Users} label="Klienci" />
            <NavBtn active={tab === "tasks"} onClick={() => setTab("tasks")} icon={ListChecks} label="Zadania" />
            <NavBtn active={tab === "vehicles"} onClick={() => setTab("vehicles")} icon={Car} label="Pojazdy" />
            {profile.role === "admin" && (
              <NavBtn active={tab === "settings"} onClick={() => setTab("settings")} icon={Settings} label="Ustawienia" />
            )}
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{profile.name || profile.email}</div>
              <div style={{ fontSize: 10.5, color: "#9A9A9A", textTransform: "uppercase", fontWeight: 700 }}>
                {profile.role === "admin" ? "Administrator" : "Doradca"}
              </div>
            </div>
            <button onClick={onLogout} title="Wyloguj" style={{ background: "#F0EFEC", border: "none", borderRadius: 8, padding: 8 }}>
              <LogOut size={15} />
            </button>
          </div>
        </header>
        <div style={S.headerWedge} />

        {error && (
          <div style={S.errorBanner}>
            {error}
            <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "#fff", marginLeft: 12 }}>
              <X size={14} />
            </button>
          </div>
        )}

        <main style={S.main}>
          {tab === "dashboard" && (
            <Dashboard
              clients={clients}
              tasks={upcomingTasks}
              goals={goals}
              onOpenClient={(id) => { setSelectedClientId(id); setTab("clients"); }}
            />
          )}

          {tab === "clients" && !selectedClient && (
            <ClientsList
              clients={filteredClients}
              search={search}
              setSearch={setSearch}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              onSelect={setSelectedClientId}
              onAdd={() => { setEditingClient(null); setShowClientForm(true); }}
            />
          )}

          {tab === "clients" && selectedClient && (
            <ClientDetail
              client={selectedClient}
              tasks={tasks.filter((t) => t.clientId === selectedClient.id)}
              activities={activities.filter((a) => a.clientId === selectedClient.id)}
              staffName={staffNameById[selectedClient.ownerId] || "—"}
              onBack={() => setSelectedClientId(null)}
              onEdit={() => { setEditingClient(selectedClient); setShowClientForm(true); }}
              onDelete={() => removeClient(selectedClient.id)}
              onAddTask={(task) => upsertTask(task)}
              onToggleTask={(task) => upsertTask({ ...task, done: !task.done })}
              onDeleteTask={(id) => removeTask(id)}
              onAddActivity={(activity) => addActivity(activity)}
              onDeleteActivity={(id) => removeActivity(id)}
              onUpdateClient={(patch) => upsertClient({ ...selectedClient, ...patch })}
            />
          )}

          {tab === "tasks" && (
            <TasksBoard
              tasks={upcomingTasks}
              doneTasks={doneTasksWithNames}
              onToggleTask={(task) => upsertTask({ ...task, done: !task.done })}
              onOpenClient={(id) => { setSelectedClientId(id); setTab("clients"); }}
            />
          )}

          {tab === "vehicles" && (
            <VehiclesList
              vehicles={filteredVehicles}
              statusFilter={vehicleStatusFilter}
              setStatusFilter={setVehicleStatusFilter}
              onAdd={() => { setEditingVehicle(null); setShowVehicleForm(true); }}
              onEdit={(v) => { setEditingVehicle(v); setShowVehicleForm(true); }}
              onDelete={(id) => removeVehicle(id)}
            />
          )}

          {tab === "settings" && profile.role === "admin" && (
            <SettingsPanel user={user} goals={goals} onUpdateGoals={updateGoals} />
          )}
        </main>

        {showClientForm && (
          <ClientFormModal
            initial={editingClient}
            staff={staff}
            canReassign={profile.role === "admin"}
            currentUserId={user.id}
            onClose={() => setShowClientForm(false)}
            onSave={async (client) => {
              const saved = await upsertClient(client);
              setShowClientForm(false);
              if (saved) setSelectedClientId(saved.id);
            }}
          />
        )}

        {showVehicleForm && (
          <VehicleFormModal
            initial={editingVehicle}
            onClose={() => setShowVehicleForm(false)}
            onSave={async (vehicle) => {
              await upsertVehicle(vehicle);
              setShowVehicleForm(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

function NavBtn({ active, onClick, icon: Icon, label }) {
  return (
    <button className="navBtn" onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 8, border: "none",
      background: active ? "#111111" : "transparent", color: active ? "#fff" : "#111111",
      fontSize: 13, fontWeight: 600, transition: "background .15s",
    }}>
      <Icon size={15} /> {label}
    </button>
  );
}

/* ---------- Dashboard ---------- */
function Dashboard({ clients, tasks, goals, onOpenClient }) {
  const urgent = tasks.filter((t) => t.days !== null && t.days <= 2);
  const totalBudget = clients.reduce((sum, c) => sum + (Number(c.budget) || 0), 0);
  const funnel = STATUSES.map((s) => ({ ...s, count: clients.filter((c) => c.status === s.key).length }));
  const maxCount = Math.max(1, ...funnel.map((f) => f.count));

  const now = new Date();
  const isThisMonth = (d) => {
    if (!d) return false;
    const dt = new Date(d);
    return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();
  };
  const addedThisMonth = clients.filter((c) => isThisMonth(c.createdAt)).length;
  const dealsThisMonth = clients.filter((c) => isThisMonth(c.createdAt) && c.status !== "utracony").length;
  const openValue = clients
    .filter((c) => c.status !== "sprzedane" && c.status !== "utracony")
    .reduce((s, c) => s + (Number(c.budget) || 0), 0);
  const wonThisMonth = clients.filter((c) => c.status === "sprzedane" && isThisMonth(c.statusChangedAt)).length;
  const lostThisMonth = clients.filter((c) => c.status === "utracony" && isThisMonth(c.statusChangedAt)).length;
  const daysLeft = daysLeftInMonth();
  const goalRows = [
    { label: "Nowi klienci", value: addedThisMonth, target: goals.contactsTarget },
    { label: "Nowe szanse sprzedaży", value: dealsThisMonth, target: goals.dealsTarget },
    { label: "Wartość otwartych szans", value: openValue, target: goals.valueTarget, isCurrency: true },
  ];

  return (
    <div style={S.stack}>
      <section style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
          <h3 style={S.cardTitle}>Twoje statystyki</h3>
          <span style={{ fontSize: 11.5, color: "#9A9A9A", fontWeight: 600 }}>
            Zostało {daysLeft} {daysLeft === 1 ? "dzień" : "dni"} do końca miesiąca
          </span>
        </div>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginTop: 16 }}>
          <div style={{ flex: 1.4, minWidth: 260 }}>
            <div style={{ ...S.label, marginBottom: 10 }}>Cele miesięczne</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {goalRows.map((g) => {
                const pct = g.target > 0 ? Math.min(100, Math.round((g.value / g.target) * 100)) : 0;
                return (
                  <div key={g.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>{g.label}</span>
                      <span style={{ color: "#9A9A9A" }}>
                        {g.isCurrency
                          ? `${g.value.toLocaleString("pl-PL")} / ${g.target.toLocaleString("pl-PL")} zł`
                          : `${g.value} z ${g.target}`}
                      </span>
                    </div>
                    <div style={{ background: "#F0EFEC", borderRadius: 6, height: 8, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, background: pct >= 100 ? "#1C8A4B" : "#111111", height: "100%", borderRadius: 6 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ ...S.label, marginBottom: 10 }}>Podsumowanie tego miesiąca</div>
            <div style={{ display: "flex", gap: 20 }}>
              <SummaryFigure value={addedThisMonth} label="Dodane" color="#111111" />
              <SummaryFigure value={wonThisMonth} label="Wygrane" color="#1C8A4B" />
              <SummaryFigure value={lostThisMonth} label="Przegrane" color="#E4241B" />
            </div>
          </div>
        </div>
      </section>

      <div style={S.statRow}>
        <StatCard label="Klienci" value={clients.length} />
        <StatCard label="Aktywne zadania" value={tasks.length} />
        <StatCard label="Pilne (≤2 dni)" value={urgent.length} />
        <StatCard label="Łączny budżet" value={`${totalBudget.toLocaleString("pl-PL")} zł`} />
      </div>

      <div style={S.twoCol}>
        <section style={{ ...S.card, flex: 1.2 }}>
          <h3 style={S.cardTitle}>Lejek sprzedaży</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            {funnel.map((f) => (
              <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 110, fontSize: 12, color: "#6B6B6B", fontWeight: 600 }}>{f.label}</div>
                <div style={{ flex: 1, background: "#F0EFEC", borderRadius: 6, height: 18, overflow: "hidden" }}>
                  <div style={{ width: `${(f.count / maxCount) * 100}%`, background: f.color, height: "100%", borderRadius: 6 }} />
                </div>
                <div style={{ width: 24, fontSize: 12.5, fontWeight: 700, textAlign: "right" }}>{f.count}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ ...S.card, flex: 1 }}>
          <h3 style={S.cardTitle}>Wymaga uwagi</h3>
          {urgent.length === 0 && <EmptyNote text="Brak pilnych zadań." />}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {urgent.slice(0, 6).map((t) => (
              <button key={t.id} className="hoverRow" onClick={() => onOpenClient(t.clientId)} style={S.urgentRow}>
                <Bell size={14} color="#E4241B" />
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</div>
                  <div style={{ fontSize: 11, color: "#9A9A9A" }}>{t.clientName}</div>
                </div>
                <ChevronRight size={14} color="#9A9A9A" />
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function SummaryFigure({ value, label, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 26, fontWeight: 600, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#9A9A9A", textTransform: "uppercase", fontWeight: 700, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ ...S.card, minWidth: 150 }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: "#9A9A9A", fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 32, fontWeight: 600, marginTop: 4, color: "#111111" }}>{value}</div>
    </div>
  );
}

function EmptyNote({ text }) {
  return <div style={{ fontSize: 13, color: "#9A9A9A", marginTop: 10 }}>{text}</div>;
}

/* ---------- Clients list ---------- */
function ClientsList({ clients, search, setSearch, statusFilter, setStatusFilter, onSelect, onAdd }) {
  return (
    <div style={S.stack}>
      <div style={S.toolbar}>
        <div style={S.searchBox}>
          <Search size={15} color="#9A9A9A" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj klienta, telefonu, e-maila, modelu…"
            style={S.searchInput}
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={S.select}>
          <option value="all">Wszystkie statusy</option>
          {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <button onClick={onAdd} style={S.primaryBtn}>
          <Plus size={15} /> Nowy klient
        </button>
      </div>

      {clients.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center", padding: 48 }}>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, marginBottom: 6 }}>Brak klientów</div>
          <div style={{ fontSize: 13, color: "#9A9A9A", marginBottom: 16 }}>Dodaj pierwszego klienta, aby zacząć budować bazę.</div>
          <button onClick={onAdd} style={{ ...S.primaryBtn, margin: "0 auto" }}><Plus size={15} /> Nowy klient</button>
        </div>
      ) : (
        <div style={S.card}>
          <div style={S.tableHeader}>
            <span style={{ flex: 2 }}>Klient</span>
            <span style={{ flex: 1.4 }}>Interesuje go</span>
            <span style={{ flex: 1 }}>Budżet</span>
            <span style={{ flex: 1.2 }}>Decyzja</span>
            <span style={{ flex: 1.2 }}>Status</span>
          </div>
          {clients.map((c) => {
            const d = daysUntil(c.decisionDate);
            return (
              <button key={c.id} className="hoverRow" onClick={() => onSelect(c.id)} style={S.tableRow}>
                <span style={{ flex: 2, textAlign: "left" }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{c.name}</div>
                  <div style={{ fontSize: 11.5, color: "#9A9A9A" }}>{c.phone}</div>
                  {c.tags && c.tags.length > 0 && (
                    <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                      {c.tags.slice(0, 3).map((t) => (
                        <span key={t} style={{ fontSize: 10, fontWeight: 700, background: "#F0EFEC", borderRadius: 10, padding: "2px 7px" }}>{t}</span>
                      ))}
                    </div>
                  )}
                </span>
                <span style={{ flex: 1.4, fontSize: 13, textAlign: "left" }}>{c.carInterest || "—"}</span>
                <span style={{ flex: 1, fontSize: 13, textAlign: "left" }}>{c.budget ? `${Number(c.budget).toLocaleString("pl-PL")} zł` : "—"}</span>
                <span style={{ flex: 1.2, fontSize: 13, textAlign: "left", color: d !== null && d <= 2 ? "#E4241B" : "#111111", fontWeight: d !== null && d <= 2 ? 700 : 400 }}>
                  {fmtDate(c.decisionDate)}
                </span>
                <span style={{ flex: 1.2, textAlign: "left" }}><StatusPill statusKey={c.status} /></span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- Client detail ---------- */
function ClientDetail({ client, tasks, activities, staffName, onBack, onEdit, onDelete, onAddTask, onToggleTask, onDeleteTask, onAddActivity, onDeleteActivity, onUpdateClient }) {
  const [newTaskType, setNewTaskType] = useState("call");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDate, setNewTaskDate] = useState("");

  const [newActivityType, setNewActivityType] = useState("note");
  const [newActivityTitle, setNewActivityTitle] = useState("");
  const [newActivityBody, setNewActivityBody] = useState("");

  const sortedTasks = [...tasks].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  const sortedActivities = [...(activities || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  function submitTask(e) {
    e.preventDefault();
    if (!newTaskTitle.trim() || !newTaskDate) return;
    onAddTask({
      clientId: client.id,
      type: newTaskType,
      title: newTaskTitle.trim(),
      dueDate: newTaskDate,
      done: false,
    });
    setNewTaskTitle("");
    setNewTaskDate("");
  }

  function submitActivity(e) {
    e.preventDefault();
    if (!newActivityTitle.trim()) return;
    onAddActivity({
      clientId: client.id,
      type: newActivityType,
      title: newActivityTitle.trim(),
      body: newActivityBody.trim(),
    });
    setNewActivityTitle("");
    setNewActivityBody("");
  }

  const probability = STATUS_PROBABILITY[client.status] ?? 0;
  const checklist = [
    { label: "Dane kontaktowe uzupełnione", done: !!(client.phone && client.email) },
    { label: "NIP uzupełniony", done: !!client.nip },
    { label: "Osoba kontaktowa uzupełniona", done: !!client.contactPerson },
    { label: "Źródło pozyskania uzupełnione", done: !!client.source },
    { label: "Budżet uzupełniony", done: !!client.budget },
    { label: "Forma finansowania określona", done: !!client.financing },
  ];
  const completePct = Math.round((checklist.filter((c) => c.done).length / checklist.length) * 100);

  return (
    <div style={S.stack}>
      <button onClick={onBack} style={S.backBtn}>← Wszyscy klienci</button>

      <div style={S.twoCol}>
        <section style={{ ...S.card, flex: 1.3 }}>
          <PinnedNoteBox note={client.pinnedNote} onSave={(v) => onUpdateClient({ pinnedNote: v })} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 14 }}>
            <div>
              <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 24, fontWeight: 600 }}>{client.name}</div>
              <div style={{ marginTop: 6, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <StatusPill statusKey={client.status} />
                <span style={{ fontSize: 11.5, color: "#9A9A9A" }}>Opiekun: <strong style={{ color: "#111111" }}>{staffName}</strong></span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onEdit} style={S.secondaryBtn}>Edytuj</button>
              <button onClick={onDelete} style={S.dangerBtn}><Trash2 size={14} /></button>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <TagsEditor tags={client.tags || []} onChange={(tags) => onUpdateClient({ tags })} />
          </div>

          <div style={S.detailGrid}>
            <DetailRow icon={Phone} label="Telefon" value={client.phone} />
            <DetailRow icon={Mail} label="E-mail" value={client.email} />
            <DetailRow icon={MapPin} label="Adres" value={client.address} />
            <DetailRow icon={Building2} label="NIP" value={client.nip} />
            <DetailRow icon={UserPlus} label="Osoba kontaktowa" value={client.contactPerson} />
            <DetailRow icon={Tag} label="Źródło pozyskania" value={client.source} />
            <DetailRow icon={Car} label="Model / auto" value={client.carInterest} />
            <DetailRow icon={Wallet} label="Budżet" value={client.budget ? `${Number(client.budget).toLocaleString("pl-PL")} zł` : "—"} />
            <DetailRow icon={Handshake} label="Finansowanie" value={client.financing} />
            <DetailRow icon={CalendarClock} label="Decyzja do" value={fmtDate(client.decisionDate)} />
          </div>

          {client.notes && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #E7E5E2" }}>
              <div style={S.label}>Notatki</div>
              <div style={{ fontSize: 13.5, marginTop: 4, lineHeight: 1.5 }}>{client.notes}</div>
            </div>
          )}
        </section>

        <section style={{ ...S.card, flex: 1 }}>
          <h3 style={S.cardTitle}>Zadania</h3>
          <form onSubmit={submitTask} style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            <select value={newTaskType} onChange={(e) => setNewTaskType(e.target.value)} style={S.select}>
              {Object.entries(TASK_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <input
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="np. Zadzwonić w sprawie oferty"
              style={S.input}
            />
            <input type="date" value={newTaskDate} onChange={(e) => setNewTaskDate(e.target.value)} style={S.input} />
            <button type="submit" style={S.primaryBtn}><Plus size={14} /> Dodaj zadanie</button>
          </form>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16 }}>
            {sortedTasks.length === 0 && <EmptyNote text="Brak zadań dla tego klienta." />}
            {sortedTasks.map((t) => {
              const Icon = TASK_TYPES[t.type]?.icon || Bell;
              const d = daysUntil(t.dueDate);
              return (
                <div key={t.id} style={{ ...S.urgentRow, opacity: t.done ? 0.5 : 1 }}>
                  <button onClick={() => onToggleTask(t)} style={{ background: "none", border: "none", display: "flex" }}>
                    {t.done ? <CheckCircle2 size={17} color="#1C8A4B" /> : <Circle size={17} color="#B7B5B1" />}
                  </button>
                  <Icon size={14} color="#6B6B6B" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, textDecoration: t.done ? "line-through" : "none" }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: "#9A9A9A" }}>{fmtDate(t.dueDate)}{!t.done && d !== null && d <= 2 ? " · pilne" : ""}</div>
                  </div>
                  <button onClick={() => onDeleteTask(t.id)} className="iconBtn" style={S.iconBtnStyle}><X size={14} color="#9A9A9A" /></button>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div style={S.twoCol}>
        <section style={{ ...S.card, flex: 1.3 }}>
          <h3 style={S.cardTitle}>Historia kontaktu</h3>
          <form onSubmit={submitActivity} style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select value={newActivityType} onChange={(e) => setNewActivityType(e.target.value)} style={{ ...S.select, minWidth: 150 }}>
                {Object.entries(TASK_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <input
                value={newActivityTitle}
                onChange={(e) => setNewActivityTitle(e.target.value)}
                placeholder="np. Rozmowa o ofercie finansowania"
                style={{ ...S.input, flex: 1, minWidth: 180 }}
              />
            </div>
            <textarea
              value={newActivityBody}
              onChange={(e) => setNewActivityBody(e.target.value)}
              placeholder="Szczegóły rozmowy / treść notatki (opcjonalnie)"
              rows={2}
              style={{ ...S.input, resize: "vertical" }}
            />
            <button type="submit" style={{ ...S.primaryBtn, alignSelf: "flex-start" }}><Send size={13} /> Dodaj wpis</button>
          </form>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
            {sortedActivities.length === 0 && <EmptyNote text="Brak historii kontaktu z tym klientem." />}
            {sortedActivities.map((a) => {
              const Icon = TASK_TYPES[a.type]?.icon || Bell;
              return (
                <div key={a.id} style={{ border: "1px solid #F0EFEC", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <Icon size={14} color="#6B6B6B" style={{ marginTop: 2 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{a.title}</div>
                      {a.body && <div style={{ fontSize: 12.5, color: "#4a4a4a", marginTop: 4, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{a.body}</div>}
                      <div style={{ fontSize: 11, color: "#9A9A9A", marginTop: 6 }}>{fmtDateTime(a.createdAt)}</div>
                    </div>
                    <button onClick={() => onDeleteActivity(a.id)} className="iconBtn" style={S.iconBtnStyle}><X size={13} color="#9A9A9A" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section style={{ ...S.card, flex: 1 }}>
          <h3 style={S.cardTitle}>Postęp sprzedaży</h3>
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6B6B6B", fontWeight: 600, marginBottom: 6 }}>
              <span>Prawdopodobieństwo sprzedaży</span>
              <span style={{ color: "#111111", fontWeight: 700 }}>{probability}%</span>
            </div>
            <div style={{ background: "#F0EFEC", borderRadius: 6, height: 8, overflow: "hidden" }}>
              <div style={{ width: `${probability}%`, background: "#E4241B", height: "100%", borderRadius: 6 }} />
            </div>
          </div>

          <div style={{ marginTop: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6B6B6B", fontWeight: 600, marginBottom: 8 }}>
              <span>Kompletowanie danych</span>
              <span style={{ color: "#111111", fontWeight: 700 }}>{completePct}%</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {checklist.map((c) => (
                <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                  {c.done ? <CheckCircle2 size={15} color="#1C8A4B" /> : <Circle size={15} color="#B7B5B1" />}
                  <span style={{ color: c.done ? "#111111" : "#9A9A9A" }}>{c.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0" }}>
      <Icon size={15} color="#9A9A9A" style={{ marginTop: 2 }} />
      <div>
        <div style={S.label}>{label}</div>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{value || "—"}</div>
      </div>
    </div>
  );
}

/* ---------- Tasks board (global, scoped by DB row-level security) ---------- */
function TasksBoard({ tasks, doneTasks, onToggleTask, onOpenClient }) {
  return (
    <div style={S.stack}>
      <section style={S.card}>
        <h3 style={S.cardTitle}>Aktywne zadania</h3>
        {tasks.length === 0 && <EmptyNote text="Brak aktywnych zadań." />}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
          {tasks.map((t) => {
            const Icon = TASK_TYPES[t.type]?.icon || Bell;
            return (
              <div key={t.id} className="hoverRow" style={S.urgentRow}>
                <button onClick={() => onToggleTask(t)} style={{ background: "none", border: "none", display: "flex" }}>
                  <Circle size={17} color="#B7B5B1" />
                </button>
                <Icon size={14} color="#6B6B6B" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</div>
                  <button onClick={() => onOpenClient(t.clientId)} style={{ background: "none", border: "none", padding: 0, fontSize: 11.5, color: "#E4241B", fontWeight: 600 }}>
                    {t.clientName} <ChevronRight size={10} style={{ display: "inline" }} />
                  </button>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: t.days !== null && t.days <= 2 ? "#E4241B" : "#9A9A9A" }}>
                  {t.days < 0 ? `${Math.abs(t.days)} dni po terminie` : t.days === 0 ? "Dziś" : `za ${t.days} dni`}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {doneTasks.length > 0 && (
        <section style={S.card}>
          <h3 style={S.cardTitle}>Zakończone</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
            {doneTasks.map((t) => (
              <div key={t.id} style={{ ...S.urgentRow, opacity: 0.5 }}>
                <button onClick={() => onToggleTask(t)} style={{ background: "none", border: "none", display: "flex" }}>
                  <CheckCircle2 size={17} color="#1C8A4B" />
                </button>
                <div style={{ flex: 1, fontSize: 13, textDecoration: "line-through" }}>{t.title}</div>
                <span style={{ fontSize: 11, color: "#9A9A9A" }}>{t.clientName}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------- Client form modal (with NIP lookup) ---------- */
function ClientFormModal({ initial, staff = [], canReassign = false, currentUserId, onClose, onSave }) {
  const [form, setForm] = useState(() => initial || {
    id: null, name: "", phone: "", email: "", address: "", nip: "",
    carInterest: "", budget: "", financing: FINANCING[0], decisionDate: "",
    status: "nowy", notes: "",
    contactPerson: "", source: "", tags: [], pinnedNote: "", ownerId: currentUserId,
  });
  const [saving, setSaving] = useState(false);
  const [nipLoading, setNipLoading] = useState(false);
  const [nipError, setNipError] = useState(null);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function lookupNip() {
    const clean = (form.nip || "").replace(/[^0-9]/g, "");
    if (clean.length !== 10) {
      setNipError("NIP powinien mieć 10 cyfr.");
      return;
    }
    setNipLoading(true);
    setNipError(null);
    try {
      const res = await fetch(`/api/nip-lookup?nip=${clean}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Nie znaleziono firmy.");
      setForm((f) => ({ ...f, name: data.name || f.name, address: data.address || f.address }));
    } catch (e) {
      setNipError(e.message || "Błąd wyszukiwania NIP.");
    } finally {
      setNipLoading(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 20, fontWeight: 600 }}>
            {initial ? "Edytuj klienta" : "Nowy klient"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none" }}><X size={18} /></button>
        </div>
        <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Imię i nazwisko / Firma *" value={form.name} onChange={(v) => set("name", v)} required />
          <Field label="Telefon *" value={form.phone} onChange={(v) => set("phone", v)} required />
          <Field label="E-mail" value={form.email} onChange={(v) => set("email", v)} type="email" />
          <Field label="Adres" value={form.address} onChange={(v) => set("address", v)} />
          <div>
            <label style={S.label}>NIP</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={form.nip} onChange={(e) => set("nip", e.target.value)} style={{ ...S.input, flex: 1 }} placeholder="10 cyfr" />
              <button type="button" onClick={lookupNip} disabled={nipLoading} style={{ ...S.secondaryBtn, whiteSpace: "nowrap" }}>
                {nipLoading ? "Szukam…" : "Wyszukaj"}
              </button>
            </div>
            {nipError && <div style={{ fontSize: 11, color: "#E4241B", marginTop: 4 }}>{nipError}</div>}
          </div>
          <Field label="Osoba kontaktowa" value={form.contactPerson} onChange={(v) => set("contactPerson", v)} />
          <div>
            <label style={S.label}>Źródło pozyskania</label>
            <select value={form.source} onChange={(e) => set("source", e.target.value)} style={S.input}>
              <option value="">— wybierz —</option>
              {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <Field label="Model / auto" value={form.carInterest} onChange={(v) => set("carInterest", v)} />
          <Field label="Budżet (PLN)" value={form.budget} onChange={(v) => set("budget", v)} type="number" />
          <div>
            <label style={S.label}>Finansowanie</label>
            <select value={form.financing} onChange={(e) => set("financing", e.target.value)} style={S.input}>
              {FINANCING.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <Field label="Decyzja do (data)" value={form.decisionDate} onChange={(v) => set("decisionDate", v)} type="date" />
          <div>
            <label style={S.label}>Status</label>
            <select value={form.status} onChange={(e) => set("status", e.target.value)} style={S.input}>
              {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          {canReassign && staff.length > 0 && (
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={S.label}>Opiekun</label>
              <select value={form.ownerId || ""} onChange={(e) => set("ownerId", e.target.value)} style={S.input}>
                {staff.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email || p.id}</option>)}
              </select>
            </div>
          )}
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={S.label}>Tagi / grupy</label>
            <TagsEditor tags={form.tags || []} onChange={(tags) => set("tags", tags)} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={S.label}>Istotna informacja (przypięta)</label>
            <textarea
              value={form.pinnedNote}
              onChange={(e) => set("pinnedNote", e.target.value)}
              rows={2}
              style={{ ...S.input, resize: "vertical" }}
              placeholder="Np. Klient wymaga kontaktu tylko po 17:00"
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={S.label}>Notatki</label>
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} style={{ ...S.input, resize: "vertical" }} />
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
            <button type="button" onClick={onClose} style={S.secondaryBtn}>Anuluj</button>
            <button type="submit" disabled={saving} style={S.primaryBtn}>{saving ? "Zapisywanie…" : "Zapisz klienta"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TagsEditor({ tags = [], onChange }) {
  const [draft, setDraft] = useState("");
  function addTag() {
    const clean = draft.trim();
    if (!clean || tags.includes(clean)) { setDraft(""); return; }
    onChange([...tags, clean]);
    setDraft("");
  }
  function removeTag(t) {
    onChange(tags.filter((x) => x !== t));
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: tags.length ? 8 : 0 }}>
        {tags.map((t) => (
          <span key={t} style={{
            display: "inline-flex", alignItems: "center", gap: 4, background: "#F0EFEC",
            borderRadius: 20, padding: "4px 10px", fontSize: 11.5, fontWeight: 600,
          }}>
            {t}
            <button type="button" onClick={() => removeTag(t)} style={{ background: "none", border: "none", display: "flex", padding: 0 }}>
              <X size={11} color="#9A9A9A" />
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
          placeholder="np. VIP, Leasing, Powracający…"
          style={{ ...S.input, flex: 1 }}
        />
        <button type="button" onClick={addTag} style={S.secondaryBtn}>Dodaj</button>
      </div>
    </div>
  );
}

function PinnedNoteBox({ note, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note || "");
  useEffect(() => { setDraft(note || ""); }, [note]);

  if (!editing && !note) {
    return (
      <button onClick={() => setEditing(true)} style={{ ...S.secondaryBtn, display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Pin size={13} /> Dodaj istotną informację
      </button>
    );
  }
  if (!editing) {
    return (
      <div style={{ background: "#FFF7E0", border: "1px solid #F0E0A8", borderRadius: 8, padding: "10px 12px", display: "flex", gap: 8, alignItems: "flex-start" }}>
        <Pin size={14} color="#8a6d00" style={{ marginTop: 2 }} />
        <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>{note}</div>
        <button onClick={() => setEditing(true)} style={{ background: "none", border: "none" }}><Edit2 size={13} color="#8a6d00" /></button>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        style={{ ...S.input, resize: "vertical" }}
        placeholder="Np. Klient wymaga kontaktu tylko po 17:00"
      />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={() => { setEditing(false); setDraft(note || ""); }} style={S.secondaryBtn}>Anuluj</button>
        <button onClick={() => { onSave(draft.trim()); setEditing(false); }} style={S.primaryBtn}>Zapisz</button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required }) {
  return (
    <div>
      <label style={S.label}>{label}</label>
      <input type={type} value={value} required={required} onChange={(e) => onChange(e.target.value)} style={S.input} />
    </div>
  );
}

/* ---------- Styles ---------- */

/* ---------- Vehicles (Pojazdy) ---------- */
function VehicleStatusPill({ statusKey }) {
  const s = VEHICLE_STATUSES.find((x) => x.key === statusKey) || VEHICLE_STATUSES[0];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700,
      padding: "4px 10px", borderRadius: 20, background: s.color + "1A", color: s.color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color }} />
      {s.label}
    </span>
  );
}

function VehiclesList({ vehicles, statusFilter, setStatusFilter, onAdd, onEdit, onDelete }) {
  return (
    <div style={S.stack}>
      <div style={S.toolbar}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={S.select}>
          <option value="all">Wszystkie statusy</option>
          {VEHICLE_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <button onClick={onAdd} style={S.primaryBtn}>
          <Plus size={15} /> Nowy pojazd
        </button>
      </div>

      {vehicles.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center", padding: 48 }}>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, marginBottom: 6 }}>Brak pojazdów</div>
          <div style={{ fontSize: 13, color: "#9A9A9A", marginBottom: 16 }}>Dodaj pierwszy pojazd do oferty.</div>
          <button onClick={onAdd} style={{ ...S.primaryBtn, margin: "0 auto" }}><Plus size={15} /> Nowy pojazd</button>
        </div>
      ) : (
        <div style={S.card}>
          <div style={S.tableHeader}>
            <span style={{ flex: 2 }}>Pojazd</span>
            <span style={{ flex: 1 }}>Rok</span>
            <span style={{ flex: 1.2 }}>Cena</span>
            <span style={{ flex: 1.2 }}>Rata</span>
            <span style={{ flex: 1.2 }}>Status</span>
            <span style={{ flex: 0.6 }}></span>
          </div>
          {vehicles.map((v) => (
            <div key={v.id} className="hoverRow" style={S.tableRow}>
              <span style={{ flex: 2, textAlign: "left" }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{v.brand} {v.model}</div>
                <div style={{ fontSize: 11.5, color: "#9A9A9A" }}>{v.bodyType || "—"}</div>
              </span>
              <span style={{ flex: 1, fontSize: 13, textAlign: "left" }}>{v.year || "—"}</span>
              <span style={{ flex: 1.2, fontSize: 13, textAlign: "left" }}>{v.price ? `${Number(v.price).toLocaleString("pl-PL")} zł` : "—"}</span>
              <span style={{ flex: 1.2, fontSize: 13, textAlign: "left" }}>{v.monthlyPayment ? `${Number(v.monthlyPayment).toLocaleString("pl-PL")} zł/mc` : "—"}</span>
              <span style={{ flex: 1.2, textAlign: "left" }}><VehicleStatusPill statusKey={v.status} /></span>
              <span style={{ flex: 0.6, display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button className="iconBtn" onClick={() => onEdit(v)} style={S.iconBtnStyle}><Edit2 size={14} /></button>
                <button onClick={() => { if (window.confirm("Usunąć ten pojazd?")) onDelete(v.id); }} style={S.dangerBtn}><Trash2 size={14} /></button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VehicleFormModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState(initial || {
    brand: "", model: "", year: "", price: "", monthlyPayment: "",
    bodyType: BODY_TYPES[0], description: "", status: "dostepny",
    imageUrl: "", imageUrls: [], sourceUrl: "",
  });
  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setVal = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const [importUrl, setImportUrl] = useState(form.sourceUrl || "");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [importWarnings, setImportWarnings] = useState([]);

  const importFromOtomoto = async () => {
    if (!importUrl.trim()) return;
    setImporting(true);
    setImportError(null);
    setImportWarnings([]);
    try {
      const r = await fetch("/api/otomoto-import?url=" + encodeURIComponent(importUrl.trim()));
      const data = await r.json();
      if (!r.ok) {
        setImportError(data.error || "Nie udało się pobrać danych.");
        return;
      }
      setForm((f) => ({
        ...f,
        brand: data.brand || f.brand,
        model: data.model || f.model,
        year: data.year || f.year,
        price: data.price || f.price,
        bodyType: data.bodyType || f.bodyType,
        description: data.description || f.description,
        imageUrl: (data.images && data.images[0]) || f.imageUrl,
        imageUrls: data.images && data.images.length ? data.images : f.imageUrls,
        sourceUrl: data.sourceUrl || importUrl.trim(),
      }));
      setImportWarnings(data.warnings || []);
    } catch (e) {
      setImportError("Błąd połączenia z serwerem.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, fontWeight: 600 }}>
            {initial ? "Edytuj pojazd" : "Nowy pojazd"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none" }}><X size={18} /></button>
        </div>

        <div style={{ background: "#F3F3F1", borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <div style={{ ...S.label, marginBottom: 6 }}>Wklej link do ogłoszenia OtoMoto</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://www.otomoto.pl/oferta/..."
              style={{ ...S.input, flex: 1 }}
            />
            <button
              type="button"
              onClick={importFromOtomoto}
              disabled={importing || !importUrl.trim()}
              style={{ ...S.primaryBtn, whiteSpace: "nowrap", opacity: importing ? 0.6 : 1 }}
            >
              {importing ? "Pobieranie…" : "Pobierz dane"}
            </button>
          </div>
          {importError && (
            <div style={{ color: "#E4241B", fontSize: 12.5, marginTop: 8 }}>{importError}</div>
          )}
          {importWarnings.length > 0 && (
            <div style={{ color: "#8a6d00", fontSize: 12.5, marginTop: 8 }}>
              {importWarnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
            </div>
          )}
          {form.imageUrls && form.imageUrls.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {form.imageUrls.slice(0, 10).map((img, i) => (
                <img
                  key={i}
                  src={img}
                  alt=""
                  onClick={() => setForm((f) => ({ ...f, imageUrl: img }))}
                  style={{
                    width: 56, height: 56, objectFit: "cover", borderRadius: 4, cursor: "pointer",
                    border: form.imageUrl === img ? "2px solid #E4241B" : "2px solid transparent",
                  }}
                />
              ))}
            </div>
          )}
          <div style={{ fontSize: 11.5, color: "#9A9A9A", marginTop: 8 }}>
            Dane pobrane automatycznie mogą wymagać sprawdzenia — zawsze zerknij, czy wszystko się zgadza.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 14px" }}>
          <Field label="Marka" value={form.brand} onChange={setVal("brand")} required />
          <Field label="Model" value={form.model} onChange={setVal("model")} required />
          <Field label="Rok produkcji" value={form.year} onChange={setVal("year")} type="number" />
          <div>
            <div style={S.label}>Nadwozie</div>
            <select value={form.bodyType} onChange={setField("bodyType")} style={{ ...S.select, width: "100%" }}>
              {BODY_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <Field label="Cena (zł)" value={form.price} onChange={setVal("price")} type="number" />
          <Field label="Rata miesięczna (zł)" value={form.monthlyPayment} onChange={setVal("monthlyPayment")} type="number" />
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Link do zdjęcia (URL)" value={form.imageUrl} onChange={setVal("imageUrl")} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={S.label}>Status</div>
            <select value={form.status} onChange={setField("status")} style={{ ...S.select, width: "100%" }}>
              {VEHICLE_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={S.label}>Opis</div>
            <textarea
              value={form.description}
              onChange={setField("description")}
              rows={3}
              style={{ ...S.input, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={S.secondaryBtn}>Anuluj</button>
          <button onClick={() => onSave({ ...initial, ...form })} style={S.primaryBtn}>Zapisz pojazd</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Settings (Ustawienia) - admin only ---------- */
function SettingsPanel({ user, goals, onUpdateGoals }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("doradca");
  const [msg, setMsg] = useState(null);
  const [goalsForm, setGoalsForm] = useState(goals);
  const [savingGoals, setSavingGoals] = useState(false);

  useEffect(() => { setGoalsForm(goals); }, [goals]);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    setStaff(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  const changeRole = async (id, role) => {
    await supabase.from("profiles").update({ role }).eq("id", id);
    setStaff((prev) => prev.map((p) => (p.id === id ? { ...p, role } : p)));
  };

  async function saveGoals(e) {
    e.preventDefault();
    setSavingGoals(true);
    await onUpdateGoals({
      contactsTarget: Number(goalsForm.contactsTarget) || 0,
      dealsTarget: Number(goalsForm.dealsTarget) || 0,
      valueTarget: Number(goalsForm.valueTarget) || 0,
    });
    setSavingGoals(false);
  }

  return (
    <div style={S.stack}>
      <div style={S.card}>
        <div style={S.cardTitle}>Cele miesięczne</div>
        <div style={{ fontSize: 12.5, color: "#9A9A9A", marginTop: 4, marginBottom: 16 }}>
          Progi widoczne na pulpicie w sekcji „Twoje statystyki". Wymaga uruchomienia migracji SQL (tabela goals).
        </div>
        <form onSubmit={saveGoals} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
          <div>
            <label style={S.label}>Nowi klienci (cel)</label>
            <input type="number" value={goalsForm.contactsTarget} onChange={(e) => setGoalsForm((f) => ({ ...f, contactsTarget: e.target.value }))} style={S.input} />
          </div>
          <div>
            <label style={S.label}>Nowe szanse sprzedaży (cel)</label>
            <input type="number" value={goalsForm.dealsTarget} onChange={(e) => setGoalsForm((f) => ({ ...f, dealsTarget: e.target.value }))} style={S.input} />
          </div>
          <div>
            <label style={S.label}>Wartość szans sprzedaży (cel, PLN)</label>
            <input type="number" value={goalsForm.valueTarget} onChange={(e) => setGoalsForm((f) => ({ ...f, valueTarget: e.target.value }))} style={S.input} />
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" disabled={savingGoals} style={S.primaryBtn}>{savingGoals ? "Zapisywanie…" : "Zapisz cele"}</button>
          </div>
        </form>
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>Zespół i uprawnienia</div>
        <div style={{ fontSize: 12.5, color: "#9A9A9A", marginTop: 4, marginBottom: 16 }}>
          Zarządzaj rolami osób z dostępem do panelu CRM. Nowe konta zakłada się w Supabase (Authentication),
          a tutaj przypisujesz im rolę administratora lub doradcy.
        </div>
        {loading ? (
          <div style={{ fontSize: 13, color: "#9A9A9A" }}>Wczytywanie…</div>
        ) : staff.length === 0 ? (
          <EmptyNote text="Brak kont w systemie." />
        ) : (
          <div>
            <div style={S.tableHeader}>
              <span style={{ flex: 2 }}>Osoba</span>
              <span style={{ flex: 1.4 }}>Rola</span>
            </div>
            {staff.map((p) => (
              <div key={p.id} style={S.tableRow}>
                <span style={{ flex: 2, textAlign: "left" }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{p.full_name || "—"}</div>
                  <div style={{ fontSize: 11.5, color: "#9A9A9A" }}>{p.id}</div>
                </span>
                <span style={{ flex: 1.4, textAlign: "left" }}>
                  <select
                    value={p.role}
                    onChange={(e) => changeRole(p.id, e.target.value)}
                    style={S.select}
                    disabled={p.id === user.id}
                  >
                    <option value="admin">Administrator</option>
                    <option value="doradca">Doradca</option>
                    <option value="client">Klient</option>
                  </select>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>Dodanie nowego pracownika</div>
        <div style={{ fontSize: 12.5, color: "#9A9A9A", marginTop: 4, marginBottom: 16 }}>
          Aby dodać nowego doradcę lub administratora: w Supabase → Authentication → Users kliknij
          "Add user" i utwórz konto e-mail + hasło. Osoba pojawi się automatycznie na liście powyżej
          zaraz po utworzeniu konta — wtedy przypisz jej właściwą rolę (Doradca lub Administrator).
        </div>
      </div>
    </div>
  );
}

const S = {
  appShell: {
    fontFamily: "'Inter', sans-serif", background: "#F3F3F1", minHeight: 600, color: "#111111",
    borderRadius: 12, overflow: "hidden", border: "1px solid #E7E5E2", maxWidth: 1200, margin: "0 auto",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "14px 24px", background: "#FFFFFF",
  },
  headerWedge: { height: 4, background: "linear-gradient(90deg, #111111 50%, #E4241B 50%)" },
  errorBanner: { background: "#E4241B", color: "#fff", padding: "8px 24px", fontSize: 13, display: "flex", alignItems: "center" },
  main: { padding: 24 },
  stack: { display: "flex", flexDirection: "column", gap: 18 },
  twoCol: { display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" },
  statRow: { display: "flex", gap: 14, flexWrap: "wrap" },
  card: {
    background: "#FFFFFF", borderRadius: 10, padding: 20, border: "1px solid #E7E5E2",
    minWidth: 260, flex: 1,
  },
  cardTitle: { fontFamily: "'Oswald', sans-serif", fontSize: 15, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 },
  label: { fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "#9A9A9A" },
  toolbar: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  searchBox: { display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #E7E5E2", borderRadius: 8, padding: "8px 12px", flex: 1, minWidth: 220 },
  searchInput: { border: "none", outline: "none", fontSize: 13, flex: 1, background: "transparent" },
  select: { border: "1px solid #E7E5E2", borderRadius: 8, padding: "9px 10px", fontSize: 13, background: "#fff", color: "#111111" },
  input: { border: "1px solid #E7E5E2", borderRadius: 8, padding: "9px 10px", fontSize: 13, width: "100%", outline: "none" },
  primaryBtn: {
    display: "flex", alignItems: "center", gap: 6, background: "#E4241B", color: "#fff", border: "none",
    borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 700, justifyContent: "center",
  },
  secondaryBtn: { background: "#F0EFEC", border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 12.5, fontWeight: 600, color: "#111111" },
  dangerBtn: { background: "#FCEBEA", border: "none", borderRadius: 8, padding: "9px 11px", color: "#E4241B" },
  backBtn: { background: "none", border: "none", fontSize: 13, fontWeight: 600, color: "#6B6B6B", textAlign: "left", padding: 0 },
  tableHeader: {
    display: "flex", padding: "0 14px 10px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: 0.4, color: "#9A9A9A", borderBottom: "1px solid #E7E5E2",
  },
  tableRow: {
    display: "flex", alignItems: "center", width: "100%", background: "none", border: "none",
    padding: "13px 14px", borderBottom: "1px solid #F0EFEC", textAlign: "left",
  },
  urgentRow: {
    display: "flex", alignItems: "center", gap: 10, background: "#FAFAF9", border: "1px solid #F0EFEC",
    borderRadius: 8, padding: "9px 12px", width: "100%",
  },
  iconBtnStyle: { background: "none", border: "none", borderRadius: 6, padding: 4 },
  detailGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 20px", marginTop: 14 },
  modalOverlay: {
    position: "fixed", inset: 0, background: "rgba(17,17,17,0.5)", display: "flex",
    alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20,
  },
  modal: {
    background: "#fff", borderRadius: 12, padding: 24, width: "100%", maxWidth: 620,
    maxHeight: "88vh", overflowY: "auto",
  },
};
