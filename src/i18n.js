/* Arayüz metinleri. Dil tarayıcıdan gelir, ayarlardan elle de seçilebilir:
 * Firefox'un dili İngilizce olup YouTube'u Türkçe kullanmak yaygın, ikisi
 * çakıştığında karar kullanıcının olsun.
 *
 * Sayı biçimi de dile bağlı: Türkçede ondalık ayırıcı virgül ve kısaltmalar
 * B/Mn/Mr, İngilizcede nokta ve K/M/B.
 */
var OBI18n = (function () {
  "use strict";

  var STRINGS = {
    tr: {
      badgeScore: "Outlier skoru $1",
      badgeViews: "İzlenme: $1",
      badgeMedian: "Kanal medyanı: $1 (son $2 $3)",
      badgeRank: "Kanalın son videolarının %$1'inden yüksek",
      badgeYoung: "Video 7 günden yeni: skor olduğundan düşük çıkar",
      badgeRounded: "Kanal izlenmeleri yuvarlanmış gelir, skor yaklaşıktır",
      badgeFailed: "Skor hesaplanamadı",

      unitVideos: "video",
      unitShorts: "Shorts",

      panelLoading: "Outlier hesaplanıyor",
      panelTitle: "Outlier",
      panelHead: "kanal medyanının katı",
      panelViews: "İzlenme",
      panelMedian: "Kanal medyanı",
      panelMedianValue: "$1 (son $2 $3)",
      panelRank: "Sıralama",
      panelRankValue: "son videoların %$1'inden yüksek",
      panelDaily: "Günlük ortalama",
      panelDailyValue: "$1 izlenme",
      panelDistTitle: "Kanalın son videoları (eskiden yeniye)",
      chartMedianLegend: "Kırmızı çizgi: medyan",
      chartSelfLegend: "Turuncu: bu video",
      chartNotInPool: "Bu video kanalın son $1 videosunun içinde değil",
      chartHint: "Her çubuk bir video, yüksekliği izlenmesi. Üzerine gel, tıkla açılsın.",
      tipViews: "$1 izlenme",
      agoDays: "$1 gün önce",
      agoMonths: "$1 ay önce",
      agoYears: "$1 yıl önce",
      tipThisVideo: "bu video",
      panelNoScore: "Skor hesaplanamadı: kanalın bu havuzunda en az $1 video gerekiyor.",
      panelError: "Skor alınamadı: $1",
      panelNote: "Kanal izlenmeleri YouTube tarafından yuvarlanmış gelir, skor yaklaşıktır. " +
        "7 günden yeni videoların skoru olduğundan düşük çıkar.",

      popupPermission: "Eklentinin YouTube'a istek atma izni yok, rozet çıkmaz.",
      popupGrant: "İzin ver",
      popupEnabled: "Rozetler açık",
      popupScoreShorts: "Shorts da puanlansın",
      popupShowPanel: "Video sayfasında panel",
      popupBaselineSize: "Baseline boyutu",
      popupMinScore: "Şu skorun altını gizle",
      popupTtl: "Önbellek ömrü",
      popupLanguage: "Dil",
      popupClear: "Önbelleği temizle",
      popupCleared: "Önbellek temizlendi.",
      popupNote: "Skor = videonun izlenmesi / kanalın son N videosunun izlenme medyanı. " +
        "Shorts kendi havuzunda puanlanır, canlı yayınlar hiçbir havuza girmez. " +
        "İzlenmeler YouTube tarafından yuvarlanmış geldiği için skor yaklaşıktır, " +
        "7 günden yeni videolarınki olduğundan düşük çıkar.",
      popupStatsChannels: "$1 kanalın verisi önbellekte.",
      popupStatsTab: "Bu sekmede $1 kart tarandı, $2 skorlandı",
      popupStatsSkipped: ", $1 veri yetersiz",
      popupStatsFailed: ", $1 hata",
      popupLastError: "Son hata: $1",

      optAuto: "Otomatik",
      optLastN: "son $1 video",
      optShowAll: "hepsini göster",
      optHours: "$1 saat",
      optDays: "$1 gün",
      optWeek: "1 hafta"
    },

    en: {
      badgeScore: "Outlier score $1",
      badgeViews: "Views: $1",
      badgeMedian: "Channel median: $1 (last $2 $3)",
      badgeRank: "Higher than $1% of the channel's recent videos",
      badgeYoung: "Video is under 7 days old: the score reads lower than it should",
      badgeRounded: "Channel view counts come rounded, so the score is approximate",
      badgeFailed: "Score unavailable",

      unitVideos: "videos",
      unitShorts: "Shorts",

      panelLoading: "Calculating outlier score",
      panelTitle: "Outlier",
      panelHead: "of the channel median",
      panelViews: "Views",
      panelMedian: "Channel median",
      panelMedianValue: "$1 (last $2 $3)",
      panelRank: "Rank",
      panelRankValue: "higher than $1% of recent videos",
      panelDaily: "Daily average",
      panelDailyValue: "$1 views",
      panelDistTitle: "Channel's recent videos (oldest to newest)",
      chartMedianLegend: "Red line: median",
      chartSelfLegend: "Orange: this video",
      chartNotInPool: "This video is not among the channel's last $1",
      chartHint: "Each bar is a video, its height the view count. Hover for details, click to open.",
      tipViews: "$1 views",
      agoDays: "$1 days ago",
      agoMonths: "$1 months ago",
      agoYears: "$1 years ago",
      tipThisVideo: "this video",
      panelNoScore: "No score: this channel pool needs at least $1 videos.",
      panelError: "Score unavailable: $1",
      panelNote: "Channel view counts come rounded from YouTube, so the score is approximate. " +
        "Videos under 7 days old score lower than they deserve.",

      popupPermission: "The extension is not allowed to call YouTube, so no badges appear.",
      popupGrant: "Grant access",
      popupEnabled: "Badges on",
      popupScoreShorts: "Score Shorts too",
      popupShowPanel: "Panel on the watch page",
      popupBaselineSize: "Baseline size",
      popupMinScore: "Hide scores below",
      popupTtl: "Cache lifetime",
      popupLanguage: "Language",
      popupClear: "Clear cache",
      popupCleared: "Cache cleared.",
      popupNote: "Score = the video's views divided by the median views of the channel's last N " +
        "videos. Shorts are scored in their own pool, live streams in none. View counts come " +
        "rounded from YouTube so the score is approximate, and videos under a week old read low.",
      popupStatsChannels: "$1 channels cached.",
      popupStatsTab: "This tab: $1 cards scanned, $2 scored",
      popupStatsSkipped: ", $1 lacked data",
      popupStatsFailed: ", $1 failed",
      popupLastError: "Last error: $1",

      optAuto: "Automatic",
      optLastN: "last $1 videos",
      optShowAll: "show all",
      optHours: "$1 hours",
      optDays: "$1 days",
      optWeek: "1 week"
    }
  };

  var current = null;

  function detect() {
    var nav = (navigator.language || "en").toLowerCase();
    return nav.indexOf("tr") === 0 ? "tr" : "en";
  }

  /* setting: "auto" | "tr" | "en" */
  function init(setting) {
    current = (setting === "tr" || setting === "en") ? setting : detect();
    return current;
  }

  function lang() {
    if (!current) current = detect();
    return current;
  }

  function t(key) {
    var table = STRINGS[lang()] || STRINGS.en;
    var text = table[key] != null ? table[key] : (STRINGS.en[key] != null ? STRINGS.en[key] : key);
    for (var i = 1; i < arguments.length; i++) {
      text = text.split("$" + i).join(String(arguments[i]));
    }
    return text;
  }

  /* Ondalık ayırıcı dile göre: 2,4x / 2.4x */
  function num(value, digits) {
    var text = value.toFixed(digits == null ? 1 : digits);
    return lang() === "tr" ? text.replace(".", ",") : text;
  }

  return { init: init, lang: lang, t: t, num: num };
})();
