# Source feed research — JAPAC (candidates for ingestion allowlist)

Researched 2026-10-12. Machine-readable list: [`data/sources/feeds.candidates.json`](../data/sources/feeds.candidates.json) (81 entries, 71 with a verified RSS/Atom feed).

Method: every feed URL was fetched (curl with a browser UA, WebFetch where curl was blocked). We parsed it as RSS/Atom and recorded the item count and newest item date. Terms pages were fetched and quoted or paraphrased. Where no terms page could be read, the entry says "unclear". **`reuseLikely` is a research hint, not legal advice.** Have counsel review it before anything goes live.

Legend: ✅ verified feed · ❌ not verified · reuse = `yes` / `attr` (attribution-required) / `?` (unclear) / `no` (licence required)

## Summary

| Market | Entries | Verified | Verified primary | Open-licence (`yes`) primaries |
|---|---|---|---|---|
| IN | 6 | 6 | 5 | 0 (PIB is `attr`) |
| JP | 9 | 9 | 8 | 6 |
| KR | 5 | 4 | 3 | 2 (+BoK `attr`) |
| TW | 6 | 6 | 4 | 3 |
| HK | 7 | 7 | 5 | 0 (all non-commercial only) |
| SG | 3 | 1 | **0** | 0 |
| MY | 5 | 4 | 1 | 0 |
| ID | 4 | 3 | 1 | 0 |
| TH | 4 | 3 | 1 | 0 |
| VN | 4 | 4 | 2 | 0 |
| PH | 5 | 4 | 2 | 0 (gov works, `attr`) |
| AU | 8 | 8 | 5 | 2 |
| NZ | 7 | 6 | 4 | 0 verified (+GeoNet API, CC BY) |
| APAC | 8 | 6 | 5 | 3 |

## Per market

