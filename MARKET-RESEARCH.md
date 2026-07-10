# Unkept — Market Research

*Compiled July 2026. Unkept is a personal/learning project with no monetisation plan; this research validates the product thesis — is the problem real, who else is solving it, and where does Unkept's positioning sit — rather than sizing a business.*

---

## TL;DR

The problem Unkept targets is real, large, and getting worse: humanity takes over 2 trillion photos a year, ~70% are never looked at again, and half of users say their camera roll causes them stress. Yet no existing product occupies Unkept's exact position — **guided, goal-oriented curation that runs entirely on-device and ends in a shareable story**. The competitive landscape splits into four clusters (platform "Memories" features, pro culling tools, swipe-to-delete cleaners, and privacy-first photo libraries), and each one is missing at least two of Unkept's three pillars: consumer-grade curation UX, verifiable privacy, and a finished story as output. The main strategic risks are platform incumbents commoditising the output (Google's Gemini-powered Recap) and the reality that "privacy-first" motivates a vocal minority rather than the mainstream.

---

## 1. The problem is validated by data

**Volume.** Roughly [2.1 trillion photos will be taken in 2025](https://petapixel.com/2025/06/18/the-number-of-photos-taken-in-2025-is-expected-to-exceed-two-trillion/) — 5.3 billion a day — with [94% captured on smartphones](https://photutorial.com/photos-statistics/). The average smartphone user stores [~2,000–2,800 photos](https://photoaid.com/blog/mobile-photography-statistics/), and [more than 1 in 10 have over 7,500](https://www.mixbook.com/inspiration/survey-overwhelmed-photo-clutter).

**Neglect.** A 2026 study found [~70% of camera-roll photos are never revisited](https://www.digitalinformationworld.com/2026/07/study-finds-70-of-smartphone-photos-are.html), and only 16% of people have looked back at more than a quarter of their photos in the past year. Researchers describe the camera roll as having become "a filing system rather than a memory system."

**Pain.** [Half of respondents say their camera roll causes them stress](https://www.digitalcameraworld.com/photography/70-percent-of-photos-on-your-camera-roll-are-forgotten-and-many-photographers-will-relate-to-digital-photo-overload), strongest among Gen Z. In a [Mixbook survey](https://www.mixbook.com/inspiration/survey-overwhelmed-photo-clutter), 37% say important photos get lost in the volume; 1 in 5 Americans feel actively overwhelmed by their library.

This maps directly onto Unkept's core reframe: the blocker is not storage or search — it's that *reviewing 400 photos is an aversive task*. Every stat above is a person who closes the app that Unkept is designed to keep open.

**Privacy tailwind.** [4 in 5 consumers believe companies train AI on their data without telling them](https://www.relyance.ai/consumer-ai-trust-survey-2025); [more than half are unwilling to share sensitive data even for better digital experiences](https://www.deloitte.com/us/en/insights/industry/telecommunications/connectivity-mobile-trends-survey.html), and the share who feel online-service benefits outweigh privacy concerns dropped from 58% to [48% in 2025](https://www.acronis.com/en/resource-center/resource/data-privacy-in-2025-survey/). Unkept's "disconnect mid-session and it still works" demo speaks directly to this sentiment.

---

## 2. Market context (for scale, not monetisation)

- Photo management software: estimates vary widely by methodology, from [$3.5B in 2025 growing to ~$7.8B by 2034](https://www.businessresearchinsights.com/market-reports/photo-management-software-market-114281) to [$3.6B in 2024 at ~7% CAGR](https://www.verifiedmarketresearch.com/product/photo-management-software-market/). All sources agree on the drivers: AI auto-tagging, face recognition, and automated enhancement.
- The *output* side is large too: photo book services are a [~$26.6B market growing at 4.6% CAGR](https://dataintelo.com/report/photo-book-services-market), with [Shutterfly alone doing ~$60M revenue in May 2026](https://gripsintelligence.com/insights/retailers/mixbook.com). This validates Unkept's goal-aware export modes (print album is one of the four session goals) — people demonstrably pay to turn curated photos into artifacts. The bottleneck those services all share is that the user must arrive with an already-curated set, which is exactly the step Unkept automates.

---

## 3. Competitive landscape

Four clusters, none occupying Unkept's position:

### 3a. Platform "Memories" — Google Photos Recap, Apple Memories
The closest functional competitors and the biggest threat. [Google's 2025 Recap](https://blog.google/products-and-platforms/products/photos/google-photos-2025-recap/) uses Gemini to build AI-curated story videos with customisation (hide people/photos, regenerate), CapCut template export, and social sharing — this is Wrapped-style photo storytelling shipped to a billion-user install base.

**Where Unkept differs:** cloud-upload required (the antithesis of Unkept's promise); curation is automatic and opaque (regenerate-until-satisfied vs. Unkept's reactive swap model); output is an annual recap or passive reel, not a goal-aware export; and both platforms are ecosystem-locked while Unkept is a URL. The differentiation table in the executive summary holds up against the 2025/2026 versions of these products.

### 3b. Pro AI culling — Aftershoot, Narrative Select, FilterPixel, Imagen
A maturing category proving that "AI picks the keepers, human confirms" works as a workflow — [FilterPixel culls 1,000 images in under 3 minutes, Aftershoot ~9 min locally](https://filterpixel.com/ai-photo-culling-software), at [$9–$40/month](https://adventureweddingacademy.com/culling-software-for-photographers/). Notably, [Narrative's positioning ("AI-powered tools to help you decide faster") vs. Aftershoot's ("automate the decision")](https://imagen-ai.com/valuable-tips/best-ai-photo-culling-tools-photographers/) mirrors Unkept's "guided, not forced" principle — and several of these run fully locally, proving on-device ML culling is viable at scale.

**Where Unkept differs:** these are desktop pro tools priced for wedding photographers processing RAW shoots into Lightroom. None targets the consumer with 800 phone photos from a trip, none produces a story as output, and none runs in a browser. They validate the algorithm approach, not the market segment.

### 3c. Consumer camera-roll cleaners — Swipewipe, Swipe & Delete, SwipeClear, PicSwipe
A crowded, fast-growing app-store category built on one insight Unkept shares: [make photo triage feel satisfying, not tedious](https://swipewipe.app/) — swipe right to keep, left to delete, month-by-month chunking, gamified progress. Their traction is evidence that consumers will engage with photo triage when it's framed as a game.

**Where Unkept differs:** these apps are *deletion*-framed (reclaim storage) with no intelligence — the user still reviews every photo, one at a time, with no pre-selection, no clustering, no quality scoring, and nothing at the end but free space. Unkept is *creation*-framed: the endpoint is a story you're proud of, and the ML pre-selection means you react to a starter set instead of triaging from zero. This cluster is Unkept's clearest evidence that the interaction model has demand, and its clearest differentiation opportunity.

### 3d. Privacy-first photo libraries — Ente, Immich, PhotoPrism
Fast-growing proof that privacy-first photo software has an audience: [Immich passed 20,000 GitHub stars in record time with ~1,700 contributors in 2025](https://techfuelhq.com/tutorials/self-hosted-photo-library-immich-photoprism-ente-2026/), shipping local AI search, face recognition, and (as of v3.0, July 2026) mobile slideshows. [Ente](https://alternativeto.net/software/immich/) offers audited end-to-end encryption; [PhotoPrism](https://www.photoprism.app/) monetises via a Plus licence.

**Where Unkept differs:** these are *storage and library* products demanding real commitment — a server to self-host or a subscription and full-library migration. Unkept is a zero-install, zero-account *session* tool: load a URL, drop in a trip, walk away with a story. It can serve the same privacy-conscious audience without asking them to switch photo homes. Immich's addition of slideshows shows the categories may converge, but curation-as-experience is not on any of their roadmaps.

---

## 4. Positioning map

| | Curation intelligence | Consumer UX | Verifiable privacy | Story output |
|---|---|---|---|---|
| Google/Apple Memories | ✅ strong | ✅ | ❌ cloud | ⚠️ passive reel |
| Pro culling (Aftershoot etc.) | ✅ strong | ❌ pro desktop | ⚠️ local but opaque | ❌ none |
| Swipe cleaners | ❌ none | ✅ gamified | ✅ on-device | ❌ deletion only |
| Ente/Immich/PhotoPrism | ⚠️ search/faces | ❌ setup burden | ✅ core promise | ⚠️ emerging |
| **Unkept** | ✅ roadmap | ✅ core design | ✅ structural | ✅ core design |

The whitespace is the **intersection**: every cluster has proven demand for one or two pillars; nobody combines guided curation + browser-based zero-commitment privacy + a finished story. Unkept's moat claim ("the curation experience, not just the algorithm") is consistent with this map — the algorithm is replicable, the goal-setting → L-shape → celebration workflow is the novel part.

---

## 5. Risks and honest counterpoints

1. **Google is closing the output gap fast.** The 2025 Recap with Gemini storylines, customisation, and CapCut export shows the incumbent moving from passive reel toward exactly Unkept's payoff moment. Unkept can't win on output polish alone; the privacy stance and the *per-event* (trip, wedding) rather than *annual* framing are the defensible angles.
2. **Privacy motivates a minority.** The stated-concern numbers are high, but revealed behaviour differs — billions still upload to Google Photos. Privacy is best treated as a trust-builder and differentiator, not the primary hook. The primary hook is "you finished, and it looks great."
3. **Browser ML on mobile is the hard constraint no competitor faces.** Pro culling tools use desktop GPUs; platforms use datacentres. Unkept's roadmap (NIMA ~15 MB → MediaPipe → CLIP ~150 MB) must survive mobile browser memory limits — this is both the moat and the biggest technical risk, and it's already reflected in the memory rules in CLAUDE.md.
4. **The swipe-cleaner category could move up-market.** An app like Swipewipe adding quality scoring and a slideshow endpoint would be the nearest fast-follower. Their install base and App Store distribution beat a web URL; Unkept's counter is the depth of the curation workflow and no-install shareability.

---

## 6. Implications for the roadmap

- **The completion-rate North Star is well-chosen.** The 70%-never-revisited stat means the competition isn't really any app — it's abandonment. Everything in the research supports optimising for finish rate over feature breadth.
- **Per-event framing is the wedge.** Annual recaps are owned by Google/Apple. "Your trip, told as a story, tonight, without uploading anything" is a moment neither platform serves well.
- **Goal-aware export earns its place.** The $26B photo-book market confirms print-album mode is a real endpoint, and a natural future bridge (hand a curated set to any print service).
- **Watch Immich/Ente for convergence** and Google Recap releases for output-feature parity; revisit this document when either moves into interactive curation.
