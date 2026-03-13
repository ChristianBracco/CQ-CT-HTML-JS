# TC·QC — Controlli di Qualità Tomografo Computerizzato

Sistema informatico per la gestione e l'analisi dei **Controlli di Qualità (CQ) di TC** secondo normativa D.Lgs 101/2020 art. 163, sviluppato per il Servizio di Fisica Sanitaria dell'A.O. Ordine Mauriziano – Torino.

Autore: Christian Bracco, Fisico Medico  
Stack: **Bun** (runtime) · **SQLite** (WAL mode) · **HTML/JS vanilla** (no framework, no CDN)

---

## Architettura

```
server.js          Backend Bun/SQLite, API REST JSON
index.html         App desktop (connessa al server)
mobile.html        App mobile offline (localStorage, sync WiFi)
```

Il backend espone API REST su porta `3131`. Il frontend desktop interroga il server via `fetch`. La versione mobile funziona completamente offline e sincronizza i dati via WiFi, email o clipboard.

---

## Tipi di controllo implementati

| Tipo | Descrizione | Periodicità |
|---|---|---|
| **Accettazione** | Verifica iniziale: dose in aria, fantoccio HEAD/BODY, collimazione geometrica, ricostruzione iterativa | Una tantum |
| **Costanza** | Riproducibilità CTDI, variazione kVp, fantoccio CI HEAD/BODY | Semestrale |
| **Stato** | Riproducibilità, linearità mAs, variazione kVp, collimazione/pitch/rotazione, fantoccio BODY | Annuale |

---

## `index.html` — App desktop

### Gestione macchine e sessioni
- Registrazione scanner TC con nome, modello, sede
- Creazione nuova sessione di controllo per tipo (accettazione / costanza / stato)
- Riapertura ultima sessione esistente per tipo
- Eliminazione sessione con conferma

### Schede di misura
- **Rendering dinamico** da definizione `QC_DEF`: ogni sezione è una lista di righe (acquisizioni) con campi numerici configurabili
- **Tab per sezione**: navigazione per categoria (Diodo HEAD, Linearità, Collimazione/Pitch, Fantoccio BODY, ecc.)
- **Parametri di esposizione editabili per card**: kV, mA, collimazione, pitch, rot, FOV modificabili riga per riga con modal dedicato; persistiti in `exposure_params` sul DB
- **Δ% automatico**: per ogni riga con `isDeltaA`/`isDeltaB`, calcola e mostra |CTDIvol mis. − CTDIvol TC| / CTDIvol TC × 100 con codice colore ok/warn/fail
- **Collimazione geometrica**: Δ% = |(mis − nom) / nom| × 100
- **Riproducibilità intra-sezione**: per sezioni con misure ripetute (es. `riprod_ctdi`), calcola media e deviazione percentuale vs media in tempo reale
- **Valori precedenti come placeholder**: pre-carica come `placeholder` i valori dell'ultima sessione dello stesso tipo per la stessa macchina
- **Autosave debounced**: ogni modifica viene salvata sul server dopo 400ms di inattività
- **Accettazione misura**: flag booleano per-riga, persistito sul DB

### Propagazione dati cross-sezione
- **Stato → Linearità mAs**: la media delle 3 misure di riproducibilità (`stato_riprod/st_r1÷r3`) viene propagata automaticamente come valore di riferimento 100 mA in `stato_lin_mas/mas_100` per i campi `ctdi100`, `ctdi_w`, `ctdi_vol`, `ctdi_vol_tc`
- **Costanza → Variazione kVp**: la media delle 3 misure `riprod_ctdi/rip_1÷3` (campo `dose_air`) viene propagata in `var_kv/vkv_120` campo `ctdi100`
- I campi autofillati diventano `readOnly`, mostrano stile `.autofilled` (sfondo blu persistente, bordo sinistro accent) e tooltip esplicativo
- Badge 🔗 sul contatore link di ogni card sorgente

### Barra di avanzamento
- Percentuale misure inserite sul totale previsto dalla sessione, aggiornata in tempo reale

### Report
- Generazione report HTML completo stampabile (CSS `@media print`)
- Tabella per sezione con tutti i valori, colore status (ok/warn/fail), flag accettazione
- Contatori riepilogo: conformi / borderline / non conformi / non valutate
- **Conclusioni normative** (art. 163 c.5 e c.6 D.Lgs 101/2020): qualità tecnica e idoneità uso clinico, selezionabili via radio button, persistite sul DB
- **Note tecniche** campo libero editabile, persistito
- **Firme digitali**: Fisico Medico e Responsabile impianto, salvate su DB
- **Grafici di analisi** (tab interattive, tutti visibili in stampa):

| Tipo controllo | Tab grafici disponibili |
|---|---|
| Stato annuale | 🔄 Riproducibilità · 📈 Linearità mAs · 📐 Variazione kVp · 📏 Coll./Pitch/Rot. |
| Costanza semestrale | 🔄 Riproducibilità · 📐 Variazione kVp |
| Accettazione | ☢️ Dose in Aria · 📐 Variazione kVp · 🎯 5 Posizioni HEAD · 📏 Collimazione · 🔊 Rumore/Iter. |

