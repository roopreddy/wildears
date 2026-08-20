"""
download_extra.py — Supplement training data from GBIF and Freesound.

Sources:
  1. GBIF  — Global Biodiversity Information Facility.
             Aggregates from Macaulay Library (Cornell), iNaturalist,
             and 100+ other providers.  No API key needed.

  2. Freesound — Large community audio archive, great for urban mammals
                 (rats, feral cats, raccoons).
                 Requires a FREE API key — register at:
                 https://freesound.org/apiv2/apply/
                 Then set FREESOUND_KEY below or as environment variable.

Usage:
  python download_extra.py

Adds files to the same data/<species_key>/ folders.
Safe to re-run — skips files already downloaded.
"""

import os
import json
import time
import hashlib
import requests
import soundfile as sf
import numpy as np
import librosa
from pathlib import Path
from urllib.parse import urlparse

# ── Config ────────────────────────────────────────────────────────────────────
DATA_DIR       = Path("data")
TARGET_SR      = 16000
MAX_EXTRA_GBIF = 100    # Additional clips per species from GBIF
MAX_EXTRA_FS   = 50     # Additional clips per species from Freesound

# Set your Freesound API key here, or as env var FREESOUND_KEY
# Get a free key at: https://freesound.org/apiv2/apply/
FREESOUND_KEY  = os.environ.get("FREESOUND_KEY", "")

GBIF_API       = "https://api.gbif.org/v1"
FREESOUND_API  = "https://freesound.org/apiv2"

# Domains already covered by download_data.py — skip duplicates
SKIP_DOMAINS   = {"inaturalist.org", "static.inaturalist.org"}

# Known dead / unreachable domains (offline archives, broken CDNs)
DEAD_DOMAINS   = {
    "osuc.osu.edu",          # Ohio State Borror Lab — offline
    "www.birdresearch.org",  # offline
    "animalsoundsarchive.com",
}

# Domains that fail at runtime get added here automatically (session cache)
_failed_domains: set = set()

with open("labels.json") as f:
    SPECIES = json.load(f)


# ── Audio helpers ──────────────────────────────────────────────────────────────

def process_audio(src: Path, dest: Path,
                  min_dur: float = 1.0, max_dur: float = 30.0) -> bool:
    """Load, resample, trim, normalize, save WAV. Returns False if unusable."""
    try:
        audio, sr = librosa.load(str(src), sr=TARGET_SR, mono=True)
        audio, _  = librosa.effects.trim(audio, top_db=20)
        duration  = len(audio) / TARGET_SR
        if duration < min_dur:
            return False
        if duration > max_dur:
            audio = audio[:int(max_dur * TARGET_SR)]
        peak = np.max(np.abs(audio))
        if peak > 0:
            audio = audio / peak
        sf.write(str(dest), audio, TARGET_SR, subtype="PCM_16")
        return True
    except Exception as e:
        print(f"    Processing failed: {e}")
        return False


def download_file(url: str, dest: Path) -> bool:
    """Download any URL to dest. Returns False on error."""
    domain = urlparse(url).netloc.lstrip("www.")
    if domain in DEAD_DOMAINS or domain in _failed_domains:
        return False
    try:
        r = requests.get(url, timeout=15, stream=True,
                         headers={"User-Agent": "WildEars-FLL/1.0"})
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(8192):
                f.write(chunk)
        return True
    except requests.exceptions.ConnectionError as e:
        # DNS failure or host unreachable — blacklist this domain for the session
        print(f"    Host unreachable ({domain}), skipping for rest of run.")
        _failed_domains.add(domain)
        return False
    except Exception as e:
        print(f"    Download failed: {e}")
        return False


def url_id(url: str) -> str:
    """Short hash of URL to use as filename."""
    return hashlib.md5(url.encode()).hexdigest()[:12]


# ── GBIF ──────────────────────────────────────────────────────────────────────

def gbif_sounds(scientific_name: str, limit: int = 100, offset: int = 0):
    """Return list of direct audio URLs from GBIF for a scientific name."""
    params = {
        "mediaType":  "Sound",
        "scientificName": scientific_name,
        "limit":      limit,
        "offset":     offset,
    }
    try:
        resp = requests.get(f"{GBIF_API}/occurrence/search",
                            params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"    GBIF API error: {e}")
        return []

    urls = []
    for occ in data.get("results", []):
        for media in occ.get("media", []):
            if media.get("type") != "Sound":
                continue
            url = media.get("identifier") or ""
            if not url.startswith("http"):
                continue
            domain = urlparse(url).netloc.lstrip("www.")
            if any(skip in domain for skip in SKIP_DOMAINS):
                continue   # Already have iNaturalist data
            if domain in DEAD_DOMAINS or domain in _failed_domains:
                continue   # Known dead host
            urls.append(url)
    return urls


