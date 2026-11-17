# Game catalog

Every known game for the systems we offer today and the ones we may offer next, built only from public,
openly licensed data. It lists games and facts about them; it never contains or links to game files.

- **Browse it**: `catalog.html` (also *Settings → Game catalog* in the app). Pick a system, search titles,
  developers, publishers or serials, filter by genre, decade and players, open a game to see every regional
  release with its serial and checksum. Box art comes from libretro-thumbnails, like the library's.
- **Build it**: `node tools/build-catalog.js` (about a minute, downloads from GitHub), or
  `node tools/build-catalog.js --src path/to/libretro-database` with a local clone. `--only snes,psx` rebuilds
  a few systems. The output (`catalog/index.json`, `catalog/data/<system>.json`, ~16 MB, ~3 MB gzipped) is not
  committed: the Pages workflow builds it on every deploy, so it follows upstream's weekly updates.
- **Systems**: `systems.json`. Add a system by adding a line; `db` must be its libretro-database name.

## Tiers

| Tier | Meaning | Systems |
|---|---|---|
| `offered` | plays in the browser app today | 13 (NES … PSP) |
| `browser` | a light libretro core exists (most already ship with EmulatorJS); could join the browser app | 25 |
| `desktop` | needs native power (multi-GB discs, GPU-heavy emulators): the desktop app or per-minute hosting | 11 |

**58,700 retail games** across 49 systems, 28,200 of them on systems we offer today
(prototypes, betas, demos, homebrew, unlicensed and pirate releases are counted separately and hidden by default).

## Where the data comes from