### Analisi statistica
- **R² linearità** (regressione lineare CTDIvol vs mAs) con badge colorato (≥0.999 verde, ≥0.99 giallo, <0.99 rosso)
- **Fit quadratico** CTDIvol vs kVp (HEAD e BODY separati), curva sovrapposta ai punti
- **CV%** (Coefficiente di Variazione) sulle misure di riproducibilità con badge colorato (≤1% verde, ≤3% giallo, >3% rosso)
- **Δ%** per-riga in tutte le tab grafici con tabelle riepilogo a colori
- Scala assi automatica (`niceAxisRange`): tutti i valori (misure + linea media + soglie) inclusi nel calcolo del range prima del margine; punti sempre dentro il frame SVG

### Impostazioni
- Soglie warn/fail configurabili (default 5% / 10%), salvate su DB e applicate a tutti i Δ%

### Editor parametri sezione
- Modal per modificare i parametri di esposizione predefiniti di una intera sezione (kV, mA, coll., pitch, rot.)
- Persistenza per macchina + tipo controllo + sezione

---

## `mobile.html` — App mobile offline

### Sessioni offline
- Creazione sessione con: macchina, modello, tipo controllo, data, operatori, numero tubo
- Storage completo su `localStorage` (nessuna dipendenza da rete)
- Lista sessioni precedenti con riapertura, copia e eliminazione
- Pre-carica automatica valori precedenti come suggerimento (`S._prevValues`)

### Struttura QC
Stessa struttura logica di `index.html`, con sezioni esplicite per ogni tipo:

**Accettazione**: dose in aria assiale/spirale, fantoccio CI HEAD/BODY (4 kV × 5 posizioni), collimazione geometrica (gafchromica)

**Semestrale (Costanza)**: dose in aria assiale/spirale, fantoccio CI HEAD/BODY

**Annuale (Stato)**: Diodo HEAD (variazioni kV/mA/coll/pitch/rot) + Diodo BODY

### Calcoli automatici CTDIw
Per le sezioni `isCTDIwSec`:
- **CTDIw** = ⅓ · CTDI₁₀₀ centro + ⅔ · media(CTDI₁₀₀ periferici: h12, h3, h6, h9)
- **CTDIvol** = CTDIw / pitch (pitch=1 → CTDIvol = CTDIw)
- Aggiornamento in tempo reale ad ogni input; campi calcolati `readonly` con stile `autofilled`

### Propagazione cross-annuale
- La media delle 3 misure `ann_head/ah1÷ah3` viene propagata nei tab kVp e linearità mAs come valore di riferimento 120 kV/100 mA

### Cross-link tra sessioni diverse
- `buildCrossLinks()`: confronta la firma parametri (kV, mA, coll, pitch, rot, FOV) tra sezioni di tipi di controllo diversi; costruisce mappa `CROSS_LINKS` per propagare automaticamente misure con stessa configurazione tra sessioni accettazione → costanza → annuale
- `propagateCrossLinks()`: aggiorna i campi collegati ad ogni input

### Grafici (tab tematiche per tipo sessione)
SVG puro, nessuna libreria esterna:

| Tipo sessione | Tab |
|---|---|
| Annuale | 🔄 Riproducibilità · 📈 Linearità mAs · 📐 Variazione kVp · 📏 Coll/Pitch/Rot |
| Semestrale | 🔄 Riproducibilità · 📐 Variazione kVp |
| Accettazione | 📏 Collimazione · 🔊 Rumore/Iterazione |

Ogni tab usa ID di sezione/riga espliciti (nessun approccio generico). Scala assi con margine garantito; badge R² e CV% colorati sovrapposti al grafico.

### Sincronizzazione dati
- **WiFi**: `POST /api/import` al server Bun sulla stessa LAN (URL configurabile, persistito)
- **Email**: apertura client email con JSON payload come corpo, soggetto automatico
- **Clipboard**: copia JSON con fallback `execCommand` per browser senza Clipboard API

### Tema
- Toggle dark/light con persistenza `localStorage`; variabili CSS (`--bg`, `--txt`, `--acc`, ecc.)

---

## API REST (`server.js`)

| Metodo | Endpoint | Descrizione |
|---|---|---|
| GET/POST | `/api/machines` | Lista macchine / Crea macchina |
| DELETE | `/api/machines/:id` | Elimina macchina |
| GET/POST | `/api/controls` | Lista sessioni (filtro per macchina/tipo) / Crea sessione |
| GET/PUT/DELETE | `/api/controls/:id` | Dettaglio / Aggiorna (conclusioni, note, stato) / Elimina |
| GET/POST | `/api/measurements` | Misure per sessione / Salva misura |
| GET/PUT | `/api/exposure_params` | Parametri esposizione per macchina+tipo / Aggiorna |
| GET/PUT | `/api/settings` | Soglie warn/fail globali |
| GET/PUT | `/api/signatures` | Firme per sessione |
| POST | `/api/import` | Importazione payload da `mobile.html` |

---

## Convenzioni implementative

- **Nessuna dipendenza esterna**: niente CDN, niente npm runtime, tutto SVG nativo
- **Modifiche minimali**: ogni intervento tocca solo il codice strettamente necessario
- **ID espliciti**: ogni funzione di grafico/propagazione usa ID di sezione e riga espliciti, mai scansione generica
- **WAL mode**: SQLite in Write-Ahead Log per concorrenza multi-tab
- **Codice colore universale**: ok=`#34c264`, warn=`#f0a500`, fail=`#f04f4f` sia in CSS che in SVG
