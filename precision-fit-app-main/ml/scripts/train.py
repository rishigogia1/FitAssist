import os
import sys

def main():
    print("==================================================")
    print(" FITASSIST PRO - TEMPORAL CNN TRAINING PIPELINE")
    print("==================================================")
    
    raw_dir = os.path.join(os.path.dirname(__file__), "..", "datasets", "raw")
    
    if not os.path.exists(raw_dir) or not os.listdir(raw_dir):
        print("\nERROR: DATASET NOT READY.")
        print("No collected JSONL sequences found in ml/datasets/raw/.")
        print("You must use the /pro/dev/dataset collector to gather actual movement sequences.")
        print("DO NOT fabricate synthetic data just to make this script run.")
        print("Exiting.")
        sys.exit(1)
        
    print("\nDataset found. Ready to begin processing.")
    print("Next steps once sufficient multi-participant data is gathered:")
    print("1. Split data (Train/Val/Test) by participant/session.")
    print("2. Initialize Temporal 1D-CNN (PyTorch).")
    print("3. Train using CrossEntropyLoss over the 30x32 normalized feature sequences.")
    print("4. Evaluate macro-F1 on the held-out test set.")
    print("5. Export to ONNX.")
    print("6. Update metadata.json.")

if __name__ == "__main__":
    main()
