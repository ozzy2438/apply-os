# Kaynak incelemesi ve yapılan tasarım değişiklikleri

## İncelenen kaynaklar

Kullanıcının yüklediği `files.zip` içindeki sekiz dosyanın tamamı okundu: README.md, questions.ts, weights.ts, rank.ts, role.json, resumes.json, package.json, tsconfig.json. Orijinal byte hash’leri `SOURCE_MANIFEST.json` içindedir. Ayrıca konuşmadaki canonical profile ve decision-policy yapıları, uyarlama sınırını belirlemek için incelendi. Tarihsel profil kopyaları bu pakete konulmadı ve değiştirilmedi.

## Kaynaktan korunanlar

Dokuz dar puanlama sorusu; her kriterin kendi seviye sayısına göre normalizasyonu; ağırlıklı toplama; ayrı confidence; role göre ağırlık profilleri; önce en önemli sunum zayıflıklarına bakma; aynı işe ait CV sürümlerini karşılaştırma fikri. Altı ağırlık tablosunun sayıları orijinal `weights.ts` ile aynıdır.

## Düzeltilenler

`strong_shortlist` ve `unlikely_to_shortlist` yerine yalnız CV sunum kalitesi durumları var. Düşük Jev confidence’ın insan recruiter's aynı derecede kararsız olacağı anlamına geldiği iddiası çıkarıldı. NDA müşterileri kişisel/kurumsal isim açıklamadıkları için otomatik cezalandırılmıyor. Tarih açıklığı kesintisiz istihdamla eş tutulmuyor. “Sayısal sonuç yoksa sayı ekle” teşviki kaldırıldı; dürüst nitel deliverable veya olumsuz bulgu da değerlidir.

Kaynak ranker’ın kontrolsüz `Promise.all(resumes.map(...))` akışı ve bütün CV’leri ücretli çağrıya sokan CLI, uygulama içi kullanıcı talebine bağlı tek-job pipeline ile değiştirildi. Dosya yolları gerçek `src/` yapısına taşındı. Varsayılanlar yeni API key istemez. Ham model cevabına TypeScript cast atmak yerine finite/range/eksik-alan kontrolleri konuldu.

## Bu pakette yeni olanlar

ResumeContext projection, reusable approved claim cards, deterministic coverage planı, ID-only draft assembly, pending rewrite önerisi, hash’e bağlı onaylar, explicit mock/template/unavailable durumları, HTML/metin rendering, gerçek export ölçümü için receipt sözleşmesi, sürüm ve tenant içeren cache key, bounded revision, fixture’lı regresyon testleri.

Bunlar kaynak ZIP’te zaten varmış gibi sunulmamalıdır: bu optimizasyonda eklenen tasarım ve kod parçalarıdır.

## Sınırlar

Kaynak veri yanlışsa, JSON Schema veya model confidence bunu doğruya dönüştürmez. Kusursuz AUC tek başına leakage’ı ispatlamaz. P02 exclusion’ı mevcut profilin kullanım sınırı olarak korunur; test edilmemiş leakage teşhisi yeni bir gerçek olarak eklenmez. Aynı şekilde “piyasada nadir”, “ret sebebi kesin budur” gibi varsayımlar kod/prompt içinde karar gerçeği yapılmaz.

Jev’in resmi JavaScript SDK deposunun erişilebilen quickstart’ı `TypeSafeClient.systemOne({state, questions})` temel yaklaşımını destekliyor. Ayrıntılı Score dokümantasyon sayfaları bu ortamda getirilemedi; SDK kurulumu da ağ/DNS nedeniyle yapılamadı. Bu nedenle Score adapter’ı kaynak ZIP’teki kontrata göre hazırlanıp mock transport ile test edildi. **Canlı SDK/protokol uyumluluğu Cursor entegrasyonunda doğrulanmalıdır.**

Resmi SDK referansı: https://github.com/typesafe-ai/typesafe-sdk-js
İnceleme tarihi: 2026-09-19. Hız, maliyet, işe alınma olasılığı veya “ATS geçme oranı” benchmark’ı üretilmedi.
