/* =============================================================================
   AEGIS — SKILLS  (aegis-rag.js)
   -----------------------------------------------------------------------------
   Documenti che l'utente carica una volta e che il modello puo' consultare a
   ogni domanda, senza doverli rileggere per intero a ogni chiamata.

   DOVE VIVE. IndexedDB, nel browser dell'utente. Non esiste nessun database
   remoto e non deve esistere: su un server finirebbe cio' che questa
   applicazione promette di non far uscire dal dispositivo.

   COSA C'E' DENTRO. Il testo IN CHIARO, spezzato in pezzi. E' la stessa cosa
   che l'utente ha gia' nella cartella dei download, sullo stesso dispositivo:
   non e' un'esposizione nuova. In cambio si guadagna la cosa che conta.

   NESSUN RILEVAMENTO QUI DENTRO. Non c'e' un solo pattern, e non c'e' nemmeno
   una chiamata al motore. La mascheratura avviene UNA VOLTA SOLA, al momento
   dell'invio, dentro il pannello, con la stessa funzione che maschera cio' che
   l'utente scrive a mano. Quindi la corrispondenza dei codici e' esatta per
   costruzione: se "Mario Rossi" e' [[PER_01]] nella chat, e' [[PER_01]] anche
   nel pezzo di documento, perche' e' letteralmente lo stesso passaggio di
   codice sullo stesso vault. Non c'e' niente da riconciliare, e cio' che non
   si riconcilia non puo' andare alla deriva.

   Se i pezzi fossero archiviati gia' mascherati, per rileggerli servirebbe
   salvare anche la corrispondenza codice-valore: il dato in chiaro ci sarebbe
   lo stesso, solo spezzato in due tabelle. E la ricerca lavorerebbe su codici
   invece che su parole - cercare "Bianchi" non troverebbe piu' il pezzo su
   Bianchi. Peggio su tutti i fronti.

   RICERCA: BM25, tre lingue, nessun modello, nessuno scaricamento.
   CANCELLAZIONE: documento, pezzi e indice stanno nella stessa riga apposta,
   cosi' non puo' restare niente di orfano.
   ============================================================================= */
