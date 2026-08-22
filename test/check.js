/* Eklenti mantığının Node altında doğrulanması: ayrıştırma ve skor birim
 * testleriyle, InnerTube tarafı gerçek bir kanal çağrısıyla. */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const dir = path.join(__dirname, "..", "src");
const sandbox = {
  console,
  fetch,
  navigator: { language: "tr-TR" },
  document: { querySelectorAll: () => [], documentElement: { lang: "en" } },
  setTimeout,
  Promise,
  Date,
  Math,
  JSON,
  Object,
  Array,
  parseInt,
  parseFloat,
  isNaN,
  String
};
vm.createContext(sandbox);
for (const f of ["i18n.js", "parse.js", "innertube.js", "score.js"]) {
  vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), sandbox, { filename: f });
}
const { OBParse, OBTube, OBI18n } = sandbox;
OBI18n.init("tr");

let fails = 0;
function eq(actual, expected, label) {
  const ok = typeof actual === "number" && typeof expected === "number"
    ? Math.abs(actual - expected) < 1e-9
    : actual === expected;
  if (!ok) fails++;
  console.log((ok ? "ok   " : "FAIL ") + label + "  -> " + actual + (ok ? "" : " (beklenen " + expected + ")"));
}

console.log("--- sayı ayrıştırma (InnerTube, hep İngilizce) ---");
eq(OBParse.parseCountEn("1.2M views"), 1200000, "1.2M views");
eq(OBParse.parseCountEn("341,331 views"), 341331, "341,331 views");
eq(OBParse.parseCountEn("24K views"), 24000, "24K views");
eq(OBParse.parseCountEn("1.4B views"), 1400000000, "1.4B views");
eq(OBParse.parseCountEn("No views"), null, "No views");
eq(OBParse.parseCountEn("2 months ago"), 2, "yaş metni sayı vermemeli (2 döner, filtre dışarıda)");

console.log("--- sayı ayrıştırma (sayfa DOM'u, arayüz dili) ---");
eq(OBParse.parseCountUI("24 B görüntüleme", "tr"), 24000, "tr: 24 B = 24 bin");
eq(OBParse.parseCountUI("1,3 Mn görüntüleme", "tr"), 1300000, "tr: 1,3 Mn");
eq(OBParse.parseCountUI("2,1 Mr görüntüleme", "tr"), 2100000000, "tr: 2,1 Mr");
eq(OBParse.parseCountUI("1.234.567 görüntüleme", "tr"), 1234567, "tr: tam sayı");
eq(OBParse.parseCountUI("1.2M views", "en"), 1200000, "en: 1.2M");
eq(OBParse.parseCountUI("24B views", "en"), 24000000000, "en: B = milyar");

console.log("--- yaş ---");
eq(Math.round(OBParse.parseAgeDays("3 months ago")), 91, "3 months ago");
eq(OBParse.parseAgeDays("2 days ago"), 2, "2 days ago");
eq(OBParse.parseAgeDays("3 ay önce"), 91.32, "3 ay önce");
eq(OBParse.parseAgeDays("5 saat önce"), 5 / 24, "5 saat önce");
eq(OBParse.parseAgeDays("Streamed 2 weeks ago"), 14, "Streamed 2 weeks ago");

console.log("--- medyan ve gösterim ---");
eq(OBParse.median([3, 1, 2]), 2, "medyan tek sayıda");
eq(OBParse.median([4, 1, 2, 3]), 2.5, "medyan çift sayıda");
eq(OBParse.humanCount(1234567), "1,2 Mn", "humanCount milyon (tr)");
eq(OBParse.humanCount(24000), "24 B", "humanCount bin (tr)");
eq(OBParse.humanCount(965400), "965 B", "humanCount yüz binler (tr)");

console.log("--- dil ---");
OBI18n.init("en");
eq(OBParse.humanCount(1234567), "1.2M", "humanCount milyon (en)");
eq(OBParse.humanCount(24000), "24K", "humanCount bin (en)");
eq(OBI18n.num(2.4, 1), "2.4", "en ondalık nokta");
eq(OBI18n.t("badgeViews", "1.2M"), "Views: 1.2M", "en metin");
OBI18n.init("tr");
eq(OBI18n.num(2.4, 1), "2,4", "tr ondalık virgül");
eq(OBI18n.t("badgeViews", "1,2 Mn"), "İzlenme: 1,2 Mn", "tr metin");
eq(OBI18n.t("badgeMedian", "45 B", 27, "video"),
  "Kanal medyanı: 45 B (son 27 video)", "tr yer tutuculu metin");

