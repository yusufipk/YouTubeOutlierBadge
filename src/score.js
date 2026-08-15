/* Outlier skoru: videonun izlenmesi, kendi kanalının normalinin kaç katı.
 *
 * Skor = video izlenmesi / kanalın son N videosunun izlenme MEDYANI.
 * Medyan bilerek seçildi: tek bir viral video ortalamayı yukarı çekip aynı
 * kanalın diğer videolarını "outlier değil" gösterirdi.
 *
 * Shorts ve normal videolar ayrı havuzlarda puanlanır, çünkü izlenme
 * dağılımları birbirine hiç benzemez. Canlı yayınlar hiçbir havuza girmez.
 *
 * BİLİNEN SINIRLAR (arayüzde de yazar):
 * - Kanal izlenmeleri YouTube tarafından yuvarlanmış gelir ("125K views"),
 *   skor yaklaşık bir orandır.
 * - Çok yeni videolar henüz izlenme toplamamıştır, skorları düşük çıkar.
 * - Baseline kanalın son N videosudur, tüm geçmişi değil.
 * - Havuzda 3'ten az video varsa skor hesaplanmaz.
 */
var OBScore = (function () {
  "use strict";

  var P = OBParse;
  var MIN_SAMPLE = 3;
  var MAX_PARALLEL = 4;

  var inflight = {};   /* kanal kimliği -> devam eden istek */
  var running = 0;
  var queue = [];

  function schedule(task) {
    return new Promise(function (resolve, reject) {
      queue.push({ task: task, resolve: resolve, reject: reject });
      pump();
    });
  }

  function pump() {
    while (running < MAX_PARALLEL && queue.length) {
      var job = queue.shift();
      running++;
      job.task().then(job.resolve, job.reject).then(function () {
        running--;
        pump();
      });
    }
  }

  function slim(items) {
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var v = items[i];
      /* Üyelere özel videoların izlenmesi dışarıya hiç verilmiyor: ne
       * baseline'a girerler ne de puanlanabilirler. */
      if (v.membersOnly || !v.views) continue;
      out.push({
        id: v.videoId,
        views: v.views,
        age: v.ageDays == null ? null : Math.round(v.ageDays * 10) / 10,
        /* Başlık sadece paneldeki dağılım grafiğinin ipucu balonu için; skorun
         * kendisi kullanmaz. Kanal başına 30 başlık önbelleğe birkaç kilobayt
         * ekliyor, karşılığında çubuklar hangi video olduklarını söylüyor. */
        title: (v.title || "").slice(0, 70)
      });
    }
    return out;
  }

  function fetchVideos(channelId, size) {
    return OBTube.channelTab(channelId, "videos", size).then(function (items) {
      /* Bitmiş canlı yayınlar Videos sekmesinde de listelenir; izlenmeleri
       * normal videolarla aynı havuzda ölçülemez. */
      return slim(items.filter(function (v) { return !v.wasLive && !v.isLive; }));
    });
  }

  function fetchShorts(channelId, size) {
    return OBTube.channelTab(channelId, "shorts", size).then(slim);
  }

  /* Kanalın baseline'ını döndürür; önbellekte varsa oradan.
   * Shorts havuzu sadece bir Shorts puanlanacaksa çekilir: ana sayfadaki
   * kartların çoğu normal video ve bu, kanal başına isteği yarıya indirir. */
  function baseline(channelId, needShorts) {
    var key = channelId + (needShorts ? ":s" : "");
    if (inflight[key]) return inflight[key];

    var promise = OBStore.settings().then(function (s) {
      return OBStore.readBaseline(channelId, s.baselineSize, s.ttlHours).then(function (cached) {
        if (cached && (!needShorts || cached.short)) return cached;

        return schedule(function () {
          var jobs = [];
          if (cached) {
            jobs.push(Promise.resolve(cached.video));
          } else {
            jobs.push(fetchVideos(channelId, s.baselineSize).catch(function () { return []; }));
          }
          jobs.push(needShorts
            ? fetchShorts(channelId, s.baselineSize).catch(function () { return []; })
            : Promise.resolve(cached ? cached.short : null));

          return Promise.all(jobs).then(function (res) {
            var blob = {
              v: OBStore.CACHE_VERSION,
              fetchedAt: cached ? cached.fetchedAt : Date.now(),
              size: s.baselineSize,
              video: res[0],
              short: res[1]
            };
            OBStore.writeBaseline(channelId, blob);
            return blob;
          });
        });
      });
    });

    inflight[key] = promise;
    promise.catch(function () {}).then(function () { delete inflight[key]; });
    return promise;
  }

  /* Videoyu kendi türündeki havuza göre puanlar, kendisini havuzdan çıkararak:
   * bir video kendi medyanını yukarı çekerse skoru olduğundan düşük çıkardı. */
  function score(videoId, views, isShort, blob) {
    var pool = (isShort ? blob.short : blob.video) || [];
    var others = [];
    var own = null;
    for (var i = 0; i < pool.length; i++) {
      if (pool[i].id === videoId) { own = pool[i]; continue; }
      if (pool[i].views) others.push(pool[i].views);
    }
    if (views == null && own) views = own.views;
    if (others.length < MIN_SAMPLE || !views) {
      return { score: null, median: null, sample: others.length, views: views };
    }
    var med = P.median(others);
    if (!med) return { score: null, median: null, sample: others.length, views: views };
    return {
      score: views / med,
      median: med,
      sample: others.length,
      views: views,
      ageDays: own ? own.age : null,
      /* Kanalın son N videosunun kaçından daha çok izlenmiş. */
      percentile: others.filter(function (v) { return v < views; }).length / others.length
    };
  }

  function lookupViews(videoId, blob) {
    var pools = [blob.video || [], blob.short || []];
    for (var p = 0; p < pools.length; p++) {
      for (var i = 0; i < pools[p].length; i++) {
        if (pools[p][i].id === videoId) return pools[p][i];
      }
    }
    return null;
  }

  return {
    MIN_SAMPLE: MIN_SAMPLE,
    baseline: baseline,
    score: score,
    lookupViews: lookupViews
  };
})();
