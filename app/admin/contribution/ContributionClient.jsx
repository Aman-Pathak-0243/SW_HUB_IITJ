"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

// M6 — the contribution-explorer picker (DL-090). A thin client form: pick a stakeholder
// KIND (member by email / club by lineage / entity) and navigate to the same page with
// query params; the Server Component reads them and renders the contribution. No API
// route — reads are Server-Component GETs (member PII stays server-side).
export default function ContributionClient({ clubs = [], entities = [], initial = {} }) {
  const router = useRouter();
  const [kind, setKind] = useState(initial.kind || "member");
  const [email, setEmail] = useState(initial.email || "");
  const [lineage, setLineage] = useState(initial.lineage || "");
  const [entity, setEntity] = useState(initial.entity || "");

  function submit(e) {
    e.preventDefault();
    const q = new URLSearchParams();
    q.set("kind", kind);
    if (kind === "member" && email.trim()) q.set("email", email.trim());
    if (kind === "club" && lineage) q.set("lineage", lineage);
    if (kind === "entity" && entity) q.set("entity", entity);
    router.push(`/admin/contribution?${q.toString()}`);
  }

  return (
    <form className="adm-form" onSubmit={submit} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 22 }}>
      <label className="adm-field">
        <span>Stakeholder</span>
        <select className="adm-select" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="member">Member (by email)</option>
          <option value="club">Club / council</option>
          <option value="entity">Custom entity</option>
        </select>
      </label>

      {kind === "member" && (
        <label className="adm-field" style={{ flex: "1 1 260px" }}>
          <span>Member email</span>
          <input className="adm-input" type="email" placeholder="2023ume0243@iitjammu.ac.in" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      )}

      {kind === "club" && (
        <label className="adm-field" style={{ flex: "1 1 260px" }}>
          <span>Club / council</span>
          <select className="adm-select" value={lineage} onChange={(e) => setLineage(e.target.value)}>
            <option value="">Select…</option>
            {clubs.map((c) => (
              <option key={c.orgUnitLineageKey} value={c.orgUnitLineageKey}>
                {c.name}{c.typeKey ? ` (${c.typeKey})` : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {kind === "entity" && (
        <label className="adm-field" style={{ flex: "1 1 260px" }}>
          <span>Custom entity</span>
          <select className="adm-select" value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">Select…</option>
            {entities.map((en) => (
              <option key={en.id} value={en.id}>
                {en.name}{en.kind ? ` (${en.kind})` : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      <button type="submit" className="adm-btn">View contribution</button>
    </form>
  );
}
