// Sample projects for `?demo`: try the hub without a token. Changes live in
// memory until the page reloads.

import { MemoryGitHub } from './memoryGitHub';

const SURF_BACKLOG = `# Backlog

İşçi agent'lar yukarıdan aşağı ilk \`Durum: TODO\` maddesini alır, sadece onu yapar.

## Epic: Leveller

### B-012 Level 7 "Hız Kontrolü"
Durum: DONE
Not: Hız bölgeleri eklendi; Free Surf artık Level 7'den sonra açılıyor.
Boyut: M
Kaynak: IDEAS 4

### B-013 Animasyonlu ipuçları
Durum: IN-PROGRESS
Boyut: M
Kaynak: IDEAS 4
Neden: Yazılı ipuçlarını oyuncular okumuyor; hareketi göstermek daha hızlı anlaşılıyor.
Kabul kriterleri:
- Her ipucunun yanında küçük bir el animasyonu oynar (sürükle, dokun, yukarı kaydır).
- Animasyon 2 saniyede bir tekrar eder, ipucu kapanınca durur.
- Ekran görüntüsü: \`screenshots/hint-anim.png\`.

### B-014 Level haritası
Durum: NEW
Kaynak: hub (2026-10-22)
Sahibinin notu:
Leveller bir harita üzerinde görünsün, bitenler işaretli olsun. Candy Crush'taki gibi yukarı doğru giden bir yol.

### B-015 Uygulama ikonu (geçici)
Durum: TODO
Boyut: S
Kaynak: S-003
Kabul kriterleri:
- Dalga + tahta, düz renkler, 512×512 PNG ve Android adaptive icon.

### B-016 Bali resifi plajı
Durum: TODO
Boyut: M
Kaynak: S-004

### B-017 Zorunlu güncelleme adresini gir
Durum: NEEDS-DECISION
Soru: S-005
Boyut: S

### B-018 [Sen] Telefonda dene
Durum: OWNER
Not: APK'yı telefona kur, 10 dakika oyna, gördüklerini FEEDBACK.md'ye yaz.

### B-019 Çok oyunculu mod altyapısı
Durum: BLOCKED
Not (2026-10-21): Sunucu seçimi olmadan ilerleyemedim; üç denemede de testler kırmızı kaldı.

## Tamamlananlar / İptaller

### B-010 Coin toplama
Durum: DONE
Not (2026-10-20): 10 coin, Level 4.

### B-011 İnsan engelleri
Durum: DONE
Not (2026-10-21): Level 5, çarpınca wipeout.

### B-009 Eski menü tasarımı
Durum: CANCELLED
`;

const SURF_QUESTIONS = `# Sorular

### S-004 Plajlar hangi sırayla açılsın?
Önerim: Başlangıç koyu → Bali resifi → Hawaii → Portekiz.
Cevap: önerin gibi.
→ İşlendi: B-016

### S-005 Güncelleme dosyası nerede dursun?
Neden soruyorum: Adres ilk sürümle uygulamaya gömülür ve sonradan değiştirilemez.
Seçenekler: (a) GitHub Pages: ücretsiz, tarayıcıdan düzenlenir. (b) Firebase Hosting: komut satırı gerekir.
Önerim: (a) GitHub Pages.
Cevap:
`;

const HORSE_BACKLOG = `# Backlog

## Başlangıç

### H-001 Unity projesini kur
Durum: DONE
Not (2026-10-21): Unity 6 projesi, URP, boş sahne.

### H-002 At yürüyüşü ve dörtnala
Durum: TODO
Boyut: M

### H-003 Kamera atın arkasından
Durum: TODO
Boyut: S

### H-004 Engel atlama
Durum: NEW
Kaynak: hub (2026-10-22)
Sahibinin notu:
Çitlerin üstünden atlama; zamanlama tutmazsa at durur.

### H-005 [Sen] At modeli seç
Durum: OWNER
Not: Asset Store'dan bir at modeli seç ve linkini buraya yaz.
`;

export function demoGitHub(): MemoryGitHub {
  const gh = new MemoryGitHub('demo');
  const now = Date.now();
  const ago = (minutes: number) => new Date(now - minutes * 60_000);
  const work = 'claude/cloud-backlog';

  const surf = 'demo/surf-oyunu';
  gh.addRepo(surf);
  gh.seed(surf, 'main', '.claude/hub.json', '{ "name": "Sörf Oyunu", "icon": "🏄" }\n', 'chore: connect to Claude Hub', ago(4320));
  gh.seed(surf, 'main', 'docs/BACKLOG.md', SURF_BACKLOG, 'plan: first backlog', ago(4300));
  gh.seed(surf, 'main', 'docs/QUESTIONS.md', SURF_QUESTIONS, 'plan: questions', ago(4290));
  gh.seed(surf, work, 'docs/BACKLOG.md', SURF_BACKLOG, 'claim: B-010', ago(2940));
  gh.addCommit(surf, work, 'feat(B-010): coin pickups for Level 4', ago(2880));
  gh.addCommit(surf, work, 'claim: B-011', ago(1500));
  gh.addCommit(surf, work, 'feat(B-011): swimmers as obstacles, wipeout on contact', ago(1440));
  gh.addCommit(surf, work, 'plan: speed command, Level 7, level map', ago(600));
  gh.addCommit(surf, work, 'claim: B-012', ago(300));
  gh.addCommit(surf, work, 'feat(B-012): Level 7 Speed Control with speed zones', ago(240));
  gh.addCommit(surf, work, 'hub: add B-014 Level haritası', ago(70));
  gh.addCommit(surf, work, 'claim: B-013', ago(21));

  const horse = 'demo/at-oyunu';
  gh.addRepo(horse);
  gh.seed(horse, 'main', '.claude/hub.json', '{ "name": "At Binme Oyunu", "icon": "🐎" }\n', 'chore: connect to Claude Hub', ago(2000));
  gh.seed(horse, 'main', 'docs/BACKLOG.md', HORSE_BACKLOG, 'plan: first backlog', ago(1990));
  gh.addCommit(horse, work, 'claim: H-001', ago(1500));
  gh.addCommit(horse, work, 'feat(H-001): Unity 6 project with URP', ago(1450));
  gh.seed(horse, work, '.claude/hub-paused', 'paused\n', 'hub: pause cloud runs', ago(130));

  gh.addRepo('demo/notlar');
  gh.seed('demo/notlar', 'main', 'README.md', '# Notlar\n', 'Initial commit', ago(9000));

  gh.delayMs = 120;
  return gh;
}
