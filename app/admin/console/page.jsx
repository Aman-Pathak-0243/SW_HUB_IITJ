import Link from "next/link";
import { loadModuleContext } from "../../../lib/admin/server.mjs";
import { hasPerm } from "../../../lib/admin/nav.mjs";
import { getSystemStatus } from "../../../lib/devconsole/status.mjs";
import { getDevConsoleReports } from "../../../lib/devconsole/reports.mjs";
import { listAuditLog, getAuditEntry, AUDIT_ACTIONS } from "../../../lib/devconsole/audit.mjs";
import { listBackups } from "../../../lib/devconsole/backups.mjs";
import { humanBytes } from "../../../lib/admin/view-models.mjs";
import { ModuleDenied, PageHead, SBadge } from "../_components/parts";
import ConsoleClient from "./ConsoleClient";

// Developer Console module (Session 9) — renders the Session-8 readers: system
// status, testing/cost reports, the audit-log viewer (filters + keyset pagination +
// entry drill-down), the backup ledger and recovery actions. Each section is shown
// only if the viewer holds its dedicated permission (dev.console / audit.read /
// backup.*), matching how the readers self-gate.
export const dynamic = "force-dynamic";

export default async function ConsolePage({ searchParams }) {
  const ctx = await loadModuleContext("console");
  if (ctx.state !== "ok") return <ModuleDenied module="Developer Console" />;
  const actor = { userId: ctx.user.id };
  const sp = await searchParams;

  const canStatus = hasPerm(ctx.resolved, "dev.console");
  const canAudit = hasPerm(ctx.resolved, "audit.read");
  const canBackups = hasPerm(ctx.resolved, "backup.create") || hasPerm(ctx.resolved, "backup.restore") || canStatus;

  const [status, reports] = canStatus
    ? await Promise.all([getSystemStatus(actor).catch((e) => ({ error: e.message })), getDevConsoleReports(actor).catch((e) => ({ error: e.message }))])
    : [null, null];

  const auditFilters = { action: sp?.action || undefined, entityType: sp?.entityType || undefined, search: sp?.search || undefined, cursor: sp?.cursor || undefined, take: 25 };
  const audit = canAudit ? await listAuditLog(auditFilters, actor).catch(() => ({ entries: [], hasMore: false })) : null;
  const entry = canAudit && sp?.entry ? await getAuditEntry(sp.entry, actor).catch(() => null) : null;
  const backups = canBackups ? await listBackups({}, actor).catch(() => []) : [];

  return (
    <>
      <PageHead eyebrow="Operations" title="Developer Console" subtitle="System health, audit trail, reports, backups and recovery — over the Session-8 read layer." />

      {canStatus && status && <StatusSection status={status} reports={reports} />}
      {canAudit && audit && <AuditSection audit={audit} entry={entry} filters={sp ?? {}} />}
      {canBackups && <ConsoleClient backups={backups} perms={ctx.perms} canStatus={canStatus} />}
    </>
  );
}