console.log("--- skor ---");
const { OBScore } = sandbox;
const pool = { video: [], short: null };
[100, 200, 300, 400, 500].forEach((v, i) => pool.video.push({ id: "v" + i, views: v * 1000, age: 10 }));
pool.video.push({ id: "hit", views: 1500000, age: 3 });
const r = OBScore.score("hit", 1500000, false, pool);
eq(r.median, 300000, "medyan kendisi hariç (100..500 bin)");
eq(r.score, 5, "skor 1.5M / 300K");
eq(r.sample, 5, "örnek sayısı");
eq(r.percentile, 1, "hepsinden yüksek");
const low = OBScore.score("v0", 100000, false, pool);
/* v0 çıkınca kalan [200,300,400,500,1500] bin -> medyan 400 bin */
eq(low.median, 400000, "kendisi çıkınca medyan kayar");
const tiny = OBScore.score("x", 5000, false, { video: [{ id: "a", views: 1 }, { id: "b", views: 2 }] });
eq(tiny.score, null, "3'ten az örnek: skor yok");

console.log("\n--- gerçek InnerTube çağrısı ---");
const CHANNEL = process.argv[2] || "UCXuqSBlHAE6Xw-yeJA0Tunw"; /* Linus Tech Tips */
let probe = null;   /* videoDetails'ı sınamak için kanalın güncel bir videosu */
OBTube.channelTab(CHANNEL, "videos", 30).then((items) => {
  console.log("videos sekmesi: " + items.length + " video");
  const withViews = items.filter((v) => v.views);
  console.log("izlenmesi çözülen: " + withViews.length);
  console.log("canlı yayın işaretlenen: " + items.filter((v) => v.wasLive).length);
  console.log("üyelere özel: " + items.filter((v) => v.membersOnly).length);
  for (const v of items.slice(0, 3)) {
    console.log("  " + v.videoId + " | " + OBParse.humanCount(v.views) + " | " +
      (v.ageDays == null ? "?" : v.ageDays.toFixed(1) + " gün") + " | " + v.title.slice(0, 50));
  }
  probe = withViews.length ? withViews[0] : null;
  const views = withViews.map((v) => v.views);
  console.log("medyan: " + OBParse.humanCount(OBParse.median(views)));
  if (withViews.length < 10) { fails++; console.log("FAIL izlenmesi çözülen video sayısı çok düşük"); }
  return OBTube.channelTab(CHANNEL, "shorts", 30);
}).then((shorts) => {
  console.log("shorts sekmesi: " + shorts.length + " video, izlenmesi çözülen: " +
    shorts.filter((v) => v.views).length);
  return OBTube.resolveChannel("@LinusTechTips");
}).then((id) => {
  eq(id, CHANNEL, "handle -> kanal kimliği");
  return OBTube.resolveChannel("@MesutCevik");
}).then((id) => {
  /* Eski özel adresi olan bir kanal: YouTube @handle'ı önce
   * youtube.com/mesutcevik adresine yolluyor, kimlik ancak ikinci adımda
   * geliyor. Tek adımda çözen kod bu kanallarda "kanal çözülemedi" veriyor ve
   * o kanalın hiçbir kartı puanlanmıyordu. */
  eq(id, "UCOFafpmI_dt8SxisbKniN4A", "yönlendirmeli handle -> kanal kimliği");
  /* Bilerek kanalın güncel bir videosu: sabit bir klasik ("dQw4w9WgXcQ")
   * YouTube tarafında ayrıcalıklı davranıp uç bozulduğunda bile yanıt
   * verebiliyor ve testi yanlış yere yeşil gösteriyordu. */
  if (!probe) { fails++; console.log("FAIL sınanacak video bulunamadı"); return {}; }
  return OBTube.videoDetails(probe.videoId);
}).then((d) => {
  console.log("video ucu: kanal " + d.channelId + ", izlenme " + OBParse.humanCount(d.views));
  eq(d.channelId, CHANNEL, "video ucu kanal kimliği");
  if (!d.views) { fails++; console.log("FAIL video ucu izlenme vermedi"); }
  console.log(fails ? "\n" + fails + " test başarısız" : "\nhepsi geçti");
  process.exit(fails ? 1 : 0);
}).catch((e) => {
  console.log("HATA: " + e.message);
  process.exit(1);
});