(function (root) {
  'use strict';

  var DB_NOME = 'aegis_rag';
  var DB_VER = 1;
  var STORE = 'documenti';
  var PEZZO = 900;          // caratteri per pezzo
  var SOVRAP = 150;         // sovrapposizione, perche' un concetto non si spezzi
  var MAX_PEZZI = 4;        // quanti pezzi si accodano a una domanda

  /* ------------------------------------------------------------------ archivio */
  var _db = null;
  function apri() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (ok, ko) {
      var req = indexedDB.open(DB_NOME, DB_VER);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () { _db = req.result; ok(_db); };
      req.onerror = function () { ko(req.error); };
    });
  }
  function tx(modo, fn) {
    return apri().then(function (db) {
      return new Promise(function (ok, ko) {
        var t = db.transaction(STORE, modo);
        var r = fn(t.objectStore(STORE));
        t.oncomplete = function () { ok(r && r.result !== undefined ? r.result : r); };
        t.onerror = function () { ko(t.error); };
      });
    });
  }
  function tutti() {
    return tx('readonly', function (s) { return s.getAll(); })
      .then(function (v) { return v || []; })
      .catch(function () { return []; });
  }
  function salvaDoc(d) { return tx('readwrite', function (s) { return s.put(d); }); }
  function eliminaDoc(id) { return tx('readwrite', function (s) { return s.delete(id); }); }
  function svuotaTutto() { return tx('readwrite', function (s) { return s.clear(); }); }

  /* ------------------------------------------------------- spezzettamento */
  // Si taglia su fine paragrafo, poi su fine frase, mai a meta' parola.
  function spezza(testo) {
    var t = String(testo || '');
    if (t.length <= PEZZO) return t.trim() ? [t] : [];
    var out = [], i = 0;
    while (i < t.length) {
      var fine = Math.min(t.length, i + PEZZO);
      if (fine < t.length) {
        var coda = t.slice(fine - 260, fine);
        var taglio = coda.lastIndexOf('\n\n');
        if (taglio === -1) taglio = coda.lastIndexOf('\n');
        if (taglio === -1) taglio = Math.max(coda.lastIndexOf('. '), coda.lastIndexOf('; '));
        if (taglio === -1) taglio = coda.lastIndexOf(' ');
        if (taglio !== -1 && (fine - 260 + taglio) > i + 200) fine = fine - 260 + taglio + 1;
      }
      var p = t.slice(i, fine).trim();
      if (p) out.push(p);
      if (fine >= t.length) break;
      i = Math.max(i + 1, fine - SOVRAP);
    }
    return out;
  }

  /* ------------------------------------------------------------- ricerca */
  // BM25 su tre lingue. Nessun modello, nessuno scaricamento, nessuna attesa.
  function parole(s) {
    return (String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .match(/[a-z0-9]{2,}/g) || []);
  }
  function indicizza(pezzi) {
    return pezzi.map(function (p) {
      var w = parole(p), tf = {};
      w.forEach(function (x) { tf[x] = (tf[x] || 0) + 1; });
      return { testo: p, tf: tf, len: w.length || 1 };
    });
  }
  function cerca(domanda, documenti, quanti) {
    var q = parole(domanda);
    if (!q.length) return [];
    var pezzi = [];
    documenti.forEach(function (d) {
      (d.pezzi || []).forEach(function (p, i) {
        pezzi.push({ doc: d, i: i, testo: p.testo, tf: p.tf, len: p.len });
      });
    });
    if (!pezzi.length) return [];
    var N = pezzi.length, media = 0;
    pezzi.forEach(function (p) { media += p.len; });
    media = media / N;
    var df = {};
    q.forEach(function (w) {
      df[w] = 0;
      pezzi.forEach(function (p) { if (p.tf[w]) df[w]++; });
    });
    var k1 = 1.4, b = 0.72;
    pezzi.forEach(function (p) {
      var s = 0;
      q.forEach(function (w) {
        var f = p.tf[w] || 0;
        if (!f) return;
        var idf = Math.log(1 + (N - df[w] + 0.5) / (df[w] + 0.5));
        s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * p.len / media));
      });
      p.punteggio = s;
    });
    return pezzi.filter(function (p) { return p.punteggio > 0; })
      .sort(function (a, b2) { return b2.punteggio - a.punteggio; })
      .slice(0, quanti || MAX_PEZZI);
  }

  /* --------------------------------------------------------------- ingestione */
  function idNuovo() { return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  async function aggiungi(nome, testoGrezzo) {
    var grezzo = String(testoGrezzo || '').trim();
    if (!grezzo) throw new Error('niente da aggiungere');
    var doc = {
      id: idNuovo(),
      nome: String(nome || 'documento').slice(0, 120),
      ts: Date.now(),
      caratteri: grezzo.length,
      attiva: true,
      testo: grezzo,                       // in chiaro: vedi la nota in testa
      pezzi: indicizza(spezza(grezzo))
    };
    await salvaDoc(doc);
    return doc;
  }

  // Cambia il titolo, lasciando il contenuto dov'e'.
  async function rinomina(id, titolo) {
    var d = await leggi(id);
    if (!d) return null;
    d.nome = String(titolo || d.nome).slice(0, 120);
    await salvaDoc(d);
    return d;
  }

  // Sostituisce il documento: il vecchio indice sparisce insieme al vecchio
  // testo, non resta mai un indice che punta a qualcosa che non c'e' piu'.
  async function sostituisci(id, testoGrezzo, titolo) {
    var d = await leggi(id);
    if (!d) return null;
    var grezzo = String(testoGrezzo || '').trim();
    if (!grezzo) throw new Error('niente da salvare');
    d.testo = grezzo;
    d.caratteri = grezzo.length;
    d.pezzi = indicizza(spezza(grezzo));
    d.ts = Date.now();
    if (titolo) d.nome = String(titolo).slice(0, 120);
    await salvaDoc(d);
    return d;
  }

  // ACCESA O SPENTA. Una Skill spenta resta in archivio ma non viene
  // consultata: serve quando ce ne sono diverse e si vuole che il modello
  // guardi solo quella giusta, senza doverla cancellare e ricaricare.
  async function attiva(id, acceso) {
    var d = await leggi(id);
    if (!d) return null;
    d.attiva = !!acceso;
    await salvaDoc(d);
    return d;
  }

  // Il documento e il suo indice se ne vanno insieme: stanno nella stessa riga
  // apposta, cosi' non serve ricordarsi di cancellare anche l'altra meta'.
  async function elimina(id) { await eliminaDoc(id); return true; }

  /* ------------------------------------------------------------ uso in chat */
  // Ritorna i pezzi pertinenti IN CHIARO. Non li maschera: lo fa il pannello,
  // con la stessa funzione che maschera cio' che l'utente scrive. E' l'unico
  // modo perche' gli stessi termini ricevano gli stessi codici senza doverli
  // riconciliare, e cio' che non si riconcilia non puo' sbagliarsi.
  async function contesto(domanda) {
    var docs = (await tutti()).filter(function (d) { return d.attiva !== false; });
    if (!docs.length) return '';
    var trovati = cerca(domanda, docs, MAX_PEZZI);
    if (!trovati.length) return '';
    return trovati.map(function (t) { return t.testo; }).join('\n\n---\n\n');
  }

  /* ------------------------------------------------------------- riepilogo */
  async function elenco() {
    var d = await tutti();
    return d.sort(function (a, b) { return b.ts - a.ts; }).map(function (x) {
      return { id: x.id, nome: x.nome, ts: x.ts, caratteri: x.caratteri,
               attiva: x.attiva !== false, pezzi: (x.pezzi || []).length };
    });
  }
  async function leggi(id) {
    var d = await tutti();
    for (var i = 0; i < d.length; i++) if (d[i].id === id) return d[i];
    return null;
  }

  /* =========================================================================
     NOTA SULL'AGGANCIAMENTO PER SIGNIFICATO (embedding)
     La ricerca qui sopra e' lessicale: trova i pezzi che contengono le parole
     della domanda. Funziona bene quando la domanda usa le stesse parole del
     documento, che nei testi tecnici e legali e' la norma.
     L'embedding troverebbe anche i pezzi che dicono la stessa cosa con parole
     diverse. Il gancio e' pronto - basta sostituire cerca() - ma non l'ho
     acceso: un modello multilingue decente pesa piu' del motore che l'utente
     scarica gia', e uno leggero e' quasi sempre solo inglese, quindi su un
     documento italiano o spagnolo peggiorerebbe il risultato invece di
     migliorarlo. Va acceso quando esiste un multilingue sotto i 100 MB, e
     misurato su documenti veri prima di crederci.
     Per inciso: con i pezzi in chiaro l'embedding e' possibile. Su testo
     mascherato non lo sarebbe stato affatto, perche' un codice non ha
     significato da confrontare.
     ========================================================================= */

  /* ============ TRASFERIMENTO FRA DISPOSITIVI ============
     Le Skill vivono in IndexedDB, cioe' in QUESTO browser, su QUESTO
     dispositivo. Non e' una svista: e' la stessa scelta che vale per la
     cronologia e per la corrispondenza fra codici e dati reali. Se le
     sincronizzassimo da sole, il documento in chiaro finirebbe su un server, e
     l'unica cosa che questa applicazione promette e' che non succede.

     Il trasferimento quindi lo fa l'utente, consapevolmente: si esporta un
     file e lo si apre sull'altro dispositivo. Il file contiene i documenti in
     chiaro, quindi va trattato come i documenti originali.

     La strada per una sincronizzazione vera esiste ed e' cifrare l'archivio
     nel browser con una chiave che il server non vede mai. Va fatta, ma va
     fatta bene: finche' non c'e', meglio un trasferimento manuale e onesto
     che una sincronizzazione che tradisce la promessa.
     ======================================================= */
  async function esportaTutto() {
    var d = await tutti();
    return JSON.stringify({ formato: 'aegis-skills-1', ts: Date.now(), skills: d }, null, 1);
  }

  // I documenti dell'altro dispositivo si AGGIUNGONO: non si cancella niente
  // di quello che c'e' gia' qui. Chi importa due volte non perde nulla.
  async function importa(testoJson) {
    var dati;
    try { dati = JSON.parse(String(testoJson)); }
    catch (e) { throw new Error('file non leggibile'); }
    var lista = (dati && dati.skills) || [];
    if (!Array.isArray(lista) || !lista.length) throw new Error('nessuna Skill nel file');
    var presenti = await tutti();
    var visti = {};
    presenti.forEach(function (x) { visti[String(x.nome) + '|' + (x.caratteri || 0)] = true; });
    var messe = 0;
    for (var i = 0; i < lista.length; i++) {
      var d2 = lista[i];
      if (!d2 || !d2.testo) continue;
      var k = String(d2.nome) + '|' + (d2.caratteri || String(d2.testo).length);
      if (visti[k]) continue;                       // gia' qui: non si duplica
      d2.id = idNuovo();
      d2.ts = Date.now();
      if (!d2.pezzi || !d2.pezzi.length) d2.pezzi = indicizza(spezza(String(d2.testo)));
      await salvaDoc(d2);
      messe++;
    }
    return messe;
  }

  root.AEGIS_RAG = {
    esportaTutto: esportaTutto,
    importa: importa,
    aggiungi: aggiungi,
    rinomina: rinomina,
    sostituisci: sostituisci,
    attiva: attiva,
    elimina: elimina,
    svuota: svuotaTutto,
    elenco: elenco,
    leggi: leggi,
    contesto: contesto,
    spezza: spezza,
    cerca: cerca
  };
})(typeof window !== 'undefined' ? window : globalThis);
