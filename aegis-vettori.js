/* =============================================================================
   AEGIS — RICERCA PER SIGNIFICATO  (aegis-vettori.js)
   -----------------------------------------------------------------------------
   COSA FA. Oggi la banca dati si cerca per parole: chiedi "contratto affitto" e
   trova i pezzi che contengono quelle parole. Chi ha scritto "accordo di
   locazione" non lo trova nessuno. Questo file aggiunge la ricerca per
   SIGNIFICATO: ogni pezzo diventa un elenco di numeri (un vettore), e due testi
   che vogliono dire la stessa cosa hanno vettori vicini.

   DOVE GIRA. Tutto nel browser. Il modello si scarica una volta dalla rete
   pubblica e resta nella cache; i vettori stanno in IndexedDB accanto alle
   Skill. Nessun server, nessun Supabase: i vettori di un documento sono
   ricostruibili, e mandarli fuori sarebbe come mandare fuori il documento.

   PERCHE' NON SOSTITUISCE LA RICERCA PER PAROLE, MA CI SI AGGIUNGE.
   In un testo mascherato meta' delle parole sono [[PER_01]], che per un modello
   di significato non vogliono dire niente - ma sono ESATTAMENTE cio' che serve
   trovare quando cerchi una persona. Le parole trovano i codici e i numeri
   esatti; i vettori trovano il senso della frase intorno. Da soli sbagliano
   tutti e due. Insieme funzionano, ed e' per questo che qui si sommano invece
   di sostituirsi.

   COSTO ONESTO. Il modello multilingue pesa un centinaio di megabyte alla prima
   accensione. Per questo e' SPENTO finche' l'utente non lo accende, e quando lo
   accende glielo si dice.
   ============================================================================= */
