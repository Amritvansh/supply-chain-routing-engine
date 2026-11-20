/**
 * Gradient Boosted Decision Tree (GBDT) Training Engine in Pure JavaScript
 *
 * Implements:
 *   1. GBDT Regressor (Squared Error loss) for actual transit hours
 *   2. GBDT Classifier (Logistic / Binary Cross-Entropy loss) for delay risk probability
 *   3. Feature importance tracking via variance reduction
 *   4. Export to compact JSON model (sub-100KB) for instant in-process Node.js inference (<0.1ms)
 *
 * Zero external dependencies (No Python, No C++ addons, No ONNX).
 * Pure V8 optimized JavaScript.
 *
 * Output: server/ml/eta_model.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

const FEATURE_NAMES = [
  'road_distance_km',
  'osrm_duration_mins',
  'total_weight_kg',
  'box_size',
  'is_split_shipment',
  'day_of_week',
  'hour_of_day',
];

const FEATURE_LABELS = {
  road_distance_km: 'Road Distance',
  osrm_duration_mins: 'Route Driving Time',
  total_weight_kg: 'Cargo Weight',
  box_size: 'Packaging Volume Tier',
  is_split_shipment: 'Multi-Warehouse Coordination',
  day_of_week: 'Day of Week Transit Schedule',
  hour_of_day: 'Departure Window Traffic',
};

function sigmoid(z) {
  if (z > 20) return 1.0;
  if (z < -20) return 0.0;
  return 1.0 / (1.0 + Math.exp(-z));
}

/**
 * Pre-compute candidate split thresholds for each feature.
 * Uses 25 quantile buckets to make splitting blisteringly fast.
 */
function computeFeatureThresholds(X, numBuckets = 25) {
  const thresholds = [];
  const numFeatures = FEATURE_NAMES.length;

  for (let f = 0; f < numFeatures; f++) {
    const vals = X.map(row => row[f]).sort((a, b) => a - b);
    const uniqueVals = Array.from(new Set(vals));
    const featureThresholds = [];

    if (uniqueVals.length <= numBuckets) {
      for (let i = 0; i < uniqueVals.length - 1; i++) {
        featureThresholds.push((uniqueVals[i] + uniqueVals[i + 1]) / 2);
      }
    } else {
      const step = vals.length / numBuckets;
      for (let b = 1; b < numBuckets; b++) {
        const idx = Math.min(Math.floor(b * step), vals.length - 1);
        const t = vals[idx];
        if (!featureThresholds.includes(t)) {
          featureThresholds.push(t);
        }
      }
    }
    thresholds.push(featureThresholds);
  }
  return thresholds;
}

/**
 * Train a single regression decision tree on target residuals.
 */
