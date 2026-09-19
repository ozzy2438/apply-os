# Mimari — sınırlı ve birleştirilebilir

## 1. Mevcut sistemi koruyan sınır

```text
Apply OS: Job → Requirement matching → ROLE FIT / kullanıcı kararı
                                           ↓ kullanıcı “CV’mi hazırla”
Güncel profil + claim bank → ResumeContext → ResumePlan
                                               ↓
                           writer: izinli claim ID’leri seçer
                                               ↓
                              deterministic assembly + claim gate
                                               ↓
                       Jev: dokuz sunum kalitesi değerlendirmesi
                                               ↓
                      en fazla bir hedefli, tekrar kontrol edilen revizyon
                                               ↓
                          HTML/text preview → gerçek PDF ölçümü
                                               ↓
                           aynı çıktıya bağlı insan onayı → READY
```

Bu modül Discovery, iş eleme, maaş politikası veya başvuru gönderme yapmaz. Yeni vector DB, ikinci aday profili, ikinci auth sistemi veya ayrı Next.js uygulaması gerektirmez. Kural, soru, model ve görüntüleme sorumlulukları ayrıdır.

## 2. Kanıt katmanı

`Evidence` bir kaynağın ne söylediğini taşır. `ClaimCard` o kaynaktan CV’de kullanılmasına izin verilmiş **tam bir ifadeyi** taşır. İfadenin kendi `id` değeri vardır; `evidenceIds` gerçek kaynak kayıtlarına gider. İki ID kavramı aynı değildir. `approval.contentHash` ifade, kaynak referansları ve zorunlu niteleyiciler değiştiğinde eski onayın kullanılamamasını sağlar.

Hash, gerçeğin doğruluğunu veya onayı verenin kimliğini kanıtlamaz. Yetki kontrolü sunucuda, kanıtın anlamsal uygunluğu mevcut claim guard’da/insan incelemesinde yapılır. Hash burada değişiklik ve sürüm eşleştirme aracıdır.

`approved` kart üretmek için kaynakta görünmek yeterli değildir. Claim guard sayı, birim, zaman aralığı, müşteri/proje türü, ölçüm koşulu, kişisel katkı ve kaynak çelişkilerini kontrol eder. Kaynağın kendi `uncertain` kayıtları otomatik destek sayılmaz. Global `claim_policy` sınırlamaları da kart incelemesine dahil edilir.

## 3. Seçim ve yazım

Seçici tüm kullanılabilir ifade bankasını tarar; mevcut requirement eşleşmelerini kullanır. Basit bir greedy coverage sıralaması uygular. MUST/SHOULD/NICE için kullanılan 3/2/1 yalnızca editoryal yerleşim önceliğidir; iş uygunluğu formülü değildir. Bu formül ampirik olarak optimize edilmiş değildir.

Modelin gördüğü bağlam, seçilen kaynak ve ifadelerdir. Sadece ID seçimi yapan yazıcı her cümlede özgürce yeniden anlatım yapmaz. Böylece render edilen içerik daha önce onaylanan ifadeyle aynı kalır. Özel bir cümle gerekiyorsa ayrı rewrite önerisi, claim kontrolü ve yeniden planlama kullanılır. Henüz onaylanmayan paraphrase hiç fark ettirmeden taslağa karışamaz.

Kopya/aynı işin fazları için `exclusiveGroup` kullanılır. Her `related_project_id` kopya demek değildir. Bilinen bağımsız işlerin proje kütüphanesinden silinmesi veya fazların birleştirilmesi bu modülün işi değildir.

## 4. Puan ve kapı farklıdır

Korunan dokuz boyut: role match, stakeholder evidence, technical depth, quantified impact, ownership, domain alignment, keyword alignment, verifiability, timeline clarity. Adları kodda büyük ölçüde korunmuş, anlamları CV sunum kalitesine daraltılmıştır.

Mevcut altı ağırlık profili kaynak ZIP’ten alınmıştır. Kurumun iş ilanına göre N/A boyutunu kod/kullanıcı belirler; model kendine zor gelen boyutu N/A yapamaz. Kalan ağırlıklar normalize edilir. Düşük confidence, daha düşük fit veya insan recruiter's kararsızlık olasılığı olarak çevrilmez. Sunum kalitesi puanı gerçek hiring outcome’a kalibre edilmemiştir.

`weightedShortfall`, iyileştirmeye bakılabilecek boyutları sıralar. “Bu düzenleme iş bulma şansını X artırır” ya da “X puan kesin kazandırır” anlamına gelmez.

## 5. İş akışı ve hatalar

`NEEDS_CLAIM_REVIEW`: ilgili onaylı ifade yok. Yeni claim incelemesi gerekir; üretimle doldurulmaz.

`BLOCKED`: bozuk çıktı, bilinmeyen ID, kayıp niteleyici veya taslak/plan sorunu. Başarılı gibi gösterilmez.

`NEEDS_REVISION`: kullanılabilir taslak var, sunum kalitesi tasarım eşiğinin altında.

`AWAITING_HUMAN_REVIEW`: taslak hazır; QA, kaynak veya biçim kontrolü ile ilgili açık noktalar olabilir. Son onay değildir.

`canMarkReady()`: claim gate + güncel canlı QA + gerçek export ölçümü + aynı dosyaya bağlı insan onayı. Review/renderer receipt değerleri kullanıcıdan veya modelden alınmaz; sunucu üretir. Taslak, kaynak, politika veya PDF byte’ları değişirse onay geçersizleşir.

## 6. Kendi hazırladığın CV

`reviewExistingText()` ham metni dokuz boyutta değerlendirebilir fakat açıkça `claimVerification: NOT_RUN`, `canMarkReady: false` döndürür. Bu çıktının yüksek puanı, CV’deki bilgilerin doğru olduğunu göstermez.

Mevcut dosya import/parse hattı bütün factual metni claim eşleştirmesine götürmelidir. Summary, skills, tarih, ünvan ve eğitim dahil hiçbir factual alan kontrol dışı bırakılamaz. Yeni bilgiler varsa aday profilinin ayrı onaylı güncelleme süreci kullanılır. Değiştirilen dosyada bütün kontroller tekrar çalışır.

## 7. Kişisel veri ve çok kullanıcılı ürün

Bu paket hukuki uygunluk veya çok kullanıcılı SaaS güvenliği sertifikası değildir. `tenantId` cache ve sürüm anahtarına dahil edilir, ancak gerçek auth/tenant filtreleri mevcut backend’in görevidir. Model çıktıları auth kaynağı olamaz. Başka adayların verisi örnek/benchmark olarak kullanılmaz.

Mevcut CV importunda iletişim bilgilerini, gereksiz hassas verileri ve dosya metadata’sını provider’a göndermeden önce azalt. Raw source/claim logları yerine hash, sayım, hata kodu ve sürüm kullan. Silme işlemi ilgili CV, claim variant, cache, çıktı dosyası ve audit-retention politikasını kapsamalıdır. NDA kaynakları yalnızca izinli kapsamda işlenir.
