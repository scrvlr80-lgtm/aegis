/* =============================================================================
   AEGIS — ARCHIVIO INTELLIGENTE  (aegis-storage.js)
   -----------------------------------------------------------------------------
   COSA FA. Prendi un file, lo lasci qui, e non ci pensi piu'. Non scegli il
   nome, non scegli la cartella. Piu' tardi dici "passami quel documento dove
   si parlava di [[PER_07]]" e torna fuori.

   DOVE VIVE. Nel browser, in IndexedDB, sullo stesso dispositivo. Il file
   resta nel SUO formato originale, byte per byte: un PDF resta un PDF e si
   riapre col lettore di sempre. Non esiste nessun archivio remoto, e non deve
   esistere: su un server finirebbe cio' che questa applicazione promette di
   non far uscire dal dispositivo.

   PERCHE' FUNZIONA LA RICERCA. Prima di archiviare, il contenuto viene letto e
   fatto passare dal motore di mascheramento - lo stesso della chat, lo stesso
   vault, gli stessi codici. Quello che si indicizza e' il testo MASCHERATO.
   Quindi "Pietro Rossi" nell'indice e' [[PER_07]], esattamente come nella
   conversazione: cercare il codice trova il documento, e cercare il nome vero
   funziona lo stesso, perche' il pannello maschera anche la domanda prima di
   cercarla. La corrispondenza fra codice e nome non entra mai nell'indice.

   IL PERCORSO. Le cartelle non le inventa l'utente: nascono da cio' che c'e'
   dentro. Anno / tipo di documento / persona o azienda principale. E' un
   percorso vero, visibile, e il file ci sta dentro davvero - non e' una
   finzione grafica sopra un mucchio disordinato.
   ============================================================================= */
