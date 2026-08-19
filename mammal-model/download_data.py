"""
download_data.py — Fetch mammal sound recordings from iNaturalist.

iNaturalist's API is free and requires no API key for read access.
Only downloads "research grade" observations with sounds attached.

Usage:
  python download_data.py

Output:
  data/<species_key>/<observation_id>.wav
"""

import os
import json
import time
import requests
import soundfile as sf
import numpy as np
import librosa
from pathlib import Path
from urllib.parse import urlparse
from tqdm import tqdm

# ── Config ────────────────────────────────────────────────────────────────────
DATA_DIR       = Path("data")
TARGET_SR      = 16000   # YAMNet expects 16kHz mono
MAX_PER_SPECIES = 150    # Download up to 150 clips per species
MIN_DURATION_S  = 1.0    # Skip clips shorter than 1 second
MAX_DURATION_S  = 30.0   # Trim clips longer than 30 seconds
INAT_API        = "https://api.inaturalist.org/v1"

# Load species list
with open("labels.json") as f:
    SPECIES = json.load(f)


def fetch_observations(taxon_name: str, per_page: int = 50, page: int = 1):
    """Query iNaturalist for research-grade observations with sounds."""
    params = {
        "taxon_name":    taxon_name,
        "sounds":        "true",
        "quality_grade": "research",
        "per_page":      per_page,
        "page":          page,
        "order":         "desc",
        "order_by":      "votes",
    }
    resp = requests.get(f"{INAT_API}/observations", params=params, timeout=15)
    resp.raise_for_status()
    return resp.json()


def download_audio(url: str, dest: Path) -> bool:
    """Download a raw audio file from iNaturalist CDN."""
    try:
        r = requests.get(url, timeout=30, stream=True)
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
        return True
    except Exception as e:
        print(f"  Download failed: {e}")
        return False


def process_audio(src: Path, dest: Path) -> bool:
    """
    Load any audio format, resample to 16kHz mono, trim silence,
    normalize, and save as WAV. Returns False if clip is unusable.
    """
    try:
        audio, sr = librosa.load(str(src), sr=TARGET_SR, mono=True)

        # Trim leading/trailing silence
        audio, _ = librosa.effects.trim(audio, top_db=20)

        duration = len(audio) / TARGET_SR
        if duration < MIN_DURATION_S:
            return False

        # Trim to max duration
        if duration > MAX_DURATION_S:
            audio = audio[:int(MAX_DURATION_S * TARGET_SR)]

        # Normalize to [-1, 1]
        peak = np.max(np.abs(audio))
        if peak > 0:
            audio = audio / peak

        sf.write(str(dest), audio, TARGET_SR, subtype="PCM_16")
        return True
    except Exception as e:
        print(f"  Processing failed: {e}")
        return False


def download_species(species: dict):
    """Download and process all available clips for one species."""
    key       = species["key"]
    taxon     = species["inatTaxonName"]
    out_dir   = DATA_DIR / key
    out_dir.mkdir(parents=True, exist_ok=True)

    existing  = len(list(out_dir.glob("*.wav")))
    needed    = MAX_PER_SPECIES - existing

    if needed <= 0:
        print(f"  {species['commonName']}: already have {existing} clips, skipping.")
        return

    print(f"\n{species['commonName']} ({taxon}) — need {needed} more clips")

    collected = 0
    page      = 1

    while collected < needed:
        try:
            data = fetch_observations(taxon, per_page=50, page=page)
        except Exception as e:
            print(f"  API error: {e}")
            break

        results = data.get("results", [])
        if not results:
            break

        for obs in results:
            if collected >= needed:
                break

            sounds = obs.get("sounds", [])
            if not sounds:
                continue

            obs_id    = obs["id"]
            wav_path  = out_dir / f"{obs_id}.wav"
            if wav_path.exists():
                continue

            # Try each sound attachment
            for sound in sounds:
                url = sound.get("file_url") or sound.get("file")
                if not url:
                    continue

                # Strip query params from URL before using as filename
                clean_path = urlparse(url).path
                ext        = Path(clean_path).suffix or ".mp3"
                raw_path   = out_dir / f"{obs_id}_raw{ext}"

                if download_audio(url, raw_path):
                    if process_audio(raw_path, wav_path):
                        collected += 1
                        print(f"  [{collected}/{needed}] obs {obs_id}")
                    raw_path.unlink(missing_ok=True)
                    break

            time.sleep(0.2)  # Be polite to the API

        page += 1
        time.sleep(1)

    print(f"  Done: {collected} new clips for {species['commonName']}")


def main():
    print("=" * 60)
    print("WildEars Mammal Sound Downloader")
    print("Source: iNaturalist (research-grade observations)")
    print("=" * 60)

    DATA_DIR.mkdir(exist_ok=True)

    for species in SPECIES:
        download_species(species)

    # Summary
    print("\n── Summary ──────────────────────────────────────")
    total = 0
    for species in SPECIES:
        key   = species["key"]
        count = len(list((DATA_DIR / key).glob("*.wav")))
        total += count
        status = "invasive ⚠" if species["status"] == "invasive" else "native"
        print(f"  {species['commonName']:30s} {count:3d} clips  [{status}]")
    print(f"\n  Total: {total} clips across {len(SPECIES)} species")
    print("\nNext step: run  python train.py")


if __name__ == "__main__":
    main()