function StatusSection({ status, reports }) {
  const db = status.database ?? {};
  const mig = status.migrations ?? {};
  const media = status.media ?? {};
  return (
    <div className="adm-section">
      <div className="adm-section-head"><h3>System status</h3><span style={{ color: "var(--adm-faint)", fontSize: "0.76rem" }}>checked {status.checkedAt ? new Date(status.checkedAt).toLocaleTimeString() : "—"}</span></div>
      <div className="adm-grid">
        <div className="adm-card">
          <h3>Database</h3>
          <p>{db.ok ? <><SBadge tone="good">{db.state}</SBadge> {db.latencyMs}ms round-trip</> : <SBadge tone="muted">{db.unreachable ? "unreachable" : "error"}</SBadge>}</p>
        </div>
        <div className="adm-card">
          <h3>Migrations</h3>
          <p>{mig.error ? <SBadge tone="muted">error</SBadge> : mig.upToDate ? <><SBadge tone="good">up to date</SBadge> {mig.applied?.length} applied</> : <SBadge tone="warn">{mig.pending?.length ?? 0} pending</SBadge>}</p>
        </div>
        <div className="adm-card">
          <h3>Media migration</h3>
          <p>{media.error ? <SBadge tone="muted">error</SBadge> : media.fullyMigrated ? <SBadge tone="good">fully migrated</SBadge> : <>{media.counts?.pendingPublic ?? 0} /public + {media.counts?.base64Pending ?? 0} base64 pending</>}</p>
        </div>
        <div className="adm-card">
          <h3>Transitions</h3>
          <p>{status.transitions?.error ? <SBadge tone="muted">error</SBadge> : <>{status.transitions?.summary?.completed ?? 0} completed run(s)</>}</p>
        </div>
      </div>
      {reports && !reports.error && (
        <div className="adm-card" style={{ marginTop: 16 }}>
          <h3>Reports</h3>
          <div className="adm-stat-row">
            <div><b>{reports.infra?.dbSizeBytes != null ? humanBytes(reports.infra.dbSizeBytes) : "—"}</b>DB size</div>
            <div><b>{reports.infra?.mediaCount ?? "—"}</b>media assets</div>
            <div><b>{reports.tokenUsage?.totalWorkflowTokens?.toLocaleString?.() ?? "—"}</b>workflow tokens</div>
            <div><b>${reports.buildCost?.estimatedUsd ?? "—"}</b>indicative build cost</div>
            <div><b>{reports.infraCost?.neon?.withinFreeTier ? "within" : "over"}</b>Neon free tier</div>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditSection({ audit, entry, filters }) {
  const qp = (patch) => {
    const next = { ...filters, ...patch };
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) usp.set(k, v);
    return `/admin/console?${usp.toString()}`;
  };
  return (
    <div className="adm-section">
      <div className="adm-section-head"><h3>Audit log</h3></div>
      <form className="adm-toolbar" method="get" action="/admin/console">
        <select name="action" className="adm-select" style={{ maxWidth: 160 }} defaultValue={filters.action ?? ""}>
          <option value="">All actions</option>
          {AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input name="entityType" className="adm-input" style={{ maxWidth: 160 }} placeholder="entity type" defaultValue={filters.entityType ?? ""} />
        <input name="search" className="adm-input" style={{ maxWidth: 200 }} placeholder="search summary" defaultValue={filters.search ?? ""} />
        <button className="adm-btn ghost sm" type="submit">Filter</button>
        <Link className="adm-btn link" href="/admin/console">Reset</Link>
      </form>
      <div className="adm-tablewrap">
        <table className="adm-table">
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Summary</th><th></th></tr></thead>
          <tbody>
            {audit.entries.map((e) => (
              <tr key={e.id}>
                <td style={{ color: "var(--adm-faint)", fontSize: "0.76rem", whiteSpace: "nowrap" }}>{new Date(e.createdAt).toLocaleString()}</td>
                <td>{e.actor?.email ?? "system"}</td>
                <td><SBadge tone="neutral">{e.action}</SBadge></td>
                <td>{e.entityType}</td>
                <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.summary}</td>
                <td><Link className="adm-btn link" href={qp({ entry: e.id })}>Details</Link></td>
              </tr>
            ))}
            {audit.entries.length === 0 && <tr><td colSpan={6}><div className="adm-empty">No audit entries.</div></td></tr>}
          </tbody>
        </table>
      </div>
      {audit.hasMore && audit.nextCursor && (
        // Drop a one-shot `entry` drill-down param when paging so the next page
        // doesn't re-open a stale entry detail.
        <div style={{ marginTop: 12 }}><Link className="adm-btn ghost sm" href={qp({ cursor: audit.nextCursor, entry: undefined })}>Next page →</Link></div>
      )}
      {entry && (
        <div className="adm-card" style={{ marginTop: 16 }}>
          <div className="adm-section-head"><h3 style={{ fontSize: "0.95rem" }}>Entry #{entry.id}</h3></div>
          <dl className="adm-kv">
            <dt>Action</dt><dd>{entry.action} · {entry.entityType}</dd>
            <dt>Actor</dt><dd>{entry.actor?.email ?? "system"}</dd>
            <dt>IP / agent</dt><dd>{entry.ipAddress ?? "—"} · {entry.userAgent ?? "—"}</dd>
            <dt>When</dt><dd>{new Date(entry.createdAt).toLocaleString()}</dd>
            <dt>Before</dt><dd><pre className="adm-code" style={{ whiteSpace: "pre-wrap" }}>{entry.before == null ? "—" : JSON.stringify(entry.before, null, 2)}</pre></dd>
            <dt>After</dt><dd><pre className="adm-code" style={{ whiteSpace: "pre-wrap" }}>{entry.after == null ? "—" : JSON.stringify(entry.after, null, 2)}</pre></dd>
          </dl>
        </div>
      )}
    </div>
  );
}
