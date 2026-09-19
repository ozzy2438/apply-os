# Apply OS — Resume Studio entegrasyon görevi

Mevcut Apply OS repository’si içinde çalışıyorsun. Önceki canonical candidate-profile/evidence/policy entegrasyonunu bitirdikten sonra bu görevi yap.

## Amaç

Var olan işe uygunluk değerlendirmesinin arkasına kullanıcı talebiyle çalışan Resume Studio ekle: doğru kanıtları seç → kanıta bağlı CV taslağı hazırla → claim kontrolü → Jev sunum kalitesi kontrolü → önizleme → gerçek tek sayfa PDF kontrolü → kullanıcı onayı. İş başvurusu gönderme.

Ekli `ApplyOS-ResumeStudio-v1.0.0` klasörü çalışan çekirdek + entegrasyon referansıdır, yeni bir application scaffold değildir. README.md, docs/INTEGRATION_CONTRACT.md ve qa/QA_REPORT.md dosyalarını oku. Gönderilen kaynak kodunu mevcut mimariye adapte et; ayrı bir uygulama çalıştırma.

## Önce mevcut durumu doğrula

Gerçek repo içindeki profile loader, güncel schema, evidence registry, claim guard, Jev adapter, writer provider, authentication, audit, storage, tests ve UI route’larını incele. Yeni tamamlanan profil ve decision-policy tek doğruluk kaynağıdır. Tarihsel JSON dosyalarını geri yükleme; 64 proje çalışmasını yeniden üretme.

Önceki işin schema/integrity/typecheck testlerini çalıştır. Teknik bir ön koşul bozuksa Resume Studio’yu feature flag arkasında kapalı bırak ve tam engeli raporla. Kaynakların gerçekliğiyle ilgili çözülememiş bilgiler yüzünden bütün repo çalışmasını durdurma; ilgili claim/metadata’yı pending/review bırak.

## Korunacak sınırlar

Mevcut UI, database stack, provider key yönetimi ve Jev mimarisini değiştirme. Kök package.json/tsconfig dosyalarını kit’tekilerle değiştirme. Repo sürümlerine uyumlu küçük entegrasyon yap. Yeni vector DB, auth sistemi, queue ürünü veya cloud deployment başlatma.

Candidate facts, job-fit policy ve resume presentation policy ayrı kalmalı. Role Fit puanını yeniden hesaplama veya Resume Readiness puanıyla birleştirme. CV’nin sunum puanı recruiter shortlist/işe alınma olasılığı değildir. Rubrik ağırlıkları ve eşikleri ampirik olarak kalibre edilmiş değildir; yeni “başarı oranı” iddiası ekleme.

## Uygulanacak akış

1. İlan karar ekranına mevcut tasarımla uyumlu “CV’mi hazırla”, “Kendim hazırlayacağım”, “Mevcut CV’mi kontrol et” ve “Şimdilik geç” seçeneklerini ekle. Kullanıcı talebi olmadan üretim başlatma. Review durumundaki bir işe de kullanıcı bilinçli olarak taslak hazırlayabilsin; bu işlem eksik şartları giderilmiş saymasın.

2. Mevcut doğrulanmış profil/politikadan server-only ResumeContext projection üret. Kaynak ID’lerini koru. Proje/experience/education/certification/candidate_fact kayıtlarını destekle. Tüm kütüphane yerel olarak seçilebilir olsun, ancak yalnız planın gerekli altkümesini modellere gönder. Kütüphane büyüyebileceği için 64 veya 169’u runtime limit yapma.

3. Reusable claim bank’i var olan evidence/claim altyapısına bağla. Mevcut CV bullet veya allowed_claim metni otomatik APPROVED demek değildir. Başlangıç ifadelerini atomik kaynaklara eşleştir; global claim_policy, proje sınırları, sayı/birim/ölçüm koşulu, metadata ve çelişkileri mevcut claim guard ile kontrol et. Pending claim veya eksik metadata’yı UI’da göster. Destek yeterliyse mevcut doğrulanmış guard süreciyle, belirsizse insan incelemesiyle onayla. “Source text contains this” kontrolünü tam anlamsal doğrulama gibi sunma.

4. Kaynak seçimi ve ResumePlan için kit’in deterministik yaklaşımını kullan. Eksik/partial must-have’leri göster; modelle doldurma. Gerçek duplicate/phase gruplarını iki ayrı iş olarak sayma. Her related_project ilişkisini duplicate yapma.

5. Existing generative provider’ı WriterPort’a bağla; kit’teki JSON Schema ve parseDraft kontrolünü kullan. Yazıcı model yalnız izinli claim ID’lerini seçsin. Daha iyi bullet/keyword ifadesi için ayrı rewrite-proposal akışını bağla: proposed wording → PENDING variant → mevcut claim guard → gerekirse insan → onaylı variant → yeni plan. Canonical kaynak, tarih, ünvan, metric ve engagement_type değişmesin. Model approved flag oluşturamaz.

