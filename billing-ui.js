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
        // L'ATTRIBUTO onerror NON PUO' CONTENERE UN SVG. Il disegno di ripiego ha
        // virgolette dentro: infilato in onerror="..." chiudeva l'attributo a
        // meta' e il resto ( ')">  ) finiva stampato accanto a ogni modello.
        // Ora l'immagine porta solo un contrassegno e il ripiego lo aggancia
        // codice vero, dove le virgolette non danno fastidio a nessuno.
        return '<img src="' + url + '" alt="' + String(etichetta || provider).replace(/[<>"]/g, '') + '" ' +
            'width="14" height="14" loading="lazy" decoding="async" data-logo="' + provider + '" ' +
            'style="display:block;border-radius:3px;object-fit:contain">';
    }

    // Dopo ogni disegno: le immagini che non caricano tornano al vettoriale.
    function agganciaRipieghi(radice) {
        var imgs = (radice || document).querySelectorAll('img[data-logo]:not([data-agganciato])');
        Array.prototype.forEach.call(imgs, function (im) {
            im.setAttribute('data-agganciato', '1');
            im.addEventListener('error', function () {
                var sp = document.createElement('span');
                sp.style.cssText = 'display:inline-flex;align-items:center';
                sp.innerHTML = logo(im.getAttribute('data-logo'));
                if (im.parentNode) im.parentNode.replaceChild(sp, im);
            });
        });
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
            /* selettore dei modelli: menu proprio, perche' un <select> nativo
               non accetta ne' immagini ne' distintivi dentro le <option> */
            '.ag-msel{position:relative;display:inline-flex}' +
            /* .lang-change-btn ha width:100px FISSO: il nome del modello non ci
               stava e finiva sopra NUEVO CHAT. Qui la larghezza segue il
               contenuto, il resto (cornice, altezza, tipo) resta identico agli
               altri pulsanti della riga. */
            '.ag-msel{flex:none}' +
            '.ag-msel-btn{width:auto!important;min-width:0;max-width:none;height:32px;' +
            'padding:0 11px;gap:8px;justify-content:flex-start;white-space:nowrap;overflow:visible}' +
            '.ag-msel-btn img,.ag-msel-btn > svg{flex:none}' +
            '.ag-msel-btn > svg{margin-left:1px;opacity:.75}' +
            '.ag-msel-btn img,.ag-msel-btn svg{flex:none}' +
            '.ag-msel-menu{position:fixed;z-index:3000;min-width:262px;max-height:64vh;overflow-y:auto;' +
            'background:#fff;border:1px solid rgba(0,0,0,.1);border-radius:12px;padding:6px;' +
            'box-shadow:0 10px 34px rgba(0,0,0,.16);font-family:Inter,sans-serif}' +
            '.ag-msel-gr{font-size:9.5px;letter-spacing:.07em;text-transform:uppercase;color:#8b8b90;' +
            'padding:9px 10px 4px}' +
            '.ag-msel-voce{display:flex;width:100%;align-items:center;gap:9px;border:0;background:transparent;' +
            'padding:8px 10px;border-radius:8px;cursor:pointer;text-align:left;font:400 13px Inter,sans-serif;' +
            'color:#1d1d1f}' +
            '.ag-msel-voce:hover:not(:disabled){background:rgba(0,0,0,.05)}' +
            '.ag-msel-voce[data-ok="0"] .ag-msel-nome{color:#8b8b90}' +
            '.ag-msel-voce.scelto{background:rgba(0,113,227,.09)}' +
            '.ag-msel-nome{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
            '.ag-msel-eti{white-space:nowrap;letter-spacing:1px}' +
            '.ag-msel-fs{font:400 9.5px Inter,sans-serif;color:#8b8b90;text-transform:none;' +
            'letter-spacing:0;white-space:nowrap;text-transform:none;font-family:Inter,sans-serif}' +
            /* CONSUMO: bottone nelle impostazioni + finestra dedicata */
            '.ag-cs-btn{display:flex;width:100%;align-items:center;justify-content:space-between;gap:8px;' +
            'padding:11px 13px;border:1px solid rgba(0,0,0,.12);border-radius:10px;background:transparent;' +
            'cursor:pointer;font:700 10px Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase;' +
            'color:#4a4a50}' +
            '.ag-cs-btn:hover{background:rgba(0,0,0,.035)}' +
            '.ag-cs-btn i{font-style:normal;font-weight:400;font-size:10.5px;letter-spacing:0;' +
            'text-transform:none;color:#8b8b90;font-variant-numeric:tabular-nums}' +
            '.ag-cs-velo{position:fixed;inset:0;background:rgba(20,20,22,.5);z-index:4200}' +
            '.ag-cs{position:fixed;z-index:4201;left:50%;top:50%;transform:translate(-50%,-50%);' +
            'width:min(640px,94vw);max-height:86vh;overflow-y:auto;background:#fff;border-radius:16px;' +
            'padding:28px 30px 32px;font-family:Inter,sans-serif;box-shadow:0 24px 70px rgba(0,0,0,.3)}' +
            '.ag-cs-x{position:absolute;top:16px;right:18px;border:0;background:transparent;font-size:22px;' +
            'line-height:1;color:#8b8b90;cursor:pointer;padding:4px 8px}' +
            '.ag-cs h3{margin:0 0 22px;font-size:17px;font-weight:600;color:#1d1d1f}' +
            '.ag-cs h3 span{font-weight:400;color:#8b8b90;font-size:14px;margin-left:7px}' +
            '.ag-cs h4{margin:26px 0 14px;font-size:14.5px;font-weight:600;color:#1d1d1f}' +
            '.ag-cs-f{display:grid;grid-template-columns:1fr 260px auto;gap:16px;align-items:center;' +
            'margin-bottom:16px}' +
            '@media(max-width:620px){.ag-cs-f{grid-template-columns:1fr;gap:6px}}' +
            '.ag-cs-f b{display:block;font-size:13.5px;font-weight:500;color:#1d1d1f}' +
            '.ag-cs-f small{display:block;font-size:11.5px;color:#8b8b90;margin-top:2px}' +
            '.ag-cs-tr{height:7px;border-radius:4px;background:#dbe7f6;overflow:hidden}' +
            '.ag-cs-tr i{display:block;height:100%;border-radius:4px;background:#2f6fd0;transition:width .5s}' +
            '.ag-cs-f.alto .ag-cs-tr i{background:#c98a1e}' +
            '.ag-cs-f.pieno .ag-cs-tr i{background:#b03030}' +
            '.ag-cs-pct{font-size:12.5px;color:#4a4a50;white-space:nowrap;' +
            'font-variant-numeric:tabular-nums}' +
            '.ag-cs-info{display:flex;gap:10px;padding:13px 15px;border:1px solid rgba(0,0,0,.1);' +
            'border-radius:11px;background:rgba(0,0,0,.02);margin-bottom:18px}' +
            '.ag-cs-info p{margin:0;font-size:11.5px;line-height:1.55;color:#4a4a50}' +
            '.ag-cs-mod{display:flex;flex-direction:column;gap:11px}' +
            '.ag-cs-m{display:grid;grid-template-columns:1fr 260px auto;gap:16px;align-items:center}' +
            '@media(max-width:620px){.ag-cs-m{grid-template-columns:1fr;gap:5px}}' +
            '.ag-cs-mn{display:flex;align-items:center;gap:8px;font-size:13px;color:#1d1d1f;min-width:0}' +
            '.ag-cs-mn span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
            '.ag-cs-mn small{color:#8b8b90;font-size:11px;white-space:nowrap}' +
            '.ag-cs-agg{margin-top:24px;padding-top:16px;border-top:1px solid rgba(0,0,0,.09);' +
            'display:flex;align-items:center;gap:8px;font-size:11.5px;color:#8b8b90}' +
            '.ag-cs-agg button{border:0;background:transparent;cursor:pointer;color:#6e6e73;' +
            'font-size:14px;padding:2px 5px;border-radius:6px}' +
            '.ag-cs-agg button:hover{background:rgba(0,0,0,.06)}' +
            '.ag-cs-vuoto{font-size:12px;color:#8b8b90;margin:0}' +
            '.ag-bd{flex:none;display:inline-flex;align-items:center;gap:3px;font:600 9px Inter,sans-serif;' +
            'letter-spacing:.06em;text-transform:uppercase;padding:2px 6px;border-radius:9px;border:1px solid}' +
            '.ag-bd-grigio{color:#6e6e73;border-color:rgba(110,110,115,.34);background:rgba(110,110,115,.08)}' +
            '.ag-bd-upgrade{color:#8a6212;border-color:rgba(217,160,58,.5);background:rgba(217,160,58,.13)}' +
            '.ag-bd-pay{color:#2f6a52;border-color:rgba(47,106,82,.42);background:rgba(47,106,82,.1)}' +
            /* bottone dei consumi dentro le impostazioni */
            '.ag-uso-apri{display:flex;width:100%;align-items:center;justify-content:space-between;gap:8px;' +
            'padding:10px 12px;border:1px solid rgba(0,0,0,.1);border-radius:10px;background:transparent;' +
            'cursor:pointer;font:500 12.5px Inter,sans-serif;color:#1d1d1f}' +
            '.ag-uso-apri:hover{background:rgba(0,0,0,.04)}' +
            '.ag-uso-apri i{font-style:normal;color:#6e6e73;font-size:11px}' +
            '.ag-uso-corpo{margin-top:11px}' +
            /* vetrina dei piani */
            '.ag-vt-velo{position:fixed;inset:0;background:rgba(20,20,22,.5);z-index:4000}' +
            '.ag-vt{position:fixed;z-index:4001;left:50%;top:50%;transform:translate(-50%,-50%);' +
            'width:min(880px,94vw);max-height:88vh;overflow-y:auto;background:#fff;border-radius:16px;' +
            'padding:26px 24px 30px;font-family:Inter,sans-serif;box-shadow:0 24px 70px rgba(0,0,0,.3)}' +
            '.ag-vt h3{margin:0 0 4px;font-size:17px;font-weight:600;color:#1d1d1f}' +
            '.ag-vt .ag-vt-sub{font-size:12.5px;color:#6e6e73;margin:0 0 18px}' +
            '.ag-vt-x{position:absolute;top:16px;right:18px;border:0;background:transparent;' +
            'font-size:22px;line-height:1;color:#8b8b90;cursor:pointer;padding:4px 8px}' +
            '.ag-vt-griglia{display:grid;grid-template-columns:repeat(auto-fit,minmax(226px,1fr));gap:13px}' +
            '.ag-vt-p{border:1px solid rgba(0,0,0,.11);border-radius:13px;padding:16px 15px;display:flex;' +
            'flex-direction:column;gap:9px}' +
            '.ag-vt-p.attuale{border-color:rgba(0,113,227,.5);background:rgba(0,113,227,.04)}' +
            '.ag-vt-t{display:flex;align-items:baseline;justify-content:space-between;gap:8px}' +
            '.ag-vt-t b{font-size:14.5px;font-weight:600}' +
            '.ag-vt-pr{font:600 14px Inter,sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap}' +
            '.ag-vt-pr small{font-weight:400;font-size:10.5px;color:#6e6e73}' +
            '.ag-vt-som{font-size:12px;color:#3c3c41;line-height:1.45;margin:0}' +
            '.ag-vt-ul{margin:0;padding-left:16px;display:flex;flex-direction:column;gap:5px}' +
            '.ag-vt-ul li{font-size:11.5px;color:#4a4a50;line-height:1.45}' +
            '.ag-vt-chi{font-size:10.5px;color:#6e6e73;margin-top:auto;padding-top:6px;' +
            'border-top:1px solid rgba(0,0,0,.07)}' +
            '.ag-vt-mod{font-size:10.5px;color:#6e6e73;display:flex;flex-wrap:wrap;gap:4px}' +
            '.ag-vt-nota{margin-top:20px;padding:13px 15px;border-radius:11px;' +
            'background:rgba(217,160,58,.1);border:1px solid rgba(217,160,58,.32)}' +
            '.ag-vt-nota b{display:block;font-size:12.5px;margin-bottom:3px;color:#1d1d1f}' +
            '.ag-vt-nota p{margin:0 0 6px;font-size:11.5px;color:#4a4a50;line-height:1.5}' +
            '.ag-vt-come{margin-top:18px;padding-top:16px;border-top:1px solid rgba(0,0,0,.09)}' +
            '.ag-vt-come b{display:block;font-size:12.5px;margin-bottom:5px}' +
            '.ag-vt-come p{margin:0 0 8px;font-size:11.5px;color:#4a4a50;line-height:1.55}' +
            /* cerchio account */
            '.ag-acc-cerchio{width:29px;height:29px;border-radius:50%;border:0;color:#fff;' +
            'font:600 12px/1 Inter,sans-serif;cursor:pointer;display:inline-flex;' +
            'align-items:center;justify-content:center;letter-spacing:.01em}' +
            '.ag-acc-cerchio:hover{filter:brightness(1.12)}' +
            '.ag-acc-cerchio:focus-visible{outline:2px solid currentColor;outline-offset:2px}' +
            '.ag-acc-cerchio.grande{width:36px;height:36px;font-size:14px}' +
            '.ag-account-testa{flex:none;align-self:flex-start;margin-right:2px}' +
            '.ag-account-testa .ag-acc-cerchio{width:38px;height:38px;font-size:15px}' +
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
    /* --------------------------------------------------------- selettore
       Il <select> nativo non accetta ne' immagini ne' distintivi dentro le
       <option>: per mostrare il logo di ogni casa e la fascia di ognuno serve
       un menu proprio. Il <select id="ag-model"> RESTA in pagina, nascosto, e
       continua a essere l'unica fonte della verita': tutto il resto di
       index.html legge il suo .value e non si accorge di niente. Se questo
       file non carica, il <select> e' visibile e funziona come sempre.

       NIENTE E' SCRITTO QUI DENTRO. Modelli, fasce, nomi delle fasce,
       distintivi e loghi arrivano tutti da /api/billing/state, cioe' da
       billing-config.json: per cambiare "free" in altro, o per spostare un
       modello di fascia, si tocca la configurazione, non questo file.
       ------------------------------------------------------------------- */

    // Le uniche due iconcine disegnate qui: quale usare lo dice la
    // configurazione (fasce.N.distintivo.icona). Un nome sconosciuto non
    // rompe niente, mostra solo il testo.
    var ICONE = {
        upgrade: '<svg viewBox="0 0 24 24" width="9" height="9" aria-hidden="true">' +
                 '<path fill="currentColor" d="M12 3.6 19 11h-4v8.4h-6V11H5l7-7.4Z"/></svg>',
        moneta:  '<svg viewBox="0 0 24 24" width="9" height="9" aria-hidden="true">' +
                 '<circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="1.9"/>' +
                 '<path fill="currentColor" d="M11.1 7.4h1.8v1.2h1.7v1.6h-3.1v1.1h3.1v1.6h-1.7v1.1h-1.8v-1.1H9.4v-1.6h3.1v-1.1H9.4V8.6h1.7V7.4Z"/></svg>'
    };

    // Il distintivo di una fascia: testo e tono vengono dalla configurazione.
    function distintivo(fascia, consentito, nudo) {
        var f = (stato && stato.fasce) ? stato.fasce[fascia] : null;
        var d = f && f.distintivo;
        if (!d || !d.testo) return '';
        var tono = d.tono || 'grigio';
        var ic = ICONE[d.icona] || '';
        // Un modello che il piano non copre porta comunque il suo distintivo:
        // e' proprio quello che gli dice cosa gli manca per averlo.
        if (nudo) return '<span class="ag-msel-fs">' + String(d.testo) + '</span>';
        return '<span class="ag-bd ag-bd-' + tono + '"' +
               (d.descrizione ? ' title="' + String(d.descrizione).replace(/"/g, '') + '"' : '') +
               (consentito ? '' : ' style="opacity:.9"') + '>' +
               ic + String(d.testo) + '</span>';
    }

    function modelloCorrente() {
        var sel = document.getElementById('ag-model');
        if (!sel || !stato) return null;
        var m = (stato.modelli || []).filter(function (x) { return x.id === sel.value; })[0];
        return m || null;
    }

    // Costruisce (una volta sola) il bottone che sostituisce il <select>.
    function contenitore() {
        var sel = document.getElementById('ag-model');
        if (!sel || !sel.parentNode) return null;
        var c = document.getElementById('ag-msel');
        if (c) return c;

        c = document.createElement('div');
        c.className = 'ag-msel';
        c.id = 'ag-msel';
        // La classe .lang-change-btn porta width:100px. Un foglio di stile puo'
        // perdere contro di lei (ordine, specificita', cache): lo stile in riga no.
        c.innerHTML = '<button type="button" class="lang-change-btn ag-msel-btn" id="ag-msel-btn" ' +
                      'title="Modello" aria-haspopup="listbox" aria-expanded="false" ' +
                      'style="width:auto;min-width:0;max-width:none;flex:none;height:32px;' +
                      'padding:0 11px;gap:8px;justify-content:flex-start;white-space:nowrap;' +
                      'overflow:visible"></button>';
        sel.parentNode.insertBefore(c, sel);
        sel.style.display = 'none';          // resta, ma non si vede

        c.querySelector('#ag-msel-btn').addEventListener('click', function (e) {
            e.stopPropagation();
            apriMenuModelli();
        });
        return c;
    }

    function disegnaBottone() {
        var c = contenitore();
        if (!c) return;
        var b = c.querySelector('#ag-msel-btn');
        var m = modelloCorrente();
        if (!m) { b.textContent = 'MODELLO'; return; }
        b.innerHTML = immagineLogo(m.provider, m.etichetta) +
            '<span class="ag-msel-eti">' + m.etichetta + '</span>' +
            distintivo(m.fascia, true, true) +
            '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">' +
            '<path d="M2 4l3 3 3-3" fill="none" stroke="#6E6E73" stroke-width="1.4" stroke-linecap="round"/></svg>';
        b.title = m.etichetta;
        agganciaRipieghi(b);
    }

    function chiudiMenuModelli() {
        var m = document.getElementById('ag-msel-menu');
        if (m) m.remove();
        var b = document.getElementById('ag-msel-btn');
        if (b) b.setAttribute('aria-expanded', 'false');
    }

    function apriMenuModelli() {
        if (document.getElementById('ag-msel-menu')) { chiudiMenuModelli(); return; }
        var sel = document.getElementById('ag-model');
        if (!sel || !stato || !stato.modelli || !stato.modelli.length) return;

        // Raggruppati per fascia, in ordine di fascia: prima cio' che si puo'
        // usare subito, poi cio' che richiede qualcosa.
        var perFascia = {};
        stato.modelli.forEach(function (m) {
            (perFascia[m.fascia] = perFascia[m.fascia] || []).push(m);
        });

        var h = '';
        Object.keys(perFascia).sort().forEach(function (f) {
            var info = (stato.fasce && stato.fasce[f]) || {};
            h += '<div class="ag-msel-gr">' + (info.nome || ('Fascia ' + f)) + '</div>';
            perFascia[f].forEach(function (m) {
                // Un modello non consentito resta VISIBILE ma spento: nasconderlo
                // non farebbe capire che esiste, ne' che basta un piano per averlo.
                h += '<button type="button" class="ag-msel-voce' +
                     (m.id === sel.value ? ' scelto' : '') + '" data-id="' + m.id + '"' +
                     ' data-ok="' + (m.consentito ? '1' : '0') + '">' +
                     immagineLogo(m.provider, m.etichetta) +
                     '<span class="ag-msel-nome">' + m.etichetta + '</span>' +
                     distintivo(m.fascia, m.consentito) + '</button>';
            });
        });

        var menu = document.createElement('div');
        menu.id = 'ag-msel-menu';
        menu.className = 'ag-msel-menu';
        menu.setAttribute('role', 'listbox');
        menu.innerHTML = h;
        document.body.appendChild(menu);
        agganciaRipieghi(menu);

        var b = document.getElementById('ag-msel-btn');
        var r = b.getBoundingClientRect();
        menu.style.top = (r.bottom + 8) + 'px';
        menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
        b.setAttribute('aria-expanded', 'true');

        menu.addEventListener('click', function (e) {
            var v = e.target.closest ? e.target.closest('.ag-msel-voce') : null;
            if (!v) return;
            chiudiMenuModelli();
            // Un modello che il piano non copre non e' un vicolo cieco: si preme,
            // e si apre la vetrina che dice cosa serve per averlo.
            if (v.getAttribute('data-ok') !== '1') {
                var mm = (stato.modelli || []).filter(function (x) { return x.id === v.getAttribute('data-id'); })[0];
                // Un modello la cui casa non e' ancora collegata NON e' un modello
                // che si compra: mandarlo alla vetrina dei piani sarebbe vendergli
                // una cosa che non esiste. Si dice com'e'.
                if (mm && mm.provider_pronto === false) { apriNonPronto(mm); return; }
                apriVetrina(v.getAttribute('data-id'));
                return;
            }
            scegli(v.getAttribute('data-id'));
        });
        setTimeout(function () {
            document.addEventListener('click', chiudiMenuModelli, { once: true });
        }, 0);
    }

    // Si scrive nel <select> nascosto e si annuncia il cambio, perche' il
    // resto della pagina ascolta quello e non deve sapere che esistiamo.
    function scegli(id) {
        var sel = document.getElementById('ag-model');
        if (!sel) return;
        sel.value = id;
        try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
        disegnaBottone();
        disegnaBarra();
    }

    function riempiSelettore() {
        var sel = document.getElementById('ag-model');
        if (!sel || !stato || !stato.modelli || !stato.modelli.length) return;

        var precedente = sel.value;

        // Il <select> nascosto si tiene allineato: e' lui che gli altri leggono.
        sel.innerHTML = '';
        stato.modelli.forEach(function (m) {
            var o = document.createElement('option');
            o.value = m.id;
            o.textContent = m.etichetta;
            o.disabled = !m.consentito;
            sel.appendChild(o);
        });

        // Si prova a restare sul modello di prima; se non e' piu' consentito
        // si scende sul primo disponibile invece di lasciare una scelta morta.
        var ok = stato.modelli.filter(function (m) { return m.consentito; });
        var trovato = ok.some(function (m) { return m.id === precedente; });
        sel.value = trovato ? precedente : (ok.length ? ok[0].id : sel.value);

        disegnaBottone();
    }

    // Compatibilita': il resto del file chiamava disegnaLogo().
    function disegnaLogo() { disegnaBottone(); }

    /* ======================== VETRINA DEI PIANI =========================
       Si apre premendo un modello che il piano non copre. Tutto quello che
       si legge qui dentro - titoli, sommari, elenchi, prezzi, la nota sul
       pagamento - arriva da /api/billing/state, cioe' da billing-config.json,
       cioe' dal pannello di amministrazione. In questo file non c'e' un solo
       testo commerciale: cambiarli non richiede di ricaricare il sito.
       ==================================================================== */
    function chiudiVetrina() {
        var v = document.getElementById('ag-vt'), o = document.getElementById('ag-vt-velo');
        if (v) v.remove();
        if (o) o.remove();
    }

    function modelliDiFascia(f) {
        return (stato.modelli || []).filter(function (m) { return String(m.fascia) === String(f); })
            .map(function (m) { return m.etichetta; });
    }

    function schedaPiano(id, p) {
        var v = p.vetrina || {};
        var prezzo = p.a_consumo
            ? ('da ' + (p.ricarica_minima_eur || 0) + ' \u20AC <small>ricarica</small>')
            : (Number(p.prezzo_eur || 0) > 0
                ? (p.prezzo_eur + ' \u20AC <small>/ mese</small>')
                : '<small>gratuito</small>');

        // Quali modelli si aprono davvero con questo piano: non un elenco
        // scritto a mano, ma le fasce che il piano copre.
        var fasce = (p.fasce || []).map(function (f) {
            var n = ((stato.fasce || {})[f] || {}).nome || ('Fascia ' + f);
            return '<span>' + n + '</span>';
        }).join(' \u00b7 ');

        return '<div class="ag-vt-p' + (p.attuale ? ' attuale' : '') + '">' +
            '<div class="ag-vt-t"><b>' + (v.titolo || p.etichetta || id) + '</b>' +
                '<span class="ag-vt-pr">' + prezzo + '</span></div>' +
            (v.sommario ? '<p class="ag-vt-som">' + v.sommario + '</p>' : '') +
            (v.punti && v.punti.length
                ? '<ul class="ag-vt-ul">' + v.punti.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>'
                : '') +
            '<div class="ag-vt-mod">' + fasce + '</div>' +
            (v.per_chi ? '<div class="ag-vt-chi">' + v.per_chi + (p.attuale ? ' \u00b7 <strong>il tuo piano</strong>' : '') + '</div>' : '') +
            '</div>';
    }

    function apriNonPronto(m) {
        var t = (stato.vetrina_comune && stato.vetrina_comune.non_disponibile) ||
                'Non e ancora disponibile. Lo stiamo collegando: comparira qui appena e pronto.';
        var velo = document.createElement('div');
        velo.className = 'ag-vt-velo'; velo.id = 'ag-vt-velo';
        velo.addEventListener('click', chiudiVetrina);
        document.body.appendChild(velo);
        var d = document.createElement('div');
        d.id = 'ag-vt'; d.className = 'ag-vt';
        d.style.width = 'min(440px,92vw)';
        d.innerHTML = '<button type="button" class="ag-vt-x" id="ag-vt-x" aria-label="Chiudi">&times;</button>' +
            '<h3>' + m.etichetta + '</h3>' +
            '<p class="ag-vt-sub">Non ancora disponibile</p>' +
            '<p class="ag-vt-som">' + t + '</p>';
        document.body.appendChild(d);
        document.getElementById('ag-vt-x').addEventListener('click', chiudiVetrina);
    }

    function apriVetrina(idModello) {
        if (!stato || !stato.piani) return;
        chiudiVetrina();

        var m = (stato.modelli || []).filter(function (x) { return x.id === idModello; })[0];
        var fascia = m ? ((stato.fasce || {})[m.fascia] || {}) : {};
        var com = stato.vetrina_comune || {};

        // Prima i piani che sbloccano DAVVERO il modello richiesto.
        var chiavi = Object.keys(stato.piani).sort(function (a, b) {
            var sa = m && (stato.piani[a].fasce || []).indexOf(m.fascia) !== -1 ? 0 : 1;
            var sb = m && (stato.piani[b].fasce || []).indexOf(m.fascia) !== -1 ? 0 : 1;
            if (sa !== sb) return sa - sb;
            return Number(stato.piani[a].prezzo_eur || 0) - Number(stato.piani[b].prezzo_eur || 0);
        });

        var velo = document.createElement('div');
        velo.className = 'ag-vt-velo'; velo.id = 'ag-vt-velo';
        velo.addEventListener('click', chiudiVetrina);
        document.body.appendChild(velo);

        var d = document.createElement('div');
        d.id = 'ag-vt'; d.className = 'ag-vt';
        d.setAttribute('role', 'dialog');
        d.innerHTML =
            '<button type="button" class="ag-vt-x" id="ag-vt-x" aria-label="Chiudi">&times;</button>' +
            '<h3>' + (m ? m.etichetta : 'Piani') + '</h3>' +
            '<p class="ag-vt-sub">' +
                (m ? (fascia.nome || '') + ' \u00b7 ' + (fascia.descrizione || '') : '') +
            '</p>' +
            '<div class="ag-vt-griglia">' +
                chiavi.map(function (k) { return schedaPiano(k, stato.piani[k]); }).join('') +
            '</div>' +
            (com.titolo || com.testo
                ? '<div class="ag-vt-come"><b>' + (com.titolo || '') + '</b>' +
                  (com.testo ? '<p>' + com.testo + '</p>' : '') +
                  (com.punti && com.punti.length
                    ? '<ul class="ag-vt-ul">' + com.punti.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>'
                    : '') + '</div>'
                : '') +
            // La nota sul pagamento la decide il SERVER: sparisce da sola il
            // giorno in cui il checkout viene collegato.
            ((stato.checkout && stato.checkout.collegato === false)
                ? '<div class="ag-vt-nota"><b>' + (stato.checkout.conseguenza ? 'Come si attiva' : '') + '</b>' +
                  '<p>' + (com.nota_pagamento || stato.checkout.conseguenza || '') + '</p></div>'
                : '');
        document.body.appendChild(d);
        document.getElementById('ag-vt-x').addEventListener('click', chiudiVetrina);
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
            apriConsumi();
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

    /* ===================== CONSUMO ======================================
       Nel pannello Configuracion compare un pulsante CONSUMO. Aprendolo si
       vede la stessa cosa che si vede altrove nel mestiere: due finestre a
       scorrimento con la percentuale e QUANDO tornano, e sotto quanto ha
       preso ciascun modello.

       La logica e' quella provata: una finestra breve di sessione, che si
       libera da sola dopo qualche ora, e una settimanale che scorre giorno
       per giorno. Nessuna delle due si azzera a mezzanotte: escono i
       messaggi vecchi e lo spazio torna. Ed e' per questo che si mostra il
       "torna fra", non un numero di messaggi: i messaggi non sono uguali fra
       loro, un modello potente ne vale molti.
       ==================================================================== */

    function montaConsumi() {
        var box = document.getElementById('ag-op-consumi');
        if (!box) return;
        // NIENTE CONDIZIONI. Prima si usciva se lo stato non era ancora arrivato o
        // se l'utente risultava anonimo, e in tutti e due i casi nelle impostazioni
        // non compariva NIENTE - nessun pulsante, nessuna spiegazione. Il pulsante
        // c'e' sempre: al massimo dentro c'e' scritto che non c'e' ancora niente.
        if (box.querySelector('#ag-cs-btn')) { aggiornaPulsanteConsumo(); return; }

        box.innerHTML = '<h4>Consumo</h4>' +
            '<button type="button" class="ag-cs-btn" id="ag-cs-btn">' +
            '<span>Consumo</span><i id="ag-cs-btn-n"></i></button>';
        box.querySelector('#ag-cs-btn').addEventListener('click', apriConsumi);
        aggiornaPulsanteConsumo();
    }

    // Sul pulsante si legge subito la finestra piu' stretta: chi non apre
    // niente vede comunque quanto gli resta.
    function aggiornaPulsanteConsumo() {
        var n = document.getElementById('ag-cs-btn-n');
        if (!n) return;
        if (!stato) { n.textContent = 'apri il dettaglio'; return; }
        var s1 = stato.sessione, s7 = stato.settimana;
        var p = Math.max(s1 ? s1.pct || 0 : 0, s7 ? s7.pct || 0 : 0);
        n.textContent = (s1 || s7) ? Math.round(p) + '% utilizzato' : 'apri il dettaglio';
    }

    function chiudiConsumi() {
        var a = document.getElementById('ag-cs'), b = document.getElementById('ag-cs-velo');
        if (a) a.remove();
        if (b) b.remove();
    }

    function barraFinestra(titolo, sotto, f, cls) {
        var pct = Math.max(0, Math.min(100, (f && f.pct) || 0));
        var t = stato.tetti || {};
        var stile = pct >= (t.blocco_pct || 100) ? 'pieno' : (pct >= (t.avviso_pct || 75) ? 'alto' : '');
        return '<div class="ag-cs-f ' + stile + ' ' + (cls || '') + '">' +
            '<div><b>' + titolo + '</b>' + (sotto ? '<small>' + sotto + '</small>' : '') + '</div>' +
            '<div class="ag-cs-tr"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
            '<div class="ag-cs-pct">' + Math.round(pct) + '% utilizzato</div>' +
            '</div>';
    }

    async function apriConsumi() {
        if (!stato) return;
        chiudiConsumi();

        var velo = document.createElement('div');
        velo.className = 'ag-cs-velo'; velo.id = 'ag-cs-velo';
        velo.addEventListener('click', chiudiConsumi);
        document.body.appendChild(velo);

        var d = document.createElement('div');
        d.id = 'ag-cs'; d.className = 'ag-cs';
        d.setAttribute('role', 'dialog');
        d.innerHTML = '<button type="button" class="ag-cs-x" id="ag-cs-x" aria-label="Chiudi">&times;</button>' +
            '<h3>Limiti di utilizzo del piano<span>' + (stato.piano_etichetta || '') + '</span></h3>' +
            '<div id="ag-cs-corpo"><p class="ag-cs-vuoto">Lettura in corso\u2026</p></div>';
        document.body.appendChild(d);
        document.getElementById('ag-cs-x').addEventListener('click', chiudiConsumi);

        await disegnaConsumi();
    }

    async function disegnaConsumi() {
        var corpo = document.getElementById('ag-cs-corpo');
        if (!corpo) return;

        try {
            var r = await fetch(API + '/api/billing/usage?giorni=7&email=' +
                encodeURIComponent(emailCorrente()));
            usoCache = await r.json();
        } catch (e) { usoCache = null; }

        if (!stato) { corpo.innerHTML = '<p class="ag-cs-vuoto">Dati di consumo non disponibili ora.</p>'; return; }
        var t = (usoCache && usoCache.totale) || { messaggi: 0, tokens: 0 };
        var mods = (usoCache && usoCache.modelli) || [];
        var com = stato.vetrina_comune || {};

        var h = '';

        // --- sessione ---
        h += barraFinestra('Sessione corrente',
            stato.sessione && stato.sessione.reset_ts
                ? 'Si ripristina ' + quando(stato.sessione.reset_ts)
                : 'Finestra di ' + (stato.sessione_ore || 5) + ' ore, a scorrimento',
            stato.sessione);

        // --- settimana ---
        h += '<h4>Limiti settimanali</h4>';
        if (com.testo) {
            h += '<div class="ag-cs-info"><p>' + com.testo + '</p></div>';
        }
        h += barraFinestra('Tutti i modelli',
            stato.settimana && stato.settimana.reset_ts
                ? 'Si ripristina ' + quando(stato.settimana.reset_ts)
                : 'Sette giorni a scorrimento',
            stato.settimana);

        // --- per modello ---
        h += '<h4>Per modello \u00b7 ultimi 7 giorni</h4>';
        if (!mods.length) {
            h += '<p class="ag-cs-vuoto">Ancora nessun messaggio in questo periodo.</p>';
        } else {
            h += '<div class="ag-cs-mod">' + mods.map(function (m) {
                var pct = Math.max(0, Math.min(100, m.quota_pct || 0));
                var f = (stato.fasce || {})[m.fascia] || {};
                return '<div class="ag-cs-m">' +
                    '<div class="ag-cs-mn">' + immagineLogo(m.provider, m.etichetta) +
                        '<span>' + m.etichetta + '</span>' +
                        '<small>' + (f.nome || '') + '</small></div>' +
                    '<div class="ag-cs-tr"><i style="width:' + Math.max(1.5, pct).toFixed(1) + '%"></i></div>' +
                    '<div class="ag-cs-pct">' + Math.round(pct) + '% \u00b7 ' + m.messaggi + ' msg</div>' +
                    '</div>';
            }).join('') + '</div>';
            h += '<div class="ag-cs-info" style="margin-top:16px"><p>' +
                 'La percentuale dice quanta parte della quota ha preso ciascun modello, non quanti ' +
                 'messaggi hai scritto: un modello potente pesa piu\u2019 di uno rapido a parita\u2019 di ' +
                 'messaggi. In totale ' + t.messaggi + ' messaggi e ' + numeroBreve(t.tokens) + ' token.' +
                 '</p></div>';
        }

        // --- saldo, solo dove significa qualcosa ---
        if (stato.a_consumo && typeof stato.saldo_eur === 'number') {
            h += '<h4>Saldo</h4><div class="ag-cs-info"><p>Ti restano <b>' +
                 stato.saldo_eur.toFixed(2) + ' \u20AC</b> di ricarica. Cala solo quando scrivi e non scade.</p></div>';
        }

        h += '<div class="ag-cs-agg"><span id="ag-cs-ora">Ultimo aggiornamento: proprio ora</span>' +
             '<button type="button" id="ag-cs-ric" title="Rileggi">\u21BB</button></div>';

        corpo.innerHTML = h;
        agganciaRipieghi(corpo);
        var ric = document.getElementById('ag-cs-ric');
        if (ric) ric.addEventListener('click', async function () {
            await aggiorna();
            await disegnaConsumi();
        });
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
            montaConsumi();      // se il pannello e' aperto, il pulsante c'e'
        } catch (e) {
            // Silenzio voluto: senza billing l'applicazione deve restare intera.
        } finally {
            aggiornamentoInCorso = false;
        }
    }

    /* Il cerchio dell'account entra nella riga dei pulsanti, allineato con
       la prima fila. Se il pannello non c'e' (o non e' ancora stato
       costruito) resta dov'e' e non succede niente. */
    function spostaAccount() {
        var host = document.getElementById('ag-account');
        var testa = document.querySelector('.ag-testa');
        if (!host || !testa) return;
        if (host.parentNode === testa) return;
        host.classList.add('ag-account-testa');
        testa.insertBefore(host, testa.firstChild);
    }

    /* ---------------------------------------------------------- aggancio */
    var VERSIONE = 7;

    function avvia() {
        // Si stampa la versione: se in console non compare il numero che ti
        // aspetti, stai eseguendo un file vecchio tenuto in cache, e nessuna
        // correzione potra' mai comparire finche' non lo svuoti.
        console.log('[billing] ui v' + VERSIONE + ' caricata');
        stile();
        aggiorna();
        var sel = document.getElementById('ag-model');
        if (sel) sel.addEventListener('change', function () { disegnaLogo(); disegnaBarra(); });

        // Il pannello impostazioni si ricostruisce a ogni apertura: il riquadro
        // dei consumi va riempito dopo, non prima.
        // ECCO PERCHE' IL PULSANTE CONSUMO NON COMPARIVA MAI.
        // Qui c'era document.getElementById('ag-opzioni-btn') eseguito
        // all'avvio. Ma il pannello di mezzo NON ESISTE all'avvio: lo costruisce
        // index.html piu' tardi, con createElement. Quindi getElementById
        // tornava null, l'ascoltatore non veniva mai attaccato, e montaConsumi
        // non veniva chiamata NEMMENO UNA VOLTA. Nessun errore in console,
        // semplicemente non succedeva niente.
        // Adesso l'ascolto sta sul documento, che esiste sempre: qualunque
        // click sull'ingranaggio viene visto, anche se il pulsante e' nato
        // dieci secondi dopo di noi.
        document.addEventListener('click', function (e) {
            var t = e.target;
            var ing = (t && t.closest) ? t.closest('#ag-opzioni-btn') : null;
            if (!ing) return;
            [0, 60, 200, 500, 900].forEach(function (ms) { setTimeout(montaConsumi, ms); });
        }, true);

        // NIENTE OSSERVATORE SUL DOCUMENTO. Ne avevo messo uno: montaConsumi
        // scrive nel pannello, la scrittura e' una mutazione, l'osservatore la
        // vedeva e richiamava montaConsumi. Un anello che si mordeva la coda e
        // bloccava tutta l'interfaccia. Bastano i tentativi qui sopra: si
        // fermano da soli appena il pulsante c'e'.

        // IL CERCHIO DELL'ACCOUNT VA CON I PULSANTI DEL PANNELLO DI MEZZO,
        // non nella testa della chat: li' rubava spazio al nome del modello,
        // che deve stare su una riga sola. Si sposta appena il pannello
        // esiste, e si rimette a posto se il pannello viene ricostruito.
        spostaAccount();
        var giri = 0;
        var t = setInterval(function () {
            spostaAccount();
            if (++giri > 20 || document.querySelector('.ag-testa .ag-account-testa')) clearInterval(t);
        }, 700);
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
