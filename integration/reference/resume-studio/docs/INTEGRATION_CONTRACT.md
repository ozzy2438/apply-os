# Cursor entegrasyon sözleşmesi

## Ön koşul

Mevcut canonical-profile çalışması tamamlanmalı. Bu konuşmada incelenen tarihsel profil snapshot’ı v1.0.0 idi; şu an Cursor’ın diskte oluşturduğu yeni şema ve alan adları bu pakette varsayılmıyor. Gerçek repoyu okumadan “v1.1 tamamen uyumlu” deneme. Kaynak dosyaları yeniden migrate etme, eski JSON yükleyerek yeni çalışmanın üstüne yazma.

## Mevcut uygulamada bağlanacak noktalar

### A. Profile → ResumeContext

Mevcut doğrulanmış profile loader’dan server-side bir projection üret. Bu, ikinci canonical profile değildir. Snapshot, tam güncel profilin hash’ini ve politika hash’ini taşır. Proje sayısını 64’e veya evidence sayısını 169’a runtime sabitleme; kütüphane büyüyebilir.

| ResumeContext alanı | Apply OS kaynağı |
|---|---|
| `scope.*` | Authenticated tenant/candidate, job ve doğrulanmış profil/politika sürümleri |
| `header` | Güncel adayın onaylı iletişim alanları; model girdisine koyma |
| `job` | Normalize edilmiş gerçek ilan ve alıntılı requirements |
| `entities` | Project/experience/education/certification/candidate_fact kayıtlarının PUBLIC metadata projection’ı |
| `evidence` | Canonical evidence registry, mevcut ID’leri koruyarak |
| `claims` | Tam ifadesi gözden geçirilmiş ve kaynaklarına bağlanmış reusable claim cards |
| `matches` | Mevcut requirement-level destek değerlendirmesi; lexical hit’i SUPPORTED yapma |

Yeni claim kartları yoksa kaynak bullets/allowed claims’den **pending öneriler** üret. Bütün proje evidence ID’lerini bir bullet’a bağlayıp otomatik approved verme. Mevcut claim guard veya insan, atomik ifadenin gerçekten hangi evidence ile desteklendiğini ve qualifier’larını incelemeli. Genel `verified:true` atama. `metadataApproved` modelin verdiği bir boolean olamaz.

Belirsiz ücret, sağlık arası veya NDA nedeni gibi bilgileri CV’ye zorla koyma. Bu katman çalışma izni/maaş/job-fit kararlarını yeniden hesaplamaz.

### B. Existing generative provider → WriterPort

Next.js bağlarında gerçek `server-only` sınırını kullan; kaynak dosyadaki yorum bir güvenlik kontrolü değildir. Yeni API key deposu veya ikinci provider stack oluşturma. Mevcut server-side writer’ı kullan. `write()` modelin ham response’unu JSON nesnesi olarak döndürmeli; `parseDraft()` tekrar doğrular. `schemas/resume-draft.schema.json` provider’ın structured-output mekanizmasına bağlanır. Provider bütün JSON Schema özelliklerini desteklemiyorsa kendi uyumlu request schema’sını üret; çıktı sonrasında tam yerel doğrulamayı yine uygula.

`prompts/resume-writer.md` ve `prompts/rewrite-proposal.md` iki farklı amaç içindir. Writer ID seçer; rewrite yeni cümle ÖNERİR. Rewrite hiçbir zaman doğrudan Ready akışına giremez. Var olan kanıtı başka kelimelerle anlatmak, kaynağı değiştirmek değildir; ama anlam değişmediği ayrıca kontrol edilir. Yeni ifade onaylanırsa ayrı claim variant olarak sakla, özgün kaynak metnini koru.

### C. Existing Jev client → JevRunner

`src/jev-adapter.ts` ağ istemcisi yaratmaz. Existing client’i bir wrapper ile bağla. SDK’nın **repoda kurulu olan** sürümünün `systemOne` ve AbortSignal seçeneklerini kontrol et; bu paket belirli SDK sürümünün çalıştığını iddia etmez.

