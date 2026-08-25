/* =============================================================================
   AEGIS — MODO AGENTE  (aegis-agente.js)
   -----------------------------------------------------------------------------
   COS'E'. L'ossatura di un assistente che lavora da solo: riceve un compito,
   pensa, usa uno strumento, guarda il risultato, e continua finche' non ha
   finito. Non e' il motore di mascheramento e non lo tocca - gli sta INTORNO.
   Cancellando questo file, la chat di AEGIS funziona identica: e' il criterio
   che l'abbiamo deciso.

   LA REGOLA CHE COMANDA TUTTO. Il modello vede SOLO testo mascherato, sempre,
   anche qui. Uno strumento che legge una cartella o un documento restituisce
   all'agente il contenuto GIA' passato dal mascheratore. I valori reali non
   entrano mai nel ragionamento del modello: restano nel vault, sul dispositivo.

   LEGGERE E' AUTOMATICO. SCRIVERE NO. Ogni strumento dichiara se e' di sola
   lettura o se AGISCE sul mondo (scrive un file, esegue codice). Gli strumenti
   che agiscono NON eseguono da soli: preparano l'azione, la mostrano, e
   aspettano che un umano prema conferma. Non e' una cortesia - e' cio' che ci
   tiene fuori dalla responsabilita' legale di un'azione decisa da una macchina.

   NIENTE ESECUZIONE VERA IN QUESTA OSSATURA. I tre strumenti pesanti
   (cartelle, documenti, codice) sono qui come STRUTTURA con i loro permessi e
   la loro anteprima. L'aggancio all'esecuzione reale - File System Access per
   le cartelle, un interprete isolato per il codice - e' il gradino successivo,
   e si innesta qui senza cambiare l'ossatura. Cosi' provi la logica di
   approvazione prima di darle il potere di fare danni.
   ============================================================================= */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ stato */
  var _strumenti = {};        // registro: nome -> definizione
  var _giri = 0;              // giri fatti nel compito corrente
  var _MAX_DEFAULT = 15;      // tetto di sicurezza, sovrascrivibile dal piano
  var _log = [];              // registro delle azioni (audit)
  var _inAttesa = null;       // azione che aspetta l'approvazione umana

  /* --------------------------------------------------- registro strumenti */
  /* Uno strumento e':
       nome        identificatore corto
       agisce      false = sola lettura (automatico) | true = modifica (conferma)
       descrizione cosa fa, in parole che il modello capisce
       parametri   schema minimale per la chiamata
       esegui      funzione async (args) -> risultato   [sola lettura]
       prepara     funzione async (args) -> anteprima   [se agisce]
       conferma    funzione async (anteprima) -> esito  [se agisce]
  */
  function registra(def) {
    if (!def || !def.nome) throw new Error('strumento senza nome');
    _strumenti[def.nome] = def;
  }
  function elencoStrumenti() {
    return Object.keys(_strumenti).map(function (k) {
      var s = _strumenti[k];
      return { nome: s.nome, agisce: !!s.agisce, descrizione: s.descrizione || '',
               parametri: s.parametri || {} };
    });
  }

  /* --------------------------------------------------------- registro audit
     Cosa ha letto, quale strumento ha usato, cosa ha modificato, chi ha
     approvato. E' un obbligo del documento sulle garanzie, e serve a
     ricostruire cosa e' successo quando qualcosa va storto. */
  function annota(voce) {
    _log.push(Object.assign({ ts: Date.now() }, voce));
    if (_log.length > 500) _log.shift();
    try { if (root.AEGIS_AGENTE_ONLOG) root.AEGIS_AGENTE_ONLOG(_log[_log.length - 1]); } catch (e) {}
  }
  function registroAudit() { return _log.slice(); }

  /* ----------------------------------------------------- motore di approvazione
     Chiamare uno strumento passa SEMPRE di qui. Se e' di sola lettura, si
     esegue. Se agisce, si prepara l'anteprima e si sospende: l'esecuzione
     avviene solo dopo che l'interfaccia chiama approva(). */
  async function invoca(nome, args, contesto) {
    var s = _strumenti[nome];
    if (!s) return { errore: 'strumento sconosciuto: ' + nome };

    if (!s.agisce) {
      // LETTURA: automatica. Il risultato torna gia' mascherato: e' compito
      // dello strumento, non dell'agente, garantirlo.
      var out = await s.esegui(args || {}, contesto || {});
      annota({ tipo: 'lettura', strumento: nome, args: _sicuro(args) });
      return { risultato: out };
    }

    // SCRITTURA: si prepara e si aspetta l'umano.
    var anteprima = s.prepara ? await s.prepara(args || {}, contesto || {}) : { descrizione: nome };
    _inAttesa = { nome: nome, args: args || {}, anteprima: anteprima, contesto: contesto || {} };
    annota({ tipo: 'in_attesa', strumento: nome, anteprima: _sicuro(anteprima) });
    // Chi orchestra deve fermarsi qui: torna un segnale, non un risultato.
    return { attende_approvazione: true, anteprima: anteprima };
  }

  // L'interfaccia chiama questa quando l'utente preme "Conferma".
  async function approva() {
    if (!_inAttesa) return { errore: 'niente da approvare' };
    var a = _inAttesa; _inAttesa = null;
    var s = _strumenti[a.nome];
    var esito = s.conferma ? await s.conferma(a.anteprima, a.args, a.contesto)
                           : (s.esegui ? await s.esegui(a.args, a.contesto) : { fatto: true });
    annota({ tipo: 'eseguito', strumento: a.nome, chi_approva: 'utente', esito: _sicuro(esito) });
    return { risultato: esito };
  }
  function rifiuta() {
    if (!_inAttesa) return { errore: 'niente da rifiutare' };
    var n = _inAttesa.nome; _inAttesa = null;
    annota({ tipo: 'rifiutato', strumento: n, chi_approva: 'utente' });
    return { rifiutato: true };
  }
  function inAttesa() { return _inAttesa ? { nome: _inAttesa.nome, anteprima: _inAttesa.anteprima } : null; }

  // Non far finire dati reali nel log: si tiene una versione accorciata.
  function _sicuro(x) {
    try {
      var s = JSON.stringify(x);
      return s.length > 400 ? JSON.parse(s.slice(0, 400) + '"}') : x;
    } catch (e) { return {}; }
  }

  /* ------------------------------------------------------------ il ciclo
     pensa -> agisci -> guarda -> ripeti. Qui c'e' l'OSSATURA del ciclo: il
     conteggio dei giri, il tetto per piano, la sospensione sulle azioni. Chi
     pensa e' il modello, raggiunto tramite la stessa via della chat (la
     funzione `chiedi`, iniettata da index.html, che manda SOLO testo
     mascherato). L'ossatura non parla mai col modello per conto suo. */
  async function esegui(compito, opzioni) {
    opzioni = opzioni || {};
    var tetto = Number(opzioni.giriMax || _MAX_DEFAULT);
    var chiedi = opzioni.chiedi;             // async (messaggi, strumenti) -> risposta modello
    if (typeof chiedi !== 'function') return { errore: 'manca il collegamento al modello' };

    _giri = 0;
    annota({ tipo: 'inizio', compito: _sicuro({ c: compito }) });
    var storia = [{ ruolo: 'utente', testo: String(compito || '') }];

    while (_giri < tetto) {
      _giri++;
      var risposta = await chiedi(storia, elencoStrumenti());
      // Il modello o parla (ha finito) o chiede uno strumento.
      if (risposta && risposta.strumento) {
        var esito = await invoca(risposta.strumento, risposta.args, opzioni.contesto);
        if (esito.attende_approvazione) {
          // Si esce dal ciclo e si restituisce il controllo all'interfaccia:
          // riprendera' con riprendi() dopo l'approvazione.
          return { stato: 'attende_approvazione', anteprima: esito.anteprima, giri: _giri };
        }
        storia.push({ ruolo: 'strumento', nome: risposta.strumento, testo: JSON.stringify(esito.risultato || esito.errore) });
        continue;
      }
      annota({ tipo: 'fine', giri: _giri });
      return { stato: 'finito', risposta: (risposta && risposta.testo) || '', giri: _giri };
    }
    annota({ tipo: 'tetto_raggiunto', giri: _giri });
    return { stato: 'tetto', giri: _giri, messaggio: 'Raggiunto il numero massimo di passi per questo piano.' };
  }

  /* =========================================================================
     I TRE STRUMENTI. Struttura e permessi. L'esecuzione vera e' segnata con
     TODO: si innesta qui senza cambiare nient'altro.
     ========================================================================= */

  /* 1) CARTELLE. Sola lettura in questa forma: elenca e legge file gia'
        archiviati (AEGIS_STORAGE), che sono indicizzati sul mascherato. La
        scrittura su cartella del disco (File System Access) e' una SECONDA
        azione, marcata agisce:true, che qui prepara e aspetta conferma. */
  function _mascheraSicura(t) {
    try { return (root.aegisMascheraTesto ? root.aegisMascheraTesto(t) : ''); } catch (e) { return ''; }
  }

  registra({
    nome: 'cartelle.cerca',
    agisce: false,
    descrizione: 'Cerca fra i documenti archiviati sul dispositivo e restituisce i piu\u2019 pertinenti (gia\u2019 mascherati).',
    parametri: { domanda: 'testo' },
    esegui: async function (a) {
      if (!root.AEGIS_STORAGE) return { errore: 'archivio non disponibile' };
      var q = _mascheraSicura(a.domanda) || a.domanda || '';
      var r = await root.AEGIS_STORAGE.cerca(q, 6);
      // Si restituiscono estratti gia' mascherati e i percorsi, mai il file.
      return (r || []).map(function (x) {
        return { nome: x.nome, percorso: (x.percorso || []).join('/'), estratto: x.estratto || '' };
      });
    }
  });

  registra({
    nome: 'cartelle.scrivi',
    agisce: true,
    descrizione: 'Salva un file in una cartella del dispositivo. Richiede conferma.',
    parametri: { cartella: 'testo', nome: 'testo', contenuto: 'testo' },
    prepara: async function (a) {
      return { descrizione: 'Salvare un file', cartella: a.cartella || '(da scegliere)',
               nome: a.nome || 'documento', anteprima_contenuto: String(a.contenuto || '').slice(0, 400) };
    },
    conferma: async function (ap, a) {
      /* ============ SCRITTURA VERA SU DISCO =============================
         Il limite non lo mette questo codice: lo mette il browser. L'utente
         sceglie UNA cartella con il selettore di sistema, e da quel momento
         si puo' scrivere solo li' dentro - nemmeno sbagliando il percorso si
         esce. Non c'e' modo di raggiungere il resto del disco.

         Il selettore si puo' aprire solo subito dopo un gesto umano: qui il
         gesto e' il pulsante "Conferma ed esegui", che e' esattamente il
         punto giusto. La cartella scelta si tiene per le volte successive,
         cosi' non si chiede a ogni file.

         Se il file esiste gia' NON si sovrascrive: si aggiunge un numero.
         Un agente che cancella il lavoro di ieri perche' ha scelto lo stesso
         nome e' un agente che non si usa mai piu'.
         ================================================================= */
      if (!root.showDirectoryPicker) {
        return { errore: 'Questo browser non permette di scrivere su cartelle. Servono Chrome o Edge.' };
      }
      try {
        if (!_cartella) _cartella = await root.showDirectoryPicker({ mode: 'readwrite' });
        var permesso = await _cartella.queryPermission({ mode: 'readwrite' });
        if (permesso !== 'granted') {
          permesso = await _cartella.requestPermission({ mode: 'readwrite' });
          if (permesso !== 'granted') return { errore: 'permesso negato sulla cartella' };
        }

        var nome = _nomeSicuro(a.nome || 'documento.txt');
        var esistenti = [];
        for await (var voce of _cartella.values()) esistenti.push(voce.name);
        nome = _nomeLibero(nome, esistenti);

        var f = await _cartella.getFileHandle(nome, { create: true });
        var w = await f.createWritable();
        await w.write(String(a.contenuto || ''));
        await w.close();
        return { scritto: nome, cartella: _cartella.name, byte: String(a.contenuto || '').length };
      } catch (e) {
        if (e && e.name === 'AbortError') return { errore: 'nessuna cartella scelta' };
        return { errore: 'non sono riuscito a scrivere: ' + (e && e.message) };
      }
    }
  });

  var _cartella = null;   // la cartella scelta dall'utente, per questa sessione

  // Il nome del file lo propone il modello: va ripulito prima di usarlo.
  // Niente barre (uscirebbero dalla cartella), niente caratteri vietati.
  function _nomeSicuro(n) {
    var x = String(n).replace(/[\/\\:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '_').trim();
    if (!x) x = 'documento.txt';
    // Si accorcia PRIMA di mettere l'estensione, altrimenti su un nome lungo
    // il taglio se la porta via e il file resta senza tipo.
    if (x.length > 110) {
      var q = x.lastIndexOf('.');
      var e0 = (q > 0 && x.length - q <= 9) ? x.slice(q) : '';
      x = x.slice(0, 110 - e0.length) + e0;
    }
    if (!/\.[A-Za-z0-9]{1,8}$/.test(x)) x += '.txt';
    return x;
  }
  function _nomeLibero(nome, presenti) {
    if (presenti.indexOf(nome) === -1) return nome;
    var p = nome.lastIndexOf('.'), base = p > 0 ? nome.slice(0, p) : nome,
        est = p > 0 ? nome.slice(p) : '';
    for (var i = 2; i < 999; i++) {
      var c = base + '-' + i + est;
      if (presenti.indexOf(c) === -1) return c;
    }
    return base + '-' + Date.now() + est;
  }

  /* 2) DOCUMENTI. Sola lettura: estrae testo da un documento e lo maschera
        prima di consegnarlo all'agente. In questa ossatura accetta testo
        gia' estratto; l'OCR e i PDF si innestano nell'esegui. */
  /* Estrazione del testo da un file. Le due librerie si caricano SOLO quando
     servono davvero: sono pesanti, e la maggior parte delle sessioni non apre
     nessun PDF. Il mascheramento resta l'ULTIMO passo, sempre: prima si
     estrae tutto, poi si protegge, poi si consegna. Mai l'inverso. */
  function _script(src) {
    return new Promise(function (ok, ko) {
      var t = document.createElement('script');
      t.src = src; t.onload = ok; t.onerror = function () { ko(new Error(src)); };
      document.head.appendChild(t);
    });
  }

  async function estraiTesto(file) {
    var nome = String(file.name || '').toLowerCase();

    if (/\.pdf$/.test(nome)) {
      if (!root.pdfjsLib) await _script('pdf.min.js');
      if (!root.pdfjsLib) throw new Error('pdf.min.js non disponibile');
      // Il "worker" e' il secondo processo che pdf.js usa per non bloccare la
      // pagina: senza questa riga lavora nel filo principale e l'interfaccia
      // si inchioda sui documenti lunghi.
      try { root.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.min.js'; } catch (e) {}
      var buf = await file.arrayBuffer();
      var pdf = await root.pdfjsLib.getDocument({ data: buf }).promise;
      var pezzi = [];
      for (var p = 1; p <= pdf.numPages; p++) {
        var pagina = await pdf.getPage(p);
        var cont = await pagina.getTextContent();
        pezzi.push(cont.items.map(function (i) { return i.str; }).join(' '));
      }
      return pezzi.join('\n\n');
    }

    if (/\.docx?$/.test(nome)) {
      if (!root.mammoth) await _script('mammoth.min.js');
      if (!root.mammoth) throw new Error('mammoth.min.js non disponibile');
      var b = await file.arrayBuffer();
      var r = await root.mammoth.extractRawText({ arrayBuffer: b });
      return (r && r.value) || '';
    }

    // Tutto il resto che sia testo si legge com'e'.
    return await file.text();
  }

  registra({
    nome: 'documenti.leggi',
    agisce: false,
    descrizione: 'Legge il contenuto di un documento (PDF, Word o testo) e lo restituisce mascherato.',
    parametri: { testo: 'testo gia\u2019 estratto (facoltativo)' },
    esegui: async function (a) {
      var grezzo = a.testo || '';
      if (!grezzo && a.file) {
        try { grezzo = await estraiTesto(a.file); }
        catch (e) { return { errore: 'non riesco a leggere il documento: ' + (e && e.message) }; }
      }
      var m = _mascheraSicura(grezzo);
      if (!m && grezzo) return { errore: 'non sono riuscito a proteggere il testo: non lo restituisco in chiaro' };
      return { testo_mascherato: m, caratteri: grezzo.length };
    }
  });

  /* 3) CODICE. Agisce: eseguire codice puo' fare di tutto, quindi conferma
        SEMPRE, e in piu' non tocca mai i valori reali - opera sul mascherato.
        Nessuna esecuzione in questa ossatura: si prepara e si mostra. */
  registra({
    nome: 'codice.esegui',
    agisce: true,
    descrizione: 'Esegue un piccolo calcolo o trasformazione su dati. Richiede conferma. Non vede i dati reali.',
    parametri: { linguaggio: 'testo', codice: 'testo' },
    prepara: async function (a) {
      return { descrizione: 'Eseguire codice', linguaggio: a.linguaggio || 'python',
               codice: String(a.codice || '').slice(0, 1500),
               avviso: 'Il codice gira in un ambiente isolato e vede solo dati mascherati.' };
    },
    conferma: async function (ap, a) {
      return eseguiIsolato(String(a.codice || ''), Number(a.secondi || 20));
    }
  });

  /* ============ ESECUZIONE IN UN PROCESSO SEPARATO ======================
     Tre muri, e nessuno dipende dal fatto che il codice sia buono.

     1. PROCESSO A PARTE. Gira in un worker: non vede la pagina, non vede le
        variabili di AEGIS, non vede il vault. Non c'e' niente da rubare
        perche' non c'e' niente da raggiungere.
     2. NIENTE RETE. Appena l'interprete ha finito di caricarsi, e PRIMA di
        eseguire una riga di codice del modello, si tolgono fetch e le altre
        vie d'uscita. Anche volendo, quel codice non ha con chi parlare: non
        puo' mandare fuori niente.
     3. TEMPO MASSIMO. Se non finisce entro il tempo, il processo si chiude di
        forza. Un ciclo infinito scritto per sbaglio non blocca il computer.

     L'interprete si scarica alla prima esecuzione (~10 MB) e resta in cache
     del browser. Non entra nel repo.
     ================================================================== */
  var PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';

  function eseguiIsolato(codice, secondi) {
    var sorgente = [
      'let pronto = null;',
      'self.onmessage = async (e) => {',
      '  try {',
      '    if (!pronto) {',
      '      importScripts("' + PYODIDE + 'pyodide.js");',
      '      pronto = await loadPyodide({ indexURL: "' + PYODIDE + '" });',
      '    }',
      '    // IL MURO: si toglie ogni via verso l\'esterno PRIMA di eseguire.',
      '    self.fetch = () => Promise.reject(new Error("rete non disponibile"));',
      '    self.XMLHttpRequest = function () { throw new Error("rete non disponibile"); };',
      '    self.WebSocket = function () { throw new Error("rete non disponibile"); };',
      '    self.importScripts = function () { throw new Error("non consentito"); };',
      '    let uscita = "";',
      '    pronto.setStdout({ batched: (t) => { uscita += t + "\\n"; } });',
      '    pronto.setStderr({ batched: (t) => { uscita += t + "\\n"; } });',
      '    const val = await pronto.runPythonAsync(e.data.codice);',
      '    self.postMessage({ ok: true, uscita: uscita, valore: (val === undefined ? null : String(val)) });',
      '  } catch (err) {',
      '    self.postMessage({ ok: false, errore: String(err && err.message || err) });',
      '  }',
      '};'
    ].join('\n');

    return new Promise(function (risolvi) {
      var url, w;
      try {
        url = URL.createObjectURL(new Blob([sorgente], { type: 'text/javascript' }));
        w = new Worker(url);
      } catch (e) {
        return risolvi({ errore: 'non riesco ad avviare l\u2019interprete: ' + (e && e.message) });
      }
      var chiuso = false;
      function chiudi(esito) {
        if (chiuso) return; chiuso = true;
        try { w.terminate(); } catch (e) {}
        try { URL.revokeObjectURL(url); } catch (e) {}
        risolvi(esito);
      }
      var orologio = setTimeout(function () {
        chiudi({ errore: 'tempo scaduto (' + secondi + 's): ho fermato il codice' });
      }, Math.max(3, secondi) * 1000);

      w.onmessage = function (ev) {
        clearTimeout(orologio);
        var d = ev.data || {};
        if (d.ok) chiudi({ uscita: (d.uscita || '').slice(0, 4000), valore: d.valore });
        else chiudi({ errore: d.errore || 'errore nell\u2019esecuzione' });
      };
      w.onerror = function (ev) {
        clearTimeout(orologio);
        chiudi({ errore: (ev && ev.message) || 'errore nell\u2019interprete' });
      };
      w.postMessage({ codice: codice });
    });
  }

  /* =========================================================================
     IL CERVELLO
     -------------------------------------------------------------------------
     E' la funzione che parla col modello. Non conosce il vault, non conosce i
     dati reali: riceve testo GIA' mascherato e restituisce o una risposta o la
     richiesta di uno strumento.

     Come si fa capire. Al modello si spiega, una volta sola, che puo'
     rispondere in due modi e che deve farlo in JSON:
        {"strumento":"nome", "args":{...}}   per usare un attrezzo
        {"testo":"..."}                       quando ha finito
     Non ci si fida che lo faccia sempre bene: se la risposta non e' JSON
     valido, la si tratta come testo finale invece di andare in errore. Un
     agente che si blocca perche' il modello ha messo una virgola di troppo e'
     un agente inutile.

     Perche' passa dallo stesso /api/chat della chat. Perche' li' ci sono gia'
     il conteggio dei consumi, i limiti per piano, il controllo dei modelli
     consentiti e il guardiano di sicurezza. Un endpoint separato per l'agente
     vorrebbe dire duplicare tutto e dimenticarsene meta'.
     ========================================================================= */
  function creaCervello(cfg) {
    cfg = cfg || {};
    var backend = cfg.backend || 'https://chatbot-backend-dev.onrender.com';

    function istruzioni(strumenti) {
      var elenco = strumenti.map(function (s) {
        return '- ' + s.nome + (s.agisce ? ' [richiede conferma umana]' : '') +
               ': ' + s.descrizione +
               ' | parametri: ' + JSON.stringify(s.parametri || {});
      }).join('\n');
      return [
        'Sei un assistente che lavora per passi usando degli strumenti.',
        '',
        'STRUMENTI DISPONIBILI:',
        elenco,
        '',
        'REGOLE:',
        '1. Rispondi SEMPRE e SOLO con un oggetto JSON, senza testo attorno e senza righe di codice.',
        '2. Per usare uno strumento: {"strumento":"nome.esatto","args":{...}}',
        '3. Quando hai finito e vuoi rispondere all\'utente: {"testo":"la tua risposta"}',
        '4. Un solo strumento per volta. Guarda il risultato prima di decidere il passo dopo.',
        '5. I codici fra doppie parentesi quadre (per esempio [[PER_01]]) sono dati protetti.',
        '   Non provare a indovinare cosa nascondono, non chiederlo, e riportali sempre identici.',
        '6. Se non ti serve nessuno strumento, rispondi subito con {"testo":"..."}.'
      ].join('\n');
    }

    // Estrae il JSON anche se il modello lo ha incartato male.
    function leggiRisposta(grezzo) {
      var t = String(grezzo || '').trim();
      t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      var i = t.indexOf('{'), j = t.lastIndexOf('}');
      if (i !== -1 && j > i) {
        try {
          var o = JSON.parse(t.slice(i, j + 1));
          if (o && (o.strumento || o.testo !== undefined)) return o;
        } catch (e) {}
      }
      // Non e' JSON: lo trattiamo come risposta finale. Meglio una risposta
      // in piu' che un agente che si pianta.
      return { testo: t };
    }

    return async function chiedi(storia, strumenti) {
      var messaggi = [{ role: 'system', content: istruzioni(strumenti) }];
      storia.forEach(function (m) {
        if (m.ruolo === 'utente') messaggi.push({ role: 'user', content: m.testo });
        else if (m.ruolo === 'strumento') {
          messaggi.push({ role: 'user',
            content: 'RISULTATO DELLO STRUMENTO ' + m.nome + ':\n' + m.testo });
        } else messaggi.push({ role: 'assistant', content: m.testo });
      });

      var risposta = await fetch(backend + '/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cfg.modello, local_id: cfg.localId, language: cfg.lingua || 'it-IT',
          messages: messaggi.slice(-24), temperature: 0.2,
          session_id: cfg.sessionId || null, user_email: cfg.email || null,
          access_password: cfg.password || ''
        })
      });
      if (risposta.status === 402) return { testo: 'Credito o piano insufficiente per continuare.' };
      if (risposta.status === 429) return { testo: 'Hai raggiunto il limite di richieste. Riprova piu\u2019 tardi.' };
      if (!risposta.ok) return { testo: 'Il modello non ha risposto (' + risposta.status + ').' };
      var dati = await risposta.json();
      var testo = dati && dati.choices && dati.choices[0] && dati.choices[0].message
        ? dati.choices[0].message.content : '';
      return leggiRisposta(testo);
    };
  }

  /* -------------------------------------------------------------- superficie */
  root.AEGIS_AGENTE = {
    creaCervello: creaCervello,
    estraiTesto: estraiTesto,
    eseguiIsolato: eseguiIsolato,
    registra: registra,
    strumenti: elencoStrumenti,
    esegui: esegui,
    invoca: invoca,
    approva: approva,
    rifiuta: rifiuta,
    inAttesa: inAttesa,
    audit: registroAudit,
    // per i test: azzera lo stato fra un compito e l'altro
    _reset: function () { _giri = 0; _log = []; _inAttesa = null; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
