// Serverless function (deploys automatically on Vercel as /api/nip-lookup)
// Uses Poland's official "Wykaz podatników VAT" (Whitelist) API — free, public, no key required.
export default async function handler(req, res) {
  const nip = (req.query.nip || "").toString().replace(/[^0-9]/g, "");

  if (nip.length !== 10) {
    res.status(400).json({ error: "Nieprawidłowy NIP — musi mieć 10 cyfr." });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    const r = await fetch(`https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${today}`);
    if (!r.ok) {
      res.status(404).json({ error: "Nie znaleziono firmy o podanym NIP." });
      return;
    }
    const data = await r.json();
    const subject = data && data.result && data.result.subject;
    if (!subject) {
      res.status(404).json({ error: "Nie znaleziono firmy o podanym NIP." });
      return;
    }
    res.status(200).json({
      name: subject.name || "",
      address: subject.workingAddress || subject.residenceAddress || "",
    });
  } catch (e) {
    res.status(500).json({ error: "Błąd połączenia z rejestrem Ministerstwa Finansów." });
  }
}
