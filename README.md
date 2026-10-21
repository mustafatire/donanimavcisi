# Donanım Avcısı

Amazon Türkiye fırsatlarını yayınlayan statik site. Node-RED botu `portal/firsatlar.json` dosyasını günceller; GitHub Action bu dosyadan SEO sayfalarını üretip geri commit eder. Cloudflare Pages `portal/` klasörünü yayınlar.

## Üretim

```bash
node build.js
```

Çıktılar:

- `portal/firsatlar-tekno.json` — tech-only canlı akış (ana sayfa bunu okur)
- `portal/firsat/<slug>/index.html` — ürün fırsat sayfası (JSON-LD, OG, fiyat geçmişi)
- `portal/kategori/<slug>/index.html` — kategori sayfaları (PC donanımı kategorileri önce gelir)
- `portal/donanim/index.html` — PC donanımı hub'ı; kategoriler boşken de yayında kalır
- `portal/sitemap.xml`, `portal/robots.txt`, `portal/feed.xml`
- `portal/gecmis.json` — ASIN başına günlük fiyat geçmişi
- `portal/arsiv.json` — akıştan çıkan ürünlerin 30 günlük arşivi
- `portal/assets/deal.css`, `portal/404.html`
- `portal/_redirects` — eski kategori adreslerinin (ör. `/kategori/ssd-ram/`) Cloudflare yönlendirmeleri

`build.js` bağımlılık gerektirmez. `.github/workflows/site-build.yml` her bot commit'inde ve saatte bir çalışır.

## Kategori tespiti

Tech filtresi ve kategori sınıflandırması `build.js` içindedir. Akıştaki kozmetik/gıda/giyim gibi ürünler siteye alınmaz.

PC donanımı omurgası `BILESEN` listesidir: `ekran-karti, islemci, anakart, ram, ssd, kasa-psu, sogutma, monitor`. Bu kategoriler ana sayfadaki donanım şeridinde ve `/donanim/` hub'ında her zaman görünür; fırsatı olmayanlar "Fırsat bekleniyor" olarak işaretlenir. Diğer kategoriler (ekipman, laptop, mobil-ses, tv-goruntu, ag-ev, sarj) ikincil akıştır.

Yeni bir kategori eklemek için `KATEGORILER` tablosunu (ad, ikon, `aciklama`), gerekirse `BILESEN` listesini ve ana sayfadaki pill/şerit listesini güncelleyin. Kategori slug'ı değiştirilirse `portal/_redirects` dosyasına 301 ekleyin.
