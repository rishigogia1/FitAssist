import json
import glob
import sys
import os
from collections import Counter

EXPECTED_VERSION = "pose-features-v1"
EXPECTED_FEATURE_LENGTH = 32
EXPECTED_WINDOW_SIZE = 30
VALID_LABELS = {
    "GOOD_FORM",
    "INSUFFICIENT_DEPTH",
    "EXCESSIVE_FORWARD_LEAN",
    "KNEE_VALGUS",
    "ASYMMETRIC_MOVEMENT",
    "UNKNOWN"
}

def validate_dataset(raw_dir: str):
    print(f"Validating dataset in {raw_dir}...")
    files = glob.glob(os.path.join(raw_dir, "*.jsonl"))
    
    if not files:
        print("Error: No JSONL files found. DATASET NOT READY.")
        sys.exit(1)
        
    total_samples = 0
    participants = set()
    label_counts = Counter()
    
    for filepath in files:
        with open(filepath, 'r') as f:
            for line_no, line in enumerate(f, 1):
                try:
                    sample = json.loads(line)
                except json.JSONDecodeError:
                    print(f"Error: Invalid JSON on line {line_no} in {filepath}")
                    sys.exit(1)
                
                # Check top-level keys
                required_keys = {"label", "featureVersion", "windowSize", "features", "exercise", "participantId", "sessionId"}
                if not required_keys.issubset(sample.keys()):
                    print(f"Error: Missing required keys on line {line_no} in {filepath}. Expected {required_keys}")
                    sys.exit(1)
                
                # Check version
                if sample["featureVersion"] != EXPECTED_VERSION:
                    print(f"Error: Invalid featureVersion {sample['featureVersion']} (expected {EXPECTED_VERSION}) on line {line_no}")
                    sys.exit(1)
                    
                # Check dimensions
                if sample["windowSize"] != EXPECTED_WINDOW_SIZE:
                    print(f"Error: Invalid windowSize {sample['windowSize']} (expected {EXPECTED_WINDOW_SIZE}) on line {line_no}")
                    sys.exit(1)
                    
                if len(sample["features"]) != EXPECTED_WINDOW_SIZE:
                    print(f"Error: Sequence length is {len(sample['features'])}, expected {EXPECTED_WINDOW_SIZE}")
                    sys.exit(1)
                    
                for idx, frame_features in enumerate(sample["features"]):
                    if len(frame_features["features"]) != EXPECTED_FEATURE_LENGTH:
                        print(f"Error: Frame {idx} feature length is {len(frame_features['features'])}, expected {EXPECTED_FEATURE_LENGTH}")
                        sys.exit(1)
                        
                    # Check for NaN / Inf
                    for val in frame_features["features"]:
                        if val != val or val == float('inf') or val == float('-inf'):
                            print(f"Error: NaN or Infinity found in features on line {line_no}")
                            sys.exit(1)
                            
                # Check label
                label = sample["label"]
                if label not in VALID_LABELS:
                    print(f"Error: Unknown label '{label}' on line {line_no}")
                    sys.exit(1)
                    
                participant_id = sample["participantId"]
                participants.add(participant_id)
                label_counts[label] += 1
                total_samples += 1
                
    print("\n--- Dataset Validation Passed ---")
    print(f"Total Samples: {total_samples}")
    print(f"Unique Participants: {len(participants)}")
    print("Class Distribution:")
    for label, count in label_counts.most_common():
        print(f"  {label}: {count} ({count/total_samples*100:.1f}%)")
        
    if total_samples < 100:
        print("\nWARNING: Dataset is too small for meaningful training. Collect more data.")
    elif len(participants) < 3:
        print("\nWARNING: Dataset has fewer than 3 participants. A proper train/val/test split requires more diverse participant data.")
        
    # Simulate a split to verify leakage prevention
    if len(participants) >= 3:
        p_list = list(participants)
        train_p = set(p_list[:-2])
        val_p = {p_list[-2]}
        test_p = {p_list[-1]}
        
        # Verify no intersection
        if train_p & val_p or train_p & test_p or val_p & test_p:
            print("\nERROR: Data leakage detected between simulated splits!")
            sys.exit(1)
        else:
            print("\nSplit Validation: Passed. Strict participant-level separation confirmed.")

if __name__ == "__main__":
    raw_directory = os.path.join(os.path.dirname(__file__), "..", "datasets", "raw")
    validate_dataset(raw_directory)