Beklenen skor sözleşmesi gönderilen ordered criteria’nın indeks ölçeğidir: beş seviyede 0–4, confidence 0–1. Bu, kaynak ranker’ın protokol varsayımıdır; canlı contract testinde doğrula. Cevap biçimi farklıysa adapter’ı açıkça düzelt. Eksik alanı sıfır, geçersiz sayıyı clamp veya credential hatasını mock-success yapma.

İlk smoke test, hassas veri içermeyen tek bir kurgu CV üzerinde olmalı. Dev/live modu, istenen model ve varsa dönen model revision’ını kaydet. Model revision’ı çözülemeyen `latest/preview` alias’larını kalıcı cache’e sokma.

### D. Persistence ve sunucu yetkileri

Var olan DB, audit, authentication ve job queue’yu genişlet. Örnek mantıksal kayıtlar: resume run, claim variant review, draft revision, artifact receipt, user approval. Bunlar zorunlu yeni tablo adları değildir.

Build isteğinde tenant/candidate/job erişimini sunucuda doğrula. Client yalnızca intent, job ID, mevcut draft ID ve kullanıcı düzenlemelerini gönderebilir; hazır `ResumeContext`, approved claim, review receipt veya layout receipt gönderip kabul ettiremez.

Çift tıklama ve retry için atomik idempotency anahtarı kullan: tenant + candidate + job + profile hash + decision-policy hash + resume-policy hash + writer/prompt version + seçili revision. Aynı anda gelen iki build bir model kuyruğu işi üretmeli. Onay geçişinde güncel snapshot ve artifact hash’ini transaction içinde tekrar kontrol et.

Bu kit `withDeadline()` ile beklemeyi sınırlar. Transport AbortSignal’a uymazsa uzaktaki ücretli işlem devam edebilir. Wrapper cancellation’ı gerçekten iletmeli; SDK hidden retry’ları ve toplam çağrı/süre bütçesi ayrıca sınırlandırılmalı. Core en çok iki writer-port denemesi ve iki QA denemesi tasarlar; platform içi retry sayısı değildir.

Raw CV, e-posta, telefon veya API key loglama. `.data` altındaki yerel SQLite dosyası cloud deploy için otomatik kalıcı kabul edilmez. Mevcut storage/deploy stratejisinin kalıcılığını doğrula; bu görevde yeni cloud migration başlatma.

### E. UI ve çıktı

İlan karar ekranına mevcut tasarımı bozmadan seçenek ekle:

`CV’mi hazırla` / `Kendim hazırlayacağım` / `Mevcut CV’mi kontrol et` / `Şimdilik geç`

Draft ekranı: seçili kaynaklar, requirement coverage, unresolved gaps, metin önizleme ve ayrı Resume Readiness. `ROLE FIT` puanını koru. `MOCK`, `TEMPLATE` ve `REVIEW_UNAVAILABLE` durumlarını görünür göster. Kaynak/tarih/ünvan düzenlemeleri normal CV süsleme alanları değildir; source-review akışına gitmelidir.

Tek sayfa A4, siyah/beyaz, tek sütun hedefle. PDF için mevcut renderer’ı kullan veya projeye uygun minimal print-to-PDF adaptörü ekle. Bu kit gerçek PDF oluşturmaz.

Gerçek PDF’den üretilen `LayoutReceipt`: page count=1, sayfa taşması yok, minimum yazı boyutu karşılanıyor, Unicode ve okuma sırası korunuyor, çıkarılan metin render’daki visible plain text ile uyumlu. Whitespace/bullet/hyphen normalizasyonu açık ve dar olsun; kayıp cümle veya sayı normalizasyonla gizlenmesin. PDF byte hash’i receipt’e yazılır. Font kontrolü yaklaşık tahmin olarak doldurulmaz.

PDF sığmıyorsa niteleyicileri kesme. En az ilgili bütün bir bullet’ı kaldır veya kanıta uygun daha kısa bir variant öner, sonra yeniden kontrol/render yap. Kullanıcı final önizlemeyi gördükten sonra aynı artifact için onay verir. Onay, job application submission değildir.

DOCX output sonraki fazda mevcut Resume Builder ile aynı Draft/claim bank’ten türetilebilir. Bu paket içinde DOCX renderer yoktur. Upload edilen PDF/DOCX için dosya türü/boyutu/parser güvenliği ve eksiksiz metin çıkarımı kontrolü mevcut backend’de kalır.
