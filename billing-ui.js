/* =============================================================================
   BILLING UI — barra di consumo, fasce, loghi
   -----------------------------------------------------------------------------
   COSA FA
     Sostituisce il contenuto del <select id="ag-model"> con i modelli che il
     SERVER dichiara consentiti, ognuno col logo della casa produttrice, e
     aggiunge sotto una barra che dice quanto credito resta - in messaggi, non
     in token, perche' i token non vogliono dire niente a nessuno.

   COSA NON FA
     Non decide niente. La fascia, il credito e il permesso li stabilisce il
     server: qui si mostra soltanto. Se questo file non carica, il <select>
     resta quello di sempre con le sue due voci e la chat funziona identica.

   LOGHI IN SVG INLINE, MAI DA UN CDN.
     Un logo caricato da un dominio esterno e' una richiesta di rete a ogni
     render, cioe' esattamente cio' che questa applicazione promette di non
     fare. Sono disegnati qui, pesano poche centinaia di byte e funzionano
     anche senza connessione.
   ========================================================================== */
(function () {
    'use strict';

    var API = (window.AEGIS_BACKEND || 'https://chatbot-backend-dev.onrender.com');
    var stato = null;
    var aggiornamentoInCorso = false;

    /* ------------------------------------------------------------- loghi */
    var LOGHI = {
        openai:
            '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">' +
            '<path fill="currentColor" d="M12 2.4a4.3 4.3 0 0 1 3.7 2.13l3.02 5.23a4.3 4.3 0 0 1 0 4.3l-3.02 5.23A4.3 4.3 0 0 1 12 21.6a4.3 4.3 0 0 1-3.7-2.13l-3.02-5.23a4.3 4.3 0 0 1 0-4.3L8.3 4.53A4.3 4.3 0 0 1 12 2.4Zm0 2.2a2.1 2.1 0 0 0-1.8 1.04L7.18 10.9a2.1 2.1 0 0 0 0 2.1l3.02 5.26a2.1 2.1 0 0 0 3.6 0l3.02-5.26a2.1 2.1 0 0 0 0-2.1L13.8 5.64A2.1 2.1 0 0 0 12 4.6Z"/>' +
            '</svg>',
        deepseek:
            '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">' +
            '<path fill="currentColor" d="M4 12c0-4.42 3.58-8 8-8 3.1 0 5.8 1.77 7.11 4.35a1 1 0 0 1-1.78.9A5.98 5.98 0 0 0 12 6a6 6 0 1 0 5.66 8h-3.16a1 1 0 1 1 0-2h4.5a1 1 0 0 1 1 1c0 4.42-3.58 8-8 8s-8-3.58-8-8Z"/>' +
            '<circle fill="currentColor" cx="12" cy="12" r="2.2"/>' +
            '</svg>'
    };
    function logo(p) { return LOGHI[p] || LOGHI.openai; }

    // LOGHI REALI: gli URL arrivano dal server insieme al listino, quindi
    // cambiarli non richiede di toccare questo file. Se l'immagine non carica
    // (rete assente, file spostato) si torna al disegno vettoriale qui sopra:
    // il selettore non resta mai con un riquadro rotto.
    function immagineLogo(provider, etichetta) {
        var url = (stato && stato.loghi) ? stato.loghi[provider] : null;
        if (!url) return logo(provider);
        return '<img src="' + url + '" alt="' + String(etichetta || provider).replace(/"/g, '') + '" ' +
            'width="14" height="14" loading="lazy" decoding="async" ' +
            'style="display:block;border-radius:3px;object-fit:contain" ' +
            'onerror="this.replaceWith(document.createRange().createContextualFragment(' +
            "'" + logo(provider).replace(/'/g, "\\'") + "'" + '))">';
    }

    /* -------------------------------------------------------------- stile */
    function stile() {
        if (document.getElementById('ag-billing-css')) return;
        var s = document.createElement('style');
        s.id = 'ag-billing-css';
        s.textContent =
            '.ag-bill{padding:8px 22px 2px;font-family:Inter,sans-serif;flex:none}' +
            '.ag-bill-riga{display:flex;align-items:center;gap:10px;margin-bottom:6px}' +
            '.ag-bill-et{font-size:10.5px;color:#6e6e73;white-space:nowrap;min-width:74px}' +
            '.ag-bill-tr{position:relative;flex:1 1 auto;height:6px;border-radius:4px;' +
            'background:rgba(127,127,127,.18);overflow:hidden;min-width:70px}' +
            '.ag-bill-in{position:absolute;inset:0 auto 0 0;width:0;border-radius:4px;' +
            'background:#d9a03a;transition:width .5s ease}' +
            '.ag-bill-riga.allarme .ag-bill-in{background:#c4562f}' +
            '.ag-bill-riga.pieno .ag-bill-in{background:#b03030}' +
            '.ag-bill-pct{font-size:10.5px;color:#6e6e73;white-space:nowrap;min-width:62px;' +
            'text-align:right;font-variant-numeric:tabular-nums}' +
            '.ag-bill-nota{font-size:10px;color:#6e6e73;opacity:.85;padding-left:84px;margin-top:-2px}' +
            '.ag-mopt{display:flex;align-items:center;gap:6px}' +
            /* cerchio account */
            '.ag-acc-cerchio{width:29px;height:29px;border-radius:50%;border:0;color:#fff;' +
            'font:600 12px/1 Inter,sans-serif;cursor:pointer;display:inline-flex;' +
            'align-items:center;justify-content:center;letter-spacing:.01em}' +
            '.ag-acc-cerchio:hover{filter:brightness(1.12)}' +
            '.ag-acc-cerchio:focus-visible{outline:2px solid currentColor;outline-offset:2px}' +
            '.ag-acc-cerchio.grande{width:36px;height:36px;font-size:14px}' +
            '.ag-acc-menu{position:fixed;z-index:3000;min-width:236px;background:#fff;' +
            'border:1px solid rgba(0,0,0,.1);border-radius:12px;padding:6px;' +
            'box-shadow:0 10px 34px rgba(0,0,0,.16);font-family:Inter,sans-serif}' +
            '.ag-acc-testa{display:flex;gap:10px;align-items:center;padding:9px 10px 11px;' +
            'border-bottom:1px solid rgba(0,0,0,.07);margin-bottom:5px}' +
            '.ag-acc-mail{font-size:12.5px;font-weight:600;color:#1d1d1f;word-break:break-all}' +
            '.ag-acc-piano{font-size:10.5px;color:#6e6e73;text-transform:uppercase;' +
            'letter-spacing:.07em;margin-top:2px}' +
            '.ag-acc-voce{display:block;width:100%;text-align:left;border:0;background:transparent;' +
            'padding:9px 10px;border-radius:8px;font:400 13px Inter,sans-serif;color:#1d1d1f;' +
            'cursor:pointer}' +
            '.ag-acc-voce:hover{background:rgba(0,0,0,.05)}' +
            '.ag-acc-voce.esci{color:#b03030}' +
            /* consumi nelle impostazioni */
            '.ag-uso-fin{display:flex;flex-direction:column;gap:9px;margin-bottom:13px}' +
            '.ag-uso-fet{font-size:10.5px;color:#6e6e73;margin-bottom:3px}' +
            '.ag-uso-ftr{height:6px;border-radius:4px;background:rgba(127,127,127,.18);overflow:hidden}' +
            '.ag-uso-ftr i{display:block;height:100%;border-radius:4px;background:#d9a03a}' +
            '.ag-uso-fp{font-size:10px;color:#6e6e73;margin-top:3px}' +
            '.ag-uso-tot{display:flex;gap:16px;padding:11px 0;margin-bottom:9px;' +
            'border-top:1px solid rgba(0,0,0,.07);border-bottom:1px solid rgba(0,0,0,.07)}' +
            '.ag-uso-tot div{display:flex;flex-direction:column;gap:1px}' +
            '.ag-uso-tot b{font-size:16px;font-weight:600;font-variant-numeric:tabular-nums}' +
            '.ag-uso-tot i{font-style:normal;font-size:10px;color:#6e6e73;letter-spacing:.04em}' +
            '.ag-uso-lista{display:flex;flex-direction:column;gap:7px}' +
            '.ag-uso-riga{display:flex;align-items:center;gap:9px;font-size:11.5px}' +
            '.ag-uso-nome{flex:0 0 108px;color:#1d1d1f;overflow:hidden;text-overflow:ellipsis;' +
            'white-space:nowrap}' +
            '.ag-uso-tr{flex:1 1 auto;height:5px;border-radius:3px;' +
            'background:rgba(127,127,127,.16);overflow:hidden;min-width:36px}' +
            '.ag-uso-tr i{display:block;height:100%;border-radius:3px;background:#5a7d9a}' +
            '.ag-uso-n{color:#6e6e73;min-width:52px;text-align:right;font-variant-numeric:tabular-nums}' +
            '.ag-uso-p{color:#6e6e73;min-width:32px;text-align:right;font-variant-numeric:tabular-nums}';
        document.head.appendChild(s);
    }
    /* --------------------------------------------------------- selettore */
    // Il <select> nativo non accetta SVG dentro <option>: il logo va nel
    // testo come carattere, oppure si costruisce un menu proprio. Qui si
    // resta sul <select> nativo - e' quello che c'e' gia', funziona su
    // mobile e non introduce un componente nuovo da mantenere - e il logo
    // viene mostrato accanto al selettore, seguendo il modello scelto.
    function riempiSelettore() {
        var sel = document.getElementById('ag-model');
        if (!sel || !stato || !stato.modelli || !stato.modelli.length) return;

        var precedente = sel.value;
        var perFascia = {};
        stato.modelli.forEach(function (m) {
            (perFascia[m.fascia] = perFascia[m.fascia] || []).push(m);
        });

        sel.innerHTML = '';
        Object.keys(perFascia).sort().forEach(function (f) {
            var info = (stato.fasce && stato.fasce[f]) || {};
            var g = document.createElement('optgroup');
            g.label = (info.nome || ('Fascia ' + f));
            perFascia[f].forEach(function (m) {
                var o = document.createElement('option');
                o.value = m.id;
                // Un modello non consentito resta VISIBILE ma disabilitato:
                // nasconderlo non farebbe capire che esiste un piano superiore.
                o.disabled = !m.consentito;
                o.textContent = m.etichetta + (m.consentito ? '' : '  \u2014  richiede piano');
                o.setAttribute('data-provider', m.provider);
                g.appendChild(o);
            });
            sel.appendChild(g);
        });

        // Si prova a restare sul modello di prima; se non e' piu' consentito
        // si scende sul primo disponibile invece di lasciare una scelta morta.
        var ok = stato.modelli.filter(function (m) { return m.consentito; });
        var trovato = ok.some(function (m) { return m.id === precedente; });
        sel.value = trovato ? precedente : (ok.length ? ok[0].id : sel.value);
        disegnaLogo();
    }

    function disegnaLogo() {
        var sel = document.getElementById('ag-model');
        if (!sel || !stato) return;
        var m = (stato.modelli || []).filter(function (x) { return x.id === sel.value; })[0];
        var cont = document.getElementById('ag-model-logo');
        if (!cont) {
            cont = document.createElement('span');
            cont.id = 'ag-model-logo';
            cont.style.cssText = 'display:inline-flex;align-items:center;margin-right:4px;vertical-align:middle';
            if (sel.parentNode) sel.parentNode.insertBefore(cont, sel);
        }
        cont.innerHTML = m ? immagineLogo(m.provider, m.etichetta) : '';
        cont.title = m ? m.etichetta : '';
    }

    /* ------------------------------------------------------------- barra
       DUE FINESTRE, come quelle che l'utente ha gia' visto altrove: la
       sessione, che si ripristina in poche ore, e la settimana. Non si mostra
       ne' denaro ne' token - non dicono niente a nessuno - ma la percentuale e
       quando torna disponibile, che e' l'unica cosa utile da sapere.
       Compare SOLO a chi ha un piano a pagamento: a chi e' in prova direbbe
       soltanto quanto poco ha.
       ------------------------------------------------------------------- */
    function barra() {
        var b = document.getElementById('ag-bill');
        if (!b) {
            var ancora = document.getElementById('ag-barra-campo')
                || document.getElementById('chat-input-wrapper');
            if (!ancora || !ancora.parentNode) return null;
            b = document.createElement('div');
            b.id = 'ag-bill';
            b.className = 'ag-bill';
            ancora.parentNode.insertBefore(b, ancora.nextSibling);
        }
        return b;
    }

    function quando(ts) {
        if (!ts) return '';
        var m = Math.max(0, Math.round((ts - Date.now()) / 60000));
        if (m < 1) return 'a momenti';
        if (m < 60) return 'fra ' + m + ' min';
        var h = Math.floor(m / 60), r = m % 60;
        if (h < 24) return 'fra ' + h + ' h' + (r ? ' ' + r + ' min' : '');
        return 'fra ' + Math.round(h / 24) + ' giorni';
    }

    function riga(etichetta, f, tetti) {
        if (!f) return '';
        var pct = Math.max(0, Math.min(100, f.pct || 0));
        var cls = pct >= (tetti.blocco_pct || 100) ? 'pieno'
                : (pct >= (tetti.allarme_pct || 90) ? 'allarme' : '');
        return '<div class="ag-bill-riga ' + cls + '">' +
            '<span class="ag-bill-et">' + etichetta + '</span>' +
            '<span class="ag-bill-tr"><span class="ag-bill-in" style="width:' +
                pct.toFixed(1) + '%"></span></span>' +
            '<span class="ag-bill-pct">' + Math.round(pct) + '% usato</span>' +
            '</div>' +
            (pct >= (tetti.avviso_pct || 75) && f.reset_ts
                ? '<div class="ag-bill-nota">Si ripristina ' + quando(f.reset_ts) + '</div>' : '');
    }

    function disegnaBarra() {
        var b = document.getElementById('ag-bill');
        if (!stato || !stato.barra_visibile) { if (b) b.remove(); return; }
        b = barra();
        if (!b) return;
        var t = stato.tetti || {};
        b.innerHTML = riga('Sessione', stato.sessione, t) + riga('Settimana', stato.settimana, t);
    }

    /* ===================== CERCHIO DELL'ACCOUNT =========================
       L'utente entra con Google e poi non ha nessun modo di uscire: la sessione
       resta finche' non svuota il browser. Su un computer condiviso vuol dire
       che il prossimo che apre la pagina e' lui.
       Il cerchio mostra l'iniziale dell'indirizzo; premendolo si apre un
       riquadro con l'email intera, il piano, e l'uscita.
       ==================================================================== */
    function iniziale(em) {
        var t = String(em || '?').trim();
        return (t.charAt(0) || '?').toUpperCase();
    }

    function coloreDa(em) {
        // Colore stabile ricavato dall'indirizzo: la stessa persona ha sempre
        // lo stesso cerchio, e si riconosce senza leggere.
        var h = 0, t = String(em || '');
        for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 360;
        return 'hsl(' + h + ', 42%, 42%)';
    }

    function disegnaAccount() {
        var host = document.getElementById('ag-account');
        if (!host) return;
        var em = emailCorrente();
        if (!em) { host.innerHTML = ''; return; }

        host.innerHTML =
            '<button type="button" class="ag-acc-cerchio" id="ag-acc-btn" ' +
            'title="' + em + '" aria-haspopup="true" aria-expanded="false" ' +
            'style="background:' + coloreDa(em) + '">' + iniziale(em) + '</button>';

        document.getElementById('ag-acc-btn').addEventListener('click', function (e) {
            e.stopPropagation();
            apriMenuAccount(em);
        });
    }

    function apriMenuAccount(em) {
        var vecchio = document.getElementById('ag-acc-menu');
        if (vecchio) { vecchio.remove(); return; }

        var piano = stato && stato.piano_etichetta ? stato.piano_etichetta : '';
        var m = document.createElement('div');
        m.id = 'ag-acc-menu';
        m.className = 'ag-acc-menu';
        m.innerHTML =
            '<div class="ag-acc-testa">' +
                '<span class="ag-acc-cerchio grande" style="background:' + coloreDa(em) + '">' +
                    iniziale(em) + '</span>' +
                '<div><div class="ag-acc-mail">' + em + '</div>' +
                (piano ? '<div class="ag-acc-piano">' + piano + '</div>' : '') + '</div>' +
            '</div>' +
            '<button type="button" class="ag-acc-voce" id="ag-acc-consumi">I miei consumi</button>' +
            '<button type="button" class="ag-acc-voce esci" id="ag-acc-esci">Esci</button>';
        document.body.appendChild(m);

        var b = document.getElementById('ag-acc-btn');
        var r = b.getBoundingClientRect();
        m.style.top = (r.bottom + 8) + 'px';
        // Si tiene dentro la finestra anche su schermo stretto.
        m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - m.offsetWidth - 8)) + 'px';
        b.setAttribute('aria-expanded', 'true');

        document.getElementById('ag-acc-esci').addEventListener('click', esci);
        document.getElementById('ag-acc-consumi').addEventListener('click', function () {
            m.remove();
            var g = document.getElementById('ag-opzioni-btn');
            if (g) g.click();
        });

        setTimeout(function () {
            document.addEventListener('click', chiudiMenu, { once: true });
        }, 0);
    }

    function chiudiMenu() {
        var m = document.getElementById('ag-acc-menu');
        if (m) m.remove();
        var b = document.getElementById('ag-acc-btn');
        if (b) b.setAttribute('aria-expanded', 'false');
    }

    /* USCITA. Si toglie la sessione E la prova di consenso persistente:
       lasciare la seconda vorrebbe dire che al ricaricamento si rientra da
       soli, cioe' non essere usciti affatto. Si dice a Google di non
       riselezionare l'account, altrimenti il suo accesso automatico rifa'
       il login prima ancora che l'utente veda la schermata. */
    function esci() {
        if (!confirm('Uscire da questo dispositivo?')) return;
        try {
            sessionStorage.removeItem('chat_user_email');
            localStorage.removeItem('gdpr_consent_email');
            localStorage.removeItem('gdpr_accepted');
        } catch (e) {}
        try {
            if (window.google && google.accounts && google.accounts.id) {
                google.accounts.id.disableAutoSelect();
            }
        } catch (e) {}
        location.reload();
    }

    /* ================== CONSUMI DENTRO LE IMPOSTAZIONI ==================
       Dove l'utente li cerca: nelle impostazioni, non in un angolo. Si mostrano
       messaggi e token per modello, e quanta parte della quota ha preso
       ciascuno. Non si mostra denaro: il costo che paghi tu non e' il prezzo
       che paga lui, e confonderli sarebbe disonesto.
       ==================================================================== */
    var usoCache = null;

    async function riempiConsumi() {
        var box = document.getElementById('ag-op-consumi');
        if (!box) return;
        if (!stato || stato.anonimo) { box.innerHTML = ''; return; }

        box.innerHTML = '<h4>Consumi</h4><p class="ag-op-nota">Lettura in corso…</p>';
        try {
            var r = await fetch(API + '/api/billing/usage?giorni=7&email=' +
                encodeURIComponent(emailCorrente()));
            usoCache = await r.json();
        } catch (e) {
            box.innerHTML = '<h4>Consumi</h4><p class="ag-op-nota">Non disponibili ora.</p>';
            return;
        }

        var t = usoCache.totale || { messaggi: 0, tokens: 0 };
        var h = '<h4>Consumi · ultimi 7 giorni</h4>';

        if (stato.barra_visibile && (stato.sessione || stato.settimana)) {
            h += '<div class="ag-uso-fin">' +
                 finestraHtml('Sessione', stato.sessione) +
                 finestraHtml('Settimana', stato.settimana) + '</div>';
        }

        h += '<div class="ag-uso-tot">' +
             '<div><b>' + t.messaggi + '</b><i>messaggi</i></div>' +
             '<div><b>' + numeroBreve(t.tokens) + '</b><i>token</i></div>' +
             '<div><b>' + (usoCache.modelli || []).length + '</b><i>modelli usati</i></div>' +
             '</div>';

        if (!(usoCache.modelli || []).length) {
            h += '<p class="ag-op-nota">Ancora nessun messaggio in questo periodo.</p>';
        } else {
            h += '<div class="ag-uso-lista">' + usoCache.modelli.map(function (m) {
                return '<div class="ag-uso-riga">' +
                    '<span class="ag-uso-nome">' + m.etichetta + '</span>' +
                    '<span class="ag-uso-tr"><i style="width:' + Math.max(2, m.quota_pct).toFixed(1) + '%"></i></span>' +
                    '<span class="ag-uso-n">' + m.messaggi + ' msg</span>' +
                    '<span class="ag-uso-p">' + Math.round(m.quota_pct) + '%</span>' +
                    '</div>';
            }).join('') + '</div>' +
            '<p class="ag-op-nota">La percentuale dice quanta parte della quota ' +
            'ha preso ciascun modello. I piu' + '\u2019 potenti consumano di piu' + '\u2019 a parita' + '\u2019 di messaggi.</p>';
        }
        box.innerHTML = h;
    }

    function finestraHtml(et, f) {
        if (!f) return '';
        var pct = Math.max(0, Math.min(100, f.pct || 0));
        return '<div class="ag-uso-f">' +
            '<div class="ag-uso-fet">' + et + '</div>' +
            '<div class="ag-uso-ftr"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
            '<div class="ag-uso-fp">' + Math.round(pct) + '% usato' +
            (f.reset_ts ? ' \u00b7 torna ' + quando(f.reset_ts) : '') + '</div></div>';
    }

    function numeroBreve(n) {
        n = Number(n || 0);
        if (n >= 1e6) return (n / 1e6).toFixed(1) + ' M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + ' k';
        return String(n);
    }

    /* ------------------------------------------------------------ lettura */
    function emailCorrente() {
        try {
            return (window.safeStorage && window.safeStorage.getSession('chat_user_email'))
                || sessionStorage.getItem('chat_user_email') || '';
        } catch (e) { return ''; }
    }

    async function aggiorna() {
        if (aggiornamentoInCorso) return;
        aggiornamentoInCorso = true;
        try {
            var em = emailCorrente();
            var r = await fetch(API + '/api/billing/state?email=' + encodeURIComponent(em));
            var d = await r.json();
            if (!d || d.errore) return;
            stato = d;
            riempiSelettore();
            disegnaBarra();
            disegnaAccount();
        } catch (e) {
            // Silenzio voluto: senza billing l'applicazione deve restare intera.
        } finally {
            aggiornamentoInCorso = false;
        }
    }

    /* ---------------------------------------------------------- aggancio */
    function avvia() {
        stile();
        aggiorna();
        var sel = document.getElementById('ag-model');
        if (sel) sel.addEventListener('change', function () { disegnaLogo(); disegnaBarra(); });

        // Il pannello impostazioni si ricostruisce a ogni apertura: il riquadro
        // dei consumi va riempito dopo, non prima.
        var ing = document.getElementById('ag-opzioni-btn');
        if (ing) ing.addEventListener('click', function () { setTimeout(riempiConsumi, 60); });
        // Dopo ogni risposta il consumo e' cambiato: si rilegge.
        document.addEventListener('aegis-risposta', aggiorna);
        setInterval(aggiorna, 60000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', avvia);
    } else {
        avvia();
    }

    window.AEGIS_BILLING = {
        aggiorna: aggiorna,
        get stato() { return stato; },
        // Il frontend puo' segnalare la fine di un turno per aggiornare subito
        // la barra invece di aspettare il giro da 60 secondi.
        segnalaTurno: function () { aggiorna(); }
    };
})();