function buildTree(
  X,
  residuals,
  indices,
  candidateThresholds,
  maxDepth = 5,
  minSamplesLeaf = 15,
  featureGainAccumulator = null,
  currentDepth = 0,
  hessians = null
) {
  const n = indices.length;

  if (n <= minSamplesLeaf || currentDepth >= maxDepth) {
    if (hessians) {
      let sumRes = 0;
      let sumHess = 0;
      for (let i = 0; i < n; i++) {
        const idx = indices[i];
        sumRes += residuals[idx];
        sumHess += hessians[idx];
      }
      const leafVal = sumRes / (sumHess + 1.0);
      return { value: Math.round(leafVal * 10000) / 10000 };
    } else {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += residuals[indices[i]];
      }
      return { value: Math.round((sum / n) * 10000) / 10000 };
    }
  }

  let sumAll = 0;
  for (let i = 0; i < n; i++) {
    sumAll += residuals[indices[i]];
  }
  const scoreBase = (sumAll * sumAll) / n;

  let bestGain = -Infinity;
  let bestFeature = -1;
  let bestThreshold = null;

  for (let f = 0; f < FEATURE_NAMES.length; f++) {
    const thresholds = candidateThresholds[f];
    if (!thresholds || thresholds.length === 0) continue;

    for (let t = 0; t < thresholds.length; t++) {
      const thresh = thresholds[t];
      let sumLeft = 0;
      let countLeft = 0;

      for (let i = 0; i < n; i++) {
        const idx = indices[i];
        if (X[idx][f] <= thresh) {
          sumLeft += residuals[idx];
          countLeft++;
        }
      }

      const countRight = n - countLeft;
      if (countLeft < minSamplesLeaf || countRight < minSamplesLeaf) {
        continue;
      }

      const sumRight = sumAll - sumLeft;
      const scoreSplit = (sumLeft * sumLeft) / countLeft + (sumRight * sumRight) / countRight;
      const gain = scoreSplit - scoreBase;

      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = f;
        bestThreshold = thresh;
      }
    }
  }

  if (bestGain <= 0 || bestFeature === -1) {
    if (hessians) {
      let sumRes = 0, sumHess = 0;
      for (let i = 0; i < n; i++) {
        const idx = indices[i];
        sumRes += residuals[idx];
        sumHess += hessians[idx];
      }
      return { value: Math.round((sumRes / (sumHess + 1.0)) * 10000) / 10000 };
    } else {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += residuals[indices[i]];
      return { value: Math.round((sum / n) * 10000) / 10000 };
    }
  }

  const bestLeftIndices = [];
  const bestRightIndices = [];
  for (let i = 0; i < n; i++) {
    const idx = indices[i];
    if (X[idx][bestFeature] <= bestThreshold) {
      bestLeftIndices.push(idx);
    } else {
      bestRightIndices.push(idx);
    }
  }

  if (featureGainAccumulator) {
    featureGainAccumulator[bestFeature] += bestGain;
  }

  const leftChild = buildTree(
    X, residuals, bestLeftIndices, candidateThresholds,
    maxDepth, minSamplesLeaf, featureGainAccumulator, currentDepth + 1, hessians
  );
  const rightChild = buildTree(
    X, residuals, bestRightIndices, candidateThresholds,
    maxDepth, minSamplesLeaf, featureGainAccumulator, currentDepth + 1, hessians
  );

  return {
    feature: FEATURE_NAMES[bestFeature],
    featureIndex: bestFeature,
    threshold: Math.round(bestThreshold * 1000) / 1000,
    left: leftChild,
    right: rightChild,
  };
}

function predictTree(tree, x) {
  let curr = tree;
  while (curr.value === undefined) {
    if (x[curr.featureIndex] <= curr.threshold) {
      curr = curr.left;
    } else {
      curr = curr.right;
    }
  }
  return curr.value;
}

function trainRegressor(X_train, y_train, candidateThresholds, options = {}) {
  const {
    numTrees = 30,
    learningRate = 0.12,
    maxDepth = 5,
    minSamplesLeaf = 15,
  } = options;

  const n = X_train.length;
  let sumY = 0;
  for (let i = 0; i < n; i++) sumY += y_train[i];
  const baseline = sumY / n;

  const predictions = new Array(n).fill(baseline);
  const trees = [];
  const featureGains = new Array(FEATURE_NAMES.length).fill(0);
  const allIndices = Array.from({ length: n }, (_, i) => i);

  console.log(`Training GBDT Regressor (${numTrees} trees, maxDepth=${maxDepth}, lr=${learningRate})...`);

  for (let t = 0; t < numTrees; t++) {
    const residuals = new Array(n);
    for (let i = 0; i < n; i++) {
      residuals[i] = y_train[i] - predictions[i];
    }

    const tree = buildTree(
      X_train,
      residuals,
      allIndices,
      candidateThresholds,
      maxDepth,
      minSamplesLeaf,
      featureGains
    );

    for (let i = 0; i < n; i++) {
      predictions[i] += learningRate * predictTree(tree, X_train[i]);
    }

    trees.push(tree);
  }

  const totalGain = featureGains.reduce((a, b) => a + b, 0) || 1;
  const featureImportances = {};
  FEATURE_NAMES.forEach((name, idx) => {
    featureImportances[name] = Math.round((featureGains[idx] / totalGain) * 1000) / 10;
  });

  return {
    baseline: Math.round(baseline * 100) / 100,
    learningRate,
    trees,
    featureImportances,
  };
}

