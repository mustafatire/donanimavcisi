# Donanım Avcısı

Amazon Türkiye fırsatlarını yayınlayan statik site. Node-RED botu `portal/firsatlar.json` dosyasını günceller; GitHub Action bu dosyadan SEO sayfalarını üretip geri commit eder. Cloudflare Pages `portal/` klasörünü yayınlar.

## Üretim

```bash
node build.js
```

Çıktılar:

- `portal/firsatlar-tekno.json` — tech-only canlı akış (ana sayfa bunu okur)
- `portal/firsat/<slug>/index.html` — ürün fırsat sayfası (JSON-LD, OG, fiyat geçmişi)
- `portal/kategori/<slug>/index.html` — kategori sayfaları
- `portal/sitemap.xml`, `portal/robots.txt`, `portal/feed.xml`
- `portal/gecmis.json` — ASIN başına günlük fiyat geçmişi
- `portal/arsiv.json` — akıştan çıkan ürünlerin 30 günlük arşivi
- `portal/assets/deal.css`, `portal/404.html`

`build.js` bağımlılık gerektirmez. `.github/workflows/site-build.yml` her bot commit'inde ve saatte bir çalışır.

## Kategori tespiti

Tech filtresi ve kategori sınıflandırması `build.js` içindedir. Akıştaki kozmetik/gıda/giyim gibi ürünler siteye alınmaz. Yeni bir kategori eklemek için `KATEGORILER` tablosunu ve ana sayfadaki pill listesini güncelleyin.
