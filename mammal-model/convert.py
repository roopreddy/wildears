"""
convert.py — Export the trained mammal classifier to TF.js LayersModel format.

The browser pipeline is:
  Audio → YAMNet (TF.js, loaded from TF Hub) → embeddings
        → our classifier (TF.js LayersModel, loaded from /wildears/mammal-model/tfjs/)

Load in browser with:  tf.loadLayersModel('/wildears/mammal-model/tfjs/model.json')

Usage:
  python convert.py

Output:
  model/tfjs/          — TF.js model files (copy to wildears/mammal-model/tfjs/)
  model/labels.json    — copy of labels for the browser
"""

import json
import shutil
import sys
import types
from pathlib import Path

MODEL_DIR  = Path("model")
TFJS_DIR   = MODEL_DIR / "tfjs"
LABELS_SRC = Path("labels.json")


def stub_missing_modules():
    """
    Stub out optional TF ecosystem packages that tensorflowjs imports
    but that are not available on Windows / not needed for Keras conversion.
    Must be called before `import tensorflowjs`.
    """
    stubs = [
        "tensorflow_decision_forests",
        "tensorflow_decision_forests.component",
        "tensorflow_decision_forests.component.py_tree",
        "tensorflow_decision_forests.component.py_tree.base",
        "tensorflow_decision_forests.tensorflow_ops",
        "orbax",
        "orbax.checkpoint",
    ]
    for name in stubs:
        if name not in sys.modules:
            mod = types.ModuleType(name)
            mod.__version__ = "0.0.0-stub"
            sys.modules[name] = mod


def convert_via_api(model) -> bool:
    """Try tensorflowjs.converters.save_keras_model (produces LayersModel)."""
    try:
        stub_missing_modules()
        import tensorflowjs as tfjs
        tfjs.converters.save_keras_model(model, str(TFJS_DIR))
        return True
    except Exception as e:
        print(f"  tensorflowjs API failed: {e}")
        return False


def convert_manual(model) -> None:
    """
    Fallback: write TF.js LayersModel format directly using only
    tensorflow + numpy (no tensorflowjs package needed).

    Produces:
      model.json               — topology + weight manifest
      group1-shard1of1.bin     — packed float32 weights (little-endian)
    """
    import numpy as np

    # --- weights ---
    weight_specs = []
    weight_buffers = []

    for w in model.weights:
        arr  = w.numpy().astype("<f4")          # float32 little-endian
        name = w.name.rstrip(":0")              # strip TF ':0' suffix

        # Keras uses the layer name as prefix, e.g. "dense/kernel"
        # TF2 may already have this form; normalise just in case.
        weight_specs.append({
            "name":  name,
            "shape": list(arr.shape),
            "dtype": "float32",
        })
        weight_buffers.append(arr.tobytes())

    binary = b"".join(weight_buffers)
    (TFJS_DIR / "group1-shard1of1.bin").write_bytes(binary)

    # --- topology (Keras JSON) ---
    topology = json.loads(model.to_json())

    manifest = {
        "format": "layers-model",
        "generatedBy": "keras",
        "convertedBy": "wildears-manual-converter",
        "modelTopology": topology,
        "weightsManifest": [{
            "paths":   ["group1-shard1of1.bin"],
            "weights": weight_specs,
        }],
    }
    (TFJS_DIR / "model.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    print("  Manual conversion complete.")


def main():
    print("=" * 60)
    print("WildEars Mammal Classifier — TF.js Export")
    print("=" * 60)

    import tensorflow as tf

    # Load the trained classifier
    classifier_path = MODEL_DIR / "classifier_only.keras"
    if not classifier_path.exists():
        classifier_path = MODEL_DIR / "best_classifier.keras"
    if not classifier_path.exists():
        print("ERROR: No trained model found. Run train.py first.")
        sys.exit(1)

    print(f"\nLoading model from {classifier_path}...")
    model = tf.keras.models.load_model(str(classifier_path))
    model.summary()

    TFJS_DIR.mkdir(parents=True, exist_ok=True)

    # Try tensorflowjs API first (cleaner output), fall back to manual
    print(f"\nConverting to TF.js LayersModel → {TFJS_DIR}")
    if not convert_via_api(model):
        print("  Falling back to manual conversion...")
        convert_manual(model)

    # Copy labels alongside the model
    shutil.copy(LABELS_SRC, MODEL_DIR / "labels.json")
    shutil.copy(LABELS_SRC, TFJS_DIR / "labels.json")

    # Report file sizes
    print("\nExported files:")
    total = 0
    for f in sorted(TFJS_DIR.iterdir()):
        size   = f.stat().st_size
        total += size
        print(f"  {f.name:40s} {size/1024:8.1f} KB")
    print(f"\n  Total model size: {total/1024:.0f} KB ({total/1024/1024:.2f} MB)")

    print("""
─────────────────────────────────────────────────────────
Next steps:
  1. Copy model/tfjs/ to wildears/mammal-model/tfjs/
  2. Push to GitHub:
       git add mammal-model/tfjs && git commit -m "Add TF.js mammal model" && git push
  3. The mammal-worker.js loads it with:
       tf.loadLayersModel('/wildears/mammal-model/tfjs/model.json')
─────────────────────────────────────────────────────────
""")


if __name__ == "__main__":
    main()