function trainClassifier(X_train, y_train, candidateThresholds, options = {}) {
  const {
    numTrees = 25,
    learningRate = 0.12,
    maxDepth = 4,
    minSamplesLeaf = 20,
  } = options;

  const n = X_train.length;
  let sumY = 0;
  for (let i = 0; i < n; i++) sumY += y_train[i];
  const p0 = Math.max(0.01, Math.min(0.99, sumY / n));
  const initialLogOdds = Math.log(p0 / (1.0 - p0));

  const fValues = new Array(n).fill(initialLogOdds);
  const trees = [];
  const allIndices = Array.from({ length: n }, (_, i) => i);

  console.log(`Training GBDT Classifier (${numTrees} trees, maxDepth=${maxDepth}, lr=${learningRate})...`);

  for (let t = 0; t < numTrees; t++) {
    const residuals = new Array(n);
    const hessians = new Array(n);

    for (let i = 0; i < n; i++) {
      const p = sigmoid(fValues[i]);
      residuals[i] = y_train[i] - p;
      hessians[i] = p * (1.0 - p);
    }

    const tree = buildTree(
      X_train,
      residuals,
      allIndices,
      candidateThresholds,
      maxDepth,
      minSamplesLeaf,
      null,
      0,
      hessians
    );

    for (let i = 0; i < n; i++) {
      fValues[i] += learningRate * predictTree(tree, X_train[i]);
    }

    trees.push(tree);
  }

  return {
    initialLogOdds: Math.round(initialLogOdds * 10000) / 10000,
    learningRate,
    trees,
  };
}