(function (root) {
  'use strict';

  var DB_NOME = 'aegis_vettori';
  var DB_VER = 1;
  var STORE = 'vett';
  var CHIAVE_ON = 'aegis_vettori_attivo';

  // Multilingue: gli utenti scrivono in italiano, spagnolo e inglese, e un
  // modello solo inglese qui sarebbe inutile per due terzi dei clienti.
  var MODELLO = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
  var LIBRERIA = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

  var _pipe = null;        // il modello caricato
  var _caricando = null;   // promessa in corso, per non caricarlo due volte

  /* ------------------------------------------------------------- archivio */
  var _db = null;
  function apri() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (ok, ko) {
      var r = indexedDB.open(DB_NOME, DB_VER);
      r.onupgradeneeded = function () {
        var db = r.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      r.onsuccess = function () { _db = r.result; ok(_db); };
      r.onerror = function () { ko(r.error); };
    });
  }
  function tx(modo, fn) {
    return apri().then(function (db) {
      return new Promise(function (ok, ko) {
        var t = db.transaction(STORE, modo);
        var res = fn(t.objectStore(STORE));
        t.oncomplete = function () { ok(res && res.result !== undefined ? res.result : res); };
        t.onerror = function () { ko(t.error); };
      });
    });
  }
  function tutti() {
    return tx('readonly', function (s) { return s.getAll(); })
      .then(function (v) { return v || []; }).catch(function () { return []; });
  }

  /* ------------------------------------------------------ acceso o spento */
  function attivo() {
    try { return localStorage.getItem(CHIAVE_ON) === '1'; } catch (e) { return false; }
  }
  function accendi(v) {
    try { v ? localStorage.setItem(CHIAVE_ON, '1') : localStorage.removeItem(CHIAVE_ON); } catch (e) {}
  }

  /* -------------------------------------------------------- il modello */
  function caricaModello(avanzamento) {
    if (_pipe) return Promise.resolve(_pipe);
    if (_caricando) return _caricando;
    _caricando = (async function () {
      var mod = await import(/* webpackIgnore: true */ LIBRERIA);
      // Niente modelli locali: si prendono da dove stanno, una volta sola.
      mod.env.allowLocalModels = false;
      _pipe = await mod.pipeline('feature-extraction', MODELLO, {
        quantized: true,
        progress_callback: function (p) {
          if (typeof avanzamento === 'function' && p && p.status === 'progress') {
            avanzamento(Math.round(p.progress || 0));
          }
        }
      });
      return _pipe;
    })();
    return _caricando;
  }

  /* Il vettore di un testo. Normalizzato, cosi' il confronto e' un semplice
     prodotto e non serve dividere ogni volta. */
  async function vettore(testo) {
    var p = await caricaModello();
    var out = await p(String(testo || '').slice(0, 2000), { pooling: 'mean', normalize: true });
    return Array.from(out.data);
  }

  function somiglianza(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;   // gia' normalizzati: questo E' il coseno
  }

  /* --------------------------------------------------------- indicizzare
     Si indicizza il testo GIA' MASCHERATO, perche' e' quello che sta in banca
     dati. Il vettore di un testo mascherato non permette di risalire ai dati
     veri: i codici sono neutri per costruzione. */
  async function indicizza(id, pezzi, avanzamento) {
    if (!Array.isArray(pezzi) || !pezzi.length) return 0;
    await caricaModello(avanzamento);
    var fatti = 0;
    for (var i = 0; i < pezzi.length; i++) {
      var t = String(pezzi[i].testo || pezzi[i] || '').trim();
      if (!t) continue;
      var v = await vettore(t);
      await tx('readwrite', function (s) {
        return s.put({
          id: id + '#' + i,
          doc: id,
          i: i,
          v: v,
          // Da dove viene il pezzo: serve a riaprire l'originale, non la copia.
          rif: pezzi[i].rif || null
        });
      });
      fatti++;
      if (typeof avanzamento === 'function') avanzamento(Math.round((i + 1) / pezzi.length * 100));
    }
    return fatti;
  }

  /* Quando un documento cambia, i suoi vettori vecchi non servono piu' e
     mentirebbero: si tolgono prima di rifarli. */
  async function dimentica(id) {
    var v = await tutti();
    for (var i = 0; i < v.length; i++) {
      if (v[i].doc === id) await tx('readwrite', function (s) { return s.delete(v[i].id); });
    }
  }

  async function reindicizza(id, pezzi, avanzamento) {
    await dimentica(id);
    return indicizza(id, pezzi, avanzamento);
  }

  /* ------------------------------------------------------------- cercare */
  async function cerca(domanda, quanti) {
    if (!attivo()) return [];
    var v = await tutti();
    if (!v.length) return [];
    var q = await vettore(domanda);
    return v.map(function (x) { return { doc: x.doc, i: x.i, rif: x.rif, punti: somiglianza(q, x.v) }; })
            .sort(function (a, b) { return b.punti - a.punti; })
            .slice(0, quanti || 6);
  }

  /* ------------------------------------------------------------- insieme
     Fonde i risultati delle parole (BM25) con quelli del significato.
     Il metodo e' quello del rango reciproco: conta la POSIZIONE in ciascuna
     lista, non il punteggio. E' voluto - i due punteggi vivono su scale
     diverse e sommarli darebbe sempre ragione a chi ha i numeri piu' grandi,
     che qui non vuol dire "piu' pertinente". */
  function fondi(perParole, perSenso, quanti) {
    var K = 60, punti = {};
    function conta(lista, peso) {
      (lista || []).forEach(function (x, i) {
        var k = (x.doc || x.id || x) + '#' + (x.i != null ? x.i : 0);
        punti[k] = (punti[k] || 0) + peso / (K + i + 1);
        punti[k + '__dato'] = x;
      });
    }
    conta(perParole, 1);
    conta(perSenso, 1);
    return Object.keys(punti)
      .filter(function (k) { return k.indexOf('__dato') === -1; })
      .sort(function (a, b) { return punti[b] - punti[a]; })
      .slice(0, quanti || 6)
      .map(function (k) { return punti[k + '__dato']; });
  }

  root.AEGIS_VETTORI = {
    attivo: attivo,
    accendi: accendi,
    caricaModello: caricaModello,
    vettore: vettore,
    somiglianza: somiglianza,
    indicizza: indicizza,
    reindicizza: reindicizza,
    dimentica: dimentica,
    cerca: cerca,
    fondi: fondi,
    svuota: function () { return tx('readwrite', function (s) { return s.clear(); }); },
    quanti: function () { return tutti().then(function (v) { return v.length; }); },
    modello: MODELLO
  };
})(typeof window !== 'undefined' ? window : globalThis);
