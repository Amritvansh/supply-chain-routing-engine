/**
 * Synthetic Training Data Generator for Indian Logistics ETA & Delay Prediction
 *
 * Generates 10,000 realistic delivery records across key Indian logistics corridors.
 * Covers intra-city (same-day), regional (<500km), inter-state (<1200km),
 * and long-haul national corridors (>1200km).
 *
 * Output: server/ml/training_data.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Indian logistics corridors with typical highway distance (km)
const CORRIDORS = [
  // Intra-city / Metro Express (10 - 75 km)
  { origin: 'Delhi Hub', dest: 'Gurgaon NCR', baseDist: 35, type: 'intra_city' },
  { origin: 'Delhi Hub', dest: 'Noida NCR', baseDist: 28, type: 'intra_city' },
  { origin: 'Mumbai Hub (Bhiwandi)', dest: 'South Mumbai', baseDist: 48, type: 'intra_city' },
  { origin: 'Bangalore Hub (Nelamangala)', dest: 'Whitefield', baseDist: 42, type: 'intra_city' },
  { origin: 'Chennai Hub', dest: 'OMR Chennai', baseDist: 32, type: 'intra_city' },
  { origin: 'Kolkata Hub (Dankuni)', dest: 'Salt Lake Sector V', baseDist: 26, type: 'intra_city' },
  { origin: 'Hyderabad Hub', dest: 'Gachibowli Cyberabad', baseDist: 38, type: 'intra_city' },

  // Regional / Short-haul (80 - 350 km)
  { origin: 'Delhi', dest: 'Agra', baseDist: 230, type: 'regional' },
  { origin: 'Delhi', dest: 'Chandigarh', baseDist: 250, type: 'regional' },
  { origin: 'Mumbai', dest: 'Pune', baseDist: 155, type: 'regional' },
  { origin: 'Mumbai', dest: 'Nashik', baseDist: 170, type: 'regional' },
  { origin: 'Bangalore', dest: 'Mysore', baseDist: 145, type: 'regional' },
  { origin: 'Chennai', dest: 'Pondicherry', baseDist: 160, type: 'regional' },
  { origin: 'Kolkata', dest: 'Durgapur', baseDist: 175, type: 'regional' },
  { origin: 'Ahmedabad', dest: 'Vadodara', baseDist: 110, type: 'regional' },

  // Mid-haul Inter-state (350 - 850 km)
  { origin: 'Delhi', dest: 'Jaipur', baseDist: 280, type: 'mid_haul' },
  { origin: 'Delhi', dest: 'Lucknow', baseDist: 540, type: 'mid_haul' },
  { origin: 'Mumbai', dest: 'Ahmedabad', baseDist: 525, type: 'mid_haul' },
  { origin: 'Bangalore', dest: 'Hyderabad', baseDist: 570, type: 'mid_haul' },
  { origin: 'Bangalore', dest: 'Chennai', baseDist: 350, type: 'mid_haul' },
  { origin: 'Chennai', dest: 'Coimbatore', baseDist: 510, type: 'mid_haul' },
  { origin: 'Kolkata', dest: 'Ranchi', baseDist: 410, type: 'mid_haul' },
  { origin: 'Hyderabad', dest: 'Vijayawada', baseDist: 275, type: 'mid_haul' },

  // Long-haul National Corridors (850 - 2500 km)
  { origin: 'Delhi', dest: 'Mumbai', baseDist: 1420, type: 'long_haul' },
  { origin: 'Delhi', dest: 'Bangalore', baseDist: 2170, type: 'long_haul' },
  { origin: 'Delhi', dest: 'Kolkata', baseDist: 1530, type: 'long_haul' },
  { origin: 'Delhi', dest: 'Chennai', baseDist: 2200, type: 'long_haul' },
  { origin: 'Mumbai', dest: 'Kolkata', baseDist: 1960, type: 'long_haul' },
  { origin: 'Mumbai', dest: 'Chennai', baseDist: 1340, type: 'long_haul' },
  { origin: 'Mumbai', dest: 'Bangalore', baseDist: 985, type: 'long_haul' },
  { origin: 'Kolkata', dest: 'Chennai', baseDist: 1670, type: 'long_haul' },
  { origin: 'Kolkata', dest: 'Bangalore', baseDist: 1880, type: 'long_haul' },
  { origin: 'Ahmedabad', dest: 'Chennai', baseDist: 1720, type: 'long_haul' },
];

function randomNormal(mean = 0, std = 1) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + num * std;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
  return min + Math.random() * (max - min);
}

function generateDataset(totalRecords = 10000) {
  const records = [];

  for (let i = 0; i < totalRecords; i++) {
    // 25% intra-city, 25% regional, 25% mid-haul, 25% long-haul
    const typeRoll = Math.random();
    let targetType = 'long_haul';
    if (typeRoll < 0.25) targetType = 'intra_city';
    else if (typeRoll < 0.50) targetType = 'regional';
    else if (typeRoll < 0.75) targetType = 'mid_haul';

    const matchingCorridors = CORRIDORS.filter(c => c.type === targetType);
    const corridor = matchingCorridors[randomInt(0, matchingCorridors.length - 1)];

    // Distance variation (+/- 10%)
    const distanceJitter = randomNormal(1.0, 0.05);
    const road_distance_km = Math.max(8, Math.round(corridor.baseDist * distanceJitter * 10) / 10);

    // OSRM duration (minutes)
    let osrmSpeedKmH;
    if (road_distance_km <= 60) {
      osrmSpeedKmH = randomFloat(22, 28);
    } else if (road_distance_km <= 250) {
      osrmSpeedKmH = randomFloat(42, 50);
    } else {
      osrmSpeedKmH = randomFloat(50, 58);
    }
    const osrm_duration_mins = Math.round((road_distance_km / osrmSpeedKmH) * 60);

    // Box size: 1 = SMALL, 2 = MEDIUM, 3 = LARGE
    const boxRoll = Math.random();
    let box_size = 1;
    let total_weight_kg = 1.0;

    if (boxRoll < 0.45) {
      box_size = 1;
      total_weight_kg = Math.round(randomFloat(0.5, 2.0) * 10) / 10;
    } else if (boxRoll < 0.80) {
      box_size = 2;
      total_weight_kg = Math.round(randomFloat(2.0, 9.8) * 10) / 10;
    } else {
      box_size = 3;
      total_weight_kg = Math.round(randomFloat(9.5, 24.5) * 10) / 10;
    }

    // Split shipment
    const splitProb = box_size === 3 ? 0.35 : box_size === 2 ? 0.20 : 0.08;
    const is_split_shipment = Math.random() < splitProb ? 1 : 0;

    // Temporal features
    const day_of_week = randomInt(0, 6);
    const hour_of_day = randomInt(0, 23);

    // ── Base Transit Function ──
    // Consistent physical transit time across Indian logistics
    let baselineTransitHours = 0;
    if (road_distance_km <= 60) {
      baselineTransitHours = 5.0 + (road_distance_km / 12.0); // 5-10 hrs
    } else if (road_distance_km <= 250) {
      baselineTransitHours = 12.0 + (road_distance_km / 22.0); // 15-23 hrs
    } else if (road_distance_km <= 600) {
      baselineTransitHours = 20.0 + (road_distance_km / 25.0); // 24-44 hrs
    } else if (road_distance_km <= 1200) {
      baselineTransitHours = 34.0 + (road_distance_km / 26.0); // 45-80 hrs
    } else {
      baselineTransitHours = 50.0 + (road_distance_km / 25.0); // 80-140 hrs
    }

    // Weight and box handling overhead
    baselineTransitHours += (box_size - 1) * 2.5 + (total_weight_kg / 25.0) * 3.0;

    // Split coordination penalty
    if (is_split_shipment === 1) {
      baselineTransitHours += 6.5;
    }

    // Departure time window
    if (hour_of_day >= 8 && hour_of_day <= 13) {
      baselineTransitHours += 3.0; // Day hold before night dispatch
    } else if (hour_of_day >= 20 || hour_of_day <= 2) {
      baselineTransitHours -= 2.0; // Immediate overnight haul
    }

    // Weekend transit
    if (day_of_week === 0) {
      baselineTransitHours += 4.5;
    } else if (day_of_week === 6) {
      baselineTransitHours += 2.5;
    }

    const expected_transit_hours = Math.max(4.0, Math.round(baselineTransitHours * 10) / 10);

    // Predictable delay probability based on compounding risk factors
    let riskScore = 0;
    if (road_distance_km > 1200) riskScore += 2;
    if (is_split_shipment === 1) riskScore += 2;
    if (day_of_week === 0) riskScore += 1.5;
    if (hour_of_day >= 8 && hour_of_day <= 11) riskScore += 1;
    if (box_size === 3) riskScore += 1;

    // Convert risk score to delay probability (sigmoid shape)
    const delayProb = 1.0 / (1.0 + Math.exp(-(riskScore - 2.8)));
    const isDelayEvent = Math.random() < delayProb;

    let actual_transit_hours;
    if (isDelayEvent) {
      const delayAmount = expected_transit_hours * randomFloat(0.25, 0.45);
      actual_transit_hours = expected_transit_hours + delayAmount;
    } else {
      actual_transit_hours = expected_transit_hours + randomNormal(0, 1.2);
    }

    actual_transit_hours = Math.max(3.5, Math.round(actual_transit_hours * 10) / 10);
    const is_delayed = (actual_transit_hours >= expected_transit_hours * 1.20) ? 1 : 0;

    records.push({
      road_distance_km,
      osrm_duration_mins,
      total_weight_kg,
      box_size,
      is_split_shipment,
      day_of_week,
      hour_of_day,
      expected_transit_hours,
      actual_transit_hours,
      is_delayed,
      corridor: `${corridor.origin} → ${corridor.dest}`,
    });
  }

  return records;
}

const outDir = path.resolve(__dirname);
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const outputPath = path.join(outDir, 'training_data.json');
console.log(`Generating 10,000 synthetic Indian logistics records...`);
const data = generateDataset(10000);

fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');

const delayedCount = data.filter(d => d.is_delayed === 1).length;
const avgTransit = Math.round((data.reduce((s, d) => s + d.actual_transit_hours, 0) / data.length) * 10) / 10;
const avgDist = Math.round((data.reduce((s, d) => s + d.road_distance_km, 0) / data.length) * 10) / 10;

console.log(`Dataset generated successfully at: ${outputPath}`);
console.log(`Total samples: ${data.length}`);
console.log(`Delayed samples: ${delayedCount} (${((delayedCount / data.length) * 100).toFixed(1)}%)`);
console.log(`Average distance: ${avgDist} km`);
console.log(`Average transit: ${avgTransit} hours`);
