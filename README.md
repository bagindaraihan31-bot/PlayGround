# PlayGround

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/bagindaraihan31-bot/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/bagindaraihan31-bot/PlayGround)

- 🎮 [Open the project](https://omgithub.com/bagindaraihan31-bot/PlayGround).
- ✨ [Remix this project](https://omgithub.com/?remix=bagindaraihan31-bot%2FPlayGround).
- 💻 [Explore the source](https://github.com/bagindaraihan31-bot/PlayGround).
- 🛠️ [Check build runs](https://github.com/bagindaraihan31-bot/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/bagindaraihan31-bot/PlayGround/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/bagindaraihan31-bot).
- 🌍 [Create with OMGithub](https://omgithub.com).
<!-- omgithub:readme:end -->
---

# KOTA MATI — Survival Apocalypse

Game tembak-menembak 2D bertema apocalypse yang dibuat untuk browser, dengan kota prosedural yang bisa dijelajahi, gedung yang bisa dimasuki, gelombang zombie, dan mekanik bertahan hidup. Seluruh antarmuka berbahasa Indonesia.

Tidak ada build step, tidak ada aset eksternal, dan tidak ada dependency. Semua grafik digambar di canvas dan semua suara disintesis lewat Web Audio API.

## Cara menjalankan

Sajikan folder ini lewat web server statis apa pun (game memakai ES modules, jadi `file://` tidak didukung):

```bash
# Opsi 1: server bawaan runtime proyek
RUNTIME_DIR=/path/to/runtime PORT=3002 ./start.sh

# Opsi 2: Python
python3 -m http.server 3002
```

Lalu buka `http://localhost:3002`.

## Fitur

- **Kota prosedural 85 × 85 tile** dengan jalan, trotoar, taman, mobil, lampu jalan, dan 25+ gedung yang bisa dimasuki.
- **Interior gedung** dengan pintu, jendela, dekorasi, dan peti/kulkas/lemari yang bisa di-loot. Atap memudar otomatis saat pemain masuk.
- **5 senjata**: Golok, P9, Vektor (SMG), Boomstick (shotgun), dan AK-47. Masing-masing punya magasin, cadangan amunisi per tipe, waktu reload, spread, dan jangkauan berbeda.
- **3 tipe zombie**: Pejalan, Pelari, dan Besar (brute), dengan skala HP/kecepatan per gelombang.
- **Gelombang + jeda loot**: setelah gelombang bersih, ada 20 detik untuk mencari perlengkapan sebelum gelombang berikutnya.
- **Survival**: HP, stamina, rasa lapar, dan rasa haus. Makan/minum memulihkan kebutuhan; kelaparan dan dehidrasi menggerus HP.
- **Kontrol sentuh** untuk ponsel/tablet, **keyboard + mouse** untuk desktop, dan **tilt/gyro opsional**.
- **Pencahayaan malam**: lampu pemain, sorot senter, hujan, partikel, bekas darah, dan efek layar.
- **HUD lengkap**: bar HP/stamina/lapar/haus, amunisi, quickbar item, skor, minimap, dan rekor tersimpan di `localStorage`.
- **Audio disintesis**: tembakan, reload, hit, geraman zombie, hujan, dan ambience.

## Kontrol

### Desktop

| Aksi | Kontrol |
| --- | --- |
| Gerak | `W A S D` / panah |
| Bidik | Mouse |
| Tembak | Klik kiri (tahan untuk otomatis) |
| Isi ulang | `R` |
| Ganti senjata | `1`–`5` atau `Q` |
| Ambil loot / buka pintu | `E` |
| Pakai item | Tombol quickbar Makan / Minum / Energi / Obat di layar |
| Sprint | `Shift` |
| Jeda | `Esc` atau tombol jeda |

### Ponsel / tablet

- **Joystick kiri**: gerak. Dorong penuh untuk lari.
- **Joystick kanan**: bidik dan otomatis menembak saat sudah cukup jauh dari titik tengah.
- **Tombol kanan bawah**: isi ulang dan ganti senjata.
- **Tombol AMBIL**: muncul saat berada dekat peti/pintu.
- **Quickbar bawah**: makan, minum, energi, obat.
- **Tombol jeda**: di kanan atas.

## Tilt / Gyro

Tilt memungkinkan gerak dengan memiringkan perangkat, sementara joystick kanan tetap dipakai untuk membidik.

1. Tekan **TILT/GYRO** di menu atau aktifkan **Tilt / Gyro** di layar jeda.
2. Di iOS (Safari), izin sensor diminta saat tombol ditekan — ini harus terjadi di dalam gesture pengguna.
3. Sensitivitas diatur lewat slider di layar jeda. Gunakan **Kalibrasi ulang** untuk menjadikan posisi perangkat saat ini sebagai titik netral.
4. Jika perangkat tidak punya sensor, game menampilkan pesan dan tetap bisa dimainkan dengan joystick.

Pengaturan (suara, getar, tilt, sensitivitas) dan rekor disimpan di `localStorage`. Mode privat yang memblokir storage tidak akan membuat game error.

## Mekanik survival

- **HP** berkurang saat diserang zombie; regen lambat terjadi saat lapar dan haus masih cukup.
- **Stamina** terkuras saat sprint dan menebas dengan golok; pulih saat berhenti.
- **Lapar** dan **haus** turun seiring waktu. Jika mencapai nol, HP mulai berkurang.
- **Makanan kaleng** memulihkan lapar, **air mineral** memulihkan haus, **minuman energi** memulihkan sedikit haus + stamina dan memberi boost kecepatan, **kotak P3K** memulihkan HP.
- Amunisi dicari di gedung, peti, dan jatuhan zombie. Senjata baru otomatis terpasang saat diambil.

## Senjata

| Slot | Senjata | Amunisi | Magasin | Catatan |
| --- | --- | --- | --- | --- |
| 1 | Golok | — | — | Melee, hemat amunisi, butuh stamina |
| 2 | P9 | 9mm | 12 | Serba bisa |
| 3 | Vektor | 9mm | 32 | Fire rate tinggi, spread besar |
| 4 | Boomstick | 12ga | 6 | 7 pellet, mematikan di jarak dekat |
| 5 | AK-47 | 7.62 | 30 | Menembus dua zombie |

## Struktur proyek

```
index.html        Markup HUD, menu, jeda, death screen, ikon SVG
style.css         Layout responsif (portrait, landscape, desktop)
js/config.js      Data senjata, item, zombie, gedung, loot, util
js/world.js       Generasi kota, collision, pintu, BFS navigasi zombie
js/render.js      Render canvas, pencahayaan, hujan, partikel, joystick
js/input.js       Keyboard/mouse, joystick sentuh, tilt/gyro
js/audio.js       SFX dan ambience Web Audio
js/game.js        Game loop, pemain, combat, gelombang, loot, HUD
```

## Tips

- Gedung menghalangi pandangan, tetapi zombie bisa masuk lewat pintu. Jangan biarkan punggung menghadap pintu.
- Saat jeda gelombang, prioritaskan amunisi dan obat sebelum keluar.
- Golok tidak memakai amunisi — simpan peluru untuk kerumunan atau brute.
- Dengar geraman: zombie yang dekat tetap berbahaya meski tidak terlihat di kegelapan.
