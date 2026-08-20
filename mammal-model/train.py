"""
train.py — Fine-tune YAMNet on Sacramento-area mammal sounds.

Architecture:
  Audio (16kHz) → YAMNet (frozen, feature extractor) → mean pool
  → Dense(256, relu) → Dropout(0.4) → Dense(N_species, softmax)

YAMNet is Google's pre-trained audio classifier (521 classes).
We freeze it and train only our small mammal classifier on top.
This lets us get good results with as few as 50 clips per species.

Usage:
  python train.py

Output:
  model/mammal_classifier.keras   — full Keras model
  model/classifier_only.keras     — just our dense layers (for TF.js export)
  model/training_history.png      — accuracy/loss curves
"""

import os
import json
import numpy as np
import tensorflow as tf
import tensorflow_hub as hub
import librosa
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_class_weight

# ── Config ────────────────────────────────────────────────────────────────────
DATA_DIR      = Path("data")
MODEL_DIR     = Path("model")
TARGET_SR     = 16000        # YAMNet input sample rate
CLIP_DURATION = 3.0          # Seconds per training clip (matches BirdNET)
YAMNET_URL    = "https://tfhub.dev/google/yamnet/1"
EPOCHS        = 60
BATCH_SIZE    = 32
LEARNING_RATE = 3e-4

MODEL_DIR.mkdir(exist_ok=True)

# Load species labels
with open("labels.json") as f:
    SPECIES = json.load(f)
N_CLASSES = len(SPECIES)
KEY_TO_IDX = {sp["key"]: sp["id"] for sp in SPECIES}


# ── Audio Loading ─────────────────────────────────────────────────────────────

def load_clips(wav_path: Path, duration: float = CLIP_DURATION):
    """
    Load a WAV file and split into fixed-length clips.
    Returns list of numpy arrays, each of length (duration * TARGET_SR).
    """
    try:
        audio, _ = librosa.load(str(wav_path), sr=TARGET_SR, mono=True)
    except Exception:
        return []

    clip_len = int(duration * TARGET_SR)
    clips    = []

    # Slide a window across the audio
    for start in range(0, len(audio) - clip_len + 1, clip_len // 2):
        clip = audio[start : start + clip_len]
        if len(clip) == clip_len:
            clips.append(clip.astype(np.float32))

    # If audio is shorter than one clip, pad it
    if not clips and len(audio) > 0:
        pad  = np.zeros(clip_len, dtype=np.float32)
        pad[:len(audio)] = audio
        clips.append(pad)

    return clips


def augment_clip(clip: np.ndarray) -> np.ndarray:
    """
    Enhanced augmentation for wildlife sounds.
    Pitch shift is the most impactful for animal calls (same animal,
    different individual / age / distance).
    """
    clip_len = int(CLIP_DURATION * TARGET_SR)

    # 1. Random gain ±30%
    clip = clip * np.random.uniform(0.7, 1.3)

    # 2. Random Gaussian noise (mic noise, wind)
    clip = clip + np.random.normal(0, 0.008, clip.shape).astype(np.float32)

    # 3. Random time shift ±1/3 second
    shift = np.random.randint(-TARGET_SR // 3, TARGET_SR // 3)
    clip  = np.roll(clip, shift)

    # 4. Pitch shift ±2 semitones (40% chance) — simulates size variation
    #    OR time stretch ±15% (20% chance) — simulates recording speed
    r = np.random.random()
    if r < 0.4:
        n_steps = np.random.uniform(-2.0, 2.0)
        clip = librosa.effects.pitch_shift(clip, sr=TARGET_SR, n_steps=n_steps)
        # Ensure correct length after pitch shift
        if len(clip) > clip_len:
            clip = clip[:clip_len]
        elif len(clip) < clip_len:
            clip = np.pad(clip, (0, clip_len - len(clip)))
        clip = clip.astype(np.float32)
    elif r < 0.6:
        rate = np.random.uniform(0.85, 1.15)
        clip = librosa.effects.time_stretch(clip, rate=rate)
        if len(clip) > clip_len:
            clip = clip[:clip_len]
        elif len(clip) < clip_len:
            clip = np.pad(clip, (0, clip_len - len(clip)))
        clip = clip.astype(np.float32)

    return np.clip(clip, -1.0, 1.0)


# ── Dataset Building ──────────────────────────────────────────────────────────

def build_dataset(augment: bool = True):
    """Load all WAV files and build (clips, labels) arrays."""
    all_clips  = []
    all_labels = []

    for species in SPECIES:
        key      = species["key"]
        label    = species["id"]
        wav_dir  = DATA_DIR / key

        if not wav_dir.exists():
            print(f"  WARNING: No data folder for {species['commonName']} — skipping")
            continue

        wavs = list(wav_dir.glob("*.wav"))
        if not wavs:
            print(f"  WARNING: No WAV files for {species['commonName']} — skipping")
            continue

        species_clips = []
        for wav in wavs:
            species_clips.extend(load_clips(wav))

        print(f"  {species['commonName']:30s} {len(wavs):3d} files → {len(species_clips):4d} clips")

        # Augment all classes to a minimum of 300 clips for balance
        if augment and len(species_clips) < 300:
            extra = []
            while len(species_clips) + len(extra) < 300:
                src = species_clips[np.random.randint(len(species_clips))]
                extra.append(augment_clip(src))
            species_clips.extend(extra)

        all_clips.extend(species_clips)
        all_labels.extend([label] * len(species_clips))

    return np.array(all_clips, dtype=np.float32), np.array(all_labels, dtype=np.int32)


# ── YAMNet Feature Extractor ──────────────────────────────────────────────────

print("Loading YAMNet from TF Hub (first run downloads ~13MB)...")
yamnet_model = hub.load(YAMNET_URL)

def extract_embeddings(clips: np.ndarray) -> np.ndarray:
    """
    Run clips through YAMNet and return mean-pooled embeddings.
    YAMNet outputs one 1024-dim embedding per 0.96s frame.
    We average across frames to get one vector per clip.
    """
    embeddings = []
    for clip in clips:
        _, emb, _ = yamnet_model(clip)   # emb shape: (n_frames, 1024)
        embeddings.append(tf.reduce_mean(emb, axis=0).numpy())
    return np.array(embeddings, dtype=np.float32)


# ── Build & Train ─────────────────────────────────────────────────────────────

def build_classifier(n_classes: int) -> tf.keras.Model:
    """
    Wider dense network on top of YAMNet embeddings.
    L2 regularization + stronger dropout to reduce overfitting on small datasets.
    """
    reg = tf.keras.regularizers.l2(1e-4)
    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(1024,), name="yamnet_embedding"),
        tf.keras.layers.Dense(512, activation="relu", kernel_regularizer=reg),
        tf.keras.layers.BatchNormalization(),
        tf.keras.layers.Dropout(0.5),
        tf.keras.layers.Dense(256, activation="relu", kernel_regularizer=reg),
        tf.keras.layers.BatchNormalization(),
        tf.keras.layers.Dropout(0.4),
        tf.keras.layers.Dense(n_classes, activation="softmax", name="species_probs"),
    ], name="mammal_classifier")
    return model