6. JevRunner’ı mevcut sunucu tarafı SDK istemcisine bağla. Kurulu SDK’nın gerçek request/response ve cancellation imzalarını kontrol et. Bir taslak için dokuz bounded question tek istek içinde değerlendirilsin. İlk canlı smoke test hassas veri içermeyen kurgu örnekle yapılsın. Geçersiz/eksik model çıktısını açık hata yap; key yoksa template draft ver ama sahte Jev skoru üretme. MOCK, TEMPLATE ve unavailable durumlarını UI’da görünür göster.

7. Claim güvenliği ve sunum kalitesi ayrı kapılar olsun. Jev sunum kalitesi puanı claim onayını veya gerçek iş uygunluğunu değiştiremez. En fazla bir otomatik hedefli revizyon yap; yeniden claim kontrolü ve QA çalıştır. Daha kötü/unsafe revizyonu kabul etme. Sınırsız tekrar veya retry zinciri kurma.

8. Mevcut DB/audit/queue yapısını genişleterek plan, variant, draft revision, provider mode/version, request duration, kullanım bilgisi varsa gerçek usage, profile/policy/job hashes ve son artifact hash’ini sakla. Provider gerçek maliyet vermiyorsa unknown yaz; tahmini gerçek harcama diye kaydetme. Raw CV/PII/key loglama. Kalıcı cache’i tenant, candidate, job, profile, policy, rubric ve çözülmüş model revision’a göre ayır. Latest/preview alias’ını kalıcı cache anahtarı yapma.

9. Sonraki profil/politika/draft değişikliği eski QA/onayı geçersiz kılsın. Çift tıklama ve retry tek build işi üretmeli; idempotency ve READY geçişi sunucu transaction/CAS ile korunsun. Tarayıcıdan gelen context, approved claim, layout receipt veya model-provided Ready boolean kabul edilmesin. Session’dan tenant/candidate yetkisini doğrula.

10. Tek sütun, siyah/beyaz, bir sayfa A4 HTML/text/PDF çıktısını bağla. Template mevcut kaynaktaki gerçek iletişim bilgilerini ve doğrulanmış başlık/tarihleri kullansın. En fazla 3–4 ilgili detaylı çalışma kaydı; en fazla dört bullet/entry; yeterli kanıt yoksa boşluğu uydurarak doldurma. Kaynak niteliğini açık yaz: contract, independent, portfolio farklıdır. Eğitim ve sertifikalar ayrı ve doğru statüde kalsın. Tarihi pozisyon adını ilana göre yükseltme.

11. Gerçek PDF oluştur ve otomatik ölç: sayfa sayısı bir, taşma/kırpılma yok, okunabilir minimum font, metin çıkarımı ve okuma sırası beklendiği gibi. Test fixture receipt’lerini gerçek ölçüm yerine kullanma. Sığmıyorsa daha az ilgili bütün bir bullet’ı kaldır veya kontrol edilmiş daha kısa wording kullan; sayı/qualifier silme veya fontu küçültme. Mevcut DOCX renderer varsa aynı Draft’tan bağla; yoksa bu görevde ayrı DOCX motoru şart değil.

12. Kullanıcı final PDF önizlemesini gördükten sonra aynı draft+artifact hash’ine bağlı onay verir. Claim gate, geçerli QA, ölçülmüş export ve insan onayı olmadan READY yok. Ready ile Applied farklıdır. Otomatik apply, e-posta, LinkedIn mesajı veya platforma CV upload ekleme.

13. Kullanıcının mevcut CV’sini değerlendirme yolunda önce güvenli parse/redaction uygula. `reviewExistingText()` yalnız sunum QA’sıdır; yüksek skor factual verification sağlamaz. Tam claim mapping olmadan Ready yapma. Yeni bilgi için ayrı profile-review akışı kullan.

## Tamamlama standardı

Kit’teki testleri mevcut test runner’a adapte et ve çalıştır. Ek olarak gerçek uygulamada: profile integration regresyonları, yetkisiz erişim, cross-tenant izolasyon, double-click idempotency, stale approval, tam PDF metin/sayfa kontrolü, quote/provenance kaybı, provider timeout ve eksik credential senaryolarını test et. Kurgu mock sonucu canlıymış gibi göstermediğini doğrula.

Tek gerçek, kullanıcı tarafından seçilmiş iş ilanıyla URL → mevcut Role Fit → build isteği → kanıt planı → taslak → QA → PDF → kullanıcı onayı akışını dene. API erişimi yoksa canlı testleri NOT RUN olarak raporla; offline PASS ile karıştırma. Gerçek başvuru gönderme. Discovery/Exa/LinkedIn/SEEK automation bu görevin kapsamı değildir.

Feature flag varsayılan kapalıdır. Mevcut profil entegrasyonu ile module testleri geçince geliştirme ortamında etkinleştir. Deploy, public repo push veya ücretli toplu işlem için ayrı kullanıcı onayı gerekir.

İşi yalnız plan yazarak bırakma; geri alınabilir yerel kod, adapter ve testleri tamamla. Son rapor: değişen dosyalar, korunan mevcut davranışlar, çalıştırılan test/komut sonuçları, canlı test durumu, gerçek PDF test durumu, açık insan onayı gerektiren veri konuları, entegrasyonun tamamlanıp tamamlanmadığı. Yapılmayan testleri PASS yazma.
