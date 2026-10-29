import { DatasetValidator } from './DatasetValidator';
import { describe, it, expect } from 'vitest';

describe('DatasetValidator', () => {
  const createValidFrame = () => ({
    version: 'pose-features-v1',
    timestamp: Date.now(),
    features: Array(32).fill(0.1)
  });

  const createValidSample = () => ({
    sampleId: '123',
    participantId: 'P001',
    sessionId: 'S001',
    exercise: 'SQUAT',
    label: 'GOOD_FORM',
    featureVersion: 'pose-features-v1',
    windowSize: 30,
    stride: 5,
    timestamp: Date.now(),
    source: 'web-collector',
    features: Array.from({ length: 30 }, createValidFrame)
  });

  it('validates a valid 30x32 sample', () => {
    const report = DatasetValidator.validate([createValidSample()]);
    expect(report.isValid).toBe(true);
    expect(report.validCount).toBe(1);
    expect(report.errors.length).toBe(0);
  });

  it('detects wrong frame count', () => {
    const sample = createValidSample();
    sample.features = Array.from({ length: 29 }, createValidFrame);
    const report = DatasetValidator.validate([sample]);
    expect(report.isValid).toBe(false);
    expect(report.errors[0]).toContain('Expected exactly 30 frames, got 29');
  });

  it('detects wrong feature count', () => {
    const sample = createValidSample();
    sample.features[5].features = Array(31).fill(0.1);
    const report = DatasetValidator.validate([sample]);
    expect(report.isValid).toBe(false);
    expect(report.errors[0]).toContain('numeric features, expected 32');
  });

  it('detects NaN in features', () => {
    const sample = createValidSample();
    sample.features[5].features[10] = NaN;
    const report = DatasetValidator.validate([sample]);
    expect(report.isValid).toBe(false);
    expect(report.errors[0]).toContain('NaN or Infinity');
  });

  it('detects Infinity in features', () => {
    const sample = createValidSample();
    sample.features[1].features[0] = Infinity;
    const report = DatasetValidator.validate([sample]);
    expect(report.isValid).toBe(false);
    expect(report.errors[0]).toContain('NaN or Infinity');
  });

  it('detects missing participant', () => {
    const sample = createValidSample();
    sample.participantId = '';
    const report = DatasetValidator.validate([sample]);
    expect(report.isValid).toBe(false);
    expect(report.errors[0]).toContain('Missing participantId');
  });

  it('detects invalid label', () => {
    const sample = createValidSample();
    sample.label = '';
    const report = DatasetValidator.validate([sample]);
    expect(report.isValid).toBe(false);
    expect(report.errors[0]).toContain('Missing label');
  });

  it('detects invalid feature version', () => {
    const sample = createValidSample();
    sample.featureVersion = 'v2';
    const report = DatasetValidator.validate([sample]);
    expect(report.isValid).toBe(false);
    expect(report.errors[0]).toContain('Invalid featureVersion');
  });

  it('rejects empty dataset', () => {
    const report = DatasetValidator.validate([]);
    expect(report.isValid).toBe(false);
    expect(report.errors[0]).toContain('Dataset is empty');
  });

  it('calculates label distribution and adds warnings for class imbalance', () => {
    const samples = [
      { ...createValidSample(), label: 'GOOD_FORM' },
      { ...createValidSample(), label: 'GOOD_FORM' },
      { ...createValidSample(), label: 'GOOD_FORM' },
      { ...createValidSample(), label: 'GOOD_FORM' },
      { ...createValidSample(), label: 'GOOD_FORM' },
      { ...createValidSample(), label: 'GOOD_FORM' },
      { ...createValidSample(), label: 'KNEE_VALGUS' },
    ];
    
    const report = DatasetValidator.validate(samples);
    expect(report.isValid).toBe(true);
    expect(report.labelDistribution['GOOD_FORM']).toBe(6);
    expect(report.labelDistribution['KNEE_VALGUS']).toBe(1);
    
    // Check for warnings
    const hasImbalanceWarning = report.warnings.some(w => w.includes('imbalanced'));
    expect(hasImbalanceWarning).toBe(true);
  });
});
