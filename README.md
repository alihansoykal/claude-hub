# Claude Hub

Projelerine görev ekle, Claude bulutta sırayla yapsın; bilgisayarın kapalıyken
bile. Bu sayfada her projede neyin bittiğini, neyin sürdüğünü, neyin seni
beklediğini görür, sırayı değiştirir, soruları cevaplar, bir projeyi
duraklatırsın.

Sunucu yok: uygulama GitHub Pages'te duran bir web sayfası. Görevler her
projenin kendi reposunda (`docs/BACKLOG.md`) kalır; hub o dosyayı GitHub
üzerinden okur ve yazar, bulutta saatlik çalışan Claude da aynı dosyayı okur.

## Nasıl çalışır

```
 Sen (telefon / PC)          GitHub (proje reposu)              Claude (bulut, saatte bir)
 ───────────────────         ─────────────────────────          ─────────────────────────
 Görev ekle  ───────────▶    docs/BACKLOG.md  "Planlanacak"  ──▶ yönetici: küçük işlere böler
 Sırayı değiştir ───────▶    claude/cloud-backlog dalı       ──▶ işçi: ilk "Sırada" işi yapar,
 Soruyu cevapla ────────▶    docs/QUESTIONS.md                    test eder, commit'ler
 Duraklat ──────────────▶    .claude/hub-paused              ──▶ dosya varken iş almaz
 Durumu gör  ◀──────────     commit'ler, Durum: satırları
```

Durumlar: **Planlanacak** (senin eklediğin, henüz bölünmedi) · **Sırada** ·
**Çalışılıyor** · **Bitti** · **Takıldı** · **Karar bekliyor** (soru var) ·
**Senin işin** · **İptal**.

Bitenleri incelemek ve `claude/cloud-backlog` dalını `main`'e almak hâlâ
senin elinde.

## Kurulum (bir kez, ~10 dakika)

1. **Repo:** GitHub'da yeni bir repo aç: adı `claude-hub`, **Public** (GitHub
   Pages'in ücretsiz olması için; repoda sadece uygulama kodu var, görevlerin
   değil). README ekleme, boş kalsın.
2. **Kodu gönder:** Claude'a "claude-hub'ı GitHub'a gönder" de (ya da
   `git remote add origin https://github.com/<kullanıcı>/claude-hub.git` ve
   `git push -u origin main`).
3. **Pages'i aç:** repo → Settings → Pages → Build and deployment → Source:
   **GitHub Actions**. İlk yayın 1–2 dakika sürer (Actions sekmesinde görürsün).
   Adres: `https://<kullanıcı>.github.io/claude-hub/`
4. **Token:** sayfayı aç, "Token nasıl alınır?" adımlarını izle:
   [fine-grained token](https://github.com/settings/personal-access-tokens/new),
   Repository access: *All repositories*, Permissions → Contents: *Read and
   write*. Token'ı yapıştır, Bağlan.
5. **Telefon:** adresi telefonda aç, aynı token'ı bir kez yapıştır, tarayıcı
   menüsünden **Ana ekrana ekle**. Artık uygulama gibi açılır.

Token sadece o tarayıcıda saklanır ve sadece `api.github.com`'a gönderilir.
Süresi dolunca Ayarlar'dan yenisini yapıştırırsın.

## Yeni proje bağlamak

Bir repo, ana dalında `.claude/hub.json` olunca hub'da görünür. En kolayı: o
projede Claude'a şunu söyle:

> Bu projeyi Claude Hub'a bağla ve bulutta çalıştırmayı kur. Kurallar:
> claude-hub reposundaki protocol/PROTOCOL.md.

Claude `hub.json`, `docs/BACKLOG.md`, bulut talimatlarını ve saatlik bulut
görevini kurar. Sonra hub'da Ayarlar → **Projeleri yeniden tara**.

Ayrıntılı sözleşme (dosya biçimleri, bulut çalışmalarının kuralları):
[protocol/PROTOCOL.md](protocol/PROTOCOL.md). Şablonlar:
[protocol/templates/](protocol/templates/).

## Denemek

`https://<kullanıcı>.github.io/claude-hub/?demo` token istemeden örnek
projelerle açılır; değişiklikler sayfa yenilenince kaybolur.

## Geliştirme

| Komut | Ne yapar |
|---|---|
| `npm run dev` | http://localhost:5180 (demo: `/?demo`) |
| `npm test` | Birim testleri (Vitest) |
| `npm run check` | Tip kontrolü + testler + derleme |

`main`'e her push GitHub Actions ile kontrol edilip Pages'e yayınlanır.