def main():
    print("\n" + "=" * 60)
    print("WildEars Mammal Sound Classifier — Training")
    print("=" * 60)

    # 1. Load dataset
    print("\nLoading audio clips...")
    clips, labels = build_dataset(augment=True)

    if len(clips) == 0:
        print("\nERROR: No audio data found. Run download_data.py first.")
        return

    print(f"\nTotal: {len(clips)} clips, {N_CLASSES} species")

    # 2. Extract YAMNet embeddings (pre-compute — much faster than per-batch)
    print("\nExtracting YAMNet embeddings (this may take a few minutes)...")
    embeddings = extract_embeddings(clips)
    print(f"Embedding shape: {embeddings.shape}")

    # 3. Train / val split
    X_train, X_val, y_train, y_val = train_test_split(
        embeddings, labels,
        test_size=0.2,
        stratify=labels,
        random_state=42
    )

    # 4. Class weights to handle imbalance
    class_weights = compute_class_weight(
        class_weight="balanced",
        classes=np.unique(y_train),
        y=y_train
    )
    class_weight_dict = dict(enumerate(class_weights))

    # 5. Build model
    model = build_classifier(N_CLASSES)
    model.summary()

    model.compile(
        optimizer=tf.keras.optimizers.Adam(LEARNING_RATE),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"]
    )

    # 6. Callbacks
    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor="val_accuracy", patience=12, restore_best_weights=True
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss", factor=0.5, patience=4, min_lr=1e-5
        ),
        tf.keras.callbacks.ModelCheckpoint(
            str(MODEL_DIR / "best_classifier.keras"),
            monitor="val_accuracy", save_best_only=True
        ),
    ]

    # 7. Train
    print("\nTraining...")
    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=EPOCHS,
        batch_size=BATCH_SIZE,
        class_weight=class_weight_dict,
        callbacks=callbacks,
        verbose=1
    )

    # 8. Evaluate
    val_loss, val_acc = model.evaluate(X_val, y_val, verbose=0)
    print(f"\nFinal val accuracy: {val_acc:.1%}")
    print(f"Final val loss:     {val_loss:.4f}")

    # 9. Per-class accuracy
    preds     = np.argmax(model.predict(X_val, verbose=0), axis=1)
    print("\nPer-species accuracy:")
    for sp in SPECIES:
        idx   = sp["id"]
        mask  = y_val == idx
        if mask.sum() == 0:
            continue
        acc   = (preds[mask] == idx).mean()
        flag  = "⚠ invasive" if sp["status"] == "invasive" else ""
        print(f"  {sp['commonName']:30s} {acc:6.1%}  {flag}")

    # 10. Save model
    model.save(str(MODEL_DIR / "classifier_only.keras"))
    print(f"\nSaved classifier to {MODEL_DIR / 'classifier_only.keras'}")

    # 11. Plot training curves
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4))
    ax1.plot(history.history["accuracy"],     label="Train")
    ax1.plot(history.history["val_accuracy"], label="Val")
    ax1.set_title("Accuracy")
    ax1.legend()
    ax2.plot(history.history["loss"],     label="Train")
    ax2.plot(history.history["val_loss"], label="Val")
    ax2.set_title("Loss")
    ax2.legend()
    plt.tight_layout()
    plt.savefig(str(MODEL_DIR / "training_history.png"), dpi=150)
    print(f"Saved training plot to {MODEL_DIR / 'training_history.png'}")

    print("\nNext step: run  python convert.py")


if __name__ == "__main__":
    main()
