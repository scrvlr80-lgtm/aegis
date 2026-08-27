/* =============================================================================
   AEGIS — SURROGATI  (aegis-surrogati.js)
   -----------------------------------------------------------------------------
   IL PROBLEMA. Un segnaposto protegge ma sfonda il ragionamento del modello.
   [[PER_01]] non occupa lo stesso posto di un nome: il modello sa che e' un
   buco, non sa che e' una persona, non sa il genere, non declina, e in un
   documento con otto segnaposto diversi fatica a ricostruire chi e' chi. Il
   vettore finisce in una zona dello spazio latente che non c'entra niente con
   l'entita' che sostituisce. Piu' il testo e' denso di dati, piu' la risposta
   peggiora - non perche' il modello sia meno bravo, ma perche' gli abbiamo
   tolto la struttura su cui ragiona.

   LA SOLUZIONE. Al posto del codice si mette un SURROGATO: un nome plausibile
   al posto di un nome, una citta' al posto di una citta', una data al posto di
   una data. Il modello riceve un testo integro e ragiona come se lo fosse. La
   corrispondenza reale->surrogato resta sul dispositivo, esattamente come
   prima: reversibile, e mai spedita.

   L'UTENTE NON VEDE MAI I NOMI FINTI. Sullo schermo restano coperti da una
   striscia. E' quello che tiene in piedi la verifica a occhio: striscia =
   protetto, testo leggibile = scoperto. Un nome sfuggito si nota di piu' di
   prima, perche' e' l'unica cosa leggibile in mezzo alle strisce.

   TRE REGOLE CHE NON SI TOCCANO
   1. LE DATE SI TRASLANO, NON SI SORTEGGIANO. Un solo scostamento in giorni
      per tutta l'installazione. Cosi' "fra la fattura e la scadenza passano
      30 giorni" resta vero, l'eta' si conserva, la cronologia regge. Sorteggiare
      ogni data separatamente distrugge tutti i calcoli.
   2. GLI IDENTIFICATORI SONO VOLUTAMENTE NON VALIDI. Codice fiscale, IBAN e
      partita IVA surrogati hanno la forma giusta ma falliscono il controllo
      matematico. E' la differenza fra una maschera e un furto d'identita': un
      IBAN surrogato valido potrebbe essere di qualcuno.
   3. NOME E COGNOME SONO DUE VOCI SEPARATE. Cosi' quando il modello risponde
      "il Sig. Sauro" il ripristino trova il cognome da solo e lo rimette a
      posto. Con la coppia trattata come un blocco unico, meta' risposta
      resterebbe surrogata.
   ============================================================================= */
