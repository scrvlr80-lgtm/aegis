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
  /* LA STORIA DEL COMPITO IN CORSO.
     Stava dentro esegui(), come variabile locale. Sembrava innocuo e non lo
     era: ogni ripresa dopo un'approvazione ricominciava da una storia nuova,
     quindi il modello ritrovava il compito ma NON i risultati degli strumenti
     che aveva gia' visto, e rifaceva da capo il passo appena approvato.
     Qui invece la storia sopravvive alla sospensione, e approva()/rifiuta()
     possono scriverci l'esito. _reset() la azzera insieme al resto. */
  var _storia = [];

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
    /* L'ESITO ENTRA NELLA STORIA, non solo nell'audit. Senza questa riga il
       modello, ripreso dopo l'approvazione, non sapeva se l'azione fosse
       riuscita: la richiedeva di nuovo, e l'utente doveva confermare due
       volte la stessa cosa. */
    try { _storia.push({ ruolo: 'strumento', nome: a.nome, testo: JSON.stringify(esito) }); } catch (e) {
      _storia.push({ ruolo: 'strumento', nome: a.nome, testo: 'eseguito' });
    }
    return { risultato: esito };
  }
  function rifiuta() {
    if (!_inAttesa) return { errore: 'niente da rifiutare' };
    var n = _inAttesa.nome; _inAttesa = null;
    annota({ tipo: 'rifiutato', strumento: n, chi_approva: 'utente' });
    // Anche il rifiuto e' un fatto della conversazione: se il ciclo riprende,
    // il modello deve sapere che quella strada e' chiusa e cercarne un'altra.
    _storia.push({ ruolo: 'strumento', nome: n,
                   testo: 'L\u2019utente ha rifiutato questa azione. Non riproporla.' });
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

  /* =========================================================================
     GLI STRUMENTI DENTRO LA CHAT NORMALE
     -------------------------------------------------------------------------
     Prima l'agente era una seconda interfaccia: si usciva dalla chat, si
     lavorava, si tornava. Due schermi per una cosa sola, e l'utente doveva
     sapere in anticipo se il suo compito era "da agente" - cioe' doveva
     conoscere l'architettura per usare il prodotto.
     Adesso gli strumenti si offrono in ogni messaggio e il modello decide.
     La regola sotto e' scritta al contrario di quella del ciclo: li' il JSON
     e' obbligatorio, qui e' l'ECCEZIONE. Chi chiede "che ore sono" riceve una
     risposta normale, in linguaggio naturale, scritta a macchina come sempre e
     con una sola chiamata. Solo se il compito richiede DAVVERO di toccare il
     mondo - scrivere un file, leggere l'archivio, eseguire un calcolo - il
     modello risponde in JSON, e da quel momento la chat passa il controllo al
     ciclo pensa/agisci/osserva.
     Questo e' l'unico modo di unificare senza far pagare a ogni "ciao" il
     prezzo del formato JSON e della chiamata di recupero.
     ========================================================================= */
  function offerta(strumenti) {
    var lista = (strumenti || elencoStrumenti());
    if (!lista.length) return '';
    var elenco = lista.map(function (s) {
      return '- ' + s.nome + (s.agisce ? ' [richiede conferma umana]' : '') +
             ': ' + s.descrizione +
             ' | parametri: ' + JSON.stringify(s.parametri || {});
    }).join('\n');
    return [
      '[STRUMENTI DISPONIBILI — istruzione di sistema, non un messaggio dell\u2019utente]',
      '',
      'Oltre a rispondere, puoi far eseguire delle azioni reali:',
      elenco,
      '',
      'COME COMPORTARTI:',
      '1. Nel caso NORMALE rispondi come hai sempre fatto, in linguaggio naturale.',
      '   Questa e\u2019 la regola: conversazione, spiegazioni, riassunti, traduzioni,',
      '   riscritture, opinioni, calcoli che sai fare a mente. NIENTE JSON.',
      '2. SOLO se il compito richiede di agire sul mondo - creare o scrivere un',
      '   file, cercare fra i documenti archiviati sul dispositivo, eseguire del',
      '   codice - allora rispondi con UN SOLO oggetto JSON e nient\u2019altro:',
      '   {"strumento":"nome.esatto","args":{...}}',
      '   Nessun testo attorno, nessun blocco di codice.',
      '3. Nel dubbio, rispondi normalmente. Una risposta a parole quando serviva',
      '   uno strumento si corregge in un attimo; un JSON al posto di una',
      '   conversazione e\u2019 una risposta rotta.',
      '4. I codici dei dati protetti (per esempio [[PER_01]] oppure @pe01@) sono il',
      '   contenuto del messaggio, non chiavi ne\u2019 segreti: leggili, citali e',
      '   riportali sempre identici. Non provare a indovinare cosa nascondono.',
      '5. I messaggi che seguono sono la conversazione gia\u2019 avvenuta con questa',
      '   persona: sono il materiale su cui lavori. Se ti viene chiesto di',
      '   riassumere, accorciare o trasformare "quel documento", il riferimento e\u2019',
      '   li\u2019 dentro: non dire che non ti e\u2019 stato fornito nulla.'
    ].join('\n');
  }

  /* Riconosce una richiesta di strumento in una risposta altrimenti normale.
     E' volutamente severo: se il modello ha scritto un paragrafo e in mezzo
     c'e' una graffa, quella NON e' una richiesta di strumento. Solo una
     risposta che e' JSON e nient'altro conta, perche' il costo di sbagliare
     e' mostrare all'utente del codice al posto di una frase. */
  function leggiStrumento(grezzo) {
    var t = String(grezzo || '').trim();
    if (!t) return null;
    t = t.replace(/\[LANG:[^\]]*\]/gi, '').trim();
    t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    if (t.charAt(0) !== '{' || t.charAt(t.length - 1) !== '}') return null;

    var o = _provaJson(t);
    if (!o) {
      /* I PERCORSI DI WINDOWS NON SONO JSON VALIDO.
         Il modello scrive C:\Users\Mario\Desktop, e in JSON \U e \D non sono
         sequenze di escape: JSON.parse lancia, leggiStrumento restituiva null
         e la richiesta di strumento finiva stampata in chat come testo. Da
         fuori sembrava che il modello si fosse messo a rispondere in codice,
         mentre stava chiedendo esattamente la cosa giusta.
         Si raddoppiano solo i backslash che NON aprono un escape valido, cosi'
         un \n scritto apposta resta un a capo e un \Users diventa un carattere
         di percorso. */
      o = _provaJson(t.replace(/\\(?!["\\/bfnrtu])/g, '\\\\'));
    }
    if (o && typeof o.strumento === 'string' && _strumenti[o.strumento]) {
      return { strumento: o.strumento, args: o.args || {} };
    }
    return null;
  }
  function _provaJson(t) {
    try { var o = JSON.parse(t); return (o && typeof o === 'object') ? o : null; }
    catch (e) { return null; }
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

    /* ====== DA DOVE VIENE LA MEMORIA =====================================
       L'agente partiva da `[{utente: compito}]` e basta. Chi aveva appena
       incollato un documento nella chat e scriveva "riassumilo" si sentiva
       rispondere che non era stato fornito alcun testo: verissimo, dal punto
       di vista dell'agente, perche' il documento non gli era mai arrivato.
       La memoria non va costruita: c'e' gia'. E' lo SPECCHIO, la colonna
       centrale, che conserva ogni turno nella sua forma protetta e sopravvive
       anche alla chiusura della scheda. Il frontend la passa in opzioni.memoria
       come elenco di {ruolo, testo}; qui diventa l'inizio della storia.
       Due proprieta' che rendono questa scelta l'unica corretta per Aegis:
       il contenuto e' gia' mascherato - non c'e' nessun testo in chiaro da
       recuperare, nessun vault da attraversare - e non serve nessun archivio
       nuovo, nessuna riga sul server, nessuna deroga al noLog.
       ==================================================================== */
    if (opzioni.riprendi && _storia.length) {
      // Ripresa dopo un'approvazione: la storia e' quella di prima, coi
      // risultati gia' dentro. Ricostruirla qui cancellerebbe il lavoro fatto.
      annota({ tipo: 'ripresa', giri: _giri });
    } else {
      _storia = [];
      if (Array.isArray(opzioni.memoria)) {
        opzioni.memoria.forEach(function (m) {
          if (!m) return;
          /* DUE FORME, UNA SOLA STORIA. La chat parla in {role, content} -
             e' il formato che va a /api/chat - mentre qui dentro si e' sempre
             usato {ruolo, testo}. Si accettano tutte e due invece di obbligare
             il chiamante a tradurre: una traduzione in piu' e' un punto in piu'
             dove la memoria puo' arrivare vuota senza che nessuno se ne
             accorga. */
          var t = String(m.testo || m.content || '');
          if (!t) return;
          var r = m.ruolo || m.role || 'utente';
          var mio = (r === 'modello' || r === 'bot' || r === 'assistant' || r === 'assistente')
            ? 'modello' : 'utente';
          _storia.push({ ruolo: mio, testo: t });
        });
      }
      /* Il compito puo' essere GIA' l'ultima riga della memoria: il frontend
         lo consegna allo specchio prima di avviare l'agente, ed e' giusto che
         lo faccia (e' cio' che parte davvero). Aggiungerlo di nuovo lo
         manderebbe al modello due volte. Si guarda la coda, non si indovina. */
      var coda = _storia.length ? _storia[_storia.length - 1] : null;
      var testoCompito = String(compito || '');
      if (!coda || coda.ruolo !== 'utente' || coda.testo !== testoCompito) {
        _storia.push({ ruolo: 'utente', testo: testoCompito });
      }
      annota({ tipo: 'inizio', compito: _sicuro({ c: compito }), memoria: _storia.length - 1 });
    }
    var storia = _storia;

    while (_giri < tetto) {
      _giri++;
      var risposta = await chiedi(storia, elencoStrumenti());
      // Il modello o parla (ha finito) o chiede uno strumento.
      if (risposta && risposta.strumento) {
        var esito = await invoca(risposta.strumento, risposta.args, opzioni.contesto);
        if (esito.attende_approvazione) {
          // Si esce dal ciclo e si restituisce il controllo all'interfaccia:
          // riprendera' con esegui(..., {riprendi:true}) dopo l'approvazione,
          // ritrovando questa stessa storia invece di ricominciare da zero.
          return { stato: 'attende_approvazione', anteprima: esito.anteprima, giri: _giri };
        }
        storia.push({ ruolo: 'strumento', nome: risposta.strumento, testo: JSON.stringify(esito.risultato || esito.errore) });
        /* SE L'UTENTE HA CHIUSO LA PORTA, IL GIRO FINISCE.
           Un risultato marcato `ferma` non e' un guasto da cui riprendersi:
           e' una scelta della persona - ha annullato il selettore, ha detto di
           no. Senza questa uscita il modello lo leggeva come un contrattempo,
           richiedeva lo stesso strumento, si riapriva la stessa finestra, e si
           arrivava al tetto dei giri a forza di riproporre una cosa gia'
           rifiutata. */
        var _r = esito.risultato;
        if (_r && _r.ferma) {
          annota({ tipo: 'fermato', strumento: risposta.strumento });
          return { stato: 'finito', risposta: String(_r.errore || 'operazione annullata'), giri: _giri };
        }
        continue;
      }
      annota({ tipo: 'fine', giri: _giri });
      // La risposta finale resta nella storia: al turno dopo ("adesso fallo
      // piu' breve") il modello deve sapere che cosa ha gia' prodotto.
      var finale = (risposta && risposta.testo) || '';
      if (finale) storia.push({ ruolo: 'modello', testo: finale });
      return { stato: 'finito', risposta: finale,
               senza_strumenti: !!(risposta && risposta.senza_strumenti), giri: _giri };
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
        // Passa dalla stessa porta di tutti: cosi' vale anche qui il
        // ricordo dell'ultima cartella, invece di ripartire da Documenti.
        await _apriCartella(a && a.cartella);
        // Il permesso lo verifica gia' _apriCartella, che sa anche riusare
        // quello concesso nelle sessioni precedenti. Rifarlo qui significava
        // chiedere due volte la stessa cosa.

        var nome = _nomeSicuro(a.nome || 'documento.txt');
        var esistenti = [];
        for await (var voce of _cartella.values()) esistenti.push(voce.name);
        nome = _nomeLibero(nome, esistenti);

        var f = await _cartella.getFileHandle(nome, { create: true });
        /* IL CONTENUTO TORNA IN CHIARO PRIMA DI TOCCARE IL DISCO.
           Il modello lavora sui codici e quindi scrive [[PER_01]]. Ma questo
           e' il TUO disco, sul TUO computer: un file pieno di codici non
           serve a niente. Si passa dal ripristino - la stessa funzione della
           chat, lo stesso vault - cosi' sul file ci finiscono i nomi veri.
           Il modello continua a non averli mai visti. */
        var testo = String(a.contenuto || '');
        try { if (root.aegisDecodifica) testo = root.aegisDecodifica(testo); } catch (e) {}
        var w = await f.createWritable();
        await w.write(testo);
        await w.close();
        return { scritto: nome, cartella: _cartella.name, byte: testo.length };
      } catch (e) {
        if (e && (e.name === 'AbortError' || e.annullato))
          /* ANNULLATO E' UNA RISPOSTA, NON UN GUASTO.
             Restituendo un errore semplice il modello lo leggeva come
             "riprova": richiedeva lo strumento, si riapriva il selettore,
             l'utente annullava di nuovo, e si andava avanti fino al tetto
             dei giri. Questo marchio ferma il ciclo: chi ha chiuso la
             finestra ha gia' detto quello che voleva dire. */
          return { errore: 'nessuna cartella scelta', ferma: true };
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

  /* Scegliere la cartella una volta sola. Il selettore del browser si apre
     solo dopo un gesto umano: e' per questo che sta dentro conferma(), che
     parte dal clic sul pulsante. */
  /* DOVE SI APRE IL SELETTORE, E PERCHE' NON SEMPRE SU DOCUMENTI.
     showDirectoryPicker non accetta un percorso: non esiste modo di dirgli
     "apri C:\Users\Mario\Desktop\AEGIS PII", ed e' una scelta del browser,
     non una mancanza. Ma due cose si possono fare, e non venivano fatte.
     La prima e' `id`: dando un identificativo il browser RICORDA l'ultima
     cartella scelta con quell'id e riparte da li'. Senza, ricomincia ogni
     volta dalla cartella predefinita - Documenti - e da fuori sembra che
     ignori quello che gli chiedi.
     La seconda e' `startIn`: se il percorso che l'utente ha nominato dice
     Desktop, o Download, si parte da quella radice invece che da Documenti.
     Non e' la cartella esatta, ma e' un clic invece di cinque. */
  function _radiceDa(percorso) {
    var p = String(percorso || '').toLowerCase();
    if (/desktop|escritorio|scrivania/.test(p)) return 'desktop';
    if (/download|descargas|scaricat/.test(p)) return 'downloads';
    if (/document|documenti|documentos/.test(p)) return 'documents';
    if (/pictures|imagenes|immagini|foto/.test(p)) return 'pictures';
    if (/music|musica/.test(p)) return 'music';
    if (/video/.test(p)) return 'videos';
    return null;
  }

  /* ====== LA CARTELLA SI CHIEDE UNA VOLTA SOLA, NON A OGNI AVVIO =========
     _cartella stava solo in memoria. Bastava ricaricare la pagina e spariva,
     quindi il selettore tornava a chiedere la stessa cartella di ieri, e di
     stamattina, e di dieci minuti fa. Da fuori sembra che non impari niente.
     Un FileSystemDirectoryHandle si puo' SALVARE in IndexedDB: non e' una
     copia del percorso, e' proprio l'autorizzazione, e sopravvive alla
     chiusura del browser. Al ritorno si chiede al browser se vale ancora:
     se dice 'granted' si usa e basta; se dice 'prompt' serve un solo permesso
     - una riga sola, non il selettore - e siamo dentro il clic di conferma,
     quindi il momento e' quello giusto.
     Il selettore torna solo se l'autorizzazione e' stata revocata o se serve
     un'altra cartella. */
  var _IDB = 'aegis_cartelle', _CHIAVE = 'ultima';
  function _idb() {
    return new Promise(function (ok, ko) {
      var r = indexedDB.open(_IDB, 1);
      r.onupgradeneeded = function () {
        if (!r.result.objectStoreNames.contains('h')) r.result.createObjectStore('h');
      };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { ko(r.error); };
    });
  }
  function _ricorda(h) {
    return _idb().then(function (db) {
      return new Promise(function (ok) {
        try {
          var t = db.transaction('h', 'readwrite');
          t.objectStore('h').put(h, _CHIAVE);
          t.oncomplete = function () { ok(true); };
          t.onerror = function () { ok(false); };
        } catch (e) { ok(false); }
      });
    }).catch(function () { return false; });
  }
  function _ricordata() {
    return _idb().then(function (db) {
      return new Promise(function (ok) {
        try {
          var q = db.transaction('h', 'readonly').objectStore('h').get(_CHIAVE);
          q.onsuccess = function () { ok(q.result || null); };
          q.onerror = function () { ok(null); };
        } catch (e) { ok(null); }
      });
    }).catch(function () { return null; });
  }
  function _dimentica() {
    return _idb().then(function (db) {
      try { db.transaction('h', 'readwrite').objectStore('h').delete(_CHIAVE); } catch (e) {}
    }).catch(function () {});
  }

  async function _apriCartella(suggerimento) {
    if (!root.showDirectoryPicker) throw new Error('Servono Chrome o Edge per aprire una cartella.');

    // 1) Quella di questa sessione.
    if (_cartella && await _valida(_cartella)) return _cartella;

    // 2) Quella salvata dalle volte scorse: niente selettore, al massimo un
    //    permesso da riconfermare.
    if (!_cartella) {
      var salvata = await _ricordata();
      if (salvata && await _valida(salvata)) { _cartella = salvata; return _cartella; }
      if (salvata) await _dimentica();       // revocata: non serve piu' a niente
    }

    // 3) Solo adesso si disturba l'utente.
    var opz = { mode: 'readwrite', id: 'aegis-cartelle' };
    var r = _radiceDa(suggerimento);
    if (r) opz.startIn = r;
    try { _cartella = await root.showDirectoryPicker(opz); }
    catch (e) {
      if (e && e.name === 'AbortError') { e.annullato = true; throw e; }
      try { _cartella = await root.showDirectoryPicker({ mode: 'readwrite' }); }
      catch (e2) {
        if (e2 && e2.name === 'AbortError') e2.annullato = true;
        throw e2;
      }
    }
    if (!await _valida(_cartella)) throw new Error('permesso negato sulla cartella');
    await _ricorda(_cartella);               // la prossima volta non si chiede
    return _cartella;
  }

  // Vale ancora? Prima si guarda, poi semmai si chiede: chiedere quando e'
  // gia' concesso fa comparire una riga inutile.
  async function _valida(h) {
    try {
      var p = await h.queryPermission({ mode: 'readwrite' });
      if (p === 'granted') return true;
      p = await h.requestPermission({ mode: 'readwrite' });
      return p === 'granted';
    } catch (e) { return false; }
  }

  /* SCENDERE IN UN SOTTOPERCORSO, UN SEGMENTO ALLA VOLTA.
     getDirectoryHandle accetta UN nome, non un percorso: passandogli
     "Desktop/AEGIS PII" fallisce sempre, ed e' il motivo per cui ogni
     richiesta con un percorso dentro finiva in "sottocartella non trovata".
     Un percorso assoluto di Windows - C:\Users\Mario\... - il browser non lo
     puo' aprire per nessun motivo: e' fuori da cio' che gli e' permesso, e
     nessuna astuzia lo cambia.
     Quindi dell'assoluto si tiene solo la coda che sta DENTRO la cartella che
     l'utente ha scelto. Se non c'e' corrispondenza si resta nella cartella
     scelta, che e' l'unica davvero autorizzata. */
  async function _scendi(dir, percorso) {
    var pezzi = _segmenti(dir, percorso);
    if (!pezzi.length) return dir;
    // 1) La strada dritta: segmento per segmento, come sta scritto.
    var d = dir, ok = true;
    for (var k = 0; k < pezzi.length; k++) {
      try { d = await d.getDirectoryHandle(pezzi[k]); }
      catch (e) { ok = false; break; }
    }
    if (ok) return d;

    /* 2) LA STRADA VERA, quando la prima non porta da nessuna parte.
       Il percorso e' scritto nella lingua di Windows, la cartella si chiama
       come la vede l'utente: su un sistema in spagnolo il percorso dice
       "Desktop" ma la cartella scelta si chiama "Escritorio". Nessun taglio
       per nome puo' funzionare, e il risultato era che si scendeva a vuoto e
       si finiva per elencare la cartella sbagliata.
       Quindi si smette di seguire il percorso alla lettera e si cerca cio'
       che conta davvero: l'ULTIMO segmento, il nome della cartella di
       destinazione, fra i discendenti di quella autorizzata. "AEGIS PII" si
       trova subito sotto Escritorio, e non importa come Windows chiami il
       resto della strada. */
    var bersaglio = pezzi[pezzi.length - 1];
    var trovata = await _cerca(dir, bersaglio, 3);
    if (trovata) return trovata;
    throw new Error('dentro "' + dir.name + '" non c\u2019e\u2019 nessuna cartella "' + bersaglio + '"');
  }

  /* I segmenti utili di un percorso, tolta l'unita' e tolta la parte che
     precede la cartella gia' aperta (quando si riesce a riconoscerla, anche
     tradotta). */
  var _ALIAS = {
    desktop: ['desktop', 'escritorio', 'scrivania', 'bureau', 'schreibtisch'],
    documents: ['documents', 'documenti', 'documentos', 'dokumente'],
    downloads: ['downloads', 'download', 'descargas', 'scaricati', 'telechargements']
  };
  function _stessoNome(a, b) {
    a = String(a || '').toLowerCase(); b = String(b || '').toLowerCase();
    if (a === b) return true;
    for (var k in _ALIAS) {
      if (_ALIAS[k].indexOf(a) !== -1 && _ALIAS[k].indexOf(b) !== -1) return true;
    }
    return false;
  }
  function _segmenti(dir, percorso) {
    var p = String(percorso || '').trim();
    if (!p) return [];
    p = p.replace(/^[a-zA-Z]:/, '');                 // via la lettera di unita'
    var pezzi = p.split(/[\\/]+/).filter(function (x) { return x && x !== '.'; });
    // Il confronto e' per ALIAS, non per stringa: "Desktop" nel percorso e
    // "Escritorio" come nome della cartella sono la stessa cosa.
    for (var i = pezzi.length - 1; i >= 0; i--) {
      if (_stessoNome(pezzi[i], dir.name)) { pezzi = pezzi.slice(i + 1); break; }
    }
    return pezzi;
  }

  /* Cerca una cartella per nome fra i discendenti, in ampiezza. In ampiezza e
     non in profondita' perche' quella giusta e' quasi sempre vicina: cosi' la
     si trova al primo livello invece di infilarsi in un ramo lungo. */
  async function _cerca(dir, nome, dentro) {
    var coda = [{ h: dir, d: 0 }], visti = 0;
    while (coda.length) {
      var n = coda.shift();
      if (n.d > dentro) continue;
      for await (var v of n.h.values()) {
        if (v.kind !== 'directory') continue;
        if (_stessoNome(v.name, nome)) return v;
        if (++visti > 600) return null;      // un tetto, per non frugare tutto il disco
        if (n.d < dentro) coda.push({ h: v, d: n.d + 1 });
      }
    }
    return null;
  }

  /* Enumera in profondita'. Chi chiede "cosa c'e' dentro" intende dentro
     davvero, non solo il primo livello. Due tetti - profondita' e numero di
     voci - perche' una cartella puo' contenere un progetto intero e nessuno
     vuole aspettare mezzo minuto per una domanda del genere. */
  async function _enumera(dir, prefisso, dentro, quota) {
    var righe = [];
    for await (var v of dir.values()) {
      if (quota.n >= 400) { quota.troncato = true; break; }
      quota.n++;
      var nome = prefisso + v.name;
      if (v.kind === 'directory') {
        righe.push(nome + '/');
        if (dentro > 0) {
          try { righe = righe.concat(await _enumera(v, nome + '/', dentro - 1, quota)); }
          catch (e) {}
        }
      } else {
        righe.push(nome);
      }
    }
    return righe;
  }

  registra({
    nome: 'cartelle.elenca',
    agisce: true,
    descrizione: 'Elenca file e sottocartelle di una cartella del computer, in profondita\u2019. ' +
      'Usalo quando ti viene chiesto che cosa c\u2019e\u2019 dentro una cartella. ' +
      'Il browser non puo\u2019 aprire un percorso scritto a mano: la cartella la sceglie l\u2019utente ' +
      'con una finestra di selezione, e quella scelta e\u2019 solo l\u2019autorizzazione, NON il risultato ' +
      'dell\u2019operazione. Se l\u2019utente ha nominato un percorso passalo in "sottocartella" com\u2019e\u2019: ' +
      'serve a scendere dentro la cartella autorizzata quando corrisponde.',
    parametri: { sottocartella: 'facoltativa: percorso o nome di una sottocartella' },
    prepara: async function (a) {
      return { descrizione: 'Aprire una cartella e leggerne il contenuto',
               cartella: _cartella ? _cartella.name : '(la sceglierai tu adesso)',
               sottocartella: a.sottocartella || '\u2014' };
    },
    conferma: async function (ap, a) {
      try {
        // Il percorso che l'utente ha nominato serve almeno a scegliere da
        // quale radice aprire il selettore.
        var dir = await _apriCartella(a.sottocartella);
        var avviso = '';
        if (a.sottocartella) {
          try { dir = await _scendi(dir, a.sottocartella); }
          catch (e) {
            /* LA CARTELLA RICORDATA PUO' ESSERE QUELLA SBAGLIATA.
               _cartella resta in memoria per non richiedere il permesso a
               ogni domanda, ed e' giusto. Ma se l'utente chiede un'altra
               cartella, quella memorizzata non c'entra piu' niente: prima ci
               si rassegnava a elencare la vecchia, e da fuori sembrava che
               il selettore ignorasse la richiesta. Si riapre una volta sola -
               siamo ancora dentro il clic di conferma, quindi il browser lo
               permette - e se anche la seconda non contiene il percorso, si
               elenca quella e lo si dice. */
            _cartella = null;
            try {
              dir = await _apriCartella(a.sottocartella);
              try { dir = await _scendi(dir, a.sottocartella); }
              catch (e2) { avviso = String(e2.message || e2) + ' Elenco la cartella che hai scelto.'; }
            } catch (e3) {
              if (e3 && (e3.name === 'AbortError' || e3.annullato)) return { errore: 'nessuna cartella scelta', ferma: true };
              throw e3;
            }
          }
        }
        var quota = { n: 0, troncato: false };
        var righe = await _enumera(dir, '', 2, quota);
        // I NOMI DEI FILE SONO DATI. "Contratto Bianchi 2024.pdf" contiene un
        // cognome quanto il documento dentro. Passano dal mascheratore come
        // qualunque altro testo prima di arrivare al modello.
        var out = {
          cartella: _mascheraSicura(dir.name) || dir.name,
          contenuto: righe.map(function (n) { return _mascheraSicura(n) || n; }),
          quanti: righe.length
        };
        var note = [];
        if (avviso) note.push(_mascheraSicura(avviso) || avviso);
        if (quota.troncato) note.push('Elenco troncato a 400 voci.');
        if (!righe.length) note.push('La cartella e\u2019 vuota.');
        if (note.length) out.nota = note.join(' ');
        return out;
      } catch (e) {
        if (e && (e.name === 'AbortError' || e.annullato))
          /* ANNULLATO E' UNA RISPOSTA, NON UN GUASTO.
             Restituendo un errore semplice il modello lo leggeva come
             "riprova": richiedeva lo strumento, si riapriva il selettore,
             l'utente annullava di nuovo, e si andava avanti fino al tetto
             dei giri. Questo marchio ferma il ciclo: chi ha chiuso la
             finestra ha gia' detto quello che voleva dire. */
          return { errore: 'nessuna cartella scelta', ferma: true };
        return { errore: String(e && e.message || e) };
      }
    }
  });

  registra({
    nome: 'cartelle.apri',
    agisce: true,
    descrizione: 'Apre e legge il contenuto di un file dentro la cartella scelta. Restituisce il testo mascherato.',
    parametri: { nome: 'nome del file' },
    prepara: async function (a) {
      return { descrizione: 'Leggere un file dalla cartella',
               cartella: _cartella ? _cartella.name : '(da scegliere)', file: a.nome || '' };
    },
    conferma: async function (ap, a) {
      try {
        var dir = await _apriCartella();
        var nome = String(a.nome || '');
        // Il nome arriva mascherato dall'elenco: si rimette in chiaro per
        // trovarlo davvero sul disco.
        try { if (root.aegisDecodifica) nome = root.aegisDecodifica(nome); } catch (e) {}
        var h = await dir.getFileHandle(nome);
        var f = await h.getFile();
        if (f.size > 8 * 1024 * 1024) return { errore: 'file troppo grande (oltre 8 MB)' };
        var grezzo = await estraiTesto(f);
        var m = _mascheraSicura(grezzo);
        if (!m && grezzo) return { errore: 'non sono riuscito a proteggere il testo: non lo restituisco in chiaro' };
        return { file: a.nome, caratteri: grezzo.length, testo_mascherato: m.slice(0, 12000) };
      } catch (e) {
        if (e && e.name === 'NotFoundError') return { errore: 'file non trovato: ' + a.nome };
        if (e && (e.name === 'AbortError' || e.annullato))
          /* ANNULLATO E' UNA RISPOSTA, NON UN GUASTO.
             Restituendo un errore semplice il modello lo leggeva come
             "riprova": richiedeva lo strumento, si riapriva il selettore,
             l'utente annullava di nuovo, e si andava avanti fino al tetto
             dei giri. Questo marchio ferma il ciclo: chi ha chiuso la
             finestra ha gia' detto quello che voleva dire. */
          return { errore: 'nessuna cartella scelta', ferma: true };
        return { errore: String(e && e.message || e) };
      }
    }
  });

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

    /* ====== DOVE VA A FINIRE QUESTA CHIAMATA ==============================
       Nella web app parla col nostro backend, e paghiamo noi il modello.
       Nel pannello dell'estensione NON deve farlo: li' l'utente sta usando
       il proprio abbonamento a ChatGPT, e una chiamata che sfugge al ponte
       spenderebbe i nostri soldi mentre lui crede di spendere i suoi. Nessun
       errore, nessun avviso: te ne accorgi dalla fattura.
       Per questo la chiamata passa dal ponte quando il ponte c'e'. Una riga,
       e l'agente si comporta bene in tutti e due i mondi senza un solo
       "se siamo nell'estensione" sparso nel codice.
       =================================================================== */
    function chiamata(percorso, opzioni) {
      if (root.AEGIS_PONTE && typeof root.AEGIS_PONTE.fetch === 'function') {
        return root.AEGIS_PONTE.fetch(percorso, opzioni);
      }
      return fetch(backend + percorso, opzioni);
    }

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
        '6. Se non ti serve nessuno strumento, rispondi subito con {"testo":"..."}.',
        '7. I messaggi che seguono sono la conversazione gia\\u2019 avvenuta con questa',
        '   persona, nella stessa forma protetta. Sono il MATERIALE su cui lavori: se il',
        '   compito dice "riassumilo", "fallo piu\\u2019 breve" o "mettilo in cinque punti",',
        '   il riferimento e\\u2019 li\\u2019 dentro. Non chiedere di rimandarti un testo che hai',
        '   gia\\u2019 davanti e non dire che non ti e\\u2019 stato fornito nulla.',
        '',
        'IMPORTANTE: non descrivere a parole cosa faresti. Se il compito richiede di',
        'scrivere un file, leggere una cartella o eseguire un calcolo, DEVI chiamare lo',
        'strumento corrispondente. Rispondere a parole senza chiamarlo e\u2019 un errore.',
        '',
        'ESEMPI:',
        'compito: "scrivi un file di prova con dentro ciao"',
        'risposta: {"strumento":"cartelle.scrivi","args":{"nome":"prova.txt","contenuto":"ciao"}}',
        'compito: "dimmi che file ci sono nella cartella"',
        'risposta: {"strumento":"cartelle.elenca","args":{}}'
      ].join('\n');
    }

    /* Estrae il JSON anche se il modello lo ha incartato male.
       Ritorna null quando JSON non ce n'e' proprio: chi chiama decide se
       insistere o arrendersi. Prima ritornavo direttamente {testo}, e questo
       nascondeva il guasto peggiore: un modello che ignora gli strumenti e
       risponde a parole sembrava un agente che aveva finito. Non aveva
       nemmeno cominciato. */
    function leggiRisposta(grezzo) {
      var t = String(grezzo || '').trim();
      // Il server aggiunge la marca della lingua: va tolta o rompe il JSON.
      t = t.replace(/\[LANG:[^\]]*\]/gi, '').trim();
      t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      var i = t.indexOf('{'), j = t.lastIndexOf('}');
      if (i !== -1 && j > i) {
        try {
          var o = JSON.parse(t.slice(i, j + 1));
          if (o && (o.strumento || o.testo !== undefined)) return o;
        } catch (e) {}
      }
      return null;
    }

    return async function chiedi(storia, strumenti) {
      /* ====== PERCHE' LE ISTRUZIONI NON SONO UN MESSAGGIO system ==========
         Erano {role:'system'}, ed e' la cosa ovvia da fare. Ma /api/chat non
         le consegnava MAI al modello: il core filtra i messaggi in arrivo
         tenendo solo i ruoli user e assistant, e subito dopo antepone il
         proprio system prompt, quello del tenant. Il system dell'agente
         spariva per strada, senza un errore e senza una riga di log.
         Da qui tutto il resto: un modello che non ha mai visto l'elenco degli
         strumenti non li usa, e uno che non ha mai visto la regola del JSON
         risponde a parole. La "seconda e ultima chiamata" qui sotto nasce come
         rimedio a questo, e curava il sintomo.
         Il ruolo user passa. Quindi le istruzioni vanno come primo turno
         dell'utente, con una risposta breve dell'assistente subito dopo per
         fissare il patto: da li' in poi il modello sa gia' di aver accettato
         di rispondere in JSON. Il server non e' stato toccato - non va toccato,
         serve sei tenant - e il contratto di /api/chat resta quello di prima. */
      var messaggi = [
        { role: 'user', content: istruzioni(strumenti) },
        { role: 'assistant', content: '{"testo":"Ho capito. Rispondero\\u2019 sempre e solo con un oggetto JSON."}' }
      ];
      storia.forEach(function (m) {
        if (m.ruolo === 'utente') messaggi.push({ role: 'user', content: m.testo });
        else if (m.ruolo === 'strumento') {
          messaggi.push({ role: 'user',
            content: 'RISULTATO DELLO STRUMENTO ' + m.nome + ':\n' + m.testo });
        } else messaggi.push({ role: 'assistant', content: m.testo });
      });

      /* LA FINESTRA SI TAGLIA IN MEZZO, MAI IN TESTA.
         Prima era messaggi.slice(-24) e basta. Con una conversazione corta non
         si notava; adesso che l'agente eredita la memoria della chat, superata
         la soglia il taglio si mangiava le prime due righe, cioe' proprio le
         istruzioni e il patto. Quelle si tengono sempre, si accorcia solo la
         conversazione. Il tetto sta sotto i 30 messaggi che il core accetta:
         oltre quel numero /api/chat rifiuta l'intera richiesta. */
      function finestra(tutti) {
        if (tutti.length <= 24) return tutti;
        return tutti.slice(0, 2).concat(tutti.slice(2).slice(-22));
      }

      var risposta = await chiamata('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cfg.modello, local_id: cfg.localId, language: cfg.lingua || 'it-IT',
          messages: finestra(messaggi), temperature: 0.2,
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
      var letto = leggiRisposta(testo);
      if (letto) return letto;

      /* SECONDA E ULTIMA CHIAMATA. Se non ha risposto in JSON gli si rimanda
         indietro cio' che ha scritto, dicendogli senza giri di parole che
         quel formato non serve a niente. I modelli piccoli sbagliano la
         prima volta e azzeccano la seconda: un tentativo costa poco, un
         agente che non usa mai gli strumenti non costa niente perche' non
         lo usa nessuno. */
      messaggi.push({ role: 'assistant', content: testo });
      messaggi.push({ role: 'user', content:
        'Quella risposta non e\u2019 utilizzabile: non era JSON. Rispondi ORA con un solo '
        + 'oggetto JSON e nient\u2019altro. Per usare uno strumento: '
        + '{"strumento":"nome.esatto","args":{...}}. Per rispondere all\u2019utente: {"testo":"..."}. '
        + 'Nessuna spiegazione, nessun blocco di codice, solo l\u2019oggetto.' });

      var due = await chiamata('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cfg.modello, local_id: cfg.localId, language: cfg.lingua || 'it-IT',
          messages: finestra(messaggi), temperature: 0,
          session_id: cfg.sessionId || null, user_email: cfg.email || null,
          access_password: cfg.password || ''
        })
      });
      if (due.ok) {
        var d2 = await due.json();
        var t2 = d2 && d2.choices && d2.choices[0] && d2.choices[0].message
          ? d2.choices[0].message.content : '';
        var l2 = leggiRisposta(t2);
        if (l2) return l2;
      }
      // Si e' rifiutato due volte: si consegna quello che ha detto, ma
      // segnalando che non ha usato gli strumenti invece di far finta.
      return { testo: String(testo || '').replace(/\[LANG:[^\]]*\]/gi, '').trim(),
               senza_strumenti: true };
    };
  }

  /* -------------------------------------------------------------- superficie */
  root.AEGIS_AGENTE = {
    creaCervello: creaCervello,
    offerta: offerta,
    leggiStrumento: leggiStrumento,
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
    _reset: function () { _giri = 0; _log = []; _inAttesa = null; _storia = []; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
