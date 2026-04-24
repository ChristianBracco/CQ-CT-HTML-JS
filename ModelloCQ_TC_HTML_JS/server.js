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

      // ── Export filtrato v2 ──────────────────────────────────────
      // GET /api/export/controls?machine_id=X&date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&control_ids=1,2
      if (path === "/api/export/controls" && m === "GET") {
        const machineFilter = url.searchParams.get("machine_id");
        const dateFrom      = url.searchParams.get("date_from");
        const dateTo        = url.searchParams.get("date_to");
        const ctrlIdsRaw    = url.searchParams.get("control_ids");

        let q = "SELECT * FROM controls WHERE 1=1";
        const p = [];
        if (machineFilter) { q += " AND machine_id=?"; p.push(parseInt(machineFilter)); }
        if (dateFrom)      { q += " AND date>=?";      p.push(dateFrom); }
        if (dateTo)        { q += " AND date<=?";      p.push(dateTo); }
        if (ctrlIdsRaw) {
          const ids = ctrlIdsRaw.split(",").map(Number).filter(Boolean);
          if (ids.length) { q += ` AND id IN (${ids.map(()=>"?").join(",")})`; p.push(...ids); }
        }
        q += " ORDER BY date DESC, created_at DESC";

        const controls = db.query(q).all(...p);
        if (!controls.length)
          return json({ version:2, exported_at:new Date().toISOString(),
            machines:[], controls:[], measurements:[], signatures:[], exposure_params:[] });

        const ctrlIds = controls.map(c => c.id);
        const machIds = [...new Set(controls.map(c => c.machine_id))];
        const ph = arr => arr.map(()=>"?").join(",");

        return json({
          version:         2,
          exported_at:     new Date().toISOString(),
          machines:        db.query(`SELECT * FROM machines WHERE id IN (${ph(machIds)})`).all(...machIds),
          controls,
          measurements:    db.query(`SELECT * FROM measurements WHERE control_id IN (${ph(ctrlIds)})`).all(...ctrlIds),
          signatures:      db.query(`SELECT * FROM signatures WHERE control_id IN (${ph(ctrlIds)})`).all(...ctrlIds),
          exposure_params: db.query(`SELECT * FROM exposure_params WHERE machine_id IN (${ph(machIds)})`).all(...machIds),
        });
      }

      // ── Import unificato v1 (mobile) + v2 (laptop→centrale) ────
      // POST /api/import           → importa e salva
      // POST /api/import?preview=1 → dry-run, restituisce solo il report
      if (path === "/api/import" && m === "POST") {
        const body   = await parseBody(req);
        const dryRun = url.searchParams.get("preview") === "1";

        // ── v1 legacy: payload { session: {...} } dal mobile ─────
        if (body.session) {
          const sess    = body.session;
          const typeMap = { accettazione:"accettazione", semestrale:"costanza", annuale:"stato",
                            costanza:"costanza", stato:"stato" };
          const rType   = typeMap[sess.type] || sess.type;

          // Match macchina per nome+hospital (non per ID)
          let machRow = db.query(
            "SELECT id FROM machines WHERE LOWER(TRIM(name))=LOWER(TRIM(?)) AND LOWER(TRIM(hospital))=LOWER(TRIM(?))")
            .get(sess.machine||"", "Mobile Import");
          if (!machRow && !dryRun)
            machRow = db.query("INSERT INTO machines(name,model,hospital) VALUES(?,?,?) RETURNING id")
              .get(sess.machine||"TC Mobile", sess.model||"", "Mobile Import");

          const rMachId = machRow?.id;

          // Match controllo per machine+type+date
          let ctrlRow = rMachId
            ? db.query("SELECT id FROM controls WHERE machine_id=? AND type=? AND date=?")
                .get(rMachId, rType, sess.date)
            : null;
          let rCtrlId;
          if (ctrlRow) {
            rCtrlId = ctrlRow.id;
            if (!dryRun)
              db.run("UPDATE controls SET operators=?,tube_serial=?,protocol=?,status=? WHERE id=?",
                [sess.operators||"", sess.tube||"", sess.protocol||"", sess.status||"in_progress", rCtrlId]);
          } else if (!dryRun && rMachId) {
            const nr = db.query(
              "INSERT INTO controls(machine_id,type,date,operators,tube_serial,protocol,status) VALUES(?,?,?,?,?,?,?) RETURNING id")
              .get(rMachId, rType, sess.date, sess.operators||"", sess.tube||"", sess.protocol||"", sess.status||"in_progress");
            rCtrlId = nr.id;
          }

          let imported = 0;
          if (!dryRun && rCtrlId) {
            for (const [key, val] of Object.entries(sess.measurements||{})) {
              const [secId, ...rp] = key.split("_");
              db.run(`INSERT INTO measurements(control_id,section_id,row_id,values_json,accepted,accepted_at)
                      VALUES(?,?,?,?,?,?)
                      ON CONFLICT(control_id,section_id,row_id) DO UPDATE SET
                        values_json=excluded.values_json,accepted=excluded.accepted,accepted_at=excluded.accepted_at`,
                [rCtrlId, secId, rp.join("_"), JSON.stringify(val.values||{}),
                 val.accepted?1:0, val.accepted?new Date().toISOString():null]);
              imported++;
            }
          } else {
            imported = Object.keys(sess.measurements||{}).length;
          }

          console.log(`📱 Import mobile v1${dryRun?" [DRY-RUN]":""}: "${sess.machine}" ${rType} ${sess.date} – ${imported} misure`);
          return json({ ok:true, dry_run:dryRun, report:{
            machines:    { created:machRow?0:1, matched:machRow?1:0 },
            controls:    { created:ctrlRow?0:1, updated:ctrlRow?1:0 },
            measurements:{ upserted:imported }, signatures:{upserted:0}, exposure_params:{upserted:0},
          }});
        }

        // ── v2: payload { version:2, machines:[], controls:[], ... } ─
        const { machines=[], controls=[], measurements=[], signatures=[], exposure_params=[] } = body;
        if (!controls.length) return json({ error:"Nessun controllo nel payload" }, 400);

        const report = {
          machines:        { created:0, matched:0, detail:[] },
          controls:        { created:0, updated:0, detail:[] },
          measurements:    { upserted:0 },
          signatures:      { upserted:0 },
          exposure_params: { upserted:0 },
        };
        const machineIdMap = {};  // old_id → resolved_id
        const controlIdMap = {};  // old_id → resolved_id

        if (!dryRun) db.exec("BEGIN");
        try {

          // 1. Macchine: match per nome+hospital (case-insensitive, trim)
          for (const mac of machines) {
            const existing = db.query(
              "SELECT id FROM machines WHERE LOWER(TRIM(name))=LOWER(TRIM(?)) AND LOWER(TRIM(hospital))=LOWER(TRIM(?))")
              .get(mac.name||"", mac.hospital||"");
            if (existing) {
              machineIdMap[mac.id] = existing.id;
              report.machines.matched++;
              report.machines.detail.push({ name:mac.name, action:"matched", id:existing.id });
            } else {
              report.machines.created++;
              if (!dryRun) {
                const nr = db.query(
                  "INSERT INTO machines(name,model,serial_number,hospital,department) VALUES(?,?,?,?,?) RETURNING id")
                  .get(mac.name||"", mac.model||"", mac.serial_number||"", mac.hospital||"", mac.department||"");
                machineIdMap[mac.id] = nr.id;
                report.machines.detail.push({ name:mac.name, action:"created", id:nr.id });
              } else {
                report.machines.detail.push({ name:mac.name, action:"will_create" });
              }
            }
          }

          // 2. Controlli: match per machine_id(risolto)+type+date
          for (const ctrl of controls) {
            const rMachId = machineIdMap[ctrl.machine_id];
            if (!rMachId) {
              report.controls.detail.push({ date:ctrl.date, type:ctrl.type, action:"skip_no_machine" });
              continue;
            }
            const existing = db.query(
              "SELECT id FROM controls WHERE machine_id=? AND type=? AND date=?")
              .get(rMachId, ctrl.type, ctrl.date);
            if (existing) {
              controlIdMap[ctrl.id] = existing.id;
              report.controls.updated++;
              if (!dryRun)
                db.run(`UPDATE controls SET operators=?,tube_serial=?,protocol=?,status=?,notes=?,
                         conclusion_quality=?,conclusion_idoneita=?,conclusion_maint=? WHERE id=?`,
                  [ctrl.operators||"", ctrl.tube_serial||"", ctrl.protocol||"", ctrl.status||"in_progress",
                   ctrl.notes||"", ctrl.conclusion_quality||"", ctrl.conclusion_idoneita||"", ctrl.conclusion_maint||"",
                   existing.id]);
              report.controls.detail.push({ date:ctrl.date, type:ctrl.type, action:"updated", id:existing.id });
            } else {
              report.controls.created++;
              if (!dryRun) {
                const nr = db.query(
                  `INSERT INTO controls(machine_id,type,date,operators,tube_serial,protocol,status,notes,
                     conclusion_quality,conclusion_idoneita,conclusion_maint) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING id`)
                  .get(rMachId, ctrl.type, ctrl.date,
                    ctrl.operators||"", ctrl.tube_serial||"", ctrl.protocol||"",
                    ctrl.status||"in_progress", ctrl.notes||"",
                    ctrl.conclusion_quality||"", ctrl.conclusion_idoneita||"", ctrl.conclusion_maint||"");
                controlIdMap[ctrl.id] = nr.id;
                report.controls.detail.push({ date:ctrl.date, type:ctrl.type, action:"created", id:nr.id });
              } else {
                report.controls.detail.push({ date:ctrl.date, type:ctrl.type, action:"will_create" });
              }
            }
          }

          // 3. Misure – upsert sempre (last-write-wins)
          for (const meas of measurements) {
            const rCid = controlIdMap[meas.control_id];
            if (!rCid) continue;
            report.measurements.upserted++;
            if (!dryRun)
              db.run(`INSERT INTO measurements(control_id,section_id,row_id,values_json,accepted,accepted_at)
                      VALUES(?,?,?,?,?,?)
                      ON CONFLICT(control_id,section_id,row_id) DO UPDATE SET
                        values_json=excluded.values_json,accepted=excluded.accepted,accepted_at=excluded.accepted_at`,
                [rCid, meas.section_id, meas.row_id, meas.values_json, meas.accepted, meas.accepted_at||""]);
          }

          // 4. Firme
          for (const sig of signatures) {
            const rCid = controlIdMap[sig.control_id];
            if (!rCid) continue;
            report.signatures.upserted++;
            if (!dryRun)
              db.run(`INSERT INTO signatures(control_id,physicist,responsible,updated_at) VALUES(?,?,?,datetime('now'))
                      ON CONFLICT(control_id) DO UPDATE SET
                        physicist=excluded.physicist, responsible=excluded.responsible, updated_at=excluded.updated_at`,
                [rCid, sig.physicist||"", sig.responsible||""]);
          }

          // 5. Parametri di esposizione
          for (const ep of exposure_params) {
            const rMid = machineIdMap[ep.machine_id];
            if (!rMid) continue;
            report.exposure_params.upserted++;
            if (!dryRun)
              db.run(`INSERT INTO exposure_params(machine_id,control_type,section_id,rows_json) VALUES(?,?,?,?)
                      ON CONFLICT(machine_id,control_type,section_id) DO UPDATE SET rows_json=excluded.rows_json`,
                [rMid, ep.control_type, ep.section_id, ep.rows_json]);
          }

          if (!dryRun) db.exec("COMMIT");

        } catch(e) {
          if (!dryRun) db.exec("ROLLBACK");
          throw e;
        }

        console.log(`📥 Import v2${dryRun?" [DRY-RUN]":""}: ` +
          `${report.machines.created} mac.nuove / ${report.machines.matched} trovate | ` +
          `${report.controls.created} ctrl.nuovi / ${report.controls.updated} aggiornati | ` +
          `${report.measurements.upserted} misure`);
        return json({ ok:true, dry_run:dryRun, report });
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

      // ── Export completo (backup) ─────────────────────────────────
      if (path === "/api/export" && m === "GET") {
        return json({
          version:         2,
          machines:        db.query("SELECT * FROM machines").all(),
          controls:        db.query("SELECT * FROM controls").all(),
          measurements:    db.query("SELECT * FROM measurements").all(),
          settings:        db.query("SELECT * FROM settings").all(),
          exposure_params: db.query("SELECT * FROM exposure_params").all(),
          signatures:      db.query("SELECT * FROM signatures").all(),
          exported_at:     new Date().toISOString(),
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