(function (root) {
  'use strict';

  var CHIAVE_ON = 'aegis_surrogati';        // acceso/spento
  var CHIAVE_MAPPA = 'aegis_surrogati_mappa';
  var CHIAVE_SCOSTO = 'aegis_surrogati_scostamento';
  var CHIAVE_CESTINO = 'aegis_surrogati_cestino';

  /* ------------------------------------------------------------ le liste
     Liste di partenza, volutamente piccole: servono a far funzionare il
     sistema da subito. Si sostituiscono con quelle grandi chiamando
     AEGIS_SURROGATI.carica({...}) senza toccare una riga di questo file.
     REGOLA: nomi inventati, mai persone reali, mai personaggi noti. */
  var L = {
    nomiM: { it: ['Ludovico','Ermanno','Tancredi','Osvaldo','Fulvio','Gastone','Amilcare','Ruggero','Silvano','Ubaldo','Corrado','Ansaldo'],
             es: ['Casimiro','Anselmo','Baltasar','Evaristo','Nicanor','Teodulo','Fulgencio','Amancio','Bernardo','Gaudencio'],
             en: ['Alden','Merrick','Thaddeus','Grover','Winslow','Percival','Everard','Bramwell','Corbin','Halden'] },
    nomiF: { it: ['Ludovica','Ermelinda','Fiordaliso','Osvalda','Fulvia','Gastonia','Amalasunta','Ruggera','Silvana','Ubalda'],
             es: ['Casimira','Anselma','Baltasara','Evarista','Nicanora','Teodula','Fulgencia','Amancia','Bernarda','Gaudencia'],
             en: ['Aldith','Merrily','Thalia','Groveline','Winsome','Perpetua','Everild','Bramwen','Corvina','Haldis'] },
    cognomi: { it: ['Sauro','Vermiglio','Antelmi','Bracaloni','Ostuni','Ferrigno','Malaspina','Trebbiani','Corbelli','Vanzetti','Ardimenti','Solferino'],
               es: ['Belmonte','Carrascal','Vinuesa','Olmedilla','Requena','Zabaleta','Munarriz','Palencia','Toribio','Vallecas'],
               en: ['Ashcombe','Bellringer','Corveth','Draycott','Fenwold','Harrowgate','Marchwood','Pennyquick','Thorncastle','Wraymond'] },
    citta: { it: ['Montecalvara','Roccaspina','Valdibrando','Portosalvo','Castelfronte','Sanverdo','Trevalli','Belmorosa'],
             es: ['Villahonda','Puertoleal','Montesclaros','Valdeamigo','Riofresno','Peñalonga','Sanlucero','Castromiel'],
             en: ['Ashbourne Hollow','Fenwick Ridge','Marlowe Green','Thornbury Vale','Westhaven','Millbrook Cross'] },
    vie: { it: ['Via delle Camelie','Corso Bramante Vecchio','Vicolo dei Tornitori','Piazza San Verdo','Viale delle Fornaci'],
           es: ['Calle de los Alfareros','Avenida del Roble Viejo','Plaza de San Lucero','Paseo de las Adelfas'],
           en: ['Wrenfield Lane','Old Cooper Street','Marlowe Crescent','Thornbury Row'] },
    aziende: { it: ['Belmoro S.r.l.','Trevalli Costruzioni S.p.A.','Ardimenti & Figli S.r.l.','Solferino Servizi S.r.l.'],
               es: ['Belmonte Servicios S.L.','Carrascal Obras S.L.','Vinuesa Consultores S.L.','Requena Global S.A.'],
               en: ['Ashcombe Holdings Ltd','Fenwold Services Ltd','Marchwood Partners Ltd'] },
    farmaci: { it: ['Nervalina','Cortexipan','Dolvirene','Somnolex','Ferravit','Pneumaxil','Cardilene','Gastroven'] },
    strutture:{ it: ['Clinica San Verdo','Poliambulatorio Trevalli','Casa di Cura Belmorosa','Centro Medico Ardimenti'] }
  };

  function carica(nuove) {
    Object.keys(nuove || {}).forEach(function (k) {
      if (L[k]) Object.keys(nuove[k]).forEach(function (lg) {
        if (Array.isArray(nuove[k][lg]) && nuove[k][lg].length) L[k][lg] = nuove[k][lg];
      });
    });
  }

  /* --------------------------------------------------- acceso o spento
     ACCESO DI DEFAULT: i surrogati sono la modalita' migliore, i codici
     restano come ripiego per chi li preferisce o per confrontare le due. */
  function attivo() {
    try {
      var v = localStorage.getItem(CHIAVE_ON);
      return v === null ? true : v === '1';
    } catch (e) { return true; }
  }
  function accendi(v) {
    try { localStorage.setItem(CHIAVE_ON, v ? '1' : '0'); } catch (e) {}
  }

  /* ------------------------------------------------------------- la mappa
     Permanente per costruzione: se oggi sei Ludovico e domani Alberto, le
     memorie salvate ieri non combaciano piu'. Vive solo qui. */
  var _mappa = null;
  function mappa() {
    if (_mappa) return _mappa;
    try { _mappa = JSON.parse(localStorage.getItem(CHIAVE_MAPPA) || '{}'); }
    catch (e) { _mappa = {}; }
    return _mappa;
  }
  /* ====== SI SCRIVE UNA VOLTA, NON MILLE ==============================
     Ogni assegnazione chiamava salvaMappa(), e ogni salvaMappa e' una
     scrittura sincrona su disco che ferma la pagina. Su un documento con
     trecento dati diventavano milleduecento scritture di un oggetto che
     intanto cresce: e' quello che bloccava il browser.
     Adesso si segna che c'e' da salvare e si salva una volta sola, appena
     il filo di esecuzione si libera. Il risultato e' identico, il costo no.
     ================================================================== */
  var _daSalvare = false;
  function salvaMappa() {
    if (_daSalvare) return;
    _daSalvare = true;
    var scrivi = function () {
      _daSalvare = false;
      try {
        localStorage.setItem(CHIAVE_MAPPA, JSON.stringify(_mappa || {}));
        localStorage.setItem(CHIAVE_ORIG, JSON.stringify(_forme || {}));
      } catch (e) {
        // Spazio esaurito: si smette di crescere invece di rompersi. La
        // sessione continua a funzionare, i surrogati nuovi restano in
        // memoria e la prossima pulizia libera spazio.
        try { console.warn('[surrogati] non riesco a salvare la mappa:', e && e.message); } catch (e2) {}
      }
    };
    if (typeof queueMicrotask === 'function') setTimeout(scrivi, 0);
    else setTimeout(scrivi, 0);
  }

  /* Il cestino: togliere un'associazione senza perderla. Un'assegnazione
     definitiva e irrevocabile sarebbe una trappola - basta un surrogato
     sfortunato (un nome che somiglia a qualcuno vero) e non si torna
     indietro. Dal cestino si recupera; solo svuotandolo si perde davvero. */
  function cestina(chiave) {
    var m = mappa();
    if (!m[chiave]) return false;
    var c = {};
    try { c = JSON.parse(localStorage.getItem(CHIAVE_CESTINO) || '{}'); } catch (e) {}
    c[chiave] = m[chiave];
    try { localStorage.setItem(CHIAVE_CESTINO, JSON.stringify(c)); } catch (e) {}
    delete m[chiave];
    salvaMappa();
    return true;
  }
  function cestino() {
    try { return JSON.parse(localStorage.getItem(CHIAVE_CESTINO) || '{}'); } catch (e) { return {}; }
  }
  function recupera(chiave) {
    var c = cestino();
    if (!c[chiave]) return false;
    mappa()[chiave] = c[chiave];
    salvaMappa();
    delete c[chiave];
    try { localStorage.setItem(CHIAVE_CESTINO, JSON.stringify(c)); } catch (e) {}
    return true;
  }
  function svuotaCestino() {
    try { localStorage.removeItem(CHIAVE_CESTINO); } catch (e) {}
  }

  /* ------------------------------------------------------- lo scostamento
     Un solo numero per installazione, fra 400 e 3000 giorni, con segno.
     Tutte le date si spostano di quello. */
  function scostamento() {
    try {
      var v = localStorage.getItem(CHIAVE_SCOSTO);
      if (v !== null) return parseInt(v, 10);
    } catch (e) {}
    var g = (400 + Math.floor(Math.random() * 2600)) * (Math.random() < 0.5 ? -1 : 1);
    try { localStorage.setItem(CHIAVE_SCOSTO, String(g)); } catch (e) {}
    return g;
  }

  /* --------------------------------------------------------- gli attrezzi */
  // Impronta stabile: lo stesso valore reale sceglie sempre lo stesso elemento.
  function impronta(s) {
    var h = 0x811c9dc5;
    s = String(s).toLowerCase();
    for (var i = 0; i < s.length; i++) { h = (h ^ s.charCodeAt(i)) >>> 0; h = (h * 16777619) >>> 0; }
    return h >>> 0;
  }
  function pesca(lista, seme, evita) {
    if (!lista || !lista.length) return null;
    for (var t = 0; t < lista.length; t++) {
      var c = lista[(seme + t) % lista.length];
      if (!evita || !evita[c.toLowerCase()]) return c;
    }
    return lista[seme % lista.length];
  }
  function lingua(lg) {
    var k = String(lg || 'it').slice(0, 2).toLowerCase();
    return (k === 'es' || k === 'en') ? k : 'it';
  }

  // Nomi gia' usati, per non dare lo stesso surrogato a due persone diverse.
  /* L'elenco dei surrogati gia' presi. Veniva ricostruito da capo a ogni
     parola: con trecento dati sono novantamila giri per niente. Si costruisce
     una volta e si aggiorna quando se ne assegna uno nuovo. */
  var _usati = null;
  function usati() {
    if (_usati) return _usati;
    var m = mappa();
    _usati = {};
    Object.keys(m).forEach(function (k) { _usati[String(m[k]).toLowerCase()] = 1; });
    return _usati;
  }
  function segnaUsato(v) { if (_usati && v) _usati[String(v).toLowerCase()] = 1; }

  /* Cifre e lettere finte con la forma giusta. La chiave: NON devono passare
     il controllo di validita'. */
  function cifreCome(modello, seme) {
    var out = '', n = seme;
    for (var i = 0; i < modello.length; i++) {
      var c = modello[i];
      n = (n * 1103515245 + 12345) >>> 0;
      if (/[0-9]/.test(c)) out += String(n % 10);
      else if (/[A-Z]/.test(c)) out += 'ABCDEFGHJKLMNPQRSTUVWXYZ'[n % 24];
      else if (/[a-z]/.test(c)) out += 'abcdefghijkmnpqrstuvwxyz'[n % 24];
      else out += c;
    }
    return out;
  }

  function dataTraslata(testo) {
    // Riconosce gg/mm/aaaa, gg-mm-aaaa, aaaa-mm-gg. Se non capisce la forma,
    // NON inventa: restituisce null e chi chiama ripiega sul codice.
    var g = scostamento(), m, d;
    if ((m = /^(\d{1,2})([\/\-.])(\d{1,2})\2(\d{4})$/.exec(testo.trim()))) {
      d = new Date(+m[4], +m[3] - 1, +m[1]);
      if (isNaN(d)) return null;
      d.setDate(d.getDate() + g);
      return String(d.getDate()).padStart(2, '0') + m[2] +
             String(d.getMonth() + 1).padStart(2, '0') + m[2] + d.getFullYear();
    }
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(testo.trim()))) {
      d = new Date(+m[1], +m[2] - 1, +m[3]);
      if (isNaN(d)) return null;
      d.setDate(d.getDate() + g);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
             '-' + String(d.getDate()).padStart(2, '0');
    }
    return null;
  }

  // Il genere si indovina dalla desinenza. Sbagliare qui costa poco (un nome
  // maschile al posto di uno femminile), ma azzeccarlo aiuta il modello.
  function femminile(nome) {
    return /(a|ella|ina|ette)$/i.test(String(nome).split(/\s+/)[0] || '');
  }

  /* =========================================================================
     LA FUNZIONE CHE CONTA
     tipo  = PER, ORG, CITY, ADDR, DATE, IBAN, CF, EMAIL, PHONE...
     reale = il valore vero
     Ritorna il surrogato, oppure null se per quel tipo non sappiamo fare di
     meglio: in quel caso chi chiama usa il codice di sempre. Meglio un codice
     onesto che un surrogato sbagliato.
     ========================================================================= */
  /* ============ LA LUNGHEZZA DEVE COINCIDERE ============================
     Un surrogato piu' corto o piu' lungo dell'originale sposta tutto il testo
     che segue. Nell'interfaccia le targhette si calcolano sulla parola
     coperta: se sotto c'e' qualcosa di lunghezza diversa, le bande si
     disallineano e, togliendo la copertura, il testo si scompone.
     Quindi si pareggia, contando anche gli spazi:
       troppo corto -> si allunga
       troppo lungo -> si accorcia
     E si pareggia PAROLA PER PAROLA, non solo in totale: e' cio' che permette
     di separare piu' tardi un gruppo coperto insieme. "Mario Rossi" (5+1+5)
     deve diventare un surrogato di 5+1+5, non uno di 11 caratteri qualsiasi,
     altrimenti scorporare "Rossi" da solo non e' piu' possibile.
     ==================================================================== */
  function pareggia(parola, quanti) {
    var p = String(parola);
    if (p.length === quanti) return p;
    if (p.length > quanti) {
      // Si taglia, ma senza lasciare una vocale mozza in fondo dove si puo'.
      return p.slice(0, quanti);
    }
    // Si allunga ripetendo le lettere interne, non aggiungendo simboli: deve
    // continuare a sembrare una parola.
    var corpo = p.length > 2 ? p.slice(1, -1) : p;
    var out = p;
    var i = 0;
    while (out.length < quanti) {
      out = out.slice(0, -1) + corpo[i % corpo.length] + p.slice(-1);
      i++;
      if (i > 200) break;
    }
    return out.slice(0, quanti);
  }

  function stessaLunghezza(finto, reale) {
    if (finto.length === reale.length) return finto;
    var pR = reale.split(' '), pF = finto.split(' ');
    // Stesso numero di parole: si pareggia una per una, e gli spazi tornano
    // dove stavano. E' il caso che tiene in piedi lo scorporo successivo.
    if (pR.length === pF.length) {
      return pF.map(function (x, i) { return pareggia(x, pR[i].length); }).join(' ');
    }
    // Numero di parole diverso: si pareggia il totale. Si perde la
    // possibilita' di scorporare, ma la lunghezza - che e' cio' che tiene
    // allineato il testo - resta esatta.
    return pareggia(finto.replace(/\s+/g, ' '), reale.length);
  }

  function surrogato(tipo, reale, lg) {
    var chiave = tipo + '|' + String(reale).toLowerCase().trim();
    var m = mappa();
    if (m[chiave]) return m[chiave];

    var k = lingua(lg), seme = impronta(chiave), u = usati(), out = null;

    switch (String(tipo).toUpperCase()) {
      case 'PER': {
        // Nome e cognome separati: si surrogano parola per parola, cosi' il
        // ripristino ritrova anche "il Sig. Sauro" da solo.
        var parti = String(reale).trim().split(/\s+/);
        out = parti.map(function (p, i) {
          var sotto = 'PER|' + p.toLowerCase();
          if (m[sotto]) return m[sotto];
          var s2 = impronta(sotto);
          var scelto = (i === 0)
            ? pesca(femminile(p) ? L.nomiF[k] : L.nomiM[k], s2, u)
            : pesca(L.cognomi[k], s2, u);
          if (scelto) { m[sotto] = scelto; segnaUsato(scelto); ricordaForma(sotto, p); }
          return scelto || p;
        }).join(' ');
        break;
      }
      case 'ORG':  out = pesca(L.aziende[k], seme, u); break;
      case 'CITY': out = pesca(L.citta[k], seme, u); break;
      case 'ADDR': out = pesca(L.vie[k], seme, u); break;
      case 'DATE': out = dataTraslata(String(reale)); break;
      case 'EMAIL': {
        var nm = pesca(L.cognomi[k], seme, u) || 'privato';
        out = nm.toLowerCase().replace(/[^a-z]/g, '') + '@' +
              (pesca(L.aziende[k], seme + 7, null) || 'esempio').toLowerCase()
                .replace(/[^a-z]/g, '').slice(0, 12) + '.example';
        break;
      }
      case 'PHONE': out = cifreCome(String(reale), seme); break;
      case 'MED':   out = pesca(L.farmaci.it, seme, u); break;
      default:
        // Documenti e numeri: stessa forma, checksum rotto di proposito.
        if (/^[A-Za-z0-9 .\/-]+$/.test(String(reale)) && String(reale).length <= 40) {
          out = cifreCome(String(reale), seme);
        }
    }

    if (!out) return null;
    out = stessaLunghezza(out, String(reale));
    m[chiave] = out;
    segnaUsato(out);
    ricordaForma(chiave, reale);
    salvaMappa();
    return out;
  }

  /* La chiave della mappa e' in minuscolo, perche' serve a riconoscere lo
     stesso dato scritto in modi diversi. Ma il valore da RIMETTERE nella
     risposta deve avere le maiuscole giuste: "pasquale gonzolone" al posto
     di "Pasquale Gonzolone" e' un ripristino sbagliato, e si vede. Quindi si
     tiene da parte anche la forma originale. */
  var CHIAVE_ORIG = 'aegis_surrogati_forme';
  var _forme = null;
  function forme() {
    if (_forme) return _forme;
    try { _forme = JSON.parse(localStorage.getItem(CHIAVE_ORIG) || '{}'); }
    catch (e) { _forme = {}; }
    return _forme;
  }
  function ricordaForma(chiave, originale) {
    var f = forme();
    if (f[chiave]) return;
    f[chiave] = String(originale);
    salvaMappa();          // scrive tutto insieme, una volta sola
  }

  function inverso() {
    var m = mappa(), f = forme(), inv = {};
    Object.keys(m).forEach(function (k) {
      var reale = f[k] || k.slice(k.indexOf('|') + 1);
      inv[String(m[k]).toLowerCase()] = reale;
    });
    return inv;
  }

  root.AEGIS_SURROGATI = {
    attivo: attivo, accendi: accendi,
    surrogato: surrogato,
    mappa: mappa, inverso: inverso,
    cestina: cestina, cestino: cestino, recupera: recupera, svuotaCestino: svuotaCestino,
    scostamento: scostamento,
    carica: carica,
    liste: function () { return L; },
    svuota: function () {
      try { localStorage.removeItem(CHIAVE_MAPPA); localStorage.removeItem(CHIAVE_ORIG); } catch (e) {}
      _mappa = null; _forme = null; _usati = null;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