| Source | What it gives | License / access | Used |
|---|---|---|---|
| [No-Intro](https://no-intro.org) (cartridges, handhelds, digital) | the complete list of known dumps: official name, region, revision, CRC32/MD5/SHA-1, size | free DATs | ✔ via libretro-database |
| [Redump](http://redump.org) (discs) | the same for CD/DVD/Blu-ray games, plus serials and disc counts | free DATs | ✔ via libretro-database |
| [libretro-database](https://github.com/libretro/libretro-database) | the above, plus per-game developer, publisher, genre, release year/month, max players, franchise, ESRB, serial (compiled from GameFAQs-era lists, psxdatacenter, GameTDB and contributors) | **CC BY-SA 4.0** | ✔ the source of everything here |
| [libretro-thumbnails](https://github.com/libretro-thumbnails) | box art, title screens, in-game snaps, named after No-Intro/Redump names | hot-linkable from GitHub with CORS; art is the publishers' | ✔ box art |
| [GameTDB](https://www.gametdb.com) | GameCube, Wii, Wii U, 3DS, DS, PS3: dates, publisher, players, controllers, ratings, descriptions | free, included in libretro-database's `dat/` | ✔ (facts only) |
| [Wikidata](https://www.wikidata.org) | games with platform, release dates per region, developer, publisher, genre, series, and links to Wikipedia, MobyGames, IGDB IDs | **CC0**, SPARQL endpoint, no key | ✘ next step (see below) |
| [IGDB](https://api-docs.igdb.com) | the deepest modern dataset: summaries, ratings, screenshots, videos, age ratings | free API with a Twitch account; commercial use needs a partnership | ✘ |
| [ScreenScraper](https://www.screenscraper.fr) | retro-focused: descriptions in many languages, box art, videos, wheel logos, matched by checksum | free account, rate-limited, non-commercial terms | ✘ |
| [TheGamesDB](https://thegamesdb.net) | descriptions, box art, release dates | free API key, attribution | ✘ |
| [MobyGames](https://www.mobygames.com/info/api/) | credits, release history, descriptions | paid API for commercial use | ✘ |
| MAME / FBNeo DATs | arcade games, also in libretro-database (`metadat/mame`, `fbneo-split`) | free | ✘ arcade needs romset versions pinned to an emulator |

We keep facts (names, years, companies, genres, player counts, serials, checksums). We don't copy descriptions,
reviews or screenshots into our files: those are someone's writing or the publishers' art.

## How well each system is covered

Share of retail games with each fact known (from the build of 2026-11-17, libretro-database 2026.11.14).

**Plays here now**

| System | List | Games | Year | Genre | Developer | Publisher | Players |
|---|---|--:|--:|--:|--:|--:|--:|
| NES / Famicom | No-Intro | 2,983 | 56% | 64% | 63% | 65% | 63% |
| Game Boy | No-Intro | 1,612 | 50% | 77% | 71% | 78% | 67% |
| Game Boy Color | No-Intro | 1,755 | 49% | 61% | 57% | 64% | 43% |
| Game Boy Advance | No-Intro | 2,206 | 74% | 87% | 83% | 90% | 86% |
| Super Nintendo | No-Intro | 2,273 | 91% | 95% | 91% | 95% | 92% |
| Genesis / Mega Drive | No-Intro | 1,624 | 55% | 77% | 74% | 77% | 76% |
| Master System | No-Intro | 650 | 29% | 64% | 65% | 65% | 61% |
| Game Gear | No-Intro | 467 | 50% | 86% | 86% | 86% | 86% |
| PC Engine / TurboGrafx-16 | No-Intro | 378 | 93% | 94% | 91% | 94% | 92% |
| PlayStation | Redump | 6,331 | 82% | 82% | 82% | 82% | 82% |
| Nintendo 64 | No-Intro | 556 | 85% | 87% | 86% | 87% | 87% |
| Nintendo DS | No-Intro | 5,163 | 71% | 34% | 35% | 35% | 97% |
| PSP | Redump | 2,198 | 52% | 71% | 0% | 1% | 0% |

**Coming to the browser**

| System | List | Games | Year | Genre | Developer | Publisher | Players |
|---|---|--:|--:|--:|--:|--:|--:|
| Famicom Disk System | No-Intro | 284 | 86% | 86% | 89% | 89% | 88% |
| Virtual Boy | No-Intro | 44 | 52% | 75% | 75% | 66% | 80% |
| Pokémon Mini | No-Intro | 21 | 0% | 0% | 0% | 0% | 0% |
| SG-1000 | No-Intro | 99 | 68% | 93% | 94% | 93% | 94% |
| 32X | No-Intro | 37 | 62% | 95% | 95% | 95% | 95% |
| Sega CD / Mega-CD | Redump | 254 | 0% | 0% | 0% | 0% | 0% |
| PC Engine CD / TurboGrafx-CD | Redump | 454 | 0% | 0% | 0% | 0% | 0% |
| PC Engine SuperGrafx | No-Intro | 5 | 100% | 100% | 100% | 100% | 100% |
| PC-FX | Redump | 68 | 0% | 0% | 0% | 0% | 0% |
| Atari 2600 | No-Intro | 588 | 14% | 88% | 83% | 88% | 85% |
| Atari 7800 | No-Intro | 129 | 12% | 46% | 46% | 46% | 46% |
| Atari Lynx | No-Intro | 174 | 10% | 44% | 45% | 45% | 45% |
| Atari Jaguar | No-Intro | 163 | 26% | 39% | 39% | 39% | 39% |
| Neo Geo Pocket | No-Intro | 9 | 33% | 89% | 89% | 89% | 89% |
| Neo Geo Pocket Color | No-Intro | 83 | 86% | 96% | 95% | 96% | 96% |
| WonderSwan | No-Intro | 190 | 3% | 58% | 56% | 58% | 56% |
| WonderSwan Color | No-Intro | 183 | 3% | 49% | 48% | 50% | 50% |
| ColecoVision | No-Intro | 141 | 1% | 98% | 99% | 99% | 99% |
| Intellivision | No-Intro | 199 | 23% | 65% | 68% | 69% | 69% |
| Vectrex | No-Intro | 32 | 41% | 97% | 100% | 100% | 100% |
| MSX | No-Intro | 575 | 85% | 72% | 74% | 97% | 62% |
| MSX2 | No-Intro | 154 | 91% | 64% | 78% | 96% | 58% |
| Commodore 64 | No-Intro | 2,656 | 0% | 0% | 0% | 0% | 0% |
| Amiga | No-Intro | 2,468 | 0% | 0% | 0% | 0% | 0% |
| 3DO | Redump | 398 | 0% | 0% | 0% | 0% | 0% |

**Desktop app & hosted**

| System | List | Games | Year | Genre | Developer | Publisher | Players |
|---|---|--:|--:|--:|--:|--:|--:|
| Saturn | Redump | 1,366 | 0% | 0% | 0% | 0% | 0% |
| Dreamcast | Redump | 949 | 0% | 0% | 1% | 0% | 0% |
| Neo Geo CD | Redump | 102 | 0% | 0% | 0% | 0% | 0% |
| PlayStation 2 | Redump | 6,589 | 35% | 34% | 34% | 34% | 34% |
| GameCube | Redump | 1,076 | 92% | 78% | 83% | 91% | 92% |
| Wii | Redump | 2,149 | 100% | 97% | 96% | 100% | 100% |
| Nintendo 3DS | No-Intro | 1,265 | 66% | 33% | 39% | 62% | 72% |
| Xbox | Redump | 1,403 | 0% | 0% | 0% | 0% | 0% |
| PlayStation Vita | No-Intro | 2,085 | 0% | 0% | 0% | 0% | 0% |
| PlayStation 3 | Redump | 2,188 | 92% | 51% | 54% | 56% | 95% |
| Xbox 360 | Redump | 1,965 | 0% | 0% | 0% | 0% | 0% |

What this says:

- **The game lists are complete everywhere.** No-Intro and Redump aim to record every released game, so
  every system has its full library with names, regions and checksums.
- **The 16-bit era is well described** (SNES, PC Engine, N64, PS1, GBA: 80–95%). NES, Game Boy, Genesis and
  Master System sit around 50–75%, mostly missing on Japan-only and European-only releases.
- **Gaps that matter for us**: PSP (no developer/publisher/players), DS (genre/developer at ~35%), and every
  CD system before PS2 except PS1: Sega CD, PC Engine CD, Saturn, Dreamcast, 3DO, Neo Geo CD, Xbox, 360, Vita
  have names only.
- **GameTDB years** (GameCube, Wii, 3DS, PS3) are sometimes a re-release or digital date; we keep the earliest
  year across a game's releases and drop years before the system launched, which hides most of it.

## Checksums: knowing what a player loaded

Every cartridge release carries its CRC32 (and disc releases their serial plus each disc's first-track CRC).
That lets the app recognize a file no matter what it's called: compute the CRC32 when a game is inserted, look
it up, and show the proper title, year, genre and box art (today the app guesses from the file name). Same for
the desktop app and hosted sessions. Not wired into the app yet.

## Next steps

1. **Wikidata enrichment** (CC0, no key): match by title + platform (Wikidata has P400 platform, P577
   release date, P178 developer, P123 publisher, P136 genre, P179 series, plus IGDB/MobyGames IDs) to fill the
   CD-era and PSP/DS gaps. It's one SPARQL query per platform; the build container for this work couldn't reach
   query.wikidata.org, so it's not in this first version.
2. **Recognize inserted games by checksum** (above).
3. **Arcade**: MAME/FBNeo lists are in libretro-database, but each romset version only works with its own
   emulator version, so this waits until we pick the arcade core.
4. **Descriptions and screenshots** for game pages: ScreenScraper or IGDB, both need an account and have terms
   to check before commercial use (the hosted offer is commercial).

## License

The generated catalog files are CC BY-SA 4.0 (they're derived from libretro-database); credit is on the
catalog page. The builder and page code are GPL-3.0 like the rest of the project.
