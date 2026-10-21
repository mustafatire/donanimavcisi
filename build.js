'use strict';

/**
 * Donanım Avcısı statik site üreticisi.
 *
 * Girdi : portal/firsatlar.json  (Node-RED botunun GitHub'a yazdığı canlı akış)
 * Çıktı : portal/firsatlar-tekno.json, portal/firsat/<slug>/index.html,
 *         portal/kategori/<slug>/index.html, portal/sitemap.xml,
 *         portal/robots.txt, portal/feed.xml, portal/gecmis.json,
 *         portal/arsiv.json, portal/assets/deal.css, portal/404.html
 *
 * Bağımlılık yok; Node 20+ ile çalışır. GitHub Action her bot commit'inde ve
 * saatlik olarak çalıştırıp çıktıları geri commit eder.
 */

const fs = require('fs');
const path = require('path');

const KOK = __dirname;
const PORTAL = path.join(KOK, 'portal');
const SITE = 'https://donanimavcisi.com';
const AFF_TAG = 'motodash-21';
const GECMIS_GUN = 180;      // ASIN başına tutulan fiyat günü
const ARSIV_GUN = 30;        // arşivde tutulan gün
const SAYFA_GUN = 14;        // akıştan çıktıktan sonra sayfası yayında kalan gün
const MAKS_FIRSAT = 300;

const TR_AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const KATEGORILER = {
    'ekran-karti': {
        ad: 'Ekran Kartı', ikon: '🎮',
        aciklama: 'NVIDIA GeForce RTX, AMD Radeon ve Intel Arc ekran kartlarında Amazon Türkiye fiyat düşüşleri; indirim oranı, satıcı fiyatı ve fiyat geçmişiyle birlikte.'
    },
    'islemci': {
        ad: 'İşlemci', ikon: '⚙️',
        aciklama: 'AMD Ryzen ve Intel Core işlemci fırsatları; soket, çekirdek sayısı ve güncel Amazon fiyatı tek sayfada.'
    },
    'anakart': {
        ad: 'Anakart', ikon: '🧩',
        aciklama: 'AM5, AM4 ve LGA1700 anakart indirimleri; çipset, form faktörü ve bellek desteği bilgisiyle doğrulanmış fiyatlar.'
    },
    'ram': {
        ad: 'RAM', ikon: '🧠',
        aciklama: 'DDR4 ve DDR5 RAM kitlerinde güncel indirimler; kapasite, hız, gecikme değerleri ve fiyat geçmişi.'
    },
    'ssd': {
        ad: 'SSD & Depolama', ikon: '💾',
        aciklama: 'NVMe M.2, SATA SSD, taşınabilir disk ve hafıza kartı fırsatları; okuma-yazma hızı ve fiyat geçmişiyle.'
    },
    'kasa-psu': {
        ad: 'Kasa & Güç Kaynağı', ikon: '🔌',
        aciklama: 'Bilgisayar kasası ve güç kaynağı indirimleri; 80+ sertifikası, watt değeri ve kasa tipi bilgisiyle.'
    },
    'sogutma': {
        ad: 'Soğutma', ikon: '❄️',
        aciklama: 'İşlemci soğutucu, sıvı soğutma, kasa fanı ve termal macun fırsatları; TDP ve sessizlik bilgisiyle.'
    },
    'monitor': {
        ad: 'Monitör', ikon: '🖥️',
        aciklama: 'Oyuncu monitörlerinde indirim: yenileme hızı, panel tipi, çözünürlük ve güncel Amazon fiyatı.'
    },
    'cevre-birimleri': { ad: 'Ekipman', ikon: '⌨️', aciklama: 'Klavye, mouse, gamepad ve masaüstü ekipmanlarında güncel fırsatlar.' },
    'laptop': { ad: 'Laptop', ikon: '💻', aciklama: 'Dizüstü bilgisayar ve notebook indirimleri; işlemci, RAM ve ekran bilgisiyle.' },
    'mobil-ses': { ad: 'Mobil & Ses', ikon: '📱', aciklama: 'Telefon, tablet, akıllı saat, kulaklık ve hoparlör fırsatları.' },
    'tv-goruntu': { ad: 'TV & Görüntü', ikon: '📺', aciklama: 'Televizyon, projektör, kamera ve görüntü ekipmanı indirimleri.' },
    'ag-ev': { ad: 'Ağ & Akıllı Ev', ikon: '🌐', aciklama: 'Router, mesh sistem, NAS ve akıllı ev ürünlerinde indirimler.' },
    'sarj': { ad: 'Şarj & Aksesuar', ikon: '🔋', aciklama: 'Şarj cihazı, powerbank, kablo ve aksesuar fırsatları.' }
};

// PC donanımı omurgası: /donanim/ hub'ı ve ana sayfa bu sırayı kullanır.
const BILESEN = ['ekran-karti', 'islemci', 'anakart', 'ram', 'ssd', 'kasa-psu', 'sogutma', 'monitor'];

// ---------------------------------------------------------------- yardımcılar

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function slugify(s) {
    const harf = { 'ı': 'i', 'İ': 'i', 'ş': 's', 'Ş': 's', 'ğ': 'g', 'Ğ': 'g',
        'ü': 'u', 'Ü': 'u', 'ö': 'o', 'Ö': 'o', 'ç': 'c', 'Ç': 'c' };
    return String(s || '')
        .replace(/[ıİşŞğĞüÜöÖçÇ]/g, c => harf[c])
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64)
        .replace(/-+$/g, '');
}

function asinOf(link) {
    const m = String(link || '').match(/(?:dp|gp\/product|gp\/aw\/d|\/d)\/([A-Z0-9]{10})/i);
    return m ? m[1].toUpperCase() : '';
}

function affLink(link) {
    try {
        const u = new URL(link);
        if (/amazon\.com\.tr$/i.test(u.hostname)) u.searchParams.set('tag', AFF_TAG);
        return u.toString();
    } catch (e) {
        return link || `https://www.amazon.com.tr/?tag=${AFF_TAG}`;
    }
}

function tl(n) {
    return Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}

// SEO başlık/açıklama için kelime ortasından kesmeden kısalt.
function kisalt(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (s.length <= n) return s;
    const kesik = s.slice(0, n);
    const bosluk = kesik.lastIndexOf(' ');
    return (bosluk > n * 0.6 ? kesik.slice(0, bosluk) : kesik)
        .replace(/[,;:\-–]+$/, '') + '…';
}

