import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Phone, Mail, MapPin, Building2, Car, Wallet, CalendarClock, Plus,
  Search, CheckCircle2, Circle, X, LayoutGrid, Users, ListChecks,
  Handshake, Bell, Trash2, ChevronRight, ChevronLeft, LogOut, Loader2, Settings, UserPlus, Edit2,
  Tag, Pin, Send, Calendar, BarChart3, Package, Link2, Sparkles, Filter, MoreVertical
} from "lucide-react";
import { supabase } from "./supabaseClient.js";
import logo from "./assets/logo.png";

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

/* ---------- Szanse sprzedaży: status ---------- */
const DEAL_STATUSES = [
  { key: "otwarta", label: "Otwarta", color: "#2F6FED" },
  { key: "wygrana", label: "Wygrana", color: "#1C8A4B" },
  { key: "przegrana", label: "Przegrana", color: "#E4241B" },
  { key: "nieaktualna", label: "Nieaktualna", color: "#9A9A9A" },
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

const VISIBILITY_OPTIONS = ["Publiczna", "Prywatna"];
const PURCHASE_TYPES = ["Zakup gotówkowy", "Kredyt", "Leasing", "Wykup z leasingu", "Zamiana"];
const RELATION_TYPES = ["Firma powiązana", "Rodzina", "Polecił", "Współpracownik", "Inne"];

/* ---------- Proces sprzedaży: etapy odznaczane po kolei ----------
   Etap "dane" jest liczony automatycznie na podstawie wypełnionych pól.
   Kolejne etapy są odznaczane ręcznie i tylko w kolejności — nie da się
   zaznaczyć kroku, dopóki wszystkie wcześniejsze (włącznie z etapem "dane")
   nie są zaznaczone. Stan zapisywany jest w szansie sprzedaży: pipelineSteps.
-------------------------------------------------------------------*/
const PIPELINE_STAGES = [
  {
    key: "dane",
    label: "Kompletowanie danych",
    auto: true,
    steps: [
      { key: "dane_kontakt", label: "Uzupełniono dane kontaktowe", check: (d, company) => !!(company && company.phone && company.email) },
      { key: "dane_nip", label: "Uzupełniono NIP", check: (d, company) => !!(company && company.nip) },
      { key: "dane_budzet", label: "Uzupełniono budżet na nowy pojazd", check: (d) => !!d.budget },
      { key: "dane_finansowanie", label: "Określono formę finansowania pojazdu", check: (d) => !!d.financing },
    ],
  },
  {
    key: "ofertowanie",
    label: "Ofertowanie",
    steps: [
      { key: "oferta_przygotowana", label: "Przygotowano ofertę" },
      { key: "oferta_wyslana", label: "Wysłano ofertę do klienta" },
      { key: "oferta_potwierdzona", label: "Klient potwierdził zainteresowanie ofertą" },
    ],
  },
  {
    key: "procesowanie",
    label: "Procesowanie wniosku",
    steps: [
      { key: "wniosek_zlozony", label: "Złożono wniosek o finansowanie" },
      { key: "wniosek_zaakceptowany", label: "Wniosek zaakceptowany" },
      { key: "umowa_podpisana", label: "Podpisano umowę" },
    ],
  },
  {
    key: "finalizacja",
    label: "Finalizacja",
    steps: [
      { key: "pojazd_przygotowany", label: "Pojazd przygotowany do wydania" },
      { key: "faktura_wystawiona", label: "Faktura wystawiona" },
      { key: "pojazd_wydany", label: "Pojazd wydany klientowi" },
    ],
  },
];

const PIPELINE_FLAT_ORDER = PIPELINE_STAGES.flatMap((stage) =>
  stage.steps.map((s) => ({ key: s.key, auto: !!stage.auto }))
);

function computePipeline(deal, company) {
  let previousDone = true;
  const stages = PIPELINE_STAGES.map((stage) => {
    const steps = stage.steps.map((step) => {
      const done = stage.auto ? step.check(deal, company) : !!(deal.pipelineSteps && deal.pipelineSteps[step.key]);
      const unlocked = stage.auto ? true : previousDone;
      previousDone = previousDone && done;
      return { ...step, done, unlocked };
    });
    return { ...stage, steps, done: steps.every((s) => s.done) };
  });
  const flatSteps = stages.flatMap((s) => s.steps);
  const donePct = Math.round((flatSteps.filter((s) => s.done).length / flatSteps.length) * 100);
  const currentStage = stages.find((s) => !s.done) || stages[stages.length - 1];
  return { stages, donePct, currentStage };
}

function dealProbability(deal, company) {
  if (deal.status === "wygrana") return 100;
  if (deal.status === "przegrana" || deal.status === "nieaktualna") return 0;
  return computePipeline(deal, company).donePct;
}

function toggleStepInSteps(pipelineSteps, stepKey) {
  const idx = PIPELINE_FLAT_ORDER.findIndex((s) => s.key === stepKey);
  const current = !!(pipelineSteps && pipelineSteps[stepKey]);
  const next = { ...(pipelineSteps || {}) };
  if (!current) {
    next[stepKey] = true;
  } else {
    for (let i = idx; i < PIPELINE_FLAT_ORDER.length; i++) {
      const s = PIPELINE_FLAT_ORDER[i];
      if (!s.auto) delete next[s.key];
    }
  }
  return next;
}

function daysLeftInMonth() {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return Math.max(0, Math.round((end - now) / 86400000) + 1);
}

/* ---------- Ustawienia regionalne ----------
   Format daty/godziny/kwot i pierwszy dzień tygodnia są ustawieniem osobistym
   (Ustawienia -> Ustawienia regionalne). Ponieważ fmtDate/fmtMoney są zwykłymi
   funkcjami wywoływanymi z bardzo wielu miejsc w tym pliku (nie komponentami),
   trzymamy je jako mały, modułowy "singleton" zamiast przeciągać ustawienia
   przez propsy wszystkich komponentów. CRM ładuje ustawienia usera przy starcie
   i wywołuje applyRegionalSettings(...) — a ponowne wyrenderowanie wymuszane
   jest przez klucz na <main> (patrz formatTick w komponencie CRM).
   Strefa czasowa jest ustawieniem informacyjnym — CRM nie wykonuje konwersji
   stref czasowych (wszystkie daty są traktowane jako lokalny czas przeglądarki).
------------------------------------------------------------------*/
let REGIONAL_SETTINGS = {
  timezone: "Europe/Warsaw",
  dateFormat: "d.m.Y",
  timeFormat: "H:i",
  firstDayOfWeek: "monday", // monday | sunday
  decimalSymbol: ",",
  thousandsSeparator: " ",
  decimalPlaces: 0,
  currencyFormat: "value_symbol", // value_symbol | symbol_value
  currencySymbol: "zł",
};

function applyRegionalSettings(patch) {
  REGIONAL_SETTINGS = { ...REGIONAL_SETTINGS, ...(patch || {}) };
}

function formatWithPattern(date, pattern) {
  const pad = (n) => String(n).padStart(2, "0");
  const h24 = date.getHours();
  const h12 = ((h24 + 11) % 12) + 1;
  const map = {
    Y: date.getFullYear(),
    m: pad(date.getMonth() + 1),
    d: pad(date.getDate()),
    H: pad(h24),
    h: pad(h12),
    i: pad(date.getMinutes()),
    A: h24 < 12 ? "AM" : "PM",
  };
  return pattern.replace(/Y|m|d|H|h|i|A/g, (tok) => (map[tok] !== undefined ? map[tok] : tok));
}

function fmtDate(d) {
  if (!d) return "—";
  try {
    return formatWithPattern(new Date(d), REGIONAL_SETTINGS.dateFormat);
  } catch {
    return d;
  }
}

function fmtDateTime(d) {
  if (!d) return "—";
  try {
    return formatWithPattern(new Date(d), REGIONAL_SETTINGS.dateFormat + " " + REGIONAL_SETTINGS.timeFormat);
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

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}

function fmtMoney(n) {
  const places = Number.isFinite(REGIONAL_SETTINGS.decimalPlaces) ? REGIONAL_SETTINGS.decimalPlaces : 0;
  const num = Number(n || 0);
  const fixed = num.toFixed(Math.max(0, places));
  const [intPart, decPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, REGIONAL_SETTINGS.thousandsSeparator);
  const numStr = decPart ? grouped + REGIONAL_SETTINGS.decimalSymbol + decPart : grouped;
  return REGIONAL_SETTINGS.currencyFormat === "symbol_value"
    ? `${REGIONAL_SETTINGS.currencySymbol} ${numStr}`
    : `${numStr} ${REGIONAL_SETTINGS.currencySymbol}`;
}

/* ---------- Kalendarz: pomocnicze funkcje dat ---------- */
function startOfWeek(d) {
  const dt = new Date(d);
  const day = dt.getDay(); // 0 = niedziela .. 6 = sobota
  const firstDay = REGIONAL_SETTINGS.firstDayOfWeek === "sunday" ? 0 : 1;
  const diff = (day - firstDay + 7) % 7;
  dt.setDate(dt.getDate() - diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function addDays(d, n) {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt;
}

function isSameDay(a, b) {
  if (!a || !b) return false;
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function weekdayLabels() {
  return REGIONAL_SETTINGS.firstDayOfWeek === "sunday"
    ? ["Niedz", "Pon", "Wt", "Śr", "Czw", "Pt", "Sob"]
    : ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Niedz"];
}

function monthMatrix(anchorDate) {
  const first = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const weeks = [];
  let cursor = gridStart;
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/* ---------- DB <-> UI mapping ---------- */
function companyFromDb(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    nip: row.nip,
    notes: row.notes,
    createdAt: row.created_at,
    contactPerson: row.contact_person || "",
    source: row.source || "",
    tags: Array.isArray(row.tags) ? row.tags : [],
    pinnedNote: row.pinned_note || "",
  };
}
function companyToDb(c, fallbackOwnerId) {
  return {
    name: c.name, phone: c.phone, email: c.email, address: c.address, nip: c.nip,
    notes: c.notes, owner_id: c.ownerId || fallbackOwnerId,
    contact_person: c.contactPerson || null,
    source: c.source || null,
    tags: Array.isArray(c.tags) && c.tags.length ? c.tags : null,
    pinned_note: c.pinnedNote || null,
  };
}

function dealFromDb(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    ownerId: row.owner_id,
    name: row.name,
    carInterest: row.car_model,
    budget: row.budget,
    financing: row.financing_type,
    decisionDate: row.deadline,
    status: row.status,
    purchaseType: row.purchase_type || "",
    visibility: row.visibility || "Publiczna",
    pipelineSteps: row.pipeline_steps || {},
    winReason: row.win_reason || "",
    lossReason: row.loss_reason || "",
    statusChangedAt: row.status_changed_at || row.created_at,
    notes: row.notes,
    createdAt: row.created_at,
  };
}
function dealToDb(d, fallbackOwnerId) {
  return {
    company_id: d.companyId,
    name: d.name || "Szansa sprzedaży",
    car_model: d.carInterest,
    budget: d.budget ? Number(d.budget) : null,
    financing_type: d.financing,
    deadline: d.decisionDate || null,
    status: d.status || "otwarta",
    purchase_type: d.purchaseType || null,
    visibility: d.visibility || "Publiczna",
    pipeline_steps: d.pipelineSteps || {},
    win_reason: d.winReason || null,
    loss_reason: d.lossReason || null,
    notes: d.notes,
    owner_id: d.ownerId || fallbackOwnerId,
  };
}

function taskFromDb(row) {
  return {
    id: row.id, clientId: row.client_id, dealId: row.deal_id, ownerId: row.owner_id,
    type: row.type, title: row.title, dueDate: row.due_date, done: row.done, createdAt: row.created_at,
  };
}
function taskToDb(t, ownerId) {
  return {
    client_id: t.clientId || null, deal_id: t.dealId || null, type: t.type, title: t.title,
    due_date: t.dueDate || null, done: !!t.done, owner_id: ownerId,
  };
}

function activityFromDb(row) {
  return {
    id: row.id,
    companyId: row.client_id,
    ownerId: row.owner_id,
    type: row.type,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
  };
}
function activityToDb(a, ownerId) {
  return {
    client_id: a.companyId, type: a.type, title: a.title, body: a.body, owner_id: ownerId,
  };
}

function productFromDb(row) {
  return {
    id: row.id, dealId: row.deal_id, name: row.name,
    quantity: row.quantity, unitPrice: row.unit_price, costPrice: row.cost_price, createdAt: row.created_at,
  };
}
function productToDb(p, ownerId) {
  return {
    deal_id: p.dealId, name: p.name,
    quantity: p.quantity ? Number(p.quantity) : 1,
    unit_price: p.unitPrice ? Number(p.unitPrice) : 0,
    cost_price: p.costPrice ? Number(p.costPrice) : 0,
    owner_id: ownerId,
  };
}

function costFromDb(row) {
  return { id: row.id, dealId: row.deal_id, name: row.name, amount: row.amount, createdAt: row.created_at };
}
function costToDb(c, ownerId) {
  return { deal_id: c.dealId, name: c.name, amount: c.amount ? Number(c.amount) : 0, owner_id: ownerId };
}

function relationFromDb(row) {
  return {
    id: row.id, companyAId: row.company_a_id, companyBId: row.company_b_id,
    relationType: row.relation_type, note: row.note, createdAt: row.created_at,
  };
}
function relationToDb(r, ownerId) {
  return {
    company_a_id: r.companyAId, company_b_id: r.companyBId,
    relation_type: r.relationType, note: r.note || null, owner_id: ownerId,
  };
}

function profileSettingsFromDb(row) {
  return {
    id: row.id,
    role: row.role,
    fullName: row.full_name || "",
    firstName: row.first_name || (row.full_name || "").split(" ")[0] || "",
    lastName: row.last_name || (row.full_name || "").split(" ").slice(1).join(" ") || "",
    email: row.email || "",
    phone: row.phone || "",
    position: row.position || "",
    avatarUrl: row.avatar_url || "",
  };
}

const DEFAULT_REGIONAL = {
  timezone: "Europe/Warsaw",
  dateFormat: "d.m.Y",
  timeFormat: "H:i",
  firstDayOfWeek: "monday",
  decimalSymbol: ",",
  thousandsSeparator: " ",
  decimalPlaces: 0,
  currencyFormat: "value_symbol",
  currencySymbol: "zł",
};

const DEFAULT_NOTIFICATIONS = {
  emailDigest: false,
  dailyActivityReport: false,
  inAppPopups: true,
  importFinished: true,
  contactNeedsData: true,
  dealStatusChanged: true,
  dealAutoClosed: true,
  dealPastDeadline: true,
  dealDueSoon: true,
  becameOwner: true,
  taskDateChanged: true,
};

function userSettingsFromDb(row) {
  return {
    regional: { ...DEFAULT_REGIONAL, ...(row && row.regional ? row.regional : {}) },
    notifications: { ...DEFAULT_NOTIFICATIONS, ...(row && row.notifications ? row.notifications : {}) },
  };
}

function taskTemplateFromDb(row) {
  return { id: row.id, ownerId: row.owner_id, name: row.name, createdAt: row.created_at };
}
function templateItemFromDb(row) {
  return {
    id: row.id, templateId: row.template_id, type: row.type, title: row.title,
    offsetDays: row.offset_days, sortOrder: row.sort_order,
  };
}
function importHistoryFromDb(row) {
  return {
    id: row.id, ownerId: row.owner_id, filename: row.filename,
    rowCount: row.row_count, status: row.status, createdAt: row.created_at,
  };
}

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

function DealStatusPill({ statusKey }) {
  const s = DEAL_STATUSES.find((x) => x.key === statusKey) || DEAL_STATUSES[0];
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

function CompanyAvatar({ name, size = 34 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: "#111111", color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.36,
      fontWeight: 700, flexShrink: 0,
    }}>
      {initials(name)}
    </div>
  );
}

/* ---------- Main App ---------- */
export default function CRM({ user, profile, onLogout }) {
  useFonts();
  const [companies, setCompanies] = useState([]);
  const [deals, setDeals] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [activities, setActivities] = useState([]);
  const [products, setProducts] = useState([]);
  const [costs, setCosts] = useState([]);
  const [relations, setRelations] = useState([]);
  const [staff, setStaff] = useState([]);
  const [goals, setGoals] = useState({ contactsTarget: 10, dealsTarget: 5, valueTarget: 100000 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [selectedDealId, setSelectedDealId] = useState(null);
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [showDealForm, setShowDealForm] = useState(false);
  const [editingDeal, setEditingDeal] = useState(null);
  const [dealFormCompanyId, setDealFormCompanyId] = useState(null);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [vehicleStatusFilter, setVehicleStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [companyShowFilter, setCompanyShowFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState(null);
  const [dealShowFilter, setDealShowFilter] = useState("all");
  const [dealStatusFilter, setDealStatusFilter] = useState("all");
  const [error, setError] = useState(null);
  const [taskTemplates, setTaskTemplates] = useState([]);
  const [templateItems, setTemplateItems] = useState([]);
  const [importHistory, setImportHistory] = useState([]);
  const [regionalSettings, setRegionalSettings] = useState(DEFAULT_REGIONAL);
  const [notificationSettings, setNotificationSettings] = useState(DEFAULT_NOTIFICATIONS);
  const [formatTick, setFormatTick] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      let companiesRes = await supabase.from("companies").select("*").order("created_at", { ascending: false });
      if (companiesRes.error) {
        // Migracja SQL nie została jeszcze uruchomiona — awaryjnie czytamy ze starej tabeli.
        companiesRes = await supabase.from("clients").select("*").order("created_at", { ascending: false });
      }
      if (companiesRes.error) throw companiesRes.error;

      const [
        dealsRes, taskRes, vehicleRes, activityRes, staffRes, goalsRes, productsRes, costsRes, relationsRes,
        userSettingsRes, templatesRes, templateItemsRes, importHistoryRes,
      ] = await Promise.all([
        supabase.from("deals").select("*").order("created_at", { ascending: false }),
        supabase.from("tasks").select("*").order("due_date", { ascending: true }),
        supabase.from("cars").select("*").order("created_at", { ascending: false }),
        supabase.from("client_activities").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("*"),
        supabase.from("goals").select("*").eq("id", 1).maybeSingle(),
        supabase.from("deal_products").select("*"),
        supabase.from("deal_costs").select("*"),
        supabase.from("company_relations").select("*"),
        supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("task_templates").select("*").order("created_at", { ascending: false }),
        supabase.from("task_template_items").select("*").order("sort_order", { ascending: true }),
        supabase.from("import_history").select("*").order("created_at", { ascending: false }),
      ]);
      if (taskRes.error) throw taskRes.error;
      if (vehicleRes.error) throw vehicleRes.error;

      setCompanies((companiesRes.data || []).map(companyFromDb));
      setDeals(dealsRes.error ? [] : (dealsRes.data || []).map(dealFromDb));
      setTasks((taskRes.data || []).map(taskFromDb));
      setVehicles((vehicleRes.data || []).map(vehicleFromDb));
      setActivities(activityRes.error ? [] : (activityRes.data || []).map(activityFromDb));
      setStaff(staffRes.error ? [] : (staffRes.data || []));
      setProducts(productsRes.error ? [] : (productsRes.data || []).map(productFromDb));
      setCosts(costsRes.error ? [] : (costsRes.data || []).map(costFromDb));
      setRelations(relationsRes.error ? [] : (relationsRes.data || []).map(relationFromDb));
      setTaskTemplates(templatesRes.error ? [] : (templatesRes.data || []).map(taskTemplateFromDb));
      setTemplateItems(templateItemsRes.error ? [] : (templateItemsRes.data || []).map(templateItemFromDb));
      setImportHistory(importHistoryRes.error ? [] : (importHistoryRes.data || []).map(importHistoryFromDb));
      if (!goalsRes.error && goalsRes.data) {
        setGoals({
          contactsTarget: goalsRes.data.contacts_target,
          dealsTarget: goalsRes.data.deals_target,
          valueTarget: goalsRes.data.value_target,
        });
      }
      const loadedSettings = userSettingsFromDb(userSettingsRes.error ? null : userSettingsRes.data);
      setRegionalSettings(loadedSettings.regional);
      setNotificationSettings(loadedSettings.notifications);
      applyRegionalSettings(loadedSettings.regional);
      setFormatTick((n) => n + 1);
      if (dealsRes.error) {
        setError("Tabela szans sprzedaży (deals) nie istnieje jeszcze w bazie — uruchom migrację SQL (migration_v2_deals.sql), aby korzystać z nowych widoków.");
      }
    } catch (e) {
      setError("Nie udało się wczytać danych: " + (e.message || ""));
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { reload(); }, [reload]);

  const upsertCompany = useCallback(async (company) => {
    try {
      if (company.id) {
        const { data, error } = await supabase.from("companies").update(companyToDb(company, user.id)).eq("id", company.id).select().single();
        if (error) throw error;
        setCompanies((prev) => prev.map((c) => (c.id === data.id ? companyFromDb(data) : c)));
        return companyFromDb(data);
      } else {
        const { data, error } = await supabase.from("companies").insert(companyToDb(company, user.id)).select().single();
        if (error) throw error;
        setCompanies((prev) => [companyFromDb(data), ...prev]);
        return companyFromDb(data);
      }
    } catch (e) {
      setError("Nie udało się zapisać firmy: " + (e.message || ""));
      return null;
    }
  }, [user.id]);

  const removeCompany = useCallback(async (id) => {
    const prevCompanies = companies;
    setCompanies((prev) => prev.filter((c) => c.id !== id));
    if (selectedCompanyId === id) { setSelectedCompanyId(null); setSelectedDealId(null); }
    try {
      const { error } = await supabase.from("companies").delete().eq("id", id);
      if (error) throw error;
      reload();
    } catch (e) {
      setCompanies(prevCompanies);
      setError("Nie udało się usunąć firmy: " + (e.message || ""));
    }
  }, [companies, selectedCompanyId, reload]);

  const upsertDeal = useCallback(async (deal) => {
    try {
      if (deal.id) {
        const { data, error } = await supabase.from("deals").update(dealToDb(deal, user.id)).eq("id", deal.id).select().single();
        if (error) throw error;
        setDeals((prev) => prev.map((d) => (d.id === data.id ? dealFromDb(data) : d)));
        return dealFromDb(data);
      } else {
        const { data, error } = await supabase.from("deals").insert(dealToDb(deal, user.id)).select().single();
        if (error) throw error;
        setDeals((prev) => [dealFromDb(data), ...prev]);
        return dealFromDb(data);
      }
    } catch (e) {
      setError("Nie udało się zapisać szansy sprzedaży: " + (e.message || ""));
      return null;
    }
  }, [user.id]);

  const removeDeal = useCallback(async (id) => {
    const prevDeals = deals;
    setDeals((prev) => prev.filter((d) => d.id !== id));
    if (selectedDealId === id) setSelectedDealId(null);
    try {
      const { error } = await supabase.from("deals").delete().eq("id", id);
      if (error) throw error;
      reload();
    } catch (e) {
      setDeals(prevDeals);
      setError("Nie udało się usunąć szansy sprzedaży: " + (e.message || ""));
    }
  }, [deals, selectedDealId, reload]);

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

  const addProduct = useCallback(async (product) => {
    try {
      const { data, error } = await supabase.from("deal_products").insert(productToDb(product, user.id)).select().single();
      if (error) throw error;
      setProducts((prev) => [productFromDb(data), ...prev]);
    } catch (e) {
      setError("Nie udało się dodać produktu: " + (e.message || ""));
    }
  }, [user.id]);

  const removeProduct = useCallback(async (id) => {
    const prev = products;
    setProducts((p) => p.filter((x) => x.id !== id));
    try {
      const { error } = await supabase.from("deal_products").delete().eq("id", id);
      if (error) throw error;
    } catch (e) {
      setProducts(prev);
      setError("Nie udało się usunąć produktu: " + (e.message || ""));
    }
  }, [products]);

  const addCost = useCallback(async (cost) => {
    try {
      const { data, error } = await supabase.from("deal_costs").insert(costToDb(cost, user.id)).select().single();
      if (error) throw error;
      setCosts((prev) => [costFromDb(data), ...prev]);
    } catch (e) {
      setError("Nie udało się dodać kosztu: " + (e.message || ""));
    }
  }, [user.id]);

  const removeCost = useCallback(async (id) => {
    const prev = costs;
    setCosts((c) => c.filter((x) => x.id !== id));
    try {
      const { error } = await supabase.from("deal_costs").delete().eq("id", id);
      if (error) throw error;
    } catch (e) {
      setCosts(prev);
      setError("Nie udało się usunąć kosztu: " + (e.message || ""));
    }
  }, [costs]);

  const addRelation = useCallback(async (relation) => {
    try {
      const { data, error } = await supabase.from("company_relations").insert(relationToDb(relation, user.id)).select().single();
      if (error) throw error;
      setRelations((prev) => [relationFromDb(data), ...prev]);
    } catch (e) {
      setError("Nie udało się dodać powiązania: " + (e.message || ""));
    }
  }, [user.id]);

  const removeRelation = useCallback(async (id) => {
    const prev = relations;
    setRelations((r) => r.filter((x) => x.id !== id));
    try {
      const { error } = await supabase.from("company_relations").delete().eq("id", id);
      if (error) throw error;
    } catch (e) {
      setRelations(prev);
      setError("Nie udało się usunąć powiązania: " + (e.message || ""));
    }
  }, [relations]);

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

  const updateUserSettings = useCallback(async (patch) => {
    const nextRegional = { ...regionalSettings, ...(patch.regional || {}) };
    const nextNotifications = { ...notificationSettings, ...(patch.notifications || {}) };
    try {
      const { error } = await supabase.from("user_settings").upsert({
        user_id: user.id, regional: nextRegional, notifications: nextNotifications, updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setRegionalSettings(nextRegional);
      setNotificationSettings(nextNotifications);
      applyRegionalSettings(nextRegional);
      setFormatTick((n) => n + 1);
      return true;
    } catch (e) {
      setError("Nie udało się zapisać ustawień: " + (e.message || ""));
      return false;
    }
  }, [regionalSettings, notificationSettings, user.id]);

  const saveTaskTemplate = useCallback(async (draft) => {
    try {
      let templateId = draft.id;
      if (templateId) {
        const { error } = await supabase.from("task_templates").update({ name: draft.name }).eq("id", templateId);
        if (error) throw error;
        await supabase.from("task_template_items").delete().eq("template_id", templateId);
      } else {
        const { data, error } = await supabase.from("task_templates").insert({ name: draft.name, owner_id: user.id }).select().single();
        if (error) throw error;
        templateId = data.id;
      }
      const itemsToInsert = (draft.items || []).map((it, idx) => ({
        template_id: templateId, type: it.type, title: it.title,
        offset_days: Number(it.offsetDays) || 0, sort_order: idx,
      }));
      if (itemsToInsert.length) {
        const { error } = await supabase.from("task_template_items").insert(itemsToInsert);
        if (error) throw error;
      }
      await reload();
      return true;
    } catch (e) {
      setError("Nie udało się zapisać szablonu zadań: " + (e.message || ""));
      return false;
    }
  }, [user.id, reload]);

  const removeTaskTemplate = useCallback(async (id) => {
    try {
      const { error } = await supabase.from("task_templates").delete().eq("id", id);
      if (error) throw error;
      setTaskTemplates((prev) => prev.filter((t) => t.id !== id));
      setTemplateItems((prev) => prev.filter((it) => it.templateId !== id));
    } catch (e) {
      setError("Nie udało się usunąć szablonu zadań: " + (e.message || ""));
    }
  }, []);

  const applyTemplateToDeal = useCallback(async (templateId, deal) => {
    const items = templateItems.filter((it) => it.templateId === templateId).sort((a, b) => a.sortOrder - b.sortOrder);
    for (const it of items) {
      const due = addDays(new Date(), it.offsetDays || 0);
      await supabase.from("tasks").insert(taskToDb({
        dealId: deal.id, clientId: deal.companyId, type: it.type, title: it.title,
        dueDate: due.toISOString().slice(0, 10), done: false,
      }, user.id));
    }
    await reload();
  }, [templateItems, user.id, reload]);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => vehicleStatusFilter === "all" || v.status === vehicleStatusFilter);
  }, [vehicles, vehicleStatusFilter]);

  const companiesById = useMemo(() => {
    const map = {};
    companies.forEach((c) => { map[c.id] = c; });
    return map;
  }, [companies]);

  const dealsByCompanyId = useMemo(() => {
    const map = {};
    deals.forEach((d) => { (map[d.companyId] = map[d.companyId] || []).push(d); });
    return map;
  }, [deals]);

  const staffNameById = useMemo(() => {
    const map = {};
    staff.forEach((p) => { map[p.id] = p.full_name || p.email || "—"; });
    return map;
  }, [staff]);

  const allTags = useMemo(() => {
    const set = new Set();
    companies.forEach((c) => (c.tags || []).forEach((t) => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pl"));
  }, [companies]);

  const filteredCompanies = useMemo(() => {
    return companies.filter((c) => {
      const matchesSearch = !search || [c.name, c.phone, c.email, c.nip].join(" ").toLowerCase().includes(search.toLowerCase());
      const matchesMine = companyShowFilter !== "mine" || c.ownerId === user.id;
      const matchesTag = !tagFilter || (c.tags || []).includes(tagFilter);
      return matchesSearch && matchesMine && matchesTag;
    }).sort((a, b) => (a.name || "").localeCompare(b.name || "", "pl"));
  }, [companies, search, companyShowFilter, tagFilter, user.id]);

  const filteredDeals = useMemo(() => {
    return deals.filter((d) => {
      const company = companiesById[d.companyId];
      const matchesSearch = !search || [d.name, company && company.name, d.carInterest].join(" ").toLowerCase().includes(search.toLowerCase());
      const matchesMine = dealShowFilter !== "mine" || d.ownerId === user.id;
      const matchesStatus = dealStatusFilter === "all" || d.status === dealStatusFilter;
      return matchesSearch && matchesMine && matchesStatus;
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [deals, companiesById, search, dealShowFilter, dealStatusFilter, user.id]);

  const taskMeta = useMemo(() => {
    return tasks.map((t) => {
      const deal = deals.find((d) => d.id === t.dealId);
      const company = deal ? companiesById[deal.companyId] : (t.clientId ? companiesById[t.clientId] : null);
      return {
        ...t,
        days: daysUntil(t.dueDate),
        companyName: (company && company.name) || "—",
        dealName: (deal && deal.name) || "",
        ownerName: staffNameById[t.ownerId] || "—",
      };
    });
  }, [tasks, deals, companiesById, staffNameById]);

  const upcomingTasks = useMemo(() => {
    return taskMeta.filter((t) => !t.done).sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
  }, [taskMeta]);

  const doneTasksWithNames = useMemo(() => taskMeta.filter((t) => t.done), [taskMeta]);

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) || null;
  const selectedDeal = deals.find((d) => d.id === selectedDealId) || null;

  const openCompany = (id) => { setSelectedCompanyId(id); setSelectedDealId(null); setTab("companies"); };
  const openDeal = (id) => {
    const deal = deals.find((d) => d.id === id);
    setSelectedDealId(id);
    if (deal) setSelectedCompanyId(deal.companyId);
  };

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
          .sideItem:hover { background: #F0EFEC; }
          .spin { animation: spin 1s linear infinite; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>

        <header style={S.header}>
          <Logo />
          <nav style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <NavBtn active={tab === "dashboard"} onClick={() => setTab("dashboard")} icon={LayoutGrid} label="Pulpit" />
            <NavBtn active={tab === "companies"} onClick={() => { setTab("companies"); setSelectedCompanyId(null); setSelectedDealId(null); }} icon={Users} label="Kontakty" />
            <NavBtn active={tab === "calendar"} onClick={() => setTab("calendar")} icon={Calendar} label="Kalendarz" />
            <NavBtn active={tab === "tasks"} onClick={() => setTab("tasks")} icon={ListChecks} label="Zadania" />
            <NavBtn active={tab === "deals"} onClick={() => { setTab("deals"); setSelectedDealId(null); }} icon={Handshake} label="Szanse sprzedaży" />
            <NavBtn active={tab === "vehicles"} onClick={() => setTab("vehicles")} icon={Car} label="Pojazdy" />
            <NavBtn active={tab === "stats"} onClick={() => setTab("stats")} icon={BarChart3} label="Statystyki" />
            <NavBtn active={tab === "settings"} onClick={() => setTab("settings")} icon={Settings} label="Ustawienia" />
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

        <main style={S.main} key={formatTick}>
          {tab === "dashboard" && (
            <Dashboard
              companies={companies}
              deals={deals}
              tasks={upcomingTasks}
              goals={goals}
              onOpenCompany={openCompany}
              onOpenDeal={(id) => { openDeal(id); setTab("companies"); }}
            />
          )}

          {tab === "companies" && !selectedCompany && (
            <CompaniesList
              companies={filteredCompanies}
              allCompanies={companies}
              currentUserId={user.id}
              allTags={allTags}
              tagFilter={tagFilter}
              setTagFilter={setTagFilter}
              showFilter={companyShowFilter}
              setShowFilter={setCompanyShowFilter}
              search={search}
              setSearch={setSearch}
              dealsByCompanyId={dealsByCompanyId}
              tasks={tasks}
              onSelect={openCompany}
              onAdd={() => { setEditingCompany(null); setShowCompanyForm(true); }}
            />
          )}

          {tab === "companies" && selectedCompany && !selectedDeal && (
            <CompanyDetail
              company={selectedCompany}
              deals={dealsByCompanyId[selectedCompany.id] || []}
              activities={activities.filter((a) => a.companyId === selectedCompany.id)}
              relations={relations.filter((r) => r.companyAId === selectedCompany.id || r.companyBId === selectedCompany.id)}
              companiesById={companiesById}
              staffName={staffNameById[selectedCompany.ownerId] || "—"}
              onBack={() => setSelectedCompanyId(null)}
              onEdit={() => { setEditingCompany(selectedCompany); setShowCompanyForm(true); }}
              onDelete={() => removeCompany(selectedCompany.id)}
              onAddActivity={(activity) => addActivity(activity)}
              onDeleteActivity={(id) => removeActivity(id)}
              onUpdateCompany={(patch) => upsertCompany({ ...selectedCompany, ...patch })}
              onOpenDeal={openDeal}
              onAddDeal={() => { setDealFormCompanyId(selectedCompany.id); setEditingDeal(null); setShowDealForm(true); }}
              onAddRelation={(relation) => addRelation(relation)}
              onDeleteRelation={(id) => removeRelation(id)}
              allCompanies={companies}
            />
          )}

          {tab === "companies" && selectedCompany && selectedDeal && (
            <DealDetail
              deal={selectedDeal}
              company={selectedCompany}
              tasks={taskMeta.filter((t) => t.dealId === selectedDeal.id)}
              products={products.filter((p) => p.dealId === selectedDeal.id)}
              costs={costs.filter((c) => c.dealId === selectedDeal.id)}
              activities={activities.filter((a) => a.companyId === selectedCompany.id)}
              onBack={() => setSelectedDealId(null)}
              onEdit={() => { setEditingDeal(selectedDeal); setDealFormCompanyId(selectedCompany.id); setShowDealForm(true); }}
              onDelete={() => removeDeal(selectedDeal.id)}
              onUpdateDeal={(patch) => upsertDeal({ ...selectedDeal, ...patch })}
              onAddTask={(task) => upsertTask(task)}
              onToggleTask={(task) => upsertTask({ ...task, done: !task.done })}
              onDeleteTask={(id) => removeTask(id)}
              onAddProduct={(p) => addProduct(p)}
              onDeleteProduct={(id) => removeProduct(id)}
              onAddCost={(c) => addCost(c)}
              onDeleteCost={(id) => removeCost(id)}
              taskTemplates={taskTemplates}
              onApplyTemplate={(templateId) => applyTemplateToDeal(templateId, selectedDeal)}
            />
          )}

          {tab === "calendar" && (
            <CalendarView
              tasks={taskMeta}
              onOpenDeal={(id) => { openDeal(id); setTab("deals"); }}
            />
          )}

          {tab === "tasks" && (
            <TasksBoard
              tasks={taskMeta}
              onToggleTask={(task) => upsertTask({ ...task, done: !task.done })}
              onDeleteTask={(id) => removeTask(id)}
              onOpenDeal={(id) => { openDeal(id); setTab("deals"); }}
            />
          )}

          {tab === "deals" && !selectedDeal && (
            <DealsList
              deals={filteredDeals}
              companiesById={companiesById}
              products={products}
              showFilter={dealShowFilter}
              setShowFilter={setDealShowFilter}
              statusFilter={dealStatusFilter}
              setStatusFilter={setDealStatusFilter}
              search={search}
              setSearch={setSearch}
              onSelect={openDeal}
            />
          )}

          {tab === "deals" && selectedDeal && (
            <DealDetail
              deal={selectedDeal}
              company={companiesById[selectedDeal.companyId]}
              tasks={taskMeta.filter((t) => t.dealId === selectedDeal.id)}
              products={products.filter((p) => p.dealId === selectedDeal.id)}
              costs={costs.filter((c) => c.dealId === selectedDeal.id)}
              activities={activities.filter((a) => a.companyId === selectedDeal.companyId)}
              onBack={() => setSelectedDealId(null)}
              onEdit={() => { setEditingDeal(selectedDeal); setDealFormCompanyId(selectedDeal.companyId); setShowDealForm(true); }}
              onDelete={() => removeDeal(selectedDeal.id)}
              onUpdateDeal={(patch) => upsertDeal({ ...selectedDeal, ...patch })}
              onAddTask={(task) => upsertTask(task)}
              onToggleTask={(task) => upsertTask({ ...task, done: !task.done })}
              onDeleteTask={(id) => removeTask(id)}
              onAddProduct={(p) => addProduct(p)}
              onDeleteProduct={(id) => removeProduct(id)}
              onAddCost={(c) => addCost(c)}
              onDeleteCost={(id) => removeCost(id)}
              onOpenCompany={openCompany}
              showCompanyLink
              taskTemplates={taskTemplates}
              onApplyTemplate={(templateId) => applyTemplateToDeal(templateId, selectedDeal)}
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

          {tab === "stats" && (
            <StatystykiView deals={deals} companiesById={companiesById} products={products} />
          )}

          {tab === "settings" && (
            <SettingsPanel
              user={user}
              profile={profile}
              goals={goals}
              onUpdateGoals={updateGoals}
              regionalSettings={regionalSettings}
              notificationSettings={notificationSettings}
              onUpdateUserSettings={updateUserSettings}
              taskTemplates={taskTemplates}
              templateItems={templateItems}
              onSaveTemplate={saveTaskTemplate}
              onRemoveTemplate={removeTaskTemplate}
              importHistory={importHistory}
              onImportDone={reload}
              companies={companies}
            />
          )}
        </main>

        {showCompanyForm && (
          <CompanyFormModal
            initial={editingCompany}
            staff={staff}
            canReassign={profile.role === "admin"}
            currentUserId={user.id}
            onClose={() => setShowCompanyForm(false)}
            onSave={async (company) => {
              const saved = await upsertCompany(company);
              setShowCompanyForm(false);
              if (saved) setSelectedCompanyId(saved.id);
            }}
          />
        )}

        {showDealForm && (
          <DealFormModal
            initial={editingDeal}
            companyId={dealFormCompanyId}
            currentUserId={user.id}
            onClose={() => setShowDealForm(false)}
            onSave={async (deal) => {
              const saved = await upsertDeal(deal);
              setShowDealForm(false);
              if (saved) { setSelectedCompanyId(saved.companyId); setSelectedDealId(saved.id); }
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
      display: "flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 8, border: "none",
      background: active ? "#111111" : "transparent", color: active ? "#fff" : "#111111",
      fontSize: 12.5, fontWeight: 600, transition: "background .15s", whiteSpace: "nowrap",
    }}>
      <Icon size={14} /> {label}
    </button>
  );
}

/* ---------- Asystent: podpowiedzi dla szansy sprzedaży ---------- */
function computeAssistantSuggestions(deal, company, activities = []) {
  const suggestions = [];
  if (!deal || deal.status !== "otwarta") return suggestions;
  const pipeline = computePipeline(deal, company);
  if (!pipeline.stages[0].done) {
    suggestions.push({ id: "dane", text: "Uzupełnij brakujące dane klienta (telefon, e-mail, NIP, budżet, finansowanie)." });
  }
  const companyActivities = activities.filter((a) => a.companyId === (company && company.id));
  const lastActivity = companyActivities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  const daysSinceContact = lastActivity ? Math.round((new Date() - new Date(lastActivity.createdAt)) / 86400000) : null;
  if (daysSinceContact === null || daysSinceContact >= 7) {
    suggestions.push({
      id: "contact",
      text: daysSinceContact === null
        ? "Brak zarejestrowanego kontaktu z klientem — zadzwoń lub napisz."
        : `Brak kontaktu od ${daysSinceContact} dni — czas na telefon.`,
    });
  }
  const d = daysUntil(deal.decisionDate);
  if (d !== null && d >= 0 && d <= 3 && pipeline.donePct < 100) {
    suggestions.push({ id: "deadline", text: `Zbliża się termin decyzji (${d === 0 ? "dziś" : "za " + d + " dni"}) — przyspiesz proces sprzedaży.` });
  }
  if (pipeline.donePct >= 100) {
    suggestions.push({ id: "close", text: "Wszystkie kroki procesu sprzedaży ukończone — oznacz szansę jako wygraną." });
  }
  return suggestions;
}

/* ---------- Dashboard ---------- */
function Dashboard({ companies, deals, tasks, goals, onOpenCompany, onOpenDeal }) {
  const urgent = tasks.filter((t) => t.days !== null && t.days <= 2);
  const openDeals = deals.filter((d) => d.status === "otwarta");
  const totalOpenBudget = openDeals.reduce((sum, d) => sum + (Number(d.budget) || 0), 0);
  const funnel = DEAL_STATUSES.map((s) => ({ ...s, count: deals.filter((d) => d.status === s.key).length }));
  const maxCount = Math.max(1, ...funnel.map((f) => f.count));

  const now = new Date();
  const isThisMonth = (d) => {
    if (!d) return false;
    const dt = new Date(d);
    return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();
  };
  const addedThisMonth = companies.filter((c) => isThisMonth(c.createdAt)).length;
  const dealsThisMonth = deals.filter((d) => isThisMonth(d.createdAt)).length;
  const wonThisMonth = deals.filter((d) => d.status === "wygrana" && isThisMonth(d.statusChangedAt)).length;
  const lostThisMonth = deals.filter((d) => d.status === "przegrana" && isThisMonth(d.statusChangedAt)).length;
  const daysLeft = daysLeftInMonth();
  const goalRows = [
    { label: "Nowe firmy / kontakty", value: addedThisMonth, target: goals.contactsTarget },
    { label: "Nowe szanse sprzedaży", value: dealsThisMonth, target: goals.dealsTarget },
    { label: "Wartość otwartych szans", value: totalOpenBudget, target: goals.valueTarget, isCurrency: true },
  ];

  const companiesById = {};
  companies.forEach((c) => { companiesById[c.id] = c; });
  const suggestions = openDeals
    .flatMap((d) => computeAssistantSuggestions(d, companiesById[d.companyId], []).map((s) => ({ ...s, deal: d, company: companiesById[d.companyId] })))
    .slice(0, 6);

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
        <StatCard label="Firmy / kontakty" value={companies.length} />
        <StatCard label="Otwarte szanse sprzedaży" value={openDeals.length} />
        <StatCard label="Pilne zadania (≤2 dni)" value={urgent.length} />
        <StatCard label="Wartość otwartych szans" value={fmtMoney(totalOpenBudget)} />
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
              <button key={t.id} className="hoverRow" onClick={() => (t.dealId ? onOpenDeal(t.dealId) : onOpenCompany(t.clientId))} style={S.urgentRow}>
                <Bell size={14} color="#E4241B" />
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</div>
                  <div style={{ fontSize: 11, color: "#9A9A9A" }}>{t.companyName}{t.dealName ? " · " + t.dealName : ""}</div>
                </div>
                <ChevronRight size={14} color="#9A9A9A" />
              </button>
            ))}
          </div>
        </section>
      </div>

      <section style={S.card}>
        <h3 style={{ ...S.cardTitle, display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles size={15} color="#E4241B" /> Asystent — podpowiedzi
        </h3>
        {suggestions.length === 0 ? (
          <EmptyNote text="Brak podpowiedzi — wszystkie otwarte szanse sprzedaży wyglądają dobrze." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {suggestions.map((s, i) => (
              <button key={s.deal.id + s.id + i} className="hoverRow" onClick={() => onOpenCompany(s.deal.companyId)} style={S.urgentRow}>
                <Sparkles size={14} color="#E4241B" />
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{s.text}</div>
                  <div style={{ fontSize: 11, color: "#9A9A9A" }}>{(s.company && s.company.name) || "—"} · {s.deal.name}</div>
                </div>
                <ChevronRight size={14} color="#9A9A9A" />
              </button>
            ))}
          </div>
        )}
      </section>
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

/* ---------- Kontakty: lista firm w stylu "Kontaktów" ---------- */
function SidebarItem({ active, onClick, label, count, disabled }) {
  return (
    <button
      className="sideItem"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
        background: active ? "#F0EFEC" : "none", border: "none", borderRadius: 6, padding: "7px 9px",
        fontSize: 12.5, fontWeight: active ? 700 : 500, color: disabled ? "#C7C5C1" : "#111111",
        textAlign: "left", cursor: disabled ? "not-allowed" : "pointer",
      }}
      title={disabled ? "Funkcja pojawi się w kolejnej aktualizacji" : undefined}
    >
      <span>{label}</span>
      {count !== undefined && <span style={{ color: "#9A9A9A", fontWeight: 600, fontSize: 11.5 }}>{count}</span>}
    </button>
  );
}

function SidebarSection({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ ...S.label, marginBottom: 6, padding: "0 9px" }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>{children}</div>
    </div>
  );
}

function AzIndex({ letters, onJump }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, position: "sticky", top: 20 }}>
      {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((L) => {
        const has = letters.has(L);
        return (
          <button
            key={L}
            onClick={() => has && onJump(L)}
            disabled={!has}
            style={{
              background: "none", border: "none", fontSize: 10, fontWeight: 700, padding: "1px 4px",
              color: has ? "#6B6B6B" : "#E7E5E2", cursor: has ? "pointer" : "default",
            }}
          >
            {L}
          </button>
        );
      })}
    </div>
  );
}

function CompaniesList({
  companies, allCompanies, currentUserId, allTags, tagFilter, setTagFilter,
  showFilter, setShowFilter, search, setSearch, dealsByCompanyId, tasks, onSelect, onAdd,
}) {
  const tagCounts = useMemo(() => {
    const map = {};
    allTags.forEach((t) => { map[t] = allCompanies.filter((c) => (c.tags || []).includes(t)).length; });
    return map;
  }, [allTags, allCompanies]);

  const mineCount = allCompanies.filter((c) => c.ownerId === currentUserId).length;

  const letters = useMemo(() => {
    const set = new Set();
    companies.forEach((c) => { if (c.name) set.add(c.name[0].toUpperCase()); });
    return set;
  }, [companies]);

  function jump(letter) {
    const el = document.getElementById("company-letter-" + letter);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  let lastLetter = null;

  return (
    <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
      <aside style={{ width: 190, flexShrink: 0 }}>
        <SidebarSection title="Pokaż">
          <SidebarItem label="Moje" count={mineCount} active={showFilter === "mine"} onClick={() => setShowFilter("mine")} />
          <SidebarItem label="Wszystkie" count={allCompanies.length} active={showFilter === "all"} onClick={() => setShowFilter("all")} />
          <SidebarItem label="Obserwowane" disabled />
          <SidebarItem label="Usunięte" disabled />
        </SidebarSection>
        <SidebarSection title="Tagi">
          {allTags.length === 0 && <div style={{ fontSize: 11.5, color: "#9A9A9A", padding: "0 9px" }}>Brak tagów</div>}
          {allTags.map((t) => (
            <SidebarItem key={t} label={t} count={tagCounts[t]} active={tagFilter === t} onClick={() => setTagFilter(tagFilter === t ? null : t)} />
          ))}
        </SidebarSection>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={S.toolbar}>
          <div style={S.searchBox}>
            <Search size={15} color="#9A9A9A" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj firmy, telefonu, e-maila, NIP…"
              style={S.searchInput}
            />
          </div>
          <button style={S.secondaryBtn}><Filter size={13} /> Filtruj</button>
          <button onClick={onAdd} style={S.primaryBtn}><Plus size={15} /> Nowa firma</button>
        </div>

        {companies.length === 0 ? (
          <div style={{ ...S.card, textAlign: "center", padding: 48 }}>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, marginBottom: 6 }}>Brak firm / kontaktów</div>
            <div style={{ fontSize: 13, color: "#9A9A9A", marginBottom: 16 }}>Dodaj pierwszą firmę, aby zacząć budować bazę.</div>
            <button onClick={onAdd} style={{ ...S.primaryBtn, margin: "0 auto" }}><Plus size={15} /> Nowa firma</button>
          </div>
        ) : (
          <div style={S.card}>
            {companies.map((c) => {
              const letter = (c.name || "?")[0].toUpperCase();
              const showHeader = letter !== lastLetter;
              lastLetter = letter;
              const companyDeals = dealsByCompanyId[c.id] || [];
              const taskCount = tasks.filter((t) => companyDeals.some((d) => d.id === t.dealId) || t.clientId === c.id).length;
              return (
                <React.Fragment key={c.id}>
                  {showHeader && (
                    <div id={"company-letter-" + letter} style={{ fontSize: 11, fontWeight: 700, color: "#9A9A9A", padding: "10px 14px 4px" }}>{letter}</div>
                  )}
                  <button className="hoverRow" onClick={() => onSelect(c.id)} style={S.tableRow}>
                    <span style={{ display: "flex", alignItems: "center", gap: 10, flex: 2, textAlign: "left" }}>
                      <CompanyAvatar name={c.name} />
                      <span>
                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{c.name}</div>
                        <div style={{ fontSize: 11.5, color: "#9A9A9A" }}>{c.phone || c.email || "—"}</div>
                        {c.tags && c.tags.length > 0 && (
                          <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                            {c.tags.slice(0, 3).map((t) => (
                              <span key={t} style={{ fontSize: 10, fontWeight: 700, background: "#F0EFEC", borderRadius: 10, padding: "2px 7px" }}>{t}</span>
                            ))}
                          </div>
                        )}
                      </span>
                    </span>
                    <span style={{ flex: 1, fontSize: 12, textAlign: "left", color: "#6B6B6B" }}>{fmtDate(c.createdAt)}</span>
                    <span style={{ flex: 1.4, fontSize: 12, textAlign: "left", color: "#6B6B6B" }}>
                      Zadania: {taskCount} · Szanse: {companyDeals.length}
                    </span>
                    <ChevronRight size={15} color="#9A9A9A" />
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ width: 20, flexShrink: 0 }}>
        <AzIndex letters={letters} onJump={jump} />
      </div>
    </div>
  );
}

/* ---------- Company detail ---------- */
function CompanyDetail({
  company, deals, activities, relations, companiesById, staffName, onBack, onEdit, onDelete,
  onAddActivity, onDeleteActivity, onUpdateCompany, onOpenDeal, onAddDeal, onAddRelation, onDeleteRelation, allCompanies,
}) {
  const [newActivityType, setNewActivityType] = useState("note");
  const [newActivityTitle, setNewActivityTitle] = useState("");
  const [newActivityBody, setNewActivityBody] = useState("");

  const sortedActivities = [...(activities || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const sortedDeals = [...(deals || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  function submitActivity(e) {
    e.preventDefault();
    if (!newActivityTitle.trim()) return;
    onAddActivity({
      companyId: company.id,
      type: newActivityType,
      title: newActivityTitle.trim(),
      body: newActivityBody.trim(),
    });
    setNewActivityTitle("");
    setNewActivityBody("");
  }

  return (
    <div style={S.stack}>
      <button onClick={onBack} style={S.backBtn}>← Wszystkie firmy</button>

      <div style={S.twoCol}>
        <section style={{ ...S.card, flex: 1.3 }}>
          <PinnedNoteBox note={company.pinnedNote} onSave={(v) => onUpdateCompany({ pinnedNote: v })} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <CompanyAvatar name={company.name} size={44} />
              <div>
                <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 22, fontWeight: 600 }}>{company.name}</div>
                <div style={{ marginTop: 6, fontSize: 11.5, color: "#9A9A9A" }}>Opiekun: <strong style={{ color: "#111111" }}>{staffName}</strong></div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onEdit} style={S.secondaryBtn}>Edytuj</button>
              <button onClick={() => { if (window.confirm("Usunąć tę firmę wraz ze wszystkimi jej szansami sprzedaży?")) onDelete(); }} style={S.dangerBtn}><Trash2 size={14} /></button>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <TagsEditor tags={company.tags || []} onChange={(tags) => onUpdateCompany({ tags })} />
          </div>

          <div style={S.detailGrid}>
            <DetailRow icon={Phone} label="Telefon" value={company.phone} />
            <DetailRow icon={Mail} label="E-mail" value={company.email} />
            <DetailRow icon={MapPin} label="Adres" value={company.address} />
            <DetailRow icon={Building2} label="NIP" value={company.nip} />
            <DetailRow icon={UserPlus} label="Osoba kontaktowa" value={company.contactPerson} />
            <DetailRow icon={Tag} label="Źródło pozyskania" value={company.source} />
          </div>

          {company.notes && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #E7E5E2" }}>
              <div style={S.label}>Notatki</div>
              <div style={{ fontSize: 13.5, marginTop: 4, lineHeight: 1.5 }}>{company.notes}</div>
            </div>
          )}
        </section>

        <section style={{ ...S.card, flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={S.cardTitle}>Szanse sprzedaży</h3>
            <button onClick={onAddDeal} style={{ ...S.secondaryBtn, display: "flex", alignItems: "center", gap: 6 }}><Plus size={13} /> Nowa</button>
          </div>
          {sortedDeals.length === 0 && <EmptyNote text="Ta firma nie ma jeszcze żadnej szansy sprzedaży." />}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {sortedDeals.map((d) => {
              const pct = dealProbability(d, company);
              return (
                <button key={d.id} className="hoverRow" onClick={() => onOpenDeal(d.id)} style={S.urgentRow}>
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</div>
                    <div style={{ fontSize: 11, color: "#9A9A9A" }}>{d.carInterest || "—"} · {pct}%</div>
                  </div>
                  <DealStatusPill statusKey={d.status} />
                  <ChevronRight size={14} color="#9A9A9A" />
                </button>
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
            {sortedActivities.length === 0 && <EmptyNote text="Brak historii kontaktu z tą firmą." />}
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
          <h3 style={{ ...S.cardTitle, display: "flex", alignItems: "center", gap: 8 }}><Link2 size={15} /> Powiązania</h3>
          <RelationsCard
            company={company}
            relations={relations}
            companiesById={companiesById}
            allCompanies={allCompanies}
            onAdd={onAddRelation}
            onDelete={onDeleteRelation}
          />
        </section>
      </div>
    </div>
  );
}

function RelationsCard({ company, relations, companiesById, allCompanies, onAdd, onDelete }) {
  const [targetId, setTargetId] = useState("");
  const [relType, setRelType] = useState(RELATION_TYPES[0]);
  const [note, setNote] = useState("");

  const others = allCompanies.filter((c) => c.id !== company.id);

  function submit(e) {
    e.preventDefault();
    if (!targetId) return;
    onAdd({ companyAId: company.id, companyBId: targetId, relationType: relType, note: note.trim() });
    setTargetId("");
    setNote("");
  }

  return (
    <div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        <select value={targetId} onChange={(e) => setTargetId(e.target.value)} style={S.select}>
          <option value="">— wybierz firmę —</option>
          {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={relType} onChange={(e) => setRelType(e.target.value)} style={S.select}>
          {RELATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notatka (opcjonalnie)" style={S.input} />
        <button type="submit" style={S.primaryBtn}><Plus size={14} /> Dodaj powiązanie</button>
      </form>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
        {relations.length === 0 && <EmptyNote text="Brak powiązań z innymi firmami." />}
        {relations.map((r) => {
          const otherId = r.companyAId === company.id ? r.companyBId : r.companyAId;
          const other = companiesById[otherId];
          return (
            <div key={r.id} style={{ ...S.urgentRow }}>
              <Link2 size={13} color="#6B6B6B" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{(other && other.name) || "—"}</div>
                <div style={{ fontSize: 11, color: "#9A9A9A" }}>{r.relationType}{r.note ? " · " + r.note : ""}</div>
              </div>
              <button onClick={() => onDelete(r.id)} className="iconBtn" style={S.iconBtnStyle}><X size={13} color="#9A9A9A" /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Szanse sprzedaży: lista z panelem filtrów ---------- */
function DealsList({
  deals, companiesById, products, showFilter, setShowFilter, statusFilter, setStatusFilter, search, setSearch, onSelect,
}) {
  const statusCounts = useMemo(() => {
    const map = {};
    DEAL_STATUSES.forEach((s) => { map[s.key] = deals.filter((d) => d.status === s.key).length; });
    return map;
  }, [deals]);

  const openDeals = deals.filter((d) => d.status === "otwarta");
  const wonDeals = deals.filter((d) => d.status === "wygrana");
  const forecast = openDeals.reduce((sum, d) => sum + (Number(d.budget) || 0) * (dealProbability(d, companiesById[d.companyId]) / 100), 0);
  const realized = wonDeals.reduce((sum, d) => sum + (Number(d.budget) || 0), 0);
  const productCount = products.length;

  const letters = useMemo(() => {
    const set = new Set();
    deals.forEach((d) => { if (d.name) set.add(d.name[0].toUpperCase()); });
    return set;
  }, [deals]);

  function jump(letter) {
    const el = document.getElementById("deal-letter-" + letter);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  let lastLetter = null;

  return (
    <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
      <aside style={{ width: 190, flexShrink: 0 }}>
        <SidebarSection title="Pokaż">
          <SidebarItem label="Moje" active={showFilter === "mine"} onClick={() => setShowFilter("mine")} />
          <SidebarItem label="Wszystkie" active={showFilter === "all"} onClick={() => setShowFilter("all")} />
          <SidebarItem label="Biorę udział" disabled />
          <SidebarItem label="Obserwowane" disabled />
          <SidebarItem label="Usunięte" disabled />
        </SidebarSection>
        <SidebarSection title="Status">
          <SidebarItem label="Wszystkie" count={deals.length} active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
          {DEAL_STATUSES.map((s) => (
            <button
              key={s.key}
              className="sideItem"
              onClick={() => setStatusFilter(s.key)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                background: statusFilter === s.key ? "#F0EFEC" : "none", border: "none", borderRadius: 6, padding: "7px 9px",
                fontSize: 12.5, fontWeight: statusFilter === s.key ? 700 : 500, textAlign: "left",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color }} />
                {s.label}
              </span>
              <span style={{ color: "#9A9A9A", fontWeight: 600, fontSize: 11.5 }}>{statusCounts[s.key] || 0}</span>
            </button>
          ))}
        </SidebarSection>
        <SidebarSection title="Podsumowanie">
          <div style={{ padding: "0 9px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10.5, color: "#9A9A9A", fontWeight: 700 }}>Prognoza</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtMoney(forecast)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: "#9A9A9A", fontWeight: 700 }}>Ilość otwartych</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{openDeals.length}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: "#9A9A9A", fontWeight: 700 }}>Realizacja</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtMoney(realized)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: "#9A9A9A", fontWeight: 700 }}>Ilość wygranych</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{wonDeals.length}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: "#9A9A9A", fontWeight: 700 }}>Produkty łącznie</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{productCount}</div>
            </div>
          </div>
        </SidebarSection>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={S.toolbar}>
          <div style={S.searchBox}>
            <Search size={15} color="#9A9A9A" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj szansy sprzedaży, firmy, modelu…"
              style={S.searchInput}
            />
          </div>
          <button style={S.secondaryBtn}><Filter size={13} /> Filtruj</button>
        </div>

        {deals.length === 0 ? (
          <div style={{ ...S.card, textAlign: "center", padding: 48 }}>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, marginBottom: 6 }}>Brak szans sprzedaży</div>
            <div style={{ fontSize: 13, color: "#9A9A9A" }}>Otwórz firmę i dodaj jej pierwszą szansę sprzedaży.</div>
          </div>
        ) : (
          <div style={S.card}>
            {deals.map((d) => {
              const company = companiesById[d.companyId];
              const letter = (d.name || "?")[0].toUpperCase();
              const showHeader = letter !== lastLetter;
              lastLetter = letter;
              const pct = dealProbability(d, company);
              const dd = daysUntil(d.decisionDate);
              return (
                <React.Fragment key={d.id}>
                  {showHeader && (
                    <div id={"deal-letter-" + letter} style={{ fontSize: 11, fontWeight: 700, color: "#9A9A9A", padding: "10px 14px 4px" }}>{letter}</div>
                  )}
                  <button className="hoverRow" onClick={() => onSelect(d.id)} style={S.tableRow}>
                    <span style={{ flex: 2, textAlign: "left" }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{d.name}</div>
                      <div style={{ fontSize: 11.5, color: "#9A9A9A" }}>{(company && company.name) || "—"}</div>
                    </span>
                    <span style={{ flex: 1, fontSize: 13, textAlign: "left" }}>{d.budget ? fmtMoney(d.budget) : "—"}</span>
                    <span style={{ flex: 1, fontSize: 13, textAlign: "left" }}>{pct}%</span>
                    <span style={{ flex: 1.2, fontSize: 13, textAlign: "left", color: dd !== null && dd <= 2 ? "#E4241B" : "#111111", fontWeight: dd !== null && dd <= 2 ? 700 : 400 }}>
                      {fmtDate(d.decisionDate)}
                    </span>
                    <span style={{ flex: 1.2, textAlign: "left" }}><DealStatusPill statusKey={d.status} /></span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ width: 20, flexShrink: 0 }}>
        <AzIndex letters={letters} onJump={jump} />
      </div>
    </div>
  );
}

/* ---------- Deal detail (Szansa sprzedaży) ---------- */
function DealDetail({
  deal, company, tasks, products, costs, activities, onBack, onEdit, onDelete, onUpdateDeal,
  onAddTask, onToggleTask, onDeleteTask, onAddProduct, onDeleteProduct, onAddCost, onDeleteCost,
  onOpenCompany, showCompanyLink, taskTemplates, onApplyTemplate,
}) {
  const [newTaskType, setNewTaskType] = useState("call");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDate, setNewTaskDate] = useState("");
  const [templateToApply, setTemplateToApply] = useState("");
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [reasonDraft, setReasonDraft] = useState(deal.status === "wygrana" ? deal.winReason : deal.lossReason);

  useEffect(() => {
    setReasonDraft(deal.status === "wygrana" ? deal.winReason : deal.lossReason);
  }, [deal.id, deal.status]);

  const sortedTasks = [...tasks].sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
  const pct = dealProbability(deal, company);
  const suggestions = computeAssistantSuggestions(deal, company, activities);

  function submitTask(e) {
    e.preventDefault();
    if (!newTaskTitle.trim() || !newTaskDate) return;
    onAddTask({
      dealId: deal.id,
      clientId: company ? company.id : null,
      type: newTaskType,
      title: newTaskTitle.trim(),
      dueDate: newTaskDate,
      done: false,
    });
    setNewTaskTitle("");
    setNewTaskDate("");
  }

  function saveReason() {
    if (deal.status === "wygrana") onUpdateDeal({ winReason: reasonDraft });
    else if (deal.status === "przegrana") onUpdateDeal({ lossReason: reasonDraft });
  }

  return (
    <div style={S.stack}>
      <button onClick={onBack} style={S.backBtn}>← Wszystkie szanse sprzedaży</button>

      <div style={S.twoCol}>
        <section style={{ ...S.card, flex: 1.3 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 22, fontWeight: 600 }}>{deal.name}</div>
              <div style={{ marginTop: 6, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <DealStatusPill statusKey={deal.status} />
                {company && (
                  showCompanyLink ? (
                    <button onClick={() => onOpenCompany(company.id)} style={{ background: "none", border: "none", fontSize: 11.5, color: "#E4241B", fontWeight: 700, padding: 0 }}>
                      {company.name}
                    </button>
                  ) : (
                    <span style={{ fontSize: 11.5, color: "#9A9A9A" }}>Firma: <strong style={{ color: "#111111" }}>{company.name}</strong></span>
                  )
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onEdit} style={S.secondaryBtn}>Edytuj</button>
              <button onClick={() => { if (window.confirm("Usunąć tę szansę sprzedaży?")) onDelete(); }} style={S.dangerBtn}><Trash2 size={14} /></button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            {DEAL_STATUSES.map((s) => (
              <button
                key={s.key}
                onClick={() => onUpdateDeal({ status: s.key })}
                style={{
                  display: "flex", alignItems: "center", gap: 6, border: deal.status === s.key ? `1px solid ${s.color}` : "1px solid #E7E5E2",
                  background: deal.status === s.key ? `${s.color}14` : "#fff", borderRadius: 20, padding: "5px 11px",
                  fontSize: 11.5, fontWeight: 700, color: s.color,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color }} /> {s.label}
              </button>
            ))}
          </div>

          {(deal.status === "wygrana" || deal.status === "przegrana") && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #E7E5E2" }}>
              <div style={S.label}>{deal.status === "wygrana" ? "Powód wygranej" : "Powód przegranej"}</div>
              <textarea
                value={reasonDraft || ""}
                onChange={(e) => setReasonDraft(e.target.value)}
                onBlur={saveReason}
                rows={2}
                style={{ ...S.input, resize: "vertical", marginTop: 6 }}
                placeholder="Np. cena, konkurencja, brak kontaktu, finansowanie…"
              />
            </div>
          )}

          <div style={S.detailGrid}>
            <DetailRow icon={Car} label="Model / auto" value={deal.carInterest} />
            <DetailRow icon={Wallet} label="Budżet" value={deal.budget ? fmtMoney(deal.budget) : "—"} />
            <DetailRow icon={Handshake} label="Finansowanie" value={deal.financing} />
            <DetailRow icon={CalendarClock} label="Decyzja do" value={fmtDate(deal.decisionDate)} />
            <DetailRow icon={Tag} label="Rodzaj zakupu" value={deal.purchaseType} />
            <DetailRow icon={Users} label="Widoczność" value={deal.visibility} />
          </div>

          {deal.notes && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #E7E5E2" }}>
              <div style={S.label}>Notatki</div>
              <div style={{ fontSize: 13.5, marginTop: 4, lineHeight: 1.5 }}>{deal.notes}</div>
            </div>
          )}
        </section>

        <section style={{ ...S.card, flex: 1 }}>
          <div style={{ marginTop: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6B6B6B", fontWeight: 600, marginBottom: 6 }}>
              <span>Prawdopodobieństwo sprzedaży</span>
              <span style={{ color: "#111111", fontWeight: 700 }}>{pct}%</span>
            </div>
            <div style={{ background: "#F0EFEC", borderRadius: 6, height: 8, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, background: "#E4241B", height: "100%", borderRadius: 6 }} />
            </div>
          </div>

          <div style={{ marginTop: 22 }}>
            <SalesProcessCard key={deal.id} deal={deal} company={company} onUpdateDeal={onUpdateDeal} />
          </div>

          {suggestions.length > 0 && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #E7E5E2" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                <Sparkles size={14} color="#E4241B" /> Asystent
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {suggestions.map((s) => (
                  <div key={s.id} style={{ fontSize: 12.5, background: "#FFF7E0", border: "1px solid #F0E0A8", borderRadius: 8, padding: "8px 10px" }}>
                    {s.text}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <div style={S.twoCol}>
        <section style={{ ...S.card, flex: 1 }}>
          <h3 style={{ ...S.cardTitle, display: "flex", alignItems: "center", gap: 8 }}><Package size={15} /> Produkty i koszty</h3>
          <ProductsCostsCard
            deal={deal}
            products={products}
            costs={costs}
            onAddProduct={onAddProduct}
            onDeleteProduct={onDeleteProduct}
            onAddCost={onAddCost}
            onDeleteCost={onDeleteCost}
          />
        </section>

        <section style={{ ...S.card, flex: 1 }}>
          <h3 style={S.cardTitle}>Zadania</h3>

          {taskTemplates && taskTemplates.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <select value={templateToApply} onChange={(e) => setTemplateToApply(e.target.value)} style={{ ...S.select, flex: 1 }}>
                <option value="">— zastosuj szablon zadań —</option>
                {taskTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button
                type="button"
                disabled={!templateToApply || applyingTemplate}
                onClick={async () => {
                  setApplyingTemplate(true);
                  await onApplyTemplate(templateToApply);
                  setTemplateToApply("");
                  setApplyingTemplate(false);
                }}
                style={S.secondaryBtn}
              >
                {applyingTemplate ? "Dodawanie…" : "Zastosuj"}
              </button>
            </div>
          )}

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
            {sortedTasks.length === 0 && <EmptyNote text="Brak zadań dla tej szansy sprzedaży." />}
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
    </div>
  );
}

function ProductsCostsCard({ deal, products, costs, onAddProduct, onDeleteProduct, onAddCost, onDeleteCost }) {
  const [pName, setPName] = useState("");
  const [pQty, setPQty] = useState("1");
  const [pUnit, setPUnit] = useState("");
  const [pCost, setPCost] = useState("");
  const [cName, setCName] = useState("");
  const [cAmount, setCAmount] = useState("");

  const revenue = products.reduce((s, p) => s + (Number(p.unitPrice) || 0) * (Number(p.quantity) || 0), 0);
  const productCost = products.reduce((s, p) => s + (Number(p.costPrice) || 0) * (Number(p.quantity) || 0), 0);
  const totalCosts = costs.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const margin = revenue - productCost - totalCosts;
  const marginPct = revenue > 0 ? Math.round((margin / revenue) * 100) : 0;

  function submitProduct(e) {
    e.preventDefault();
    if (!pName.trim()) return;
    onAddProduct({ dealId: deal.id, name: pName.trim(), quantity: pQty || 1, unitPrice: pUnit || 0, costPrice: pCost || 0 });
    setPName(""); setPQty("1"); setPUnit(""); setPCost("");
  }

  function submitCost(e) {
    e.preventDefault();
    if (!cName.trim()) return;
    onAddCost({ dealId: deal.id, name: cName.trim(), amount: cAmount || 0 });
    setCName(""); setCAmount("");
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
        <SummaryFigure value={fmtMoney(revenue)} label="Przychód" color="#111111" />
        <SummaryFigure value={fmtMoney(margin)} label="Marża" color={margin >= 0 ? "#1C8A4B" : "#E4241B"} />
        <SummaryFigure value={`${marginPct}%`} label="Marża %" color="#111111" />
      </div>

      <div style={S.label}>Produkty</div>
      <form onSubmit={submitProduct} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, marginBottom: 8 }}>
        <input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Nazwa" style={{ ...S.input, flex: 2, minWidth: 100 }} />
        <input value={pQty} onChange={(e) => setPQty(e.target.value)} type="number" placeholder="Ilość" style={{ ...S.input, flex: 1, minWidth: 60 }} />
        <input value={pUnit} onChange={(e) => setPUnit(e.target.value)} type="number" placeholder="Cena" style={{ ...S.input, flex: 1, minWidth: 70 }} />
        <input value={pCost} onChange={(e) => setPCost(e.target.value)} type="number" placeholder="Koszt wł." style={{ ...S.input, flex: 1, minWidth: 70 }} />
        <button type="submit" style={S.secondaryBtn}><Plus size={13} /></button>
      </form>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {products.length === 0 && <EmptyNote text="Brak produktów." />}
        {products.map((p) => (
          <div key={p.id} style={S.urgentRow}>
            <div style={{ flex: 1, fontSize: 12.5 }}>
              {p.name} · {p.quantity} × {fmtMoney(p.unitPrice)}
            </div>
            <button onClick={() => onDeleteProduct(p.id)} className="iconBtn" style={S.iconBtnStyle}><X size={13} color="#9A9A9A" /></button>
          </div>
        ))}
      </div>

      <div style={S.label}>Dodatkowe koszty</div>
      <form onSubmit={submitCost} style={{ display: "flex", gap: 6, marginTop: 6, marginBottom: 8 }}>
        <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Nazwa kosztu" style={{ ...S.input, flex: 2 }} />
        <input value={cAmount} onChange={(e) => setCAmount(e.target.value)} type="number" placeholder="Kwota" style={{ ...S.input, flex: 1 }} />
        <button type="submit" style={S.secondaryBtn}><Plus size={13} /></button>
      </form>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {costs.length === 0 && <EmptyNote text="Brak dodatkowych kosztów." />}
        {costs.map((c) => (
          <div key={c.id} style={S.urgentRow}>
            <div style={{ flex: 1, fontSize: 12.5 }}>{c.name} · {fmtMoney(c.amount)}</div>
            <button onClick={() => onDeleteCost(c.id)} className="iconBtn" style={S.iconBtnStyle}><X size={13} color="#9A9A9A" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Sekwencyjny proces sprzedaży (odznaczanie krokami po kolei) ---------- */
function SalesProcessCard({ deal, company, onUpdateDeal }) {
  const pipeline = computePipeline(deal, company);
  const [expandedKey, setExpandedKey] = useState(() => {
    const firstOpen = pipeline.stages.find((s) => !s.done);
    return (firstOpen || pipeline.stages[pipeline.stages.length - 1]).key;
  });

  function toggleStep(stepKey) {
    const nextSteps = toggleStepInSteps(deal.pipelineSteps, stepKey);
    onUpdateDeal({ pipelineSteps: nextSteps });
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6B6B6B", fontWeight: 600, marginBottom: 8 }}>
        <span>Proces sprzedaży</span>
        <span style={{ color: "#111111", fontWeight: 700 }}>{pipeline.donePct}%</span>
      </div>
      <div style={{ background: "#F0EFEC", borderRadius: 6, height: 8, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ width: `${pipeline.donePct}%`, background: pipeline.donePct >= 100 ? "#1C8A4B" : "#111111", height: "100%", borderRadius: 6 }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {pipeline.stages.map((stage) => {
          const isOpen = expandedKey === stage.key;
          const doneCount = stage.steps.filter((s) => s.done).length;
          return (
            <div key={stage.key} style={{ border: "1px solid #F0EFEC", borderRadius: 8, overflow: "hidden" }}>
              <button
                type="button"
                onClick={() => setExpandedKey(isOpen ? null : stage.key)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: stage.done ? "#F3FBF6" : "#FAFAF9", border: "none", padding: "9px 12px",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700 }}>
                  {stage.done ? <CheckCircle2 size={14} color="#1C8A4B" /> : <Circle size={14} color="#B7B5B1" />}
                  {stage.label}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#9A9A9A", fontWeight: 600 }}>
                  {doneCount}/{stage.steps.length}
                  <ChevronRight size={13} style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                </span>
              </button>
              {isOpen && (
                <div style={{ padding: "8px 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {stage.steps.map((step) => {
                    const clickable = !stage.auto && (step.unlocked || step.done);
                    return (
                      <button
                        key={step.key}
                        type="button"
                        onClick={() => clickable && toggleStep(step.key)}
                        disabled={!clickable}
                        style={{
                          display: "flex", alignItems: "center", gap: 8, background: "none", border: "none",
                          padding: 0, textAlign: "left",
                          cursor: stage.auto ? "default" : clickable ? "pointer" : "not-allowed",
                          opacity: !stage.auto && !step.unlocked && !step.done ? 0.45 : 1,
                        }}
                      >
                        {step.done ? <CheckCircle2 size={16} color="#1C8A4B" /> : <Circle size={16} color="#B7B5B1" />}
                        <span style={{ fontSize: 12.5, color: step.done ? "#111111" : "#4a4a4a" }}>{step.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
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

/* ---------- Zadania: pełna strona z panelem filtrów ---------- */
function taskCategory(t) {
  if (t.done) return "wykonane";
  if (!t.dueDate) return "inbox";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(t.dueDate);
  due.setHours(0, 0, 0, 0);
  const days = Math.round((due - today) / 86400000);
  if (days < 0) return "spoznione";
  if (days === 0) return "dzis";
  if (days === 1) return "jutro";
  const weekStart = startOfWeek(today);
  const thisWeekEnd = addDays(weekStart, 6);
  const nextWeekStart = addDays(weekStart, 7);
  const nextWeekEnd = addDays(weekStart, 13);
  if (due <= thisWeekEnd) return "tydzien";
  if (due >= nextWeekStart && due <= nextWeekEnd) return "nastepny_tydzien";
  return "kiedys";
}

const TASK_CATEGORIES = [
  { key: "wszystkie", label: "Wszystkie" },
  { key: "inbox", label: "Inbox" },
  { key: "spoznione", label: "Spóźnione" },
  { key: "dzis", label: "Dziś" },
  { key: "jutro", label: "Jutro" },
  { key: "tydzien", label: "Ten tydzień" },
  { key: "nastepny_tydzien", label: "Następny tydzień" },
  { key: "kiedys", label: "Kiedyś" },
  { key: "wykonane", label: "Wykonane" },
];

function TasksBoard({ tasks, onToggleTask, onDeleteTask, onOpenDeal }) {
  const [category, setCategory] = useState("wszystkie");

  const withCategory = useMemo(() => tasks.map((t) => ({ ...t, _cat: taskCategory(t) })), [tasks]);

  const counts = useMemo(() => {
    const map = {};
    TASK_CATEGORIES.forEach((c) => {
      map[c.key] = c.key === "wszystkie"
        ? withCategory.filter((t) => !t.done).length
        : withCategory.filter((t) => t._cat === c.key).length;
    });
    return map;
  }, [withCategory]);

  const visible = useMemo(() => {
    const filtered = category === "wszystkie" ? withCategory.filter((t) => !t.done) : withCategory.filter((t) => t._cat === category);
    return filtered.sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
  }, [withCategory, category]);

  return (
    <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
      <aside style={{ width: 190, flexShrink: 0 }}>
        <SidebarSection title="Zadania">
          {TASK_CATEGORIES.map((c) => (
            <SidebarItem key={c.key} label={c.label} count={counts[c.key]} active={category === c.key} onClick={() => setCategory(c.key)} />
          ))}
          <SidebarItem label="Usunięte" disabled />
        </SidebarSection>
      </aside>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.card}>
          <h3 style={S.cardTitle}>{TASK_CATEGORIES.find((c) => c.key === category)?.label || "Zadania"}</h3>
          {visible.length === 0 && <EmptyNote text="Brak zadań w tej kategorii." />}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
            {visible.map((t) => {
              const Icon = TASK_TYPES[t.type]?.icon || Bell;
              return (
                <div key={t.id} className="hoverRow" style={{ ...S.urgentRow, opacity: t.done ? 0.5 : 1 }}>
                  <button onClick={() => onToggleTask(t)} style={{ background: "none", border: "none", display: "flex" }}>
                    {t.done ? <CheckCircle2 size={17} color="#1C8A4B" /> : <Circle size={17} color="#B7B5B1" />}
                  </button>
                  <Icon size={14} color="#6B6B6B" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, textDecoration: t.done ? "line-through" : "none" }}>{t.title}</div>
                    <button
                      onClick={() => t.dealId && onOpenDeal(t.dealId)}
                      disabled={!t.dealId}
                      style={{ background: "none", border: "none", padding: 0, fontSize: 11.5, color: t.dealId ? "#E4241B" : "#9A9A9A", fontWeight: 600, textAlign: "left" }}
                    >
                      {t.dealName ? `Proces sprzedaży pojazdu — ${t.companyName} · ${t.dealName}` : t.companyName}
                    </button>
                    <div style={{ fontSize: 10.5, color: "#9A9A9A", marginTop: 2 }}>Dla: {t.ownerName}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: t.days !== null && t.days <= 0 && !t.done ? "#E4241B" : "#9A9A9A", whiteSpace: "nowrap" }}>
                    {fmtDate(t.dueDate)}
                  </span>
                  <button onClick={() => onDeleteTask(t.id)} className="iconBtn" style={S.iconBtnStyle}><X size={14} color="#9A9A9A" /></button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Statystyki ---------- */
function StatystykiView({ deals, companiesById, products }) {
  const [subTab, setSubTab] = useState("etap");
  const openDeals = deals.filter((d) => d.status === "otwarta");
  const totalOpenValue = openDeals.reduce((s, d) => s + (Number(d.budget) || 0), 0);

  const stageCounts = useMemo(() => {
    return PIPELINE_STAGES.map((stage) => {
      const count = openDeals.filter((d) => {
        const pipeline = computePipeline(d, companiesById[d.companyId]);
        return pipeline.currentStage.key === stage.key;
      }).length;
      return { key: stage.key, label: stage.label, count };
    });
  }, [openDeals, companiesById]);

  const maxCount = Math.max(1, ...stageCounts.map((s) => s.count));

  const SUB_TABS = [
    { key: "etap", label: "Etap" },
    { key: "produkt", label: "Produkt" },
    { key: "opiekun", label: "Opiekun" },
    { key: "zrodlo", label: "Źródło" },
  ];

  return (
    <div style={S.stack}>
      <div style={S.statRow}>
        <StatCard label="Otwarte szanse sprzedaży" value={openDeals.length} />
        <StatCard label="Produkty w szansach" value={products.length} />
        <StatCard label="Wartość otwartych szans" value={fmtMoney(totalOpenValue)} />
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            style={{
              background: subTab === t.key ? "#111111" : "#F0EFEC", color: subTab === t.key ? "#fff" : "#111111",
              border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 600,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "etap" ? (
        <section style={S.card}>
          <h3 style={S.cardTitle}>Otwarte szanse sprzedaży wg etapu procesu</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
            {stageCounts.map((s) => (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 160, fontSize: 12.5, color: "#6B6B6B", fontWeight: 600 }}>{s.label}</div>
                <div style={{ flex: 1, background: "#F0EFEC", borderRadius: 6, height: 22, overflow: "hidden" }}>
                  <div style={{ width: `${(s.count / maxCount) * 100}%`, background: "#E4241B", height: "100%", borderRadius: 6 }} />
                </div>
                <div style={{ width: 28, fontSize: 13, fontWeight: 700, textAlign: "right" }}>{s.count}</div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section style={{ ...S.card, textAlign: "center", padding: 40 }}>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 16, marginBottom: 6 }}>Wkrótce</div>
          <div style={{ fontSize: 13, color: "#9A9A9A" }}>
            Podział wg {SUB_TABS.find((t) => t.key === subTab)?.label.toLowerCase()} pojawi się w kolejnej aktualizacji.
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------- Kalendarz: widok miesiąca ---------- */
const MONTH_LABELS = [
  "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
];
const CALENDAR_VIEW_MODES = [
  { key: "rok", label: "Rok" },
  { key: "miesiac", label: "Miesiąc" },
  { key: "tydzien", label: "Tydzień" },
  { key: "5dni", label: "5 dni" },
  { key: "dzien", label: "Dzień" },
];

function CalendarView({ tasks, onOpenDeal }) {
  const [anchor, setAnchor] = useState(() => new Date());
  const [viewMode, setViewMode] = useState("miesiac");

  const weeks = useMemo(() => monthMatrix(anchor), [anchor]);
  const today = new Date();

  function go(deltaMonths) {
    setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + deltaMonths, 1));
  }

  const tasksByDay = useMemo(() => {
    const withDate = tasks.filter((t) => t.dueDate);
    return (day) => withDate.filter((t) => isSameDay(t.dueDate, day));
  }, [tasks]);

  return (
    <div style={S.stack}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => go(-1)} style={S.iconBtnStyle} className="iconBtn"><ChevronLeft size={18} /></button>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, fontWeight: 600, minWidth: 160, textAlign: "center" }}>
            {MONTH_LABELS[anchor.getMonth()]} {anchor.getFullYear()}
          </div>
          <button onClick={() => go(1)} style={S.iconBtnStyle} className="iconBtn"><ChevronRight size={18} /></button>
          <button onClick={() => setAnchor(new Date())} style={S.secondaryBtn}>Dziś</button>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {CALENDAR_VIEW_MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setViewMode(m.key)}
              title={m.key !== "miesiac" ? "Ten widok pojawi się w kolejnej aktualizacji" : undefined}
              style={{
                background: viewMode === m.key ? "#111111" : "#F0EFEC", color: viewMode === m.key ? "#fff" : "#111111",
                border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 600,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {viewMode !== "miesiac" ? (
        <section style={{ ...S.card, textAlign: "center", padding: 40 }}>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 16, marginBottom: 6 }}>Wkrótce</div>
          <div style={{ fontSize: 13, color: "#9A9A9A" }}>
            Widok „{CALENDAR_VIEW_MODES.find((m) => m.key === viewMode)?.label}” pojawi się w kolejnej aktualizacji — na razie dostępny jest widok Miesiąc.
          </div>
        </section>
      ) : (
        <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid #E7E5E2" }}>
            {weekdayLabels().map((d) => (
              <div key={d} style={{ padding: "10px 8px", fontSize: 11, fontWeight: 700, color: "#9A9A9A", textAlign: "center", textTransform: "uppercase" }}>{d}</div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: wi < weeks.length - 1 ? "1px solid #F0EFEC" : "none" }}>
              {week.map((day, di) => {
                const inMonth = day.getMonth() === anchor.getMonth();
                const isToday = isSameDay(day, today);
                const dayTasks = tasksByDay(day);
                return (
                  <div key={di} style={{
                    minHeight: 96, padding: 6, borderRight: di < 6 ? "1px solid #F0EFEC" : "none",
                    background: inMonth ? "#fff" : "#FAFAF9", opacity: inMonth ? 1 : 0.55,
                  }}>
                    <div style={{
                      fontSize: 11.5, fontWeight: 700, marginBottom: 4, width: 20, height: 20, display: "flex",
                      alignItems: "center", justifyContent: "center", borderRadius: "50%",
                      background: isToday ? "#E4241B" : "transparent", color: isToday ? "#fff" : "#111111",
                    }}>
                      {day.getDate()}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {dayTasks.slice(0, 3).map((t) => {
                        const Icon = TASK_TYPES[t.type]?.icon || Bell;
                        return (
                          <button
                            key={t.id}
                            onClick={() => t.dealId && onOpenDeal(t.dealId)}
                            style={{
                              display: "flex", alignItems: "center", gap: 4, background: t.done ? "#F0EFEC" : "#FCEBEA",
                              border: "none", borderRadius: 5, padding: "2px 5px", fontSize: 10, fontWeight: 600,
                              textDecoration: t.done ? "line-through" : "none", textAlign: "left", width: "100%",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}
                            title={t.title}
                          >
                            <Icon size={9} style={{ flexShrink: 0 }} /> {t.title}
                          </button>
                        );
                      })}
                      {dayTasks.length > 3 && (
                        <div style={{ fontSize: 9.5, color: "#9A9A9A", fontWeight: 700 }}>+{dayTasks.length - 3} więcej</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Company form modal (z wyszukiwaniem NIP) ---------- */
function CompanyFormModal({ initial, staff = [], canReassign = false, currentUserId, onClose, onSave }) {
  const [form, setForm] = useState(() => initial || {
    id: null, name: "", phone: "", email: "", address: "", nip: "",
    notes: "", contactPerson: "", source: "", tags: [], pinnedNote: "", ownerId: currentUserId,
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
            {initial ? "Edytuj firmę" : "Nowa firma"}
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
            <button type="submit" disabled={saving} style={S.primaryBtn}>{saving ? "Zapisywanie…" : "Zapisz firmę"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------- Deal form modal (szansa sprzedaży) ---------- */
function DealFormModal({ initial, companyId, currentUserId, onClose, onSave }) {
  const [form, setForm] = useState(() => initial || {
    id: null, companyId, name: "", carInterest: "", budget: "", financing: FINANCING[0],
    decisionDate: "", status: "otwarta", purchaseType: "", visibility: "Publiczna", notes: "",
    ownerId: currentUserId,
  });
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave({ ...form, companyId: form.companyId || companyId });
    setSaving(false);
  }

  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 20, fontWeight: 600 }}>
            {initial ? "Edytuj szansę sprzedaży" : "Nowa szansa sprzedaży"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none" }}><X size={18} /></button>
        </div>
        <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Nazwa szansy sprzedaży *" value={form.name} onChange={(v) => set("name", v)} required />
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
              {DEAL_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Rodzaj zakupu</label>
            <select value={form.purchaseType} onChange={(e) => set("purchaseType", e.target.value)} style={S.input}>
              <option value="">— wybierz —</option>
              {PURCHASE_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Widoczność</label>
            <select value={form.visibility} onChange={(e) => set("visibility", e.target.value)} style={S.input}>
              {VISIBILITY_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={S.label}>Notatki</label>
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} style={{ ...S.input, resize: "vertical" }} />
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
            <button type="button" onClick={onClose} style={S.secondaryBtn}>Anuluj</button>
            <button type="submit" disabled={saving} style={S.primaryBtn}>{saving ? "Zapisywanie…" : "Zapisz szansę sprzedaży"}</button>
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
              <span style={{ flex: 1.2, fontSize: 13, textAlign: "left" }}>{v.price ? fmtMoney(v.price) : "—"}</span>
              <span style={{ flex: 1.2, fontSize: 13, textAlign: "left" }}>{v.monthlyPayment ? `${fmtMoney(v.monthlyPayment)}/mc` : "—"}</span>
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
/* ---------- Ustawienia: pełny panel w stylu Livespace ---------- */
const SETTINGS_SECTIONS = [
  { key: "profile", label: "Twoje dane" },
  { key: "password", label: "Hasło" },
  { key: "notifications", label: "Powiadomienia" },
  { key: "email", label: "Konta e-mail" },
  { key: "import", label: "Import" },
  { key: "templates", label: "Kalendarz i zadania" },
  { key: "files", label: "Pliki" },
  { key: "regional", label: "Ustawienia regionalne" },
];

function SettingsPanel({
  user, profile, goals, onUpdateGoals, regionalSettings, notificationSettings, onUpdateUserSettings,
  taskTemplates, templateItems, onSaveTemplate, onRemoveTemplate, importHistory, onImportDone, companies,
}) {
  const [section, setSection] = useState("profile");
  const isAdmin = profile.role === "admin";

  return (
    <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
      <aside style={{ width: 190, flexShrink: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {SETTINGS_SECTIONS.map((s) => (
            <SidebarItem key={s.key} label={s.label} active={section === s.key} onClick={() => setSection(s.key)} />
          ))}
          {isAdmin && <SidebarItem label="Cele i zespół" active={section === "team"} onClick={() => setSection("team")} />}
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0 }}>
        {section === "profile" && <ProfileSettingsPanel user={user} profile={profile} />}
        {section === "password" && <PasswordSettingsPanel user={user} />}
        {section === "notifications" && (
          <NotificationsSettingsPanel notificationSettings={notificationSettings} onUpdateUserSettings={onUpdateUserSettings} />
        )}
        {section === "email" && <EmailAccountsPlaceholderPanel />}
        {section === "import" && (
          <ImportSettingsPanel currentUserId={user.id} importHistory={importHistory} onImportDone={onImportDone} companies={companies} />
        )}
        {section === "templates" && (
          <TaskTemplatesSettingsPanel
            taskTemplates={taskTemplates}
            templateItems={templateItems}
            onSaveTemplate={onSaveTemplate}
            onRemoveTemplate={onRemoveTemplate}
          />
        )}
        {section === "files" && <FilesPlaceholderPanel />}
        {section === "regional" && (
          <RegionalSettingsPanel regionalSettings={regionalSettings} onUpdateUserSettings={onUpdateUserSettings} />
        )}
        {section === "team" && isAdmin && <TeamGoalsSettingsPanel user={user} goals={goals} onUpdateGoals={onUpdateGoals} />}
      </div>
    </div>
  );
}

/* ---------- Twoje dane ---------- */
function ProfileSettingsPanel({ user, profile }) {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (!cancelled) {
        setForm(profileSettingsFromDb(data || { id: user.id, email: profile.email, full_name: profile.name }));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user.id]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const fullName = `${form.firstName} ${form.lastName}`.trim();
    const { error } = await supabase.from("profiles").update({
      first_name: form.firstName || null, last_name: form.lastName || null, full_name: fullName || null,
      phone: form.phone || null, position: form.position || null, avatar_url: form.avatarUrl || null,
    }).eq("id", user.id);
    setSaving(false);
    setMsg(error ? "Nie udało się zapisać danych: " + error.message : "Zapisano.");
  }

  if (loading || !form) {
    return <div style={S.card}><div style={{ fontSize: 13, color: "#9A9A9A" }}>Wczytywanie…</div></div>;
  }

  return (
    <div style={S.stack}>
      <div style={S.card}>
        <div style={S.cardTitle}>Zdjęcie</div>
        <div style={{ fontSize: 12.5, color: "#9A9A9A", marginTop: 4, marginBottom: 16 }}>
          Dodaj link do swojego zdjęcia, aby ułatwić rozpoznanie Cię w zespole.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {form.avatarUrl ? (
            <img src={form.avatarUrl} alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <CompanyAvatar name={`${form.firstName} ${form.lastName}`.trim() || "?"} size={64} />
          )}
          <div style={{ flex: 1, display: "flex", gap: 8 }}>
            <input
              value={form.avatarUrl}
              onChange={(e) => setForm((f) => ({ ...f, avatarUrl: e.target.value }))}
              placeholder="Link do zdjęcia (URL)"
              style={{ ...S.input, flex: 1 }}
            />
            <button type="button" onClick={() => setForm((f) => ({ ...f, avatarUrl: "" }))} style={S.secondaryBtn}>Usuń</button>
          </div>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>Informacje o Tobie</div>
        <form onSubmit={save} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
          <Field label="Imię" value={form.firstName} onChange={(v) => setForm((f) => ({ ...f, firstName: v }))} />
          <Field label="Nazwisko" value={form.lastName} onChange={(v) => setForm((f) => ({ ...f, lastName: v }))} />
          <div>
            <label style={S.label}>Login / e-mail</label>
            <input value={form.email || user.email || ""} disabled style={{ ...S.input, background: "#F3F3F1", color: "#9A9A9A" }} />
          </div>
          <Field label="Telefon" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
          <Field label="Stanowisko" value={form.position} onChange={(v) => setForm((f) => ({ ...f, position: v }))} />
          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
            {msg && <span style={{ fontSize: 12, color: msg.startsWith("Nie") ? "#E4241B" : "#1C8A4B" }}>{msg}</span>}
            <button type="submit" disabled={saving} style={S.primaryBtn}>{saving ? "Zapisywanie…" : "Zapisz"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------- Hasło ---------- */
function PasswordSettingsPanel({ user }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    if (next.length < 8 || !/[a-z]/.test(next) || !/[A-Z]/.test(next) || !/[0-9]/.test(next) || !/[^A-Za-z0-9]/.test(next)) {
      setMsg("Nowe hasło powinno mieć min. 8 znaków, małą i wielką literę, cyfrę oraz znak specjalny.");
      return;
    }
    if (next !== repeat) {
      setMsg("Nowe hasła nie są identyczne.");
      return;
    }
    setSaving(true);
    try {
      if (user.email && current) {
        const { error: reauthError } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
        if (reauthError) throw new Error("Aktualne hasło jest nieprawidłowe.");
      }
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw error;
      setMsg("Hasło zostało zmienione.");
      setCurrent(""); setNext(""); setRepeat("");
    } catch (e) {
      setMsg(e.message || "Nie udało się zmienić hasła.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={S.card}>
      <div style={S.cardTitle}>Hasło</div>
      <div style={{ fontSize: 12.5, color: "#9A9A9A", marginTop: 4, marginBottom: 16, lineHeight: 1.5 }}>
        Hasło zabezpiecza dostęp do Twojego konta i danych w CRM. Powinno składać się z przynajmniej ośmiu
        znaków, w tym małej i wielkiej litery, cyfry oraz znaku specjalnego.
      </div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 360 }}>
        <Field label="Aktualne hasło" value={current} onChange={setCurrent} type="password" />
        <Field label="Nowe hasło" value={next} onChange={setNext} type="password" />
        <Field label="Powtórz nowe hasło" value={repeat} onChange={setRepeat} type="password" />
        {msg && <div style={{ fontSize: 12, color: msg.includes("zmienione") ? "#1C8A4B" : "#E4241B" }}>{msg}</div>}
        <button type="submit" disabled={saving} style={{ ...S.primaryBtn, alignSelf: "flex-start" }}>{saving ? "Zmienianie…" : "Zmień hasło"}</button>
      </form>
    </div>
  );
}

/* ---------- Powiadomienia (tylko preferencje) ---------- */
const NOTIFICATION_TOGGLES = [
  { key: "emailDigest", label: "Chcę otrzymywać również mailowe powiadomienia" },
  { key: "dailyActivityReport", label: "Chcę otrzymywać mailowe raporty aktywności (wysyłane codziennie rano)" },
  { key: "inAppPopups", label: "Pokazuj wyskakujące powiadomienia w aplikacji" },
];
const NOTIFICATION_EVENT_TOGGLES = [
  { key: "importFinished", label: "Zostanie zakończony import kontaktów" },
  { key: "contactNeedsData", label: "Zostanie dodany kontakt wymagający uzupełnienia danych" },
  { key: "dealStatusChanged", label: "Szansa sprzedaży, której jestem uczestnikiem, zmieni status" },
  { key: "dealAutoClosed", label: "Szansa sprzedaży, której jestem opiekunem, zostanie automatycznie zamknięta" },
  { key: "dealPastDeadline", label: "Szansa sprzedaży, której jestem opiekunem, przekroczy datę finalizacji" },
  { key: "dealDueSoon", label: "W szansie sprzedaży, której jestem opiekunem, pozostanie 7 dni do daty finalizacji" },
  { key: "becameOwner", label: "Zostanę opiekunem nowych kontaktów lub szans sprzedaży" },
  { key: "taskDateChanged", label: "Zostanie zmieniony termin zadania, którego jestem uczestnikiem" },
];

function Toggle({ checked, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} style={{
      width: 38, height: 21, borderRadius: 11, border: "none", position: "relative",
      background: checked ? "#111111" : "#E7E5E2", transition: "background .15s", flexShrink: 0, padding: 0,
    }}>
      <span style={{
        position: "absolute", top: 2, left: checked ? 19 : 2, width: 17, height: 17, borderRadius: "50%",
        background: "#fff", transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
      }} />
    </button>
  );
}

function NotificationsSettingsPanel({ notificationSettings, onUpdateUserSettings }) {
  const [prefs, setPrefs] = useState(notificationSettings);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setPrefs(notificationSettings); }, [notificationSettings]);

  function toggle(key) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  }

  async function save() {
    setSaving(true);
    await onUpdateUserSettings({ notifications: prefs });
    setSaving(false);
  }

  return (
    <div style={S.card}>
      <div style={S.cardTitle}>Powiadomienia</div>
      <div style={{ background: "#FFF7E0", border: "1px solid #F0E0A8", borderRadius: 8, padding: "10px 12px", fontSize: 12.5, marginTop: 12, marginBottom: 16, lineHeight: 1.5 }}>
        Poniższe przełączniki zapisują Twoje preferencje w bazie danych. CRM nie wysyła jeszcze faktycznych
        e-maili ani powiadomień push — to wymaga podłączenia serwera pocztowego i pojawi się w kolejnej aktualizacji.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {NOTIFICATION_TOGGLES.map((t) => (
          <label key={t.key} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
            <Toggle checked={!!prefs[t.key]} onChange={() => toggle(t.key)} /> {t.label}
          </label>
        ))}
      </div>
      <div style={{ ...S.label, marginTop: 20, marginBottom: 8 }}>Wysyłaj powiadomienia gdy:</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {NOTIFICATION_EVENT_TOGGLES.map((t) => (
          <label key={t.key} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
            <Toggle checked={!!prefs[t.key]} onChange={() => toggle(t.key)} /> {t.label}
          </label>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
        <button onClick={save} disabled={saving} style={S.primaryBtn}>{saving ? "Zapisywanie…" : "Zapisz"}</button>
      </div>
    </div>
  );
}

/* ---------- Konta e-mail (makieta — wymaga integracji zewnętrznych) ---------- */
function EmailAccountsPlaceholderPanel() {
  return (
    <div style={S.card}>
      <div style={S.cardTitle}>Konta e-mail</div>
      <div style={{ fontSize: 13, color: "#4a4a4a", marginTop: 12, marginBottom: 16, lineHeight: 1.6 }}>
        Skonfiguruj konta pocztowe, aby mieć bezpośredni wgląd do komunikacji prowadzonej z klientami z poziomu CRM.
      </div>
      <div style={{ background: "#F3F3F1", border: "1px solid #E7E5E2", borderRadius: 8, padding: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button disabled style={{ ...S.secondaryBtn, opacity: 0.5, cursor: "not-allowed" }}>Dodaj konto IMAP</button>
        <button disabled style={{ ...S.secondaryBtn, opacity: 0.5, cursor: "not-allowed" }}>Zaloguj przez Google</button>
        <button disabled style={{ ...S.secondaryBtn, opacity: 0.5, cursor: "not-allowed" }}>Zaloguj przez Microsoft</button>
      </div>
      <div style={{ fontSize: 12, color: "#9A9A9A", marginTop: 12, lineHeight: 1.5 }}>
        Wkrótce — połączenie ze skrzynką pocztową wymaga zarejestrowanych aplikacji OAuth Google/Microsoft
        oraz osobnego serwera obsługującego pocztę, których nie da się tu podłączyć bez Twoich danych dostępowych do tych usług.
      </div>
    </div>
  );
}

/* ---------- Pliki (makieta — wymaga silnika szablonów dokumentów) ---------- */
function FilesPlaceholderPanel() {
  return (
    <div style={S.card}>
      <div style={S.cardTitle}>Szablony plików</div>
      <div style={{ fontSize: 13, color: "#4a4a4a", marginTop: 12, marginBottom: 16, lineHeight: 1.6 }}>
        Szablony plików pozwalają na automatyczne tworzenie dokumentów (np. ofert czy zamówień) wypełnionych
        danymi firmy i szansy sprzedaży.
      </div>
      <div style={{ fontSize: 12, color: "#9A9A9A", lineHeight: 1.5 }}>
        Wkrótce — automatyczne wypełnianie dokumentów danymi wymaga osobnego silnika generowania plików,
        którego nie da się tu podłączyć bez dodatkowej infrastruktury. Na razie ta zakładka jest pusta.
      </div>
    </div>
  );
}

/* ---------- Import kontaktów (CSV/XLS -> firmy) ---------- */
function randomId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === "," || c === ";") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (c === "\r") {
      // pomiń
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => (cell || "").trim() !== ""));
}

const IMPORT_FIELD_ALIASES = {
  name: ["nazwa", "imię i nazwisko", "firma", "name", "klient"],
  phone: ["telefon", "phone", "tel"],
  email: ["e-mail", "email", "mail"],
  address: ["adres", "address"],
  nip: ["nip"],
  contactPerson: ["osoba kontaktowa", "kontakt", "contact"],
  source: ["źródło", "zrodlo", "source"],
  tags: ["tagi", "tags", "grupy"],
};
const IMPORT_FIELD_LABELS = [
  ["name", "Nazwa *"], ["phone", "Telefon"], ["email", "E-mail"], ["address", "Adres"],
  ["nip", "NIP"], ["contactPerson", "Osoba kontaktowa"], ["source", "Źródło"], ["tags", "Tagi (rozdzielone ;)"],
];

function guessImportMapping(headers) {
  const norm = (s) => (s || "").toString().trim().toLowerCase();
  const mapping = {};
  Object.entries(IMPORT_FIELD_ALIASES).forEach(([field, aliases]) => {
    mapping[field] = headers.findIndex((h) => aliases.includes(norm(h)));
  });
  return mapping;
}

function ImportSettingsPanel({ currentUserId, importHistory, onImportDone }) {
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [filename, setFilename] = useState("");
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState(null);

  function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setFilename(file.name);
    setMsg(null);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCSV(String(reader.result || ""));
      if (parsed.length < 2) {
        setMsg("Plik nie zawiera danych do zaimportowania.");
        return;
      }
      const [head, ...body] = parsed;
      setHeaders(head);
      setRows(body);
      setMapping(guessImportMapping(head));
    };
    reader.readAsText(file, "UTF-8");
  }

  async function runImport() {
    if (mapping.name === undefined || mapping.name < 0) {
      setMsg("Wskaż kolumnę z nazwą firmy / klienta.");
      return;
    }
    setImporting(true);
    setMsg(null);
    const batchId = randomId();
    const toInsert = rows
      .filter((r) => (r[mapping.name] || "").trim())
      .map((r) => ({
        name: (r[mapping.name] || "").trim(),
        phone: mapping.phone >= 0 ? (r[mapping.phone] || "").trim() || null : null,
        email: mapping.email >= 0 ? (r[mapping.email] || "").trim() || null : null,
        address: mapping.address >= 0 ? (r[mapping.address] || "").trim() || null : null,
        nip: mapping.nip >= 0 ? (r[mapping.nip] || "").trim() || null : null,
        contact_person: mapping.contactPerson >= 0 ? (r[mapping.contactPerson] || "").trim() || null : null,
        source: mapping.source >= 0 ? (r[mapping.source] || "").trim() || null : null,
        tags: mapping.tags >= 0 && r[mapping.tags] ? r[mapping.tags].split(";").map((t) => t.trim()).filter(Boolean) : null,
        owner_id: currentUserId,
        import_batch_id: batchId,
      }));
    try {
      if (toInsert.length === 0) throw new Error("Brak wierszy do zaimportowania.");
      const { error } = await supabase.from("companies").insert(toInsert);
      if (error) throw error;
      const { error: histError } = await supabase.from("import_history").insert({
        id: batchId, owner_id: currentUserId, filename, row_count: toInsert.length, status: "ok",
      });
      if (histError) throw histError;
      setMsg(`Zaimportowano ${toInsert.length} firm.`);
      setHeaders([]); setRows([]); setFilename("");
      onImportDone();
    } catch (e) {
      setMsg("Błąd importu: " + (e.message || ""));
    } finally {
      setImporting(false);
    }
  }

  async function undo(historyId) {
    if (!window.confirm("Cofnąć ten import? Usunie to wszystkie firmy dodane w tej paczce.")) return;
    await supabase.from("companies").delete().eq("import_batch_id", historyId);
    await supabase.from("import_history").update({ status: "wycofano" }).eq("id", historyId);
    onImportDone();
  }

  return (
    <div style={S.stack}>
      <div style={S.card}>
        <div style={S.cardTitle}>Import kontaktów</div>
        <div style={{ fontSize: 12.5, color: "#9A9A9A", marginTop: 4, marginBottom: 16, lineHeight: 1.5 }}>
          Zaimportuj bazę firm / kontaktów z pliku CSV (np. wyeksportowanego z Excela). Pierwszy wiersz pliku
          powinien zawierać nagłówki kolumn.
        </div>
        <input type="file" accept=".csv,text/csv" onChange={handleFile} style={{ fontSize: 13 }} />

        {headers.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ ...S.label, marginBottom: 8 }}>Dopasuj kolumny</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
              {IMPORT_FIELD_LABELS.map(([field, label]) => (
                <div key={field}>
                  <label style={S.label}>{label}</label>
                  <select
                    value={mapping[field] !== undefined ? mapping[field] : -1}
                    onChange={(e) => setMapping((m) => ({ ...m, [field]: Number(e.target.value) }))}
                    style={S.select}
                  >
                    <option value={-1}>— pomiń —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 14, ...S.label }}>Podgląd (pierwsze 5 wierszy z {rows.length})</div>
            <div style={{ overflowX: "auto", marginTop: 6 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>{headers.map((h, i) => <th key={i} style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #E7E5E2", color: "#9A9A9A" }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, ri) => (
                    <tr key={ri}>{r.map((c, ci) => <td key={ci} style={{ padding: "4px 8px", borderBottom: "1px solid #F0EFEC" }}>{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <button onClick={runImport} disabled={importing} style={S.primaryBtn}>
                {importing ? "Importowanie…" : `Zaimportuj ${rows.length} wierszy`}
              </button>
            </div>
          </div>
        )}
        {msg && <div style={{ fontSize: 12.5, color: msg.startsWith("Błąd") ? "#E4241B" : "#1C8A4B", marginTop: 12 }}>{msg}</div>}
      </div>

      <div style={S.card}>
        <div style={S.cardTitle}>Historia importu</div>
        {importHistory.length === 0 ? (
          <EmptyNote text="Nie zaimportowałeś jeszcze żadnych danych." />
        ) : (
          <div style={{ marginTop: 12 }}>
            <div style={S.tableHeader}>
              <span style={{ flex: 2 }}>Plik</span>
              <span style={{ flex: 1 }}>Wierszy</span>
              <span style={{ flex: 1.4 }}>Data</span>
              <span style={{ flex: 1 }}>Status</span>
              <span style={{ flex: 1 }}></span>
            </div>
            {importHistory.map((h) => (
              <div key={h.id} style={S.tableRow}>
                <span style={{ flex: 2, textAlign: "left" }}>{h.filename || "—"}</span>
                <span style={{ flex: 1, textAlign: "left" }}>{h.rowCount}</span>
                <span style={{ flex: 1.4, textAlign: "left" }}>{fmtDateTime(h.createdAt)}</span>
                <span style={{ flex: 1, textAlign: "left" }}>{h.status === "wycofano" ? "Wycofano" : "Zaimportowano"}</span>
                <span style={{ flex: 1, textAlign: "left" }}>
                  {h.status !== "wycofano" && (
                    <button onClick={() => undo(h.id)} style={{ ...S.secondaryBtn, padding: "5px 10px", fontSize: 11.5 }}>Wycofaj</button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Szablony zadań (Kalendarz i zadania) ---------- */
function TaskTemplatesSettingsPanel({ taskTemplates, templateItems, onSaveTemplate, onRemoveTemplate }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  return (
    <div style={S.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={S.cardTitle}>Szablony zadań</div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} style={S.primaryBtn}><Plus size={14} /> Dodaj szablon</button>
      </div>
      <div style={{ fontSize: 12.5, color: "#9A9A9A", marginTop: 4, marginBottom: 16, lineHeight: 1.5 }}>
        Gotowe zestawy zadań (np. „Działania posprzedażowe"), które jednym kliknięciem dodasz do dowolnej
        szansy sprzedaży — z karty „Zadania" w widoku szansy.
      </div>
      {taskTemplates.length === 0 ? (
        <EmptyNote text="Brak zapisanych szablonów zadań." />
      ) : (
        <div>
          <div style={S.tableHeader}>
            <span style={{ flex: 2 }}>Nazwa szablonu</span>
            <span style={{ flex: 1 }}>Liczba zadań</span>
            <span style={{ flex: 1 }}>Akcje</span>
          </div>
          {taskTemplates.map((t) => {
            const items = templateItems.filter((it) => it.templateId === t.id);
            return (
              <div key={t.id} style={S.tableRow}>
                <span style={{ flex: 2, textAlign: "left", fontWeight: 700 }}>{t.name}</span>
                <span style={{ flex: 1, textAlign: "left" }}>{items.length}</span>
                <span style={{ flex: 1, display: "flex", gap: 6 }}>
                  <button className="iconBtn" onClick={() => { setEditing({ ...t, items }); setShowForm(true); }} style={S.iconBtnStyle}><Edit2 size={14} /></button>
                  <button onClick={() => { if (window.confirm("Usunąć ten szablon?")) onRemoveTemplate(t.id); }} style={S.dangerBtn}><Trash2 size={14} /></button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <TemplateFormModal
          initial={editing}
          onClose={() => setShowForm(false)}
          onSave={async (draft) => { await onSaveTemplate(draft); setShowForm(false); }}
        />
      )}
    </div>
  );
}

function TemplateFormModal({ initial, onClose, onSave }) {
  const [name, setName] = useState(initial ? initial.name : "");
  const [items, setItems] = useState(initial ? initial.items.map((it) => ({ type: it.type, title: it.title, offsetDays: it.offsetDays })) : []);
  const [saving, setSaving] = useState(false);

  function addItem() {
    setItems((prev) => [...prev, { type: "call", title: "", offsetDays: 0 }]);
  }
  function updateItem(idx, patch) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || items.length === 0) return;
    setSaving(true);
    await onSave({ id: initial ? initial.id : null, name: name.trim(), items });
    setSaving(false);
  }

  return (
    <div style={S.modalOverlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 20, fontWeight: 600 }}>
            {initial ? "Edytuj szablon" : "Nowy szablon zadań"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none" }}><X size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <Field label="Nazwa szablonu *" value={name} onChange={setName} required />
          <div style={{ ...S.label, marginTop: 16, marginBottom: 8 }}>Zadania w szablonie</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((it, idx) => (
              <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <select value={it.type} onChange={(e) => updateItem(idx, { type: e.target.value })} style={{ ...S.select, width: 130 }}>
                  {Object.entries(TASK_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <input value={it.title} onChange={(e) => updateItem(idx, { title: e.target.value })} placeholder="Treść zadania" style={{ ...S.input, flex: 1 }} />
                <input
                  type="number"
                  value={it.offsetDays}
                  onChange={(e) => updateItem(idx, { offsetDays: e.target.value })}
                  title="Ile dni od zastosowania szablonu"
                  style={{ ...S.input, width: 70 }}
                />
                <span style={{ fontSize: 11, color: "#9A9A9A", whiteSpace: "nowrap" }}>dni</span>
                <button type="button" onClick={() => removeItem(idx)} className="iconBtn" style={S.iconBtnStyle}><X size={14} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addItem} style={{ ...S.secondaryBtn, marginTop: 10 }}><Plus size={13} /> Dodaj zadanie do szablonu</button>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
            <button type="button" onClick={onClose} style={S.secondaryBtn}>Anuluj</button>
            <button type="submit" disabled={saving || items.length === 0} style={S.primaryBtn}>{saving ? "Zapisywanie…" : "Zapisz szablon"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------- Ustawienia regionalne ---------- */
const DATE_FORMAT_OPTIONS = [
  { value: "Y-m-d", label: "Y-m-d (2026-07-29)" },
  { value: "d.m.Y", label: "d.m.Y (29.07.2026)" },
  { value: "d/m/Y", label: "d/m/Y (29/07/2026)" },
  { value: "m/d/Y", label: "m/d/Y (07/29/2026)" },
];
const TIME_FORMAT_OPTIONS = [
  { value: "H:i", label: "H:i (14:05, 24h)" },
  { value: "h:i A", label: "h:i A (2:05 PM, 12h)" },
];
const TIMEZONE_OPTIONS = ["Europe/Warsaw", "Europe/London", "UTC"];

function RegionalSettingsPanel({ regionalSettings, onUpdateUserSettings }) {
  const [form, setForm] = useState(regionalSettings);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setForm(regionalSettings); }, [regionalSettings]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    await onUpdateUserSettings({ regional: form });
    setSaving(false);
  }

  return (
    <div style={S.card}>
      <div style={S.cardTitle}>Ustawienia regionalne</div>
      <div style={{ fontSize: 11.5, color: "#9A9A9A", marginTop: 10, marginBottom: 6, lineHeight: 1.5 }}>
        Strefa czasowa ma charakter informacyjny — CRM nie przelicza dat między strefami, wszystkie terminy
        są zapisywane w czasie lokalnym Twojej przeglądarki. Pozostałe ustawienia od razu zmieniają wygląd
        dat i kwot w całym CRM.
      </div>
      <form onSubmit={save} style={{ marginTop: 12 }}>
        <div style={S.label}>Data i czas</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8, marginBottom: 20 }}>
          <div>
            <label style={S.label}>Strefa czasowa</label>
            <select value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))} style={S.input}>
              {TIMEZONE_OPTIONS.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Pierwszy dzień tygodnia</label>
            <select value={form.firstDayOfWeek} onChange={(e) => setForm((f) => ({ ...f, firstDayOfWeek: e.target.value }))} style={S.input}>
              <option value="monday">poniedziałek</option>
              <option value="sunday">niedziela</option>
            </select>
          </div>
          <div>
            <label style={S.label}>Format daty</label>
            <select value={form.dateFormat} onChange={(e) => setForm((f) => ({ ...f, dateFormat: e.target.value }))} style={S.input}>
              {DATE_FORMAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Format czasu</label>
            <select value={form.timeFormat} onChange={(e) => setForm((f) => ({ ...f, timeFormat: e.target.value }))} style={S.input}>
              {TIME_FORMAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div style={S.label}>Liczby i kwoty</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8, marginBottom: 20 }}>
          <div>
            <label style={S.label}>Symbol dziesiętny</label>
            <select value={form.decimalSymbol} onChange={(e) => setForm((f) => ({ ...f, decimalSymbol: e.target.value }))} style={S.input}>
              <option value=",">, (przecinek)</option>
              <option value=".">. (kropka)</option>
            </select>
          </div>
          <div>
            <label style={S.label}>Separator tysięcy</label>
            <select value={form.thousandsSeparator} onChange={(e) => setForm((f) => ({ ...f, thousandsSeparator: e.target.value }))} style={S.input}>
              <option value=" ">spacja</option>
              <option value=",">przecinek</option>
              <option value=".">kropka</option>
              <option value="">brak</option>
            </select>
          </div>
          <div>
            <label style={S.label}>Dokładność (miejsca po przecinku)</label>
            <select value={form.decimalPlaces} onChange={(e) => setForm((f) => ({ ...f, decimalPlaces: Number(e.target.value) }))} style={S.input}>
              <option value={0}>0</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </div>
          <div>
            <label style={S.label}>Format waluty</label>
            <select value={form.currencyFormat} onChange={(e) => setForm((f) => ({ ...f, currencyFormat: e.target.value }))} style={S.input}>
              <option value="value_symbol">wartość symbol (np. 125 zł)</option>
              <option value="symbol_value">symbol wartość (np. zł 125)</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="submit" disabled={saving} style={S.primaryBtn}>{saving ? "Zapisywanie…" : "Zapisz"}</button>
        </div>
      </form>
    </div>
  );
}

/* ---------- Cele i zespół (admin) ---------- */
function TeamGoalsSettingsPanel({ user, goals, onUpdateGoals }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
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
          Progi widoczne na pulpicie w sekcji „Twoje statystyki".
        </div>
        <form onSubmit={saveGoals} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
          <div>
            <label style={S.label}>Nowe firmy / kontakty (cel)</label>
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
    borderRadius: 12, overflow: "hidden", border: "1px solid #E7E5E2", maxWidth: 1280, margin: "0 auto",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "14px 24px", background: "#FFFFFF", flexWrap: "wrap", gap: 10,
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
  secondaryBtn: { display: "flex", alignItems: "center", gap: 6, background: "#F0EFEC", border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 12.5, fontWeight: 600, color: "#111111" },
  dangerBtn: { background: "#FCEBEA", border: "none", borderRadius: 8, padding: "9px 11px", color: "#E4241B" },
  backBtn: { background: "none", border: "none", fontSize: 13, fontWeight: 600, color: "#6B6B6B", textAlign: "left", padding: 0 },
  tableHeader: {
    display: "flex", padding: "0 14px 10px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: 0.4, color: "#9A9A9A", borderBottom: "1px solid #E7E5E2",
  },
  tableRow: {
    display: "flex", alignItems: "center", width: "100%", background: "none", border: "none",
    padding: "13px 14px", borderBottom: "1px solid #F0EFEC", textAlign: "left", gap: 10,
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
