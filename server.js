// TC QC Server – Bun + SQLite
// Avvio: bun run server.js
// Accesso: http://localhost:3131

import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dir, "tc_qc.db"), { create: true });

// ─── SCHEMA ────────────────────────────────────────────────────────────────
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS machines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    model TEXT DEFAULT '',
    serial_number TEXT DEFAULT '',
    hospital TEXT DEFAULT '',
    department TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS controls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    machine_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    date TEXT NOT NULL,
    operators TEXT DEFAULT '',
    tube_serial TEXT DEFAULT '',
    protocol TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    status TEXT DEFAULT 'in_progress',
    conclusion_quality TEXT DEFAULT '',
    conclusion_idoneita TEXT DEFAULT '',
    conclusion_maint TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(machine_id) REFERENCES machines(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS measurements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    control_id INTEGER NOT NULL,
    section_id TEXT NOT NULL,
    row_id TEXT NOT NULL,
    values_json TEXT DEFAULT '{}',
    accepted INTEGER DEFAULT 0,
    accepted_at TEXT DEFAULT '',
    UNIQUE(control_id, section_id, row_id),
    FOREIGN KEY(control_id) REFERENCES controls(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS exposure_params (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    machine_id INTEGER,
    control_type TEXT NOT NULL,
    section_id TEXT NOT NULL,
    rows_json TEXT NOT NULL,
    UNIQUE(machine_id, control_type, section_id)
  );

  CREATE TABLE IF NOT EXISTS signatures (
    control_id INTEGER PRIMARY KEY,
    physicist TEXT DEFAULT '',
    responsible TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(control_id) REFERENCES controls(id) ON DELETE CASCADE
  );
`);

// Default settings
const DEFAULTS = {
  threshold_warn: "5",
  threshold_fail: "10",
};
for (const [k, v] of Object.entries(DEFAULTS)) {
  db.run("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)", [k, v]);
}

// ─── HELPERS ───────────────────────────────────────────────────────────────
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

const parseBody = async (req) => {
  try { return await req.json(); }
  catch { return {}; }
};

const HTML = readFileSync(join(__dir, "index.html"), "utf8");

// ─── SERVER ────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3131;

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url  = new URL(req.url);
    const path = url.pathname;
    const m    = req.method;

    // ── Static ──────────────────────────────────────────────────────
    if (path === "/" || path === "/index.html") {
      return new Response(HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    if (!path.startsWith("/api/")) return new Response("Not Found", { status: 404 });

    try {
      // ── Machines ────────────────────────────────────────────────
      if (path === "/api/machines") {
        if (m === "GET")
          return json(db.query("SELECT * FROM machines ORDER BY name").all());
        if (m === "POST") {
          const b = await parseBody(req);
          if (!b.name?.trim()) return json({ error: "name required" }, 400);
          const row = db
            .query("INSERT INTO machines(name,model,serial_number,hospital,department) VALUES(?,?,?,?,?) RETURNING *")
            .get(b.name.trim(), b.model || "", b.serial_number || "", b.hospital || "", b.department || "");
          return json(row, 201);
        }
      }

      const mid = path.match(/^\/api\/machines\/(\d+)$/)?.[1];
      if (mid) {
        if (m === "PUT") {
          const b = await parseBody(req);
          db.run(
            "UPDATE machines SET name=?,model=?,serial_number=?,hospital=?,department=? WHERE id=?",
            [b.name, b.model || "", b.serial_number || "", b.hospital || "", b.department || "", mid]
          );
          return json(db.query("SELECT * FROM machines WHERE id=?").get(mid));
        }
        if (m === "DELETE") {
          db.run("DELETE FROM machines WHERE id=?", [mid]);
          return json({ ok: true });
        }
      }

      // ── Controls ────────────────────────────────────────────────
      if (path === "/api/controls") {
        if (m === "GET") {
          const mid2  = url.searchParams.get("machine_id");
          const type  = url.searchParams.get("type");
          const limit = url.searchParams.get("limit") || 50;
          let q = "SELECT * FROM controls WHERE 1=1";
          const p = [];
          if (mid2) { q += " AND machine_id=?"; p.push(parseInt(mid2)); }
          if (type) { q += " AND type=?"; p.push(type); }
          q += ` ORDER BY date DESC, created_at DESC LIMIT ${parseInt(limit)}`;
          return json(db.query(q).all(...p));
        }
        if (m === "POST") {
          const b = await parseBody(req);
          const row = db
            .query("INSERT INTO controls(machine_id,type,date,operators,tube_serial,protocol) VALUES(?,?,?,?,?,?) RETURNING *")
            .get(b.machine_id, b.type, b.date, b.operators || "", b.tube_serial || "", b.protocol || "");
          return json(row, 201);
        }
      }

      const cid = path.match(/^\/api\/controls\/(\d+)$/)?.[1];
      if (cid) {
        if (m === "GET")
          return json(db.query("SELECT * FROM controls WHERE id=?").get(cid));
        if (m === "PUT") {
          const b = await parseBody(req);
          const allowed = ["operators","tube_serial","protocol","notes","status","conclusion_quality","conclusion_idoneita","conclusion_maint","date"];
          const sets = Object.keys(b).filter(k => allowed.includes(k));
          if (sets.length) {
            db.run(
              `UPDATE controls SET ${sets.map(k => `${k}=?`).join(",")} WHERE id=?`,
              [...sets.map(k => b[k]), cid]
            );
          }
          return json(db.query("SELECT * FROM controls WHERE id=?").get(cid));
        }
        if (m === "DELETE") {
          db.run("DELETE FROM controls WHERE id=?", [cid]);
          return json({ ok: true });
        }
      }

      // ── Measurements ────────────────────────────────────────────
      if (path === "/api/measurements") {
        if (m === "GET") {
          const control_id = url.searchParams.get("control_id");
          if (!control_id) return json({ error: "control_id required" }, 400);
          return json(db.query("SELECT * FROM measurements WHERE control_id=?").all(parseInt(control_id)));
        }
        if (m === "POST") {
          const b = await parseBody(req);
          db.run(
            `INSERT INTO measurements(control_id,section_id,row_id,values_json,accepted,accepted_at)
             VALUES(?,?,?,?,?,?)
             ON CONFLICT(control_id,section_id,row_id) DO UPDATE SET
               values_json=excluded.values_json,
               accepted=excluded.accepted,
               accepted_at=excluded.accepted_at`,
            [b.control_id, b.section_id, b.row_id,
             JSON.stringify(b.values || {}), b.accepted ? 1 : 0, b.accepted_at || ""]
          );
          return json({ ok: true });
        }
      }

      // ── Settings ────────────────────────────────────────────────
      if (path === "/api/settings") {
        if (m === "GET") {
          const rows = db.query("SELECT key,value FROM settings").all();
          return json(Object.fromEntries(rows.map(r => [r.key, r.value])));
        }
        if (m === "PUT") {
          const b = await parseBody(req);
          for (const [k, v] of Object.entries(b))
            db.run("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)", [k, String(v)]);
          return json({ ok: true });
        }
      }

      // ── Exposure Params ─────────────────────────────────────────
      if (path === "/api/exposure_params") {
        if (m === "GET") {
          const machine_id   = url.searchParams.get("machine_id");
          const control_type = url.searchParams.get("control_type");
          const rows = db.query(
            "SELECT * FROM exposure_params WHERE machine_id IS ? AND control_type=?"
          ).all(machine_id ? parseInt(machine_id) : null, control_type || "");
          return json(rows);
        }
        if (m === "PUT") {
          const b = await parseBody(req);
          db.run(
            `INSERT INTO exposure_params(machine_id,control_type,section_id,rows_json)
             VALUES(?,?,?,?)
             ON CONFLICT(machine_id,control_type,section_id) DO UPDATE SET rows_json=excluded.rows_json`,
            [b.machine_id || null, b.control_type, b.section_id, JSON.stringify(b.rows)]
          );
          return json({ ok: true });
        }
      }

      // ── Import da Mobile ────────────────────────────────────────
      // Riceve il payload JSON da mobile.html (WiFi sync o copia manuale)
      if (path === "/api/import" && m === "POST") {
        const body = await req.json();
        const sess = body.session;
        if (!sess) return json({ error: "Payload non valido: manca 'session'" }, 400);

        // Upsert macchina
        const machineId = `mobile_${sess.id}`;
        db.run(`INSERT INTO machines(id,name,model,hospital,department)
                VALUES(?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET name=excluded.name,model=excluded.model`,
          [machineId, sess.machine, sess.model||'', 'Mobile Import', '']);

        // Upsert controllo
        const ctrlId = sess.id;
        const typeMap = { accettazione:'accettazione', semestrale:'costanza', annuale:'stato' };
        db.run(`INSERT INTO controls(id,machine_id,type,date,operators,tube_serial,protocol,status)
                VALUES(?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET
                  operators=excluded.operators,status=excluded.status`,
          [ctrlId, machineId, typeMap[sess.type]||sess.type,
           sess.date, sess.operators||'', sess.tube||'', sess.protocol||'', sess.status||'in_progress']);

        // Upsert misure
        const meas = sess.measurements || {};
        let imported = 0;
        for (const [key, val] of Object.entries(meas)) {
          const [secId, ...rowParts] = key.split('_');
          const rowId = rowParts.join('_');
          db.run(`INSERT INTO measurements(control_id,section_id,row_id,values_json,accepted,accepted_at)
                  VALUES(?,?,?,?,?,?)
                  ON CONFLICT(control_id,section_id,row_id) DO UPDATE SET
                    values_json=excluded.values_json,accepted=excluded.accepted,accepted_at=excluded.accepted_at`,
            [ctrlId, secId, rowId,
             JSON.stringify(val.values||{}), val.accepted ? 1 : 0,
             val.accepted ? new Date().toISOString() : null]);
          imported++;
        }

        // Upsert exposure param overrides (per-card params saved on mobile)
        const paramOverrides = sess.paramOverrides || {};
        for (const [key, params] of Object.entries(paramOverrides)) {
          // key = `${secId}_${rowId}` – we store the full section rows after patching
          // We reconstruct a minimal rows array; server merges per section
          const [secId, ...rowParts] = key.split('_');
          const rowId = rowParts.join('_');
          // We need to fetch current rows_json for this section and patch the row
          const existing = db.query(
            'SELECT rows_json FROM exposure_params WHERE machine_id=? AND control_type=? AND section_id=?'
          ).get(machineId, typeMap[sess.type]||sess.type, secId);
          let rows = existing ? JSON.parse(existing.rows_json) : [];
          const rowIdx = rows.findIndex(r => r.id === rowId);
          if (rowIdx >= 0) {
            rows[rowIdx].params = params;
          } else {
            rows.push({ id: rowId, params });
          }
          db.run(`INSERT INTO exposure_params(machine_id,control_type,section_id,rows_json)
                  VALUES(?,?,?,?)
                  ON CONFLICT(machine_id,control_type,section_id) DO UPDATE SET rows_json=excluded.rows_json`,
            [machineId, typeMap[sess.type]||sess.type, secId, JSON.stringify(rows)]);
        }
        console.log(`📱 Import mobile: macchina="${sess.machine}" tipo="${sess.type}" data="${sess.date}" misure=${imported}`);
        return json({ ok: true, imported_measurements: imported });
      }

      // ── Signatures ──────────────────────────────────────────────
      if (path === "/api/signatures") {
        const control_id = url.searchParams.get("control_id") || (await parseBody(req))?.control_id;
        if (m === "GET") {
          const cid2 = url.searchParams.get("control_id");
          if (!cid2) return json({ error: "control_id required" }, 400);
          const row = db.query("SELECT * FROM signatures WHERE control_id=?").get(parseInt(cid2));
          return json(row || { control_id: parseInt(cid2), physicist: '', responsible: '' });
        }
        if (m === "PUT") {
          const b = await parseBody(req);
          db.run(
            `INSERT INTO signatures(control_id, physicist, responsible, updated_at)
             VALUES(?,?,?,datetime('now'))
             ON CONFLICT(control_id) DO UPDATE SET
               physicist=excluded.physicist,
               responsible=excluded.responsible,
               updated_at=excluded.updated_at`,
            [b.control_id, b.physicist || '', b.responsible || '']
          );
          return json({ ok: true });
        }
      }

      // ── Export / Backup ─────────────────────────────────────────
      if (path === "/api/export" && m === "GET") {
        return json({
          machines:       db.query("SELECT * FROM machines").all(),
          controls:       db.query("SELECT * FROM controls").all(),
          measurements:   db.query("SELECT * FROM measurements").all(),
          settings:       db.query("SELECT * FROM settings").all(),
          exposure_params: db.query("SELECT * FROM exposure_params").all(),
          signatures:     db.query("SELECT * FROM signatures").all(),
          exported_at:    new Date().toISOString(),
        });
      }

      return json({ error: "Not Found" }, 404);

    } catch (e) {
      console.error(e);
      return json({ error: e.message }, 500);
    }
  },
});

console.log(`\n🏥  TC QC Server in ascolto su  http://localhost:${PORT}\n`);