function bugunTR() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
}

function gunFarki(a, b) {
    const x = Date.parse(a + 'T00:00:00Z');
    const y = Date.parse(b + 'T00:00:00Z');
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 9999;
    return Math.round((y - x) / 86400000);
}

function tarihTR(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getDate()} ${TR_AY[d.getMonth()]} ${d.getFullYear()}`;
}

function jsonOku(dosya, varsayilan) {
    try {
        return JSON.parse(fs.readFileSync(dosya, 'utf8'));
    } catch (e) {
        return varsayilan;
    }
}

function jsonYaz(dosya, veri) {
    fs.mkdirSync(path.dirname(dosya), { recursive: true });
    fs.writeFileSync(dosya, JSON.stringify(veri, null, 2) + '\n');
}

function htmlYaz(dosya, icerik) {
    fs.mkdirSync(path.dirname(dosya), { recursive: true });
    fs.writeFileSync(dosya, icerik);
}

// ------------------------------------------------------- tech filtresi/kategori

const TEKNO = new RegExp([
    'ekran kart', '\\brtx\\b', '\\bgtx\\b', 'radeon', '\\brx\\s?\\d', 'nvidia', 'geforce',
    'ryzen', 'intel', 'işlemci', 'islemci', 'anakart', 'motherboard', '\\bb650\\b', '\\bb760\\b',
    '\\bb850\\b', '\\bh610\\b', 'monitör', 'monitor', '\\boled\\b', '\\bqhd\\b', '\\b4k\\b',
    '144\\s?hz', '165\\s?hz', '180\\s?hz', '240\\s?hz', '\\bssd\\b', 'nvme', 'm\\.2', 'harddisk',
    '\\bhdd\\b', '\\bram\\b', 'ddr4', 'ddr5', 'bellek', 'kasa', '\\bpsu\\b', 'power supply',
    'güç kaynağı', 'soğutucu', 'soğutma', 'termal', 'klavye', 'keyboard', '\\bmouse\\b', '\\bfare\\b',
    'kulakl[ıi]', 'headset', 'hoparlör', 'speaker', 'soundbar', 'mikrofon', 'webcam', 'kamera',
    'usb', '\\bhub\\b', 'dock', 'şarj', 'charger', 'powerbank', 'power bank', 'kablo', 'cable',
    'adaptör', 'adapter', 'laptop', 'notebook', 'dizüstü', 'macbook', 'tablet', 'ipad',
    'telefon', 'iphone', 'galaxy', 'xiaomi', 'redmi', 'poco', 'oppo', 'realme', 'honor', 'pixel',
    'akıllı saat', 'smartwatch', 'televizyon', '\\btv\\b', 'projektör', 'projector', 'router',
    'modem', 'wifi', '\\bmesh\\b', '\\bnas\\b', 'ethernet', 'akıllı ev', 'smart home',
    'robot süpürge', 'drone', 'gimbal', 'gopro', 'playstation', '\\bps5\\b', 'xbox', 'nintendo',
    'gamepad', 'oyun kolu', 'konsol', 'e-?reader', 'kindle', 'yazıcı', 'printer', 'tarayıcı',
    'scanner', 'projeksiyon', 'ekran', 'şarj istasyonu', 'type-?c', 'bluetooth'
].join('|'), 'i');

const TEKNO_DEGIL = new RegExp([
    'şampuan', 'jilet', 'tıraş bıçağı', 'deterjan', 'yumuşatıcı', 'bebek bezi', 'hasta bezi',
    '\\bped\\b', '\\bkrem\\b', 'losyon', 'parfüm', 'kolonya', 'makyaj', 'ruj', 'fondöten', 'maske',
    'vitamin', 'takviye', 'gıda', '\\bçay\\b', 'kahve', 'bisküvi', 'çikolata', '\\bşeker\\b',
    'zeytinyağı', 'peynir', '\\bsüt\\b', 'makarna', 'pirinç', 'baharat', '\\bmama\\b', 'peluş',
    'kağıt havlu', 'tuvalet kağıdı', 'peçete', 'çöp poşeti', 'bulaşık', 'çamaşır', 'temizlik',
    'deodorant', 'diş macunu', 'diş fırça', 'sabun', 'duş jeli', 'saç bakım', 'kıyafet',
    'tişört', 'gömlek', 'pantolon', 'ayakkabı', 'çorap', '\\bmont\\b', 'kaban', 'çanta',
    'nevresim', 'havlu', 'yastık', 'battaniye', 'perde', 'halı', 'tencere', 'tava', 'tabak',
    'bardak', 'çatal', 'bıçak', 'kitap', 'roman', 'defter', 'kalem', 'puzzle', 'mangal',
    'bahçe', 'çiçek', 'tohum', 'gübre', 'ilaç', 'medikal', 'bebek',
    'hava pompası', 'kompresör', 'süpürge', 'grill', 'ızgara', 'tost makinesi', 'fritöz',
    'airfryer', 'blender', 'kahve makinesi', 'kettle', 'su ısıtıcı', 'saç kurutma',
    'tıraş makinesi', 'epilasyon', 'ütü'
].join('|'), 'i');

function trKucuk(s) {
    // JS'te "İ".toLowerCase() birleşik nokta üretir; Türkçe I/İ eşlemesini
    // kendimiz yapmazsak "DİŞ FIRÇASI" gibi başlıklar hiç eşleşmez.
    return String(s || '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
}

function teknolojiMi(baslik) {
    const b = trKucuk(baslik);
    if (/bebek kamerası|bebek telsizi|robot süpürge/.test(b)) return true;
    if (!TEKNO.test(b)) return false;
    if (TEKNO_DEGIL.test(b)) return false;
    return true;
}

function kategoriBelirle(baslik) {
    const b = trKucuk(baslik);
    // Şarj aksesuarı, cihazın kendisinden önce gelir (laptop şarj adaptörü vb.).
    if (/şarj (?:cihazı|adaptörü|aleti|istasyonu)|powerbank|power bank|duvar şarj|magsafe/.test(b)) return 'sarj';
    if (/klavye|keyboard|\bmouse\b|\bfare\b|gamepad|oyun kolu|mouse ?pad/.test(b)) return 'cevre-birimleri';
    if (/laptop|notebook|dizüstü|macbook/.test(b)) return 'laptop';
    if (/telefon|iphone|galaxy|xiaomi|redmi|poco|oppo|realme|honor|pixel|tablet|ipad|akıllı saat|smartwatch|airpods|\bbuds\b|kulakl[ıi]|headset|hoparlör|speaker|soundbar|mikrofon|referans monitör/.test(b)) return 'mobil-ses';
    // Televizyon, monitörün "4K/OLED" kalıplarından önce ayrılmalı.
    if (/televizyon|\btv\b|projektör|projektor|projeksiyon|kamera|webcam|gopro|drone|gimbal|action cam/.test(b)) return 'tv-goruntu';
    if (/ekran kart|\brtx\b|\bgtx\b|radeon|\brx\s?\d|nvidia|geforce|\barc\s?a\d/.test(b)) return 'ekran-karti';
    // Anakart, işlemciden önce: "B650 anakart" başlığı işlemci sayılmasın.
    if (/anakart|motherboard|çipset|\bb650\b|\bb760\b|\bb850\b|\bh610\b|\bx670\b|\ba620\b|\bz790\b|\bb550\b|\ba520\b/.test(b)) return 'anakart';
    if (/işlemci|islemci|ryzen|athlon|threadripper|intel core|core i[3579]|\bcpu\b|\bam5\b|\bam4\b|\blga\s?\d{3,4}\b/.test(b)) return 'islemci';
    if (/monitör|monitor|144\s?hz|165\s?hz|180\s?hz|240\s?hz|360\s?hz|\bqhd\b|\b4k\b|\boled\b/.test(b)) return 'monitor';
    if (/\bram\b|ddr4|ddr5|so-?dimm|bellek kiti/.test(b)) return 'ram';
    if (/\bssd\b|nvme|m\.2|harddisk|\bhdd\b|microsd|hafıza kartı|usb bellek|taşınabilir disk|\bsd card\b/.test(b)) return 'ssd';
    if (/soğutucu|soğutma|termal macun|termal ped|radyatör|kasa fan|\bfan\b/.test(b)) return 'sogutma';
    if (/\bkasa\b|kasası|\bpsu\b|power supply|güç kaynağı/.test(b)) return 'kasa-psu';
    if (/router|modem|wifi|\bmesh\b|\bnas\b|switch|ethernet|akıllı ev|smart home|robot süpürge|akıllı ampul|akıllı priz/.test(b)) return 'ag-ev';
    if (/şarj|charger|powerbank|power bank|kablo|cable|adaptör|adapter|dock|\bhub\b|type-?c/.test(b)) return 'sarj';
    return 'cevre-birimleri';
}

// --------------------------------------------------------------------- veriler

const hamVeri = jsonOku(path.join(PORTAL, 'firsatlar.json'), []);
if (!Array.isArray(hamVeri)) {
    console.error('portal/firsatlar.json bir dizi değil; çıkılıyor.');
    process.exit(1);
}

const bugun = bugunTR();
// Zaman damgası olmayan kayıtlar için sabit yedek: çıktı her çalıştırmada
// değişmesin, yoksa Action saatte bir boş commit atar.
const yedekZaman = Date.parse(bugun + 'T00:00:00Z');

// Canlı akıştaki tech ürünleri; aynı ASIN için en yeni kayıt kalır.
const gorulen = new Set();
const canli = [];
let elenen = 0;
for (const f of hamVeri) {
    if (!f || !f.baslik || !f.link) continue;
    if (!teknolojiMi(f.baslik)) { elenen++; continue; }
    const asin = asinOf(f.link) || f.id || slugify(f.baslik);
    if (gorulen.has(asin)) continue;
    gorulen.add(asin);
    const kategori = kategoriBelirle(f.baslik);
    const slug = `${slugify(f.baslik) || 'firsat'}-${slugify(asin)}`;
    canli.push({
        ...f,
        asin,
        slug,
        kategori,
        kategoriAdi: (KATEGORILER[kategori] || KATEGORILER['cevre-birimleri']).ad,
        link: affLink(f.link),
        siteUrl: `${SITE}/firsat/${slug}/`,
        guncel: true
    });
}
canli.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

// Bu üretimde fırsatı olan kategoriler: iç linkler var olmayan kategori
// sayfasına (404) gitmesin.
const doluKategoriler = new Set(canli.map(f => f.kategori));

// Arşiv: akıştan çıkan ürünlerin sayfası bir süre daha yayında kalsın.
const arsiv = jsonOku(path.join(PORTAL, 'arsiv.json'), {});
for (const f of canli) {
    const onceki = arsiv[f.asin] || {};
    // URL kararlılığı: bir ASIN ilk gördüğü slug'ı korur; başlık sonradan
    // değişse bile canonical adres değişmez.
    if (onceki.slug) {
        f.slug = onceki.slug;
        f.siteUrl = `${SITE}/firsat/${f.slug}/`;
    }
    arsiv[f.asin] = {
        ...onceki,
        ...f,
        ilkGorulme: onceki.ilkGorulme || bugun,
        sonGorulme: bugun
    };
}
for (const asin of Object.keys(arsiv)) {
    if (gunFarki(arsiv[asin].sonGorulme, bugun) > ARSIV_GUN) delete arsiv[asin];
    // Filtre kuralları sıkılaştığında eski non-tech kayıtlar sayfa üretmesin.
    else if (!teknolojiMi(arsiv[asin].baslik)) delete arsiv[asin];
}

// Fiyat geçmişi: ASIN -> [{t:'YYYY-MM-DD', f:number}]
const gecmis = jsonOku(path.join(PORTAL, 'gecmis.json'), {});
for (const f of canli) {
    const fiyat = Number(f.yeniFiyat);
    if (!Number.isFinite(fiyat) || fiyat <= 0) continue;
    const dizi = Array.isArray(gecmis[f.asin]) ? gecmis[f.asin] : [];
    const son = dizi[dizi.length - 1];
    if (son && son.t === bugun) {
        son.f = fiyat;
    } else {
        dizi.push({ t: bugun, f: fiyat });
    }
    gecmis[f.asin] = dizi.slice(-GECMIS_GUN);
}
for (const asin of Object.keys(gecmis)) {
    if (!Array.isArray(gecmis[asin]) || gecmis[asin].length === 0) delete gecmis[asin];
}

function istatistik(asin, mevcutFiyat) {
    const dizi = (gecmis[asin] || []).slice(-30);
    const fiyatlar = dizi.map(x => Number(x.f)).filter(n => Number.isFinite(n) && n > 0);
    if (fiyatlar.length === 0) {
        return { nokta: 0, min: null, maks: null, dusuk: false, seri: [] };
    }
    const min = Math.min(...fiyatlar);
    const maks = Math.max(...fiyatlar);
    return {
        nokta: fiyatlar.length,
        min,
        maks,
        dusuk: Number.isFinite(mevcutFiyat) && mevcutFiyat <= min + 0.01,
        seri: dizi
    };
}

// Sayfası yayında kalacak kayıtlar: canlı olanlar + son SAYFA_GUN gün içinde görülenler.
const sayfalar = [];
for (const asin of Object.keys(arsiv)) {
    const a = arsiv[asin];
    const gun = gunFarki(a.sonGorulme, bugun);
    if (gun > SAYFA_GUN) continue;
    if (!a.slug || !a.baslik) continue;
    sayfalar.push({
        ...a,
        guncel: canli.some(x => x.asin === asin),
        gunOnce: gun
    });
}
sayfalar.sort((a, b) => {
    if (a.guncel !== b.guncel) return a.guncel ? -1 : 1;
    return (b.timestamp || 0) - (a.timestamp || 0);
});

// Eski üretimden kalan sayfaları temizle: kategori klasörleri her build'de
// yeniden yazılır; fırsat sayfaları yalnızca yayında kalması gerekenler kalır.
function klasorTemizle(dizin, korunacak) {
    if (!fs.existsSync(dizin)) return;
    for (const ad of fs.readdirSync(dizin)) {
        if (korunacak && korunacak.has(ad)) continue;
        fs.rmSync(path.join(dizin, ad), { recursive: true, force: true });
    }
}
klasorTemizle(path.join(PORTAL, 'kategori'), null);
klasorTemizle(path.join(PORTAL, 'firsat'), new Set(sayfalar.map(f => f.slug)));

// ---------------------------------------------------------------- ortak HTML

const CSS = `:root{--bg:#090d16;--bg2:#0b1220;--card:#101a2b;--card2:#0d1626;--border:#1e293b;--text:#e6edf7;--muted:#94a3b8;--orange:#f97316;--blue:#2563eb;--green:#10b981;--red:#ef4444;--cyan:#22d3ee}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:radial-gradient(circle at 50% -10%,#13213a 0,var(--bg) 45%) no-repeat,var(--bg);color:var(--text);font-family:'Plus Jakarta Sans',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.55;overflow-x:hidden}
a{color:inherit}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
header.site{position:sticky;top:0;z-index:20;background:rgba(9,13,22,.86);backdrop-filter:blur(12px);border-bottom:1px solid var(--border)}
.site-in{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 0}
.logo{display:flex;align-items:center;gap:10px;text-decoration:none;font-weight:800;font-size:19px;letter-spacing:-.4px}
.logo b{color:var(--orange);font-size:22px}
.tg{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#229ed9,#1d8fce);color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:9px 14px;border-radius:10px;white-space:nowrap}
main{padding:28px 0 56px}
.kirinti{display:flex;flex-wrap:wrap;gap:8px;align-items:center;color:var(--muted);font-size:13px;margin-bottom:18px}
.kirinti a{color:var(--muted);text-decoration:none}
.kirinti a:hover{color:var(--text)}
.uyari{background:rgba(249,115,22,.1);border:1px solid rgba(249,115,22,.35);color:#fdba74;border-radius:12px;padding:12px 16px;font-size:14px;margin-bottom:18px}
.kart{background:linear-gradient(180deg,var(--card),var(--card2));border:1px solid var(--border);border-radius:20px;overflow:hidden}
.urun{display:grid;grid-template-columns:minmax(260px,420px) 1fr;gap:28px;padding:28px}
.gorsel{background:#fff;border-radius:16px;display:flex;align-items:center;justify-content:center;padding:18px;min-height:320px}
.gorsel img{width:100%;max-height:380px;object-fit:contain;display:block}
.rozet{display:inline-flex;align-items:center;gap:6px;background:rgba(249,115,22,.12);border:1px solid rgba(249,115,22,.4);color:#fdba74;font-size:12px;font-weight:700;padding:5px 10px;border-radius:999px;margin-bottom:12px}
h1{font-size:clamp(21px,2.6vw,29px);line-height:1.3;margin:0 0 14px;letter-spacing:-.5px;overflow-wrap:anywhere}
.fiyatlar{display:flex;align-items:baseline;flex-wrap:wrap;gap:12px;margin:6px 0 10px}
.eski{color:var(--muted);text-decoration:line-through;font-size:17px}
.yeni{font-size:36px;font-weight:800;color:#fff;letter-spacing:-1px}
.indirim{background:rgba(16,185,129,.14);border:1px solid rgba(16,185,129,.4);color:#6ee7b7;font-weight:800;font-size:13px;padding:5px 10px;border-radius:8px}
.kazanc{color:#86efac;font-size:14px;font-weight:600;margin-bottom:16px}
.rozetler{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 18px}
.rozetler span{background:rgba(37,99,235,.12);border:1px solid rgba(37,99,235,.35);color:#93c5fd;font-size:12px;font-weight:600;padding:5px 10px;border-radius:8px}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:16px 20px;border-radius:12px;text-decoration:none;font-weight:800;font-size:16px;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;box-shadow:0 10px 26px rgba(249,115,22,.25);transition:transform .15s ease}
.btn:hover{transform:translateY(-1px)}
.btn.alt{background:transparent;border:1px solid var(--border);color:#cbd5e1;box-shadow:none;font-size:13px;font-weight:600;padding:11px}
.not{color:var(--muted);font-size:12px;text-align:center;margin-top:10px}
.bolum{margin-top:26px;background:linear-gradient(180deg,var(--card),var(--card2));border:1px solid var(--border);border-radius:20px;padding:24px 26px}
.bolum h2{font-size:18px;margin:0 0 14px;letter-spacing:-.3px}
.bolum p{color:var(--muted);font-size:14px;margin:0 0 10px}
.grafig{width:100%;height:auto;display:block;margin:10px 0 6px}
.grafig .cizgi{fill:none;stroke:var(--cyan);stroke-width:3;stroke-linejoin:round;stroke-linecap:round}
.grafig .alan{fill:rgba(34,211,238,.10)}
.grafig .izgara{stroke:#1e293b;stroke-width:1}
.grafig text{fill:#64748b;font-size:11px;font-family:inherit}
.istat{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}
.istat div{background:rgba(15,23,42,.7);border:1px solid var(--border);border-radius:10px;padding:9px 13px;font-size:12px;color:var(--muted)}
.istat b{display:block;color:var(--text);font-size:15px;margin-top:2px}
.liste{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
.mini{background:rgba(15,23,42,.6);border:1px solid var(--border);border-radius:14px;padding:14px;text-decoration:none;display:flex;flex-direction:column;gap:8px;transition:border-color .15s}
.mini:hover{border-color:#334155}
.mini img{width:100%;height:120px;object-fit:contain;background:#fff;border-radius:8px;padding:8px}
.mini b{font-size:13px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.mini span{color:var(--muted);font-size:12px}
.mini em{color:#fdba74;font-style:normal;font-weight:800;font-size:14px}
.hw-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;margin:16px 0 6px}
.hw{display:flex;flex-direction:column;gap:4px;background:rgba(15,23,42,.6);border:1px solid var(--border);border-radius:14px;padding:16px;text-decoration:none;transition:border-color .15s}
.hw:hover{border-color:#334155}
.hw>span{font-size:22px;line-height:1.2}
.hw b{font-size:14px}
.hw em{color:var(--muted);font-style:normal;font-size:12px}
.hw.bos{opacity:.5}
.hw.liste{display:block}
.bolum h2{scroll-margin-top:80px}
footer{color:#64748b;font-size:12px;border-top:1px solid var(--border);padding:22px 0;text-align:center}
footer a{color:#94a3b8;text-decoration:none}
@media(max-width:720px){.urun{grid-template-columns:1fr;padding:18px;gap:18px}.gorsel{min-height:240px}.yeni{font-size:30px}.bolum{padding:18px}}
`;

function sayfaSablonu({ baslik, aciklama, canonical, resim, jsonLd, noindex, icerik }) {
    return `<!DOCTYPE html>
<html lang="tr" translate="no">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(baslik)}</title>
<meta name="description" content="${esc(aciklama)}">
${noindex ? '<meta name="robots" content="noindex,follow">' : '<meta name="robots" content="index,follow,max-image-preview:large">'}
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:locale" content="tr_TR">
<meta property="og:type" content="product">
<meta property="og:site_name" content="Donanım Avcısı">
<meta property="og:title" content="${esc(baslik)}">
<meta property="og:description" content="${esc(aciklama)}">
<meta property="og:url" content="${esc(canonical)}">
${resim ? `<meta property="og:image" content="${esc(resim)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#090d16">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/deal.css">
${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ''}
<script async src="https://www.googletagmanager.com/gtag/js?id=AW-18436972630"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','AW-18436972630');</script>
</head>
<body>
<header class="site"><div class="wrap site-in">
<a class="logo" href="/"><b>⚡</b> Donanım Avcısı</a>
<a class="tg" href="https://t.me/donanimavcisi" target="_blank" rel="noopener">Telegram'a Katıl</a>
</div></header>
<main><div class="wrap">${icerik}</div></main>
<footer><div class="wrap">
Bu sitedeki Amazon linkleri ortaklık (affiliate) linkidir; alışverişinizden komisyon kazanabiliriz.
Fiyatlar satıcı tarafından değiştirilebilir.<br>
${altBaglantilar()}
</div></footer>
</body>
</html>`;
}

// Her sayfanın altında donanım odaklı iç linkler; boş kategoriye link vermez.
function altBaglantilar() {
    const parcalar = ['<a href="/">Canlı fırsat akışı</a>', '<a href="/donanim/">PC donanımı</a>'];
    for (const k of BILESEN) {
        if (doluKategoriler.has(k)) parcalar.push(`<a href="/kategori/${k}/">${KATEGORILER[k].ad}</a>`);
    }
    parcalar.push(`<a href="https://t.me/donanimavcisi" target="_blank" rel="noopener">Telegram</a>`);
    return parcalar.join(' · ');
}

function fiyatGrafiği(seri) {
    if (!seri || seri.length < 2) return '';
    const G = 640, Y = 150, P = 28;
    const fiyatlar = seri.map(x => Number(x.f));
    let min = Math.min(...fiyatlar), maks = Math.max(...fiyatlar);
    if (maks === min) { maks = min + 1; }
    const nokta = seri.map((x, i) => {
        const px = P + (i * (G - 2 * P)) / (seri.length - 1);
        const py = Y - P - ((Number(x.f) - min) / (maks - min)) * (Y - 2 * P);
        return `${px.toFixed(1)},${py.toFixed(1)}`;
    });
    const alan = `M${nokta[0]} L${nokta.join(' L')} L${(G - P).toFixed(1)},${Y - P} L${P},${Y - P} Z`;
    const ilk = seri[0].t.slice(5).replace('-', '.');
    const son = seri[seri.length - 1].t.slice(5).replace('-', '.');
    return `<svg class="grafig" viewBox="0 0 ${G} ${Y}" role="img" aria-label="Son fiyat geçmişi">
<line class="izgara" x1="${P}" y1="${Y - P}" x2="${G - P}" y2="${Y - P}"/>
<path class="alan" d="${alan}"/>
<polyline class="cizgi" points="${nokta.join(' ')}"/>
<text x="${P}" y="${Y - 6}">${esc(ilk)}</text>
<text x="${G - P}" y="${Y - 6}" text-anchor="end">${esc(son)}</text>
<text x="${P}" y="16">${tl(maks)} TL</text>
<text x="${P}" y="${Y - P - 6}">${tl(min)} TL</text>
</svg>`;
}

// -------------------------------------------------------------- sayfa üretimi

const urls = [{ loc: `${SITE}/`, changefreq: 'hourly', priority: '1.0' }];

// 1) Fırsat sayfaları
for (const f of sayfalar) {
    const ist = istatistik(f.asin, Number(f.yeniFiyat));
    const yol = path.join(PORTAL, 'firsat', f.slug, 'index.html');
    const baslik = `${kisalt(f.baslik, 48)} – ${tl(f.yeniFiyat)} TL | Donanım Avcısı`;
    const aciklama = kisalt(`${kisalt(f.baslik, 68)} şu an ${tl(f.yeniFiyat)} TL` +
        (f.eskiFiyat > f.yeniFiyat ? ` (${tl(f.eskiFiyat)} TL yerine, %${f.indirimOrani} indirim)` : '') +
        `. Amazon Türkiye fırsatı, fiyat geçmişi ve güncel indirim oranı Donanım Avcısı'nda.`, 155);

    const urunLd = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: f.baslik,
        image: f.resim ? [f.resim] : undefined,
        sku: f.asin,
        description: `${f.baslik} – Amazon Türkiye fiyatı ${tl(f.yeniFiyat)} TL.`,
        offers: {
            '@type': 'Offer',
            url: f.link,
            priceCurrency: 'TRY',
            price: String(Number(f.yeniFiyat) || 0),
            availability: 'https://schema.org/InStock',
            seller: { '@type': 'Organization', name: 'Amazon.com.tr' }
        }
    };
    const bilesenMi = BILESEN.includes(f.kategori);
    const kirintiOgeler = [
        { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: `${SITE}/` }
    ];
    if (bilesenMi) {
        kirintiOgeler.push({ '@type': 'ListItem', position: 2, name: 'PC Donanımı', item: `${SITE}/donanim/` });
    }
    kirintiOgeler.push(
        { '@type': 'ListItem', position: kirintiOgeler.length + 1, name: f.kategoriAdi, item: `${SITE}/kategori/${f.kategori}/` },
        { '@type': 'ListItem', position: kirintiOgeler.length + 2, name: f.baslik, item: f.siteUrl }
    );
    const kirintiLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: kirintiOgeler
    };
    const jsonLd = JSON.stringify([urunLd, kirintiLd]).replace(/</g, '\\u003c');

    const kirinti = `<nav class="kirinti"><a href="/">Ana Sayfa</a>${bilesenMi ? ' › <a href="/donanim/">PC Donanımı</a>' : ''} › <a href="/kategori/${f.kategori}/">${esc(f.kategoriAdi)}</a> › <span>${esc(f.baslik.slice(0, 60))}…</span></nav>`;
    const uyari = !f.guncel
        ? `<div class="uyari">Bu fırsat canlı akıştan çıktı (son görülme: ${esc(tarihTR(f.sonGorulme + 'T12:00:00'))}). Fiyat değişmiş olabilir; güncel fiyatı Amazon sayfasında kontrol edin.</div>`
        : '';

    const rozetler = [];
    if (ist.dusuk && ist.nokta >= 2) rozetler.push('📉 Son 30 günün en düşük fiyatı');
    if (Number(f.indirimOrani) >= 20) rozetler.push('🚨 Yüksek indirim');
    if (f.guncel) rozetler.push('🟢 Canlı akışta');

    const icerik = `${kirinti}${uyari}
<article class="kart"><div class="urun">
<div class="gorsel"><img src="${esc(f.resim || '')}" alt="${esc(f.baslik)}" width="420" height="380" loading="eager" referrerpolicy="no-referrer"></div>
<div>
<div class="rozet">${esc(f.rozet || '🔥 FIRSAT')}</div>
<h1>${esc(f.baslik)}</h1>
<div class="fiyatlar">
${Number(f.eskiFiyat) > Number(f.yeniFiyat) ? `<span class="eski">${tl(f.eskiFiyat)} TL</span>` : ''}
<span class="yeni">${tl(f.yeniFiyat)} TL</span>
<span class="indirim">%${esc(f.indirimOrani || 0)} indirim</span>
</div>
${Number(f.netKazanc) > 0 ? `<div class="kazanc">💵 Net kazanç: ${tl(f.netKazanc)} TL</div>` : ''}
<div class="rozetler">${rozetler.map(r => `<span>${esc(r)}</span>`).join('')}</div>
<a class="btn" href="${esc(f.link)}" target="_blank" rel="nofollow sponsored noopener">🛒 Amazon'da İncele ve Satın Al ➔</a>
<a class="btn alt" href="https://t.me/donanimavcisi" target="_blank" rel="noopener">Anlık fırsatlar için Telegram kanalına katıl</a>
<div class="not">Fiyat ve stok bilgisi satıcı tarafından değiştirilebilir.</div>
</div></div></article>

<section class="bolum">
<h2>📈 Fiyat geçmişi</h2>
${fiyatGrafiği(ist.seri)}
${ist.nokta >= 1
        ? `<div class="istat">
<div>İzlenen gün<b>${ist.nokta}</b></div>
<div>En düşük<b>${tl(ist.min)} TL</b></div>
<div>En yüksek<b>${tl(ist.maks)} TL</b></div>
<div>Şu an<b>${tl(f.yeniFiyat)} TL</b></div>
</div>`
        : `<p>Bu ürün için fiyat geçmişi yeni oluşturuluyor; yarın tekrar bakın.</p>`}
${ist.dusuk && ist.nokta >= 2 ? `<p style="margin-top:12px;color:#6ee7b7">✅ Bu fiyat, son 30 günde kaydedilen en düşük fiyatla aynı seviyede.</p>` : ''}
</section>

<section class="bolum">
<h2>🛡️ Neden bu fırsat?</h2>
<p>• Ürün adı ve fiyatı Amazon Türkiye sayfasından okunur; forum veya kanal başlığı kullanılmaz.</p>
<p>• İndirim oranı, listelenen eski fiyat ile güncel fiyat karşılaştırılarak hesaplanır.</p>
<p>• Fiyat geçmişi her gün otomatik kaydedilir; "son 30 günün dibi" rozeti bu kayıtlara dayanır.</p>
<p>• Bağlantı, Donanım Avcısı ortaklık etiketini taşır; fiyatı siz yine Amazon'da görürsünüz.</p>
</section>`;

    htmlYaz(yol, sayfaSablonu({
        baslik, aciklama, canonical: f.siteUrl, resim: f.resim,
        jsonLd, noindex: !f.guncel, icerik
    }));

    if (f.guncel) {
        urls.push({
            loc: f.siteUrl,
            lastmod: new Date(f.timestamp || yedekZaman).toISOString().slice(0, 10),
            changefreq: 'daily',
            priority: '0.8'
        });
    }
}

// 2) Kategori sayfaları
const kategoriGrubu = {};
for (const f of sayfalar) {
    if (!f.guncel) continue;
    (kategoriGrubu[f.kategori] = kategoriGrubu[f.kategori] || []).push(f);
}
for (const [kategori, liste] of Object.entries(kategoriGrubu)) {
    const meta = KATEGORILER[kategori] || KATEGORILER['cevre-birimleri'];
    const canonical = `${SITE}/kategori/${kategori}/`;
    const baslik = `${meta.ad} Fırsatları | Donanım Avcısı`;
    const aciklama = kisalt(`${meta.ad} kategorisindeki güncel Amazon Türkiye fırsatları: ${liste.slice(0, 3).map(x => x.baslik).join(', ')}.`, 155);
    const kartlar = liste.map(f => `<a class="mini" href="/firsat/${f.slug}/">
<img src="${esc(f.resim || '')}" alt="${esc(f.baslik)}" loading="lazy" referrerpolicy="no-referrer">
<b>${esc(f.baslik)}</b>
<span>${esc(f.rozet || 'Fırsat')}</span>
<em>${tl(f.yeniFiyat)} TL${Number(f.eskiFiyat) > Number(f.yeniFiyat) ? ` · %${esc(f.indirimOrani)} indirim` : ''}</em>
</a>`).join('');
    const bilesenMi = BILESEN.includes(kategori);
    const digerleri = BILESEN.filter(k => k !== kategori)
        .map(k => {
            const m = KATEGORILER[k];
            return doluKategoriler.has(k)
                ? `<a class="hw" href="/kategori/${k}/"><span>${m.ikon}</span><b>${esc(m.ad)}</b><em>${(kategoriGrubu[k] || []).length} fırsat</em></a>`
                : `<div class="hw bos"><span>${m.ikon}</span><b>${esc(m.ad)}</b><em>Fırsat bekleniyor</em></div>`;
        })
        .join('');
    const icerik = `<nav class="kirinti"><a href="/">Ana Sayfa</a>${bilesenMi ? ' › <a href="/donanim/">PC Donanımı</a>' : ''} › <span>${esc(meta.ad)}</span></nav>
<h1>${esc(meta.ad)} fırsatları</h1>
<p style="color:#94a3b8;margin:0 0 10px;max-width:760px">${esc(meta.aciklama || '')}</p>
<p style="color:#64748b;margin:0 0 20px">${liste.length} güncel fırsat · fiyatlar Amazon Türkiye'den otomatik okunur</p>
<div class="liste">${kartlar || '<p>Şu an bu kategoride fırsat yok.</p>'}</div>
${bilesenMi ? `<section class="bolum"><h2>Diğer donanım kategorileri</h2><div class="hw-grid">${digerleri}</div><p style="margin-top:14px"><a href="/donanim/" style="color:#93c5fd">Tüm PC donanımı kategorileri ➔</a></p></section>` : ''}`;
    const listeLd = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `${meta.ad} fırsatları`,
        numberOfItems: liste.length,
        itemListElement: liste.map((f, i) => ({
            '@type': 'ListItem', position: i + 1, url: f.siteUrl, name: f.baslik
        }))
    }).replace(/</g, '\\u003c');
    htmlYaz(path.join(PORTAL, 'kategori', kategori, 'index.html'), sayfaSablonu({
        baslik, aciklama, canonical, resim: liste[0] && liste[0].resim,
        jsonLd: listeLd, noindex: liste.length === 0, icerik
    }));
    urls.push({ loc: canonical, changefreq: 'hourly', priority: '0.7' });
}

// 3) PC donanımı hub'ı — kategoriler boşken de yayında kalır ve iç link verir.
const bilesenListe = BILESEN.map(k => ({ k, meta: KATEGORILER[k], liste: kategoriGrubu[k] || [] }));
const bilesenSayisi = bilesenListe.reduce((n, x) => n + x.liste.length, 0);
const bilesenKartlari = bilesenListe.map(({ k, meta, liste }) => {
    if (liste.length === 0) {
        return `<div class="hw bos"><span>${meta.ikon}</span><b>${esc(meta.ad)}</b><em>Fırsat bekleniyor</em></div>`;
    }
    const en = Math.min(...liste.map(f => Number(f.yeniFiyat)).filter(n => Number.isFinite(n) && n > 0));
    return `<a class="hw" href="/kategori/${k}/"><span>${meta.ikon}</span><b>${esc(meta.ad)}</b><em>${liste.length} fırsat${Number.isFinite(en) ? ` · ${tl(en)} TL'den` : ''}</em></a>`;
}).join('');
const bilesenFirsatlar = sayfalar.filter(f => f.guncel && BILESEN.includes(f.kategori)).slice(0, 8);
const digerKategoriler = Object.keys(KATEGORILER).filter(k => !BILESEN.includes(k) && doluKategoriler.has(k));
const digerLinkler = digerKategoriler.map(k => `<a class="hw" href="/kategori/${k}/"><span>${KATEGORILER[k].ikon}</span><b>${esc(KATEGORILER[k].ad)}</b><em>${(kategoriGrubu[k] || []).length} fırsat</em></a>`).join('');

const donanimIcerik = `<nav class="kirinti"><a href="/">Ana Sayfa</a> › <span>PC Donanımı</span></nav>
<h1>PC donanımı fırsatları</h1>
<p style="color:#94a3b8;max-width:780px;margin:0 0 10px">Ekran kartı, işlemci, anakart, RAM, SSD, kasa, güç kaynağı, soğutma ve monitör fiyatlarını Amazon Türkiye üzerinden takip ediyoruz. Bir parçanın fiyatı düştüğünde sayfası burada listelenir; her fırsatın fiyat geçmişini ve son 30 günün en düşük seviyesini kendiliğinden kaydediyoruz.</p>
<p style="color:#64748b;margin:0 0 18px">${bilesenSayisi} güncel donanım fırsatı · ${BILESEN.length} parça kategorisi</p>
${bilesenSayisi === 0
        ? `<div class="uyari">Şu an bu kategorilerde doğrulanmış fırsat yok; botumuz parçaları taramaya devam ediyor. İlk fırsat yakalandığında burada listelenecek. Bu arada <a href="/" style="color:#fdba74">canlı akıştaki diğer teknoloji fırsatlarına</a> göz atabilirsiniz.</div>`
        : ''}
<div class="hw-grid">${bilesenKartlari}</div>

${bilesenFirsatlar.length ? `<section class="bolum">
<h2>🔥 Son eklenen donanım fırsatları</h2>
<div class="liste">${bilesenFirsatlar.map(f => `<a class="mini" href="/firsat/${f.slug}/">
<img src="${esc(f.resim || '')}" alt="${esc(f.baslik)}" loading="lazy" referrerpolicy="no-referrer">
<b>${esc(f.baslik)}</b>
<span>${esc(f.kategoriAdi)} · ${esc(f.rozet || 'Fırsat')}</span>
<em>${tl(f.yeniFiyat)} TL${Number(f.eskiFiyat) > Number(f.yeniFiyat) ? ` · %${esc(f.indirimOrani)} indirim` : ''}</em>
</a>`).join('')}</div>
</section>` : ''}

<section class="bolum">
<h2>🧪 Fiyatları nasıl doğruluyoruz?</h2>
<p>Botumuz ürün adını ve fiyatını yalnızca Amazon Türkiye ürün sayfasından okur; forum veya kanal başlığı kullanılmaz. Böylece "RTX 4070" başlıklı bir gönderinin altında farklı bir ürün satılması durumu fırsat sayfasına yansımaz.</p>
<p>Her ürünün fiyatı günlük olarak kaydedilir. Sayfadaki grafik son 30 günü gösterir; "son 30 günün en düşük fiyatı" rozeti bu kayıtlara dayanır ve sahte indirimleri ayıklamaya yardımcı olur.</p>
<p>Fiyatlar satıcı tarafından her an değiştirilebilir. Sayfadaki tutar ile Amazon sepetindeki tutar farklıysa satın alma sayfasındaki güncel fiyat geçerlidir.</p>
</section>

${digerLinkler ? `<section class="bolum">
<h2>Diğer teknoloji fırsatları</h2>
<div class="hw-grid">${digerLinkler}</div>
</section>` : ''}`;

const donanimLd = JSON.stringify([
    {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'PC Donanımı Fırsatları',
        url: `${SITE}/donanim/`,
        inLanguage: 'tr-TR',
        description: 'Ekran kartı, işlemci, anakart, RAM, SSD, kasa, güç kaynağı, soğutma ve monitör fırsatları.'
    },
    {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Ana Sayfa', item: `${SITE}/` },
            { '@type': 'ListItem', position: 2, name: 'PC Donanımı', item: `${SITE}/donanim/` }
        ]
    }
]).replace(/</g, '\\u003c');

htmlYaz(path.join(PORTAL, 'donanim', 'index.html'), sayfaSablonu({
    baslik: `PC Donanımı Fırsatları: Ekran Kartı, İşlemci, RAM, SSD | Donanım Avcısı`,
    aciklama: kisalt(`Ekran kartı, işlemci, anakart, RAM, SSD, kasa, güç kaynağı, soğutma ve monitör fırsatları. Amazon Türkiye fiyatları ve fiyat geçmişiyle doğrulanmış ${bilesenSayisi} donanım fırsatı.`, 155),
    canonical: `${SITE}/donanim/`,
    resim: bilesenFirsatlar[0] && bilesenFirsatlar[0].resim,
    jsonLd: donanimLd,
    icerik: donanimIcerik
}));
urls.push({
    loc: `${SITE}/donanim/`,
    lastmod: new Date(bilesenFirsatlar.reduce((en, f) => Math.max(en, f.timestamp || 0), 0) || yedekZaman).toISOString().slice(0, 10),
    changefreq: 'hourly',
    priority: '0.9'
});

// 4) sitemap / robots / RSS / 404
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join('\n')}
</urlset>
`;
htmlYaz(path.join(PORTAL, 'sitemap.xml'), sitemap);

htmlYaz(path.join(PORTAL, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

// lastBuildDate her çalıştırmada değişirse Action saatte bir boş commit atar.
// En yeni fırsatın zamanını kullan; yeni fırsat yoksa günün başlangıcı.
const rssZaman = sayfalar.filter(f => f.guncel).reduce((en, f) => Math.max(en, f.timestamp || 0), 0) ||
    yedekZaman;
const rssTarihi = new Date(rssZaman).toUTCString();
const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Donanım Avcısı | Canlı Donanım Fırsatları</title>
<link>${SITE}/</link>
<description>Amazon Türkiye'den otomatik doğrulanan donanım ve elektronik fırsatları.</description>
<language>tr-TR</language>
<lastBuildDate>${rssTarihi}</lastBuildDate>
${sayfalar.filter(f => f.guncel).slice(0, 50).map(f => `  <item>
    <title>${esc(f.baslik)}</title>
    <link>${esc(f.siteUrl)}</link>
    <guid isPermaLink="true">${esc(f.siteUrl)}</guid>
    <pubDate>${new Date(f.timestamp || rssZaman).toUTCString()}</pubDate>
    <description>${esc(`${f.baslik} – ${tl(f.yeniFiyat)} TL (%${f.indirimOrani} indirim)`)}</description>
  </item>`).join('\n')}
</channel></rss>
`;
htmlYaz(path.join(PORTAL, 'feed.xml'), rss);

htmlYaz(path.join(PORTAL, '404.html'), sayfaSablonu({
    baslik: 'Sayfa bulunamadı | Donanım Avcısı',
    aciklama: 'Aradığınız sayfa bulunamadı. Canlı fırsat akışına dönün.',
    canonical: `${SITE}/404.html`,
    noindex: true,
    icerik: `<h1>404 – Sayfa bulunamadı</h1><p style="color:#94a3b8">Aradığınız fırsat sona ermiş veya adres yanlış olabilir.</p><p><a class="btn" style="max-width:320px" href="/">Canlı fırsat akışına dön</a></p>`
}));

// 4) Veri dosyaları
jsonYaz(path.join(PORTAL, 'firsatlar-tekno.json'), canli.slice(0, MAKS_FIRSAT));
jsonYaz(path.join(PORTAL, 'arsiv.json'), arsiv);
jsonYaz(path.join(PORTAL, 'gecmis.json'), gecmis);
fs.mkdirSync(path.join(PORTAL, 'assets'), { recursive: true });
fs.writeFileSync(path.join(PORTAL, 'assets', 'deal.css'), CSS);

console.log(`Kaynak ${hamVeri.length} kayıt · tech ${canli.length} · elenen ${elenen}`);
console.log(`Sayfa ${sayfalar.length} (güncel ${sayfalar.filter(f => f.guncel).length}) · kategori ${Object.keys(kategoriGrubu).length}`);
console.log(`Fiyat geçmişi ${Object.keys(gecmis).length} ASIN · arşiv ${Object.keys(arsiv).length}`);
console.log(`Sitemap ${urls.length} URL`);
