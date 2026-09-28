/* Sayfadaki kartları bulur, puanlar, rozeti basar.
 *
 * Kartlar ancak ekrana girdiğinde işlenir (IntersectionObserver): ana sayfa
 * yüzlerce kart oluşturuyor, hepsi için kanal baseline'ı çekmek hem gereksiz
 * hem de YouTube'a karşı kaba olurdu. Aynı kanalın baseline'ı tek istekle
 * alınır, günlük önbelleğe yazılır ve sonraki kartlar oradan okur.
 */
(function () {
  "use strict";

  var api = (typeof browser !== "undefined" ? browser : chrome);
  var P = OBParse;
  var T = OBI18n;

  var CARD_SELECTOR = [
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-playlist-video-renderer",
    "yt-lockup-view-model",
    "ytm-shorts-lockup-view-model",
    "ytm-shorts-lockup-view-model-v2"
  ].join(",");

  var counters = { seen: 0, scored: 0, skipped: 0, failed: 0 };
  var lastError = null;
  var settings = null;
  var observer = null;

  /* --- Karttan veri çıkarma -------------------------------------------- */

  function videoIdOf(card) {
    var links = card.querySelectorAll('a[href*="/watch?v="], a[href*="/shorts/"]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href") || "";
      var m = /[?&]v=([\w-]{11})/.exec(href) || /\/shorts\/([\w-]{11})/.exec(href);
      if (m) return m[1];
    }
    return null;
  }

  function isShortCard(card) {
    if (/shorts-lockup/i.test(card.tagName)) return true;
    return !!card.querySelector('a[href*="/shorts/"]');
  }

  function handleOf(card) {
    var links = card.querySelectorAll('a[href^="/@"], a[href^="/channel/"], a[href*="youtube.com/@"]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href") || "";
      if (href.indexOf("/channel/") >= 0) {
        var id = href.split("/channel/")[1].split(/[/?]/)[0];
        if (/^UC[\w-]{22}$/.test(id)) return { channelId: id };
      }
      var m = /\/(@[\w.\-]+)/.exec(href);
      if (m) return { handle: m[1] };
    }
    return null;
  }

  /* Kartın üzerindeki izlenme metni. Baseline'da bulunamayan videolar için son
   * çare: kanalın son N videosuna girmeyen eski videolar böyle puanlanır.
   * Metin kullanıcının arayüz dilinde geldiği için dil bilgisiyle okunur. */
  /* Newer lockup cards drop the words from the visible text: views show as a
   * play icon plus "44 B" and age as "2 hf. önce" or "18y ago". The full form
   * ("44 bin görüntüleme", "2 hafta önce") is only in the aria-label, so that
   * is read first and the visible text is the fallback for older layouts. */
  function metaTexts(card) {
    var out = [];
    var nodes = card.querySelectorAll("span, .yt-core-attributed-string");
    for (var i = 0; i < nodes.length; i++) {
      var label = (nodes[i].getAttribute("aria-label") || "").trim();
      var t = (nodes[i].textContent || "").trim();
      if (label && label.length <= 40) out.push(label);
      if (t && t.length <= 40) out.push(t);
    }
    return out;
  }

  function domViews(card) {
    var lang = document.documentElement.lang || "en";
    var texts = metaTexts(card);
    for (var i = 0; i < texts.length; i++) {
      if (/view|görüntüleme|goruntuleme|izlenme/i.test(texts[i])) {
        var n = P.parseCountUI(texts[i], lang);
        if (n) return n;
      }
    }
    return null;
  }

  function domAgeDays(card) {
    var texts = metaTexts(card);
    for (var i = 0; i < texts.length; i++) {
      if (/ago|önce|once/i.test(texts[i])) {
        var d = P.parseAgeDays(texts[i]);
        if (d != null) return d;
      }
    }
    return null;
  }

  /* --- Kanal kimliği --------------------------------------------------- */

  /* Kanal sayfasındaki kartlarda kanal bağlantısı hiç bulunmuyor: zaten o
   * kanaldasın, YouTube adı kartta tekrar etmiyor. O kartların kanalı sayfanın
   * kendi adresidir, video başına ayrı bir istek atmaya gerek yok. */
  function pageChannel() {
    var path = location.pathname;
    var m = /^\/channel\/(UC[\w-]{22})(?:\/|$)/.exec(path);
    if (m) return { channelId: m[1] };
    m = /^\/(@[\w.\-]+)(?:\/|$)/.exec(path);
    if (m) return { handle: m[1] };
    /* Eski /c/ ve /user/ adresleri: çözüm için tam adres gerekiyor. */
    m = /^\/((?:c|user)\/[^/]+)(?:\/|$)/.exec(path);
    if (m) return { handle: location.origin + "/" + m[1] };
    return null;
  }

  /* Handle'dan kanal kimliğine çözüm kalıcıdır (değişmez), o yüzden TTL'siz
   * saklanır. Arama sonuçlarında aynı kanaldan onlarca kart aynı anda ekrana
   * giriyor ve depo okuması asenkron olduğu için hepsi önbelleği ıskalayıp
   * aynı çözümü ayrı ayrı isterdi; devam eden istek paylaşılıyor. */
  var resolving = {};

  function resolveHandle(handle) {
    if (resolving[handle]) return resolving[handle];
    var promise = OBStore.readChannelId(handle).then(function (cached) {
      if (cached) return cached;
      return OBTube.resolveChannel(handle).then(function (id) {
        OBStore.writeChannelId(handle, id);
        return id;
      });
    });
    resolving[handle] = promise;
    promise.catch(function () {}).then(function () { delete resolving[handle]; });
    return promise;
  }

  /* İzleme sayfasının yan listesinde kartta kanal bağlantısı hiç
   * olmayabiliyor; orada son çare videonun kendi ucundan sorulur. */
  function channelIdOf(card, videoId) {
    var found = handleOf(card) || pageChannel();
    if (found && found.channelId) return Promise.resolve(found.channelId);
    if (found && found.handle) return resolveHandle(found.handle);
    var key = "v:" + videoId;
    return OBStore.readChannelId(key).then(function (cached) {
      if (cached) return cached;
      return OBTube.videoDetails(videoId).then(function (d) {
        if (d.channelId) OBStore.writeChannelId(key, d.channelId);
        return d.channelId;
      });
    });
  }

  /* --- Kart işleme ----------------------------------------------------- */

  function processCard(card) {
    var videoId = videoIdOf(card);
    /* Erken dönüşlerin hepsi obBadged'i düşürmek zorunda: bayrak yüksek ama
     * rozet yok kalırsa scan()'in geri basma dalı kartı her turda yeniden
     * işleyen bir döngüye girer. */
    if (!videoId) { card.obBadged = false; return; }
    if (card.obVideoId === videoId) return;
    card.obVideoId = videoId;
    card.obScore = null;
    card.obViews = null;

    var isShort = isShortCard(card);
    if (isShort && !settings.scoreShorts) {
      card.obBadged = false;
      OBBadge.clear(card);
      return;
    }

    counters.seen++;
    OBBadge.loading(card);

    channelIdOf(card, videoId).then(function (channelId) {
      if (!channelId) throw new Error("kanal bulunamadı");
      return OBScore.baseline(channelId, isShort);
    }).then(function (blob) {
      if (card.obVideoId !== videoId) return;   /* kart başka videoya geçti */
      var own = OBScore.lookupViews(videoId, blob);
      var views = own ? own.views : domViews(card);
      var result = OBScore.score(videoId, views, isShort, blob);
      if (result.score == null) {
        counters.skipped++;
        card.obBadged = false;
        OBBadge.clear(card);
        return;
      }
      if (settings.minScore && result.score < settings.minScore) {
        card.obBadged = false;
        OBBadge.clear(card);
        return;
      }
      var age = own && own.age != null ? own.age : domAgeDays(card);
      /* Rozet menüsü kaydederken skoru da yazsın diye kartta saklanır. */
      card.obScore = result.score;
      card.obViews = result.views;
      counters.scored++;
      card.obBadged = true;
      OBBadge.show(card, result, { young: age != null && age < 7, isShort: isShort });
    }).catch(function (err) {
      counters.failed++;
      lastError = String(err && err.message ? err.message : err);
      card.obBadged = false;
      OBBadge.clear(card);
    });
  }

  /* --- İzleme sayfası panosu ------------------------------------------- */

  var panelVideoId = null;
  /* Panelin son hali. Orta tuşla arka planda açılan sekmede YouTube, sekme
   * görünür olana kadar ytd-watch-metadata'yı çizmiyor; o anda mount() yer
   * bulamıyor ya da panel yedek yere düşüyor. Metadata bloğu sonradan yeniden kurulup
   * paneli silebiliyor da. İkisinde de istek tekrarlanmadan bu hal yeniden
   * basılır. */
  var panelState = null;

  function drawPanel() {
    if (!panelState) return;
    if (panelState.kind === "data") OBPanel.render(panelState.data);
    else if (panelState.kind === "error") OBPanel.renderError(panelState.message);
    else OBPanel.renderLoading();
  }

  function currentWatchId() {
    var m = /[?&]v=([\w-]{11})/.exec(location.search);
    return m ? m[1] : null;
  }

  /* Videonun süresi InnerTube'un next yanıtında yok, sayfanın oynatıcısından
   * okunuyor. Okunamazsa normal video sayılır: /watch adresinde açılan bir
   * Short nadir, yanlış havuzda puanlamaktansa gecikmeli doğruyu beklemek
   * anlamsız olurdu. */
  function watchIsShort() {
    if (location.pathname.indexOf("/shorts/") === 0) return true;
    var v = document.querySelector("#movie_player video");
    return !!(v && isFinite(v.duration) && v.duration > 0 && v.duration <= 60);
  }

  function updatePanel() {
    if (!settings || !settings.enabled || !settings.showPanel) { OBPanel.remove(); return; }
    var videoId = currentWatchId();
    if (!videoId) { panelVideoId = null; panelState = null; OBPanel.remove(); return; }
    if (videoId === panelVideoId) {
      if (!OBPanel.placed()) drawPanel();
      return;
    }
    panelVideoId = videoId;

    panelState = { kind: "loading" };
    drawPanel();
    var details = null;
    OBTube.videoDetails(videoId).then(function (d) {
      details = d;
      if (!d.channelId) throw new Error("kanal bulunamadı");
      OBStore.writeChannelId("v:" + videoId, d.channelId);
      var isShort = watchIsShort();
      return OBScore.baseline(d.channelId, isShort).then(function (blob) {
        return { blob: blob, isShort: isShort };
      });
    }).then(function (ctx) {
      if (panelVideoId !== videoId) return;
      var own = OBScore.lookupViews(videoId, ctx.blob);
      var result = OBScore.score(videoId, details.views, ctx.isShort, ctx.blob);
      if (result.score == null) {
        panelState = { kind: "error", message: T.t("panelNoScore", OBScore.MIN_SAMPLE) };
        drawPanel();
        return;
      }
      panelState = { kind: "data", data: {
        videoId: videoId,
        score: result.score,
        views: result.views,
        median: result.median,
        sample: result.sample,
        percentile: result.percentile,
        ageDays: own ? own.age : null,
        isShort: ctx.isShort,
        blob: ctx.blob
      } };
      drawPanel();
    }).catch(function (err) {
      if (panelVideoId !== videoId) return;
      lastError = String(err && err.message ? err.message : err);
      panelState = { kind: "error", message: T.t("panelError", lastError) };
      drawPanel();
    });
  }

  /* --- Tarama ---------------------------------------------------------- */

  function scan() {
    if (!settings || !settings.enabled) return;
    var cards = document.querySelectorAll(CARD_SELECTOR);
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      /* İç içe kartlarda (rich item içinde lockup) sadece en içteki işlenir. */
      if (card.querySelector(CARD_SELECTOR)) continue;
      if (!card.obObserved) {
        card.obObserved = true;
        observer.observe(card);
      } else if (card.obVideoId && card.obVideoId !== videoIdOf(card)) {
        /* YouTube kartları geri dönüştürüyor: aynı DOM elemanı başka videoya
         * bağlıysa rozet eskimiş demektir. */
        processCard(card);
      } else if (card.obBadged && !OBBadge.present(card)) {
        /* Hover önizlemesi (özellikle Shorts'ta) kapak kutusunu yeniden
         * kuruyor ve rozet DOM'dan siliniyor. Baseline önbellekte, geri
         * basmak ucuz. obVideoId sıfırlanır ki processCard "zaten işledim"
         * deyip erken dönmesin. */
        card.obVideoId = null;
        processCard(card);
      }
    }
  }

  var scanTimer = null;
  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(function () { scanTimer = null; scan(); updatePanel(); }, 250);
  }

  function clearAll() {
    var cards = document.querySelectorAll(CARD_SELECTOR);
    for (var i = 0; i < cards.length; i++) {
      OBBadge.clear(cards[i]);
      cards[i].obVideoId = null;
      cards[i].obBadged = false;
    }
    OBPanel.remove();
    panelVideoId = null;
    panelState = null;
  }

  function start() {
    observer = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) processCard(entries[i].target);
      }
    }, { rootMargin: "300px 0px" });

    new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });
    window.addEventListener("yt-navigate-finish", function () {
      scheduleScan();
      updatePanel();
    });
    document.addEventListener("yt-page-data-updated", function () {
      scheduleScan();
      updatePanel();
    });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) { scheduleScan(); updatePanel(); }
    });

    scan();
    updatePanel();
  }

  /* Ayar penceresinden gelen sorular. */
  api.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.type === "ob-stats") {
      return Promise.resolve({ counters: counters, lastError: lastError });
    }
    return undefined;
  });

  api.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local" || !changes.settings) return;
    settings = Object.assign({}, OBStore.DEFAULTS, changes.settings.newValue || {});
    T.init(settings.language);
    clearAll();
    counters = { seen: 0, scored: 0, skipped: 0, failed: 0 };
    if (settings.enabled) { scan(); updatePanel(); }
  });

  OBStore.settings().then(function (s) {
    settings = s;
    T.init(s.language);
    start();
  });
})();