def download_gbif(species: dict):
    key     = species["key"]
    taxon   = species["scientificName"]
    out_dir = DATA_DIR / key
    out_dir.mkdir(parents=True, exist_ok=True)

    existing = set(p.stem for p in out_dir.glob("gbif_*.wav"))
    needed   = MAX_EXTRA_GBIF - len(existing)
    if needed <= 0:
        print(f"  {species['commonName']}: GBIF quota met, skipping.")
        return

    print(f"\n  GBIF → {species['commonName']} ({taxon})")
    collected = 0
    offset    = 0

    while collected < needed:
        urls = gbif_sounds(taxon, limit=100, offset=offset)
        if not urls:
            break

        for url in urls:
            if collected >= needed:
                break
            uid      = url_id(url)
            wav_path = out_dir / f"gbif_{uid}.wav"
            if wav_path.exists():
                continue

            ext      = Path(urlparse(url).path).suffix or ".mp3"
            raw_path = out_dir / f"gbif_{uid}_raw{ext}"

            if download_file(url, raw_path):
                if process_audio(raw_path, wav_path):
                    collected += 1
                    print(f"    [{collected}/{needed}] {url[:70]}")
                raw_path.unlink(missing_ok=True)
            time.sleep(0.3)

        offset += 100
        if offset > 500:
            break
        time.sleep(1)

    print(f"  GBIF: added {collected} clips for {species['commonName']}")


# ── Freesound ─────────────────────────────────────────────────────────────────

# Search terms tuned per species (common name + "sound" works for most)
FREESOUND_QUERIES = {
    "coyote":                   "coyote howl wild",
    "river_otter":              "river otter sound",
    "raccoon":                  "raccoon sound wildlife",
    "mule_deer":                "mule deer call grunt",
    "california_ground_squirrel": "ground squirrel alarm chirp",
    "bobcat":                   "bobcat scream growl",
    "american_beaver":          "beaver tail slap splash",
    "feral_pig":                "wild boar pig grunt",
    "striped_skunk":            "skunk hiss squeal",
    "red_fox":                  "red fox bark scream",
    "norway_rat":               "rat squeak chattering rodent",
    "roof_rat":                 "rat squeak rodent",
    "feral_goat":               "goat bleat call",
    "nutria":                   "nutria coypu grunt",
    "virginia_opossum":         "opossum hiss click",
    "feral_cat":                "feral cat yowl caterwaul",
}


def freesound_search(query: str, page_size: int = 15, page: int = 1):
    """Search Freesound; returns list of (preview_url, duration) tuples."""
    if not FREESOUND_KEY:
        return []
    params = {
        "query":    query,
        "filter":   "tag:field-recording OR tag:animal",
        "fields":   "id,name,previews,duration",
        "page_size": page_size,
        "page":     page,
        "token":    FREESOUND_KEY,
    }
    try:
        resp = requests.get(f"{FREESOUND_API}/search/text/",
                            params=params, timeout=15)
        resp.raise_for_status()
        results = resp.json().get("results", [])
        out = []
        for r in results:
            dur = r.get("duration", 0)
            if dur < 1 or dur > 60:
                continue
            # Use HQ mp3 preview (no OAuth needed)
            preview = r.get("previews", {}).get("preview-hq-mp3", "")
            if preview:
                out.append((preview, r["id"]))
        return out
    except Exception as e:
        print(f"    Freesound API error: {e}")
        return []


def download_freesound(species: dict):
    key     = species["key"]
    out_dir = DATA_DIR / key
    out_dir.mkdir(parents=True, exist_ok=True)

    existing = len(list(out_dir.glob("fs_*.wav")))
    needed   = MAX_EXTRA_FS - existing
    if needed <= 0:
        print(f"  {species['commonName']}: Freesound quota met, skipping.")
        return

    query = FREESOUND_QUERIES.get(key, species["commonName"] + " sound")
    print(f"\n  Freesound → {species['commonName']} (query: {query!r})")

    collected = 0
    page      = 1

    while collected < needed and page <= 5:
        results = freesound_search(query, page_size=15, page=page)
        if not results:
            break

        for preview_url, fs_id in results:
            if collected >= needed:
                break
            wav_path = out_dir / f"fs_{fs_id}.wav"
            if wav_path.exists():
                continue

            raw_path = out_dir / f"fs_{fs_id}_raw.mp3"
            if download_file(preview_url, raw_path):
                if process_audio(raw_path, wav_path):
                    collected += 1
                    print(f"    [{collected}/{needed}] fs:{fs_id}")
                raw_path.unlink(missing_ok=True)
            time.sleep(0.5)

        page += 1
        time.sleep(1)

    print(f"  Freesound: added {collected} clips for {species['commonName']}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("WildEars — Supplemental Data Downloader")
    print("Sources: GBIF (Macaulay Library + others) + Freesound")
    print("=" * 60)

    DATA_DIR.mkdir(exist_ok=True)

    if not FREESOUND_KEY:
        print("\nNOTE: FREESOUND_KEY not set — skipping Freesound.")
        print("  Get a free key at https://freesound.org/apiv2/apply/")
        print("  Then run:  set FREESOUND_KEY=your_key && python download_extra.py\n")

    for species in SPECIES:
        print(f"\n── {species['commonName']} ──")
        download_gbif(species)
        if FREESOUND_KEY:
            download_freesound(species)

    # Summary
    print("\n── Summary ──────────────────────────────────────")
    total = 0
    for species in SPECIES:
        key   = species["key"]
        count = len(list((DATA_DIR / key).glob("*.wav")))
        total += count
        print(f"  {species['commonName']:30s} {count:3d} clips total")
    print(f"\n  Grand total: {total} clips across {len(SPECIES)} species")
    print("\nNext step: python train.py")


if __name__ == "__main__":
    main()