(function (root) {
  'use strict';

  var DB_NOME = 'aegis_storage';
  var DB_VER = 1;
  var STORE = 'file';
  var MAX_TESTO = 200000;      // oltre, si indicizza l'inizio: basta e avanza

  /* ------------------------------------------------------------- archivio */
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
      .then(function (v) { return v || []; }).catch(function () { return []; });
  }
  function salva(d) { return tx('readwrite', function (s) { return s.put(d); }); }
  function togli(id) { return tx('readwrite', function (s) { return s.delete(id); }); }
  function svuota() { return tx('readwrite', function (s) { return s.clear(); }); }

  /* ------------------------------------------------- lettura del contenuto */
  // Si legge quello che si sa leggere. Di un'immagine o di un formato che non
  // si apre non si finge di conoscere il contenuto: si archivia lo stesso, e
  // lo si ritrova per nome e per data. Meglio un archivio onesto che un indice
  // inventato.
  function leggiTesto(file) {
    var nome = String(file.name || '').toLowerCase();
    var tipo = String(file.type || '').toLowerCase();
    var testuale = /^text\//.test(tipo) ||
      /\.(txt|md|csv|tsv|json|xml|html?|log|rtf|srt|vtt|yaml|yml|ini|sql)$/.test(nome);
    if (!testuale) return Promise.resolve('');
    return file.text().then(function (t) { return String(t || '').slice(0, MAX_TESTO); })
                      .catch(function () { return ''; });
  }

  /* ------------------------------------------------------ il percorso logico */
  var TIPI = [
    { c: 'Contratti',   rx: /\b(contratt|contrat|arrendamiento|locazione|lease|agreement|convenio)\w*/i },
    { c: 'Fatture',     rx: /\b(fattur|factur|invoice|recibo|ricevut|presupuest|preventiv)\w*/i },
    { c: 'Sanitari',    rx: /\b(referto|informe medico|diagnos|clinic|hospital|paziente|paciente|patient)\w*/i },
    { c: 'Giudiziari',  rx: /\b(sentenz|sentencia|juzgado|tribunal|procura|denunci|querela|burofax|requerimiento)\w*/i },
    { c: 'Identita',    rx: /\b(carta d.identit|dni|nie|passaport|pasaporte|passport|codice fiscale)\w*/i },
    { c: 'Bancari',     rx: /\b(iban|bonifico|transferencia|extracto|estratto conto|bank statement|saldo)\w*/i },
    { c: 'Immobili',    rx: /\b(catast|inmueble|immobil|vivienda|appartament|piso|alquiler)\w*/i },
    { c: 'Lavoro',      rx: /\b(nomina|contrato de trabajo|busta paga|nomin|payroll|curriculum|cv)\w*/i }
  ];

  function tipoDi(testo, nome) {
    var t = (testo || '') + ' ' + (nome || '');
    for (var i = 0; i < TIPI.length; i++) if (TIPI[i].rx.test(t)) return TIPI[i].c;
    return 'Documenti';
  }

  // Il protagonista: il codice che compare piu' volte nel testo mascherato.
  // E' il modo piu' onesto di dire "questo documento parla soprattutto di X"
  // senza sapere chi sia X.
  function protagonista(mascherato) {
    var conta = {}, m, rx = /\[\[([A-Z]+_\d+)\]\]/g;
    while ((m = rx.exec(mascherato)) !== null) conta[m[1]] = (conta[m[1]] || 0) + 1;
    var chiavi = Object.keys(conta);
    if (!chiavi.length) return null;
    // Le persone e le aziende contano piu' di una data o di un numero.
    var peso = function (k) {
      if (/^PER_/.test(k)) return 3;
      if (/^ORG_/.test(k)) return 3;
      if (/^(ADDR|CITY)_/.test(k)) return 2;
      return 1;
    };
    chiavi.sort(function (a, b) { return (conta[b] * peso(b)) - (conta[a] * peso(a)); });
    return chiavi[0];
  }

  function annoDi(file, testo) {
    var m = /\b(19|20)\d{2}\b/.exec(String(testo || ''));
    if (m) return m[0];
    var d = new Date(file.lastModified || Date.now());
    return String(d.getFullYear());
  }

  function percorsoDi(file, mascherato) {
    var anno = annoDi(file, mascherato);
    var tipo = tipoDi(mascherato, file.name);
    var chi = protagonista(mascherato);
    var p = [anno, tipo];
    if (chi) p.push(chi);
    return p;
  }

  /* --------------------------------------------------------------- ricerca */
  function parole(s) {
    return (String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .match(/[a-z0-9_\[\]]{2,}/g) || []);
  }

  // BM25 sullo stesso principio delle Skill: nessun modello, nessuna attesa.
  function cerca(domanda, quanti) {
    return tutti().then(function (docs) {
      var q = parole(domanda);
      if (!q.length || !docs.length) return [];
      var N = docs.length, media = 0;
      docs.forEach(function (d) { media += (d.len || 1); });
      media = media / N;
      var df = {};
      q.forEach(function (w) { df[w] = 0; docs.forEach(function (d) { if (d.tf && d.tf[w]) df[w]++; }); });
      var k1 = 1.4, b = 0.72;
      docs.forEach(function (d) {
        var s = 0;
        q.forEach(function (w) {
          var f = (d.tf && d.tf[w]) || 0;
          if (!f) return;
          var idf = Math.log(1 + (N - df[w] + 0.5) / (df[w] + 0.5));
          s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * (d.len || 1) / media));
        });
        // il nome del file e il percorso valgono: spesso la domanda li cita
        var extra = parole(d.nome + ' ' + (d.percorso || []).join(' '));
        q.forEach(function (w) { if (extra.indexOf(w) !== -1) s += 1.2; });
        d._p = s;
      });
      return docs.filter(function (d) { return d._p > 0; })
                 .sort(function (a, b2) { return b2._p - a._p; })
                 .slice(0, quanti || 5);
    });
  }

  /* ------------------------------------------------------------ ingestione */
  function idNuovo() { return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* archivia(file, maschera)
     `maschera` e' una funzione testo -> testo mascherato, passata dal
     pannello: cosi' questo file non conosce il motore e non puo' divergere
     da come si maschera nella chat. Se manca, si archivia senza indice
     invece di indicizzare dati in chiaro. */
  function archivia(file, maschera) {
    return leggiTesto(file).then(function (grezzo) {
      var mascherato = '';
      if (grezzo) {
        try { mascherato = maschera ? String(maschera(grezzo) || '') : ''; }
        catch (e) { mascherato = ''; }
      }
      var w = parole(mascherato + ' ' + file.name), tf = {};
      w.forEach(function (x) { tf[x] = (tf[x] || 0) + 1; });
      var doc = {
        id: idNuovo(),
        nome: String(file.name || 'documento'),
        tipo_mime: String(file.type || ''),
        byte: file.size || 0,
        ts: Date.now(),
        // IL FILE ORIGINALE, INTATTO. Si conserva il Blob cosi' com'e': quando
        // torna fuori e' lo stesso file di prima, non una ricostruzione.
        dato: file,
        // Solo il testo MASCHERATO entra nell'indice e nell'anteprima.
        estratto: mascherato.slice(0, 600),
        tf: tf,
        len: w.length || 1,
        percorso: percorsoDi(file, mascherato),
        indicizzato: !!mascherato
      };
      return salva(doc).then(function () { return doc; });
    });
  }

  function elenco() {
    return tutti().then(function (d) {
      return d.sort(function (a, b) { return b.ts - a.ts; }).map(function (x) {
        return { id: x.id, nome: x.nome, ts: x.ts, byte: x.byte, tipo_mime: x.tipo_mime,
                 percorso: x.percorso || [], estratto: x.estratto || '', indicizzato: !!x.indicizzato };
      });
    });
  }

  function leggi(id) {
    return tutti().then(function (d) {
      for (var i = 0; i < d.length; i++) if (d[i].id === id) return d[i];
      return null;
    });
  }

  // Restituisce il file all'utente nel formato originale.
  function scarica(id) {
    return leggi(id).then(function (d) {
      if (!d || !d.dato) return false;
      var url = URL.createObjectURL(d.dato);
      var a = document.createElement('a');
      a.href = url; a.download = d.nome;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      return true;
    });
  }

  // L'albero delle cartelle, per mostrarlo.
  function albero() {
    return elenco().then(function (lista) {
      var radice = {};
      lista.forEach(function (f) {
        var n = radice;
        (f.percorso || ['Documenti']).forEach(function (p) {
          n[p] = n[p] || { __file: [] };
          n = n[p];
        });
        n.__file.push(f);
      });
      return radice;
    });
  }

  root.AEGIS_STORAGE = {
    archivia: archivia,
    elenco: elenco,
    leggi: leggi,
    scarica: scarica,
    cerca: cerca,
    albero: albero,
    elimina: togli,
    svuota: svuota,
    percorsoDi: percorsoDi
  };
})(typeof window !== 'undefined' ? window : globalThis);