### India (IN)
| Feed | Status | Reuse | Terms |
|---|---|---|---|
| PIB press releases (en) | ✅ 20 items, no dates in feed | attr | [PIB copyright](https://pib.gov.in/Content/102_2_Copyright-Policy.aspx): "may be reproduced free of charge", accurately, "source must be prominently acknowledged" |
| RBI press releases / notifications | ✅ 10 / 10 | ? | [Disclaimer](https://www.rbi.org.in/Scripts/Disclaimer.aspx): "All Rights Reserved"; framing prohibited; no reuse licence |
| SEBI | ✅ 30 | ? | no terms page found |
| IMD CAP alerts (S3 mirror) | ✅ 1 | ? | IMD site shows © only |
| The Hindu | ✅ 60 | no | licence required |

PIB needs a browser User-Agent. With a bot UA it returns HTML. India's GODL covers data.gov.in datasets, not PIB text. PIB's own policy is the operative one.

### Japan (JP), the best-covered market
Kantei, FSA, MHLW, METI and JMA all now publish under **PDL1.0 (公共データ利用規約 第1.0版)**, which replaces the Government Standard Terms of Use v2.0. It requires source credit and a note of any edits, and edited material must not be presented as government-authored.
| Feed | Status | Reuse |
|---|---|---|
| Kantei news (ja) `index-jnews.rdf` | ✅ 25, 2026-10-12 | yes |
| JMA XML feeds `extra.xml` (warnings), `eqvol.xml` (quakes/volcanoes) | ✅ 213 / 26 | yes (credit "出典：気象庁ホームページ") |
| FSA news, MHLW news | ✅ 15 / 131 | yes |
| METI releases (Atom) | ✅ 25, **newest 2026-06-19 (stale?)** | yes |
| Bank of Japan whatsnew (ja/en) | ✅ 72 / 48 | ? (credit required; **commercial reproduction needs permission**, see [BoJ copyright](https://www.boj.or.jp/en/about/copyright.htm)) |
| NHK | ✅ 7, newest Aug 2026 | no |

No English Kantei feed was found. MOFA's feeds return Akamai 403.

### South Korea (KR)
| Feed | Status | Reuse |
|---|---|---|
| Bank of Korea press | ✅ 100 | attr ([policy](https://www.bok.or.kr/portal/main/contents.do?menuNo=200228): must cite BoK and mark modifications) |
| KMA press releases (HTTP only) | ✅ 8 | yes (KOGL Type 1, [policy](https://www.kma.go.kr/kma/guide/copyright.jsp)) |
| KMA neighbourhood forecast RSS | ✅ 1/zone | yes |
| korea.kr policy briefing | ❌ RSS path not found (404) | ? |
| Yonhap (en) | ✅ 95 | no |

Gap: there is no verified government-wide press release feed. The korea.kr RSS index needs a manual look in a browser. FSC RSS is "under maintenance" (503).

### Taiwan (TW)
| Feed | Status | Reuse |
|---|---|---|
| Executive Yuan news (zh / en) | ✅ 100 / 100 | yes: [OGDL v1](https://www.ey.gov.tw/Page/2EADDBFEDDB6357E), irrevocable, commercial OK, must cite source |
| CWA warnings | ✅ 2 | yes ([declaration](https://www.cwa.gov.tw/V8/C/information.html), same open terms) |
| Central Bank (CBC) | ✅ 500 | ? (terms page not found) |
| CNA / Focus Taiwan, PTS News | ✅ | no |

### Hong Kong (HK)
Feeds are excellent, but **no source here permits commercial reuse.**
| Feed | Status | Reuse |
|---|---|---|
| ISD press releases (en / zh) | ✅ 100 / 100 | ? ([ISD notices](https://www.isd.gov.hk/eng/notices.htm): personal/educational use only, "must not be for re-sale or commercial distribution", source must be identified) |
| HKMA press releases | ✅ 423 | ? (non-commercial, unmodified, attributed: [T&C](https://www.hkma.gov.hk/eng/other-information/terms-and-conditions-of-use/)) |
| HKO warnings / quick earthquake | ✅ 1 / 1 | ? (non-commercial; separate commercial conditions: [HKO](https://www.hko.gov.hk/en/appweb/applink.htm)) |
| RTHK (en local) | ✅ 20 | **no**: even linking needs written consent ([RTHK notice](https://www.rthk.hk/copyright/index.html)) |
| HKFP | ✅ 30 | no |

### Singapore (SG), the weakest market
No primary feed was verified. Most SG government sites (MAS, MFA, MOH, MOM, MTI, SingStat) run on Isomer/Sitefinity and expose no RSS. The CAAS `/rss` URL returned HTML, and Mothership's feed is malformed XML. The only verified feed is CNA (licence required). Options: data.gov.sg APIs (Singapore Open Data Licence covers *datasets*, not press releases), or scraping newsroom HTML pages, which is outside the scope of this research.

### Malaysia (MY)
- Verified primary: MOF press releases only (Joomla RSS, 6 items). Terms page says "All Rights Reserved" → `?`.
- BNM has no RSS (403/404) and offers email alerts. MetMalaysia: no RSS found.
- Bernama, Malaysiakini and FMT feeds are verified → licence required.

### Indonesia (ID)
- Verified: Setkab `/feed/` (10 items; no terms page found).
- BMKG `autogempa.xml` is live but uses custom XML, not RSS. The portal says the data is "open and easy to reuse" but shows no licence.
- BI, BPS, OJK, Komdigi, Kemenkeu and presidenri.go.id are blocked by Cloudflare or Akamai, or have no feed.
- Antara and Tempo → licence required.

### Thailand (TH)
- Verified primary: TMD earthquake RSS only (no terms page found).
- Bank of Thailand, Thaigov (Cloudflare), PRD and MFA: no feed found.
- Thai PBS feed is verified, but its [terms](https://www.thaipbs.or.th/org/terms-and-conditions/) prohibit copying and republishing → **no** (being a public broadcaster does not imply open content).
- Bangkok Post → licence required.

### Vietnam (VN)
- Báo Điện tử Chính phủ (vi + en) feeds verified (50 items each). The government portal footer asks republishers to "Ghi rõ nguồn" (cite source), but the e-newspaper's own terms are not confirmed → `?`.
- SBV, MOFA and the National Assembly: no feed found.
- VnExpress and VietnamPlus (VNA) → licence required.
- **No DNR coverage for VN** (see below).

### Philippines (PH)
- PAGASA CAP alerts (`publicalert.pagasa.dost.gov.ph/feeds/`, Atom, 51 items) ✅.
- PHIVOLCS RSS ✅.
- No site terms were found for either. Under [RA 8293 s.176](https://lawphil.net/statutes/repacts/ra1997/ra_8293_1997.html), no copyright subsists in government works, but exploitation "for profit" needs prior approval of the agency.
- PNA's feed host was down (Cloudflare 522) → retry.
- Official Gazette, PSA, DOH, DFA, BSP and Senate are all behind Cloudflare/Akamai bot walls.
- Inquirer and Rappler → licence required.

### Australia (AU)
| Feed | Status | Reuse |
|---|---|---|
| RBA media releases | ✅ (WebFetch; curl gets Akamai 403) | yes, CC BY 4.0 ([RBA](https://www.rba.gov.au/copyright/)) |
| PM media | ✅ 50 | yes, CC BY 4.0 except Coat of Arms/photos ([pm.gov.au](https://www.pm.gov.au/copyright)) |
| APH House media / Senate reports | ✅ 2 / 134 | ? (CC BY-NC-ND 4.0) |
| BoM warnings (per state `IDZ00054`–`61`) | ✅ 5 | **no** by default ("must not ... use it for any commercial purpose" unless marked CC BY) |
| The Conversation AU | ✅ 50 | attr (CC BY-ND, verbatim republish) |
| ABC, SBS | ✅ | no |

ABS and ASIC: no working RSS path found.

### New Zealand (NZ)
- Beehive releases ✅ (30). The copyright page is client-rendered and could not be read → `?`. NZGOAL defaults to CC BY 4.0, but that is unconfirmed for this site.
- RBNZ news ✅ (50). Terms page returned 403 → `?`.
- Courts of NZ ✅ (low volume): personal/in-house use only → no.
- MetService CAP ✅ → `?`.
- GeoNet quake **GeoJSON API**: CC BY 3.0 NZ ([policy](https://www.geonet.org.nz/policy)) → yes.
- Stats NZ and Parliament: no feed found.
- RNZ → licence required.

### Region-wide (APAC)
- GDACS ✅ (EC legal notice: CC BY 4.0), USGS M4.5+ Atom ✅ (public domain, credit requested; policy page blocked bot fetch, so re-verify), ADB news ✅ (republish unaltered with attribution).
- UN News Asia-Pacific ✅ but UN terms are personal/non-commercial → `?`.
- ASEAN ✅ (terms unreachable). UNESCAP ✅ (stale, Feb 2026).
- ReliefWeb ❌ (bot challenge).
- VOA's Asia feed was last updated 2025-03 and is excluded.

## Key caveats
1. **Wikinews is gone.** Wikimedia closed all language editions; they have been read-only since 4 May 2026 ([Meta consultation](https://meta.wikimedia.org/wiki/Public_consultation_about_Wikinews), [Wikipedia](https://en.wikipedia.org/wiki/Wikinews)). The NewsFeed endpoints return 404. This removes the main openly licensed *news* source.
2. **Public broadcasters are not open.** NHK, RTHK, Thai PBS, PTS, ABC and RNZ all reserve rights; RTHK even restricts linking.
3. **Commercial-use clauses.** If OpenLens counts as commercial, the HK government sources, BoJ, the UN, APH (NC-ND) and PH government works (for-profit approval) need permission or legal review. The clean open licences are JP PDL1.0, TW OGDL, KR KOGL-1 (KMA), AU CC BY (RBA, PM), the EU/GDACS CC BY, and USGS.
4. **Weak markets:** SG (no primary feed), MY, ID, TH (one primary feed each, unclear terms), VN (unclear terms). These will need HTML newsroom scraping or direct licensing.
5. **Bot protection.** RBA, MOFA-JP, IMF, BI/BPS, PH agencies and RBNZ sit behind Akamai or Cloudflare. A production fetcher needs a real UA and polite rate limits, and will still fail on some.
6. **Staleness to monitor:** METI (Jun 2026), NHK cat0 (Aug), SBS (Aug), UNESCAP (Feb), NZ Courts (Mar).
7. Several feeds omit dates (PIB, Bernama) or use non-RFC date formats (SEBI, baochinhphu, pm.gov.au, KMA). The ingester needs lenient date parsing.

## Left/centre/right lens: published positioning studies
No per-brand left/centre/right ratings were found for these markets in the sources reviewed, and **none are invented here**. Available evidence:
- **Reuters Institute Digital News Report 2026** has country pages with *brand trust* scores (0–10 scale; 6–10 counted as trust) for AU, HK, IN, ID, JP, MY, PH, SG, KR, TW, TH. Index: https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2026, e.g. [/japan](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2026/japan), [/south-korea](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2026/south-korea), [/india](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2026/india). The DNR states that trust scores are "aggregates of people's personal opinions, ... not an objective assessment". These are trust data, not ideology placements. **VN and NZ are not covered.** The 2025 edition is at /digital-news-report/2025.
- **NZ:** AUT JMAD "Trust in News in Aotearoa New Zealand" (annual, brand trust): https://www.jmadresearch.com/trust-in-news-in-new-zealand
- **Pew Research** has published audience-ideology versus perceived-leaning placements for news outlets, but the only such study surfaced covers Western Europe. No APAC equivalent was found.
- Any lens rating will therefore need OpenLens's own methodology (for example, audience self-placement from DNR microdata where licensed, or editorial-stance coding) and should be documented as such.