function run() {
  const dataPath = path.join(__dirname, 'training_data.json');
  if (!fs.existsSync(dataPath)) {
    console.error(`training_data.json not found at ${dataPath}. Run generateTrainingData.js first.`);
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  console.log(`Loaded ${rawData.length} records for training.`);

  const X = rawData.map(d => [
    d.road_distance_km,
    d.osrm_duration_mins,
    d.total_weight_kg,
    d.box_size,
    d.is_split_shipment,
    d.day_of_week,
    d.hour_of_day,
  ]);

  const y_reg = rawData.map(d => d.actual_transit_hours);
  const y_clf = rawData.map(d => d.is_delayed);

  const splitIdx = Math.floor(X.length * 0.80);
  const X_train = X.slice(0, splitIdx);
  const y_reg_train = y_reg.slice(0, splitIdx);
  const y_clf_train = y_clf.slice(0, splitIdx);

  const X_val = X.slice(splitIdx);
  const y_reg_val = y_reg.slice(splitIdx);
  const y_clf_val = y_clf.slice(splitIdx);

  console.log(`Train set: ${X_train.length} samples | Validation set: ${X_val.length} samples`);
  console.log('Precomputing feature candidate thresholds...');
  const candidateThresholds = computeFeatureThresholds(X_train, 25);

  const tStart = Date.now();

  const regressor = trainRegressor(X_train, y_reg_train, candidateThresholds, {
    numTrees: 30,
    learningRate: 0.12,
    maxDepth: 5,
    minSamplesLeaf: 15,
  });

  const classifier = trainClassifier(X_train, y_clf_train, candidateThresholds, {
    numTrees: 25,
    learningRate: 0.12,
    maxDepth: 4,
    minSamplesLeaf: 20,
  });

  const trainDurationMs = Date.now() - tStart;
  console.log(`Training complete in ${trainDurationMs}ms!`);

  // Evaluate Regressor MAE & RMSE on Validation
  let totalAbsError = 0;
  let totalSqError = 0;
  for (let i = 0; i < X_val.length; i++) {
    let pred = regressor.baseline;
    for (const tree of regressor.trees) {
      pred += regressor.learningRate * predictTree(tree, X_val[i]);
    }
    const err = Math.abs(pred - y_reg_val[i]);
    totalAbsError += err;
    totalSqError += err * err;
  }
  const valMAE = Math.round((totalAbsError / X_val.length) * 100) / 100;
  const valRMSE = Math.round(Math.sqrt(totalSqError / X_val.length) * 100) / 100;

  // Evaluate Classifier Accuracy, Precision, Recall on Validation
  let correctClf = 0;
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  for (let i = 0; i < X_val.length; i++) {
    let logOdds = classifier.initialLogOdds;
    for (const tree of classifier.trees) {
      logOdds += classifier.learningRate * predictTree(tree, X_val[i]);
    }
    const prob = sigmoid(logOdds);
    const predClass = prob >= 0.45 ? 1 : 0;
    const actual = y_clf_val[i];

    if (predClass === actual) correctClf++;
    if (predClass === 1 && actual === 1) truePositives++;
    if (predClass === 1 && actual === 0) falsePositives++;
    if (predClass === 0 && actual === 1) falseNegatives++;
  }
  const valAccuracy = Math.round((correctClf / X_val.length) * 1000) / 10;
  const valPrecision = truePositives + falsePositives > 0
    ? Math.round((truePositives / (truePositives + falsePositives)) * 1000) / 10
    : 0;
  const valRecall = truePositives + falseNegatives > 0
    ? Math.round((truePositives / (truePositives + falseNegatives)) * 1000) / 10
    : 0;

  console.log('\n── Validation Results ──────────────────────────────────');
  console.log(`Regressor Validation MAE:  ${valMAE} hours (Goal: < 8.0 hours) ${valMAE < 8.0 ? '✅' : '⚠️'}`);
  console.log(`Regressor Validation RMSE: ${valRMSE} hours`);
  console.log(`Classifier Accuracy:       ${valAccuracy}% (Goal: > 80.0%) ${valAccuracy >= 80.0 ? '✅' : '⚠️'}`);
  console.log(`Classifier Precision:      ${valPrecision}%`);
  console.log(`Classifier Recall:         ${valRecall}%`);
  console.log('\nFeature Importance:');
  Object.entries(regressor.featureImportances)
    .sort(([, a], [, b]) => b - a)
    .forEach(([f, imp]) => {
      console.log(`  - ${f.padEnd(20)}: ${imp.toFixed(1)}% (${FEATURE_LABELS[f]})`);
    });

  const exportedModel = {
    metadata: {
      modelType: 'GBDT_DUAL_ENSEMBLE',
      version: '1.0.0',
      trainedAt: new Date().toISOString(),
      trainingSamples: X_train.length,
      validationSamples: X_val.length,
      metrics: {
        valMAE,
        valRMSE,
        valAccuracy,
        valPrecision,
        valRecall,
      },
      featureNames: FEATURE_NAMES,
      featureLabels: FEATURE_LABELS,
    },
    featureImportance: regressor.featureImportances,
    regressor: {
      baseline: regressor.baseline,
      learningRate: regressor.learningRate,
      trees: regressor.trees,
    },
    classifier: {
      initialLogOdds: classifier.initialLogOdds,
      learningRate: classifier.learningRate,
      trees: classifier.trees,
    },
  };

  const modelPath = path.join(__dirname, 'eta_model.json');
  fs.writeFileSync(modelPath, JSON.stringify(exportedModel), 'utf-8');
  const modelSizeBytes = fs.statSync(modelPath).size;

  console.log(`\nModel successfully saved to: ${modelPath}`);
  console.log(`Model file size: ${(modelSizeBytes / 1024).toFixed(1)} KB`);
}

run();
