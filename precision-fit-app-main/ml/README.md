# FitAssist Pro - ML Temporal CNN Pipeline

This directory contains the machine learning infrastructure for FitAssist Pro's form correction temporal CNN.

## Dataset Status
**NOT READY** - The repository currently contains no labeled training sequences.

## Model Status
**NOT TRAINED** - No weights exist. The system falls back to `MissingModelClassifier` using geometric rules.

## Feature Specification (`pose-features-v1`)

The frontend extracts deterministic numeric features from MediaPipe. This exact feature pipeline is used for both **Training Data Collection** and **Production Inference**.

- **Temporal Window Size**: 30 frames
- **Sequence Stride**: 5 frames
- **Landmarks Selected (in order)**:
  1. `LEFT_SHOULDER` (11)
  2. `RIGHT_SHOULDER` (12)
  3. `LEFT_HIP` (23)
  4. `RIGHT_HIP` (24)
  5. `LEFT_KNEE` (25)
  6. `RIGHT_KNEE` (26)
  7. `LEFT_ANKLE` (27)
  8. `RIGHT_ANKLE` (28)
- **Coordinate Ordering**: `[x, y, z, visibility]`
- **Feature Vector Length**: 8 landmarks * 4 values = 32 floats per frame
- **Input Shape**: `[batch_size, 30, 32]`
- **Normalization**: Hip-center origin. The (x, y, z) midpoint between `LEFT_HIP` and `RIGHT_HIP` is subtracted from all other coordinates to provide translation invariance (robustness against where the user stands in the frame).
- **Missing Values**: Any missing landmark defaults to `[0, 0, 0, 0]`.

## Label Definitions
- `GOOD_FORM`: No observable movement deviations.
- `INSUFFICIENT_DEPTH`: Failing to reach parallel or the required eccentric minimum.
- `EXCESSIVE_FORWARD_LEAN`: The angle between shoulder, hip, and knee drops, collapsing the chest forward.
- `KNEE_VALGUS`: Medial deviation of the knees relative to the ankle/hip alignment.
- `ASYMMETRIC_MOVEMENT`: Uneven left vs right side movement (e.g., favoring one leg).

*Note: Labels represent observable movement patterns, not medical diagnoses or injury predictions.*

## How to Collect Data
1. Navigate to `/pro/dev/dataset` in the web application (Dev Mode only).
2. Select the target label (e.g., `KNEE_VALGUS`).
3. Click "Start Recording".
4. Perform the squat with the selected form deviation.
5. Stop recording. The sequence buffer will automatically capture the 30-frame numeric feature sequences and prompt you to download the `JSONL` dataset chunks.
6. Place the collected JSONL files in `ml/datasets/raw/`.

## Privacy Guarantee
The data collector records **only numeric [x, y, z] features**. It **never** stores or transmits raw video, camera frames, or images.

## Training Pipeline
Once sufficient JSONL files are collected in `ml/datasets/raw/`:
1. Run `python ml/scripts/validate_dataset.py` to ensure schema consistency, normalization validity, and check class balances.
2. Run `python ml/scripts/train.py` to process the data, perform participant-level train/validation/test splitting, train the PyTorch 1D-CNN, and export `.onnx` and `.pth` weights to `ml/models/`.

DO NOT train unless a balanced, multi-participant dataset is ready. Fake data will ruin the inference pipeline.
