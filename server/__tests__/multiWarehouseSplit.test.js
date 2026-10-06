/**
 * Multi-Warehouse Split Shipment Tests
 *
 * Tests the inventory-based cross-warehouse order splitting.
 */

'use strict';

const { evaluateMultiWarehouseFulfillment } = require('../algorithms/splitFulfillment');

describe('Multi-Warehouse Split Fulfillment', () => {
  const WH1 = { id: 'wh1', name: 'Delhi', distanceKm: 10, inventory: { 'SKU-A': 10, 'SKU-B': 5, 'SKU-C': 0 } };
  const WH2 = { id: 'wh2', name: 'Mumbai', distanceKm: 50, inventory: { 'SKU-A': 5, 'SKU-B': 10, 'SKU-C': 2 } };
  
  const createItem = (sku, qty) => ({
    sku,
    name: sku,
    length_cm: 10, width_cm: 10, height_cm: 10, weight_kg: 1, // small box sizes
    qty
  });

  test('TEST 1: All products available in one warehouse -> returns null (SINGLE_SHIPMENT)', () => {
    const orderItems = [createItem('SKU-A', 2), createItem('SKU-B', 2)];
    
    // WH1 has 10 of A and 5 of B, which is enough.
    const result = evaluateMultiWarehouseFulfillment({
      warehouses: [WH1, WH2],
      orderItems
    });
    
    expect(result).toBeNull();
  });

  test('TEST 2: Products available in different warehouses -> SPLIT_SHIPMENT', () => {
    // WH1 has A (10), WH2 has C (2) but only 5 A. We need 6 A and 2 C.
    // No single warehouse has both.
    const orderItems = [createItem('SKU-A', 6), createItem('SKU-C', 2)];
    
    const result = evaluateMultiWarehouseFulfillment({
      warehouses: [WH1, WH2],
      orderItems
    });
    
    expect(result).not.toBeNull();
    expect(result.status).toBe('MULTI_WAREHOUSE_SPLIT');
    expect(result.shipmentCount).toBe(2);
    
    // Check allocations
    const group1 = result.shipmentGroups.find(g => g.warehouseId === 'wh1');
    const group2 = result.shipmentGroups.find(g => g.warehouseId === 'wh2');
    
    expect(group1.items[0].sku).toBe('SKU-A');
    expect(group1.items[0].qty).toBe(6);
    
    expect(group2.items[0].sku).toBe('SKU-C');
    expect(group2.items[0].qty).toBe(2);
  });

  test('TEST 3: One warehouse partially fulfills the order and another fulfills the remainder -> SPLIT_SHIPMENT', () => {
    // WH1 has 5 B. WH2 has 10 B. We order 12 B. Neither can fulfill it alone.
    const orderItems = [createItem('SKU-B', 12)];
    
    const result = evaluateMultiWarehouseFulfillment({
      warehouses: [WH1, WH2],
      orderItems
    });
    
    expect(result).not.toBeNull();
    expect(result.status).toBe('MULTI_WAREHOUSE_SPLIT');
    expect(result.shipmentCount).toBe(2);
    
    const group1 = result.shipmentGroups.find(g => g.warehouseId === 'wh1');
    const group2 = result.shipmentGroups.find(g => g.warehouseId === 'wh2');
    
    expect(group1.items[0].sku).toBe('SKU-B');
    expect(group1.items[0].qty).toBe(5); // Takes all 5 from closer WH1
    
    expect(group2.items[0].sku).toBe('SKU-B');
    expect(group2.items[0].qty).toBe(7); // Takes remaining 7 from WH2
  });

  test('TEST 4: Same SKU quantity split across warehouses (Exact exhaustion) -> SPLIT_SHIPMENT', () => {
    // A total of 15 A across both warehouses.
    const orderItems = [createItem('SKU-A', 15)];
    
    const result = evaluateMultiWarehouseFulfillment({
      warehouses: [WH1, WH2],
      orderItems
    });
    
    expect(result).not.toBeNull();
    expect(result.status).toBe('MULTI_WAREHOUSE_SPLIT');
    
    const group1 = result.shipmentGroups.find(g => g.warehouseId === 'wh1');
    const group2 = result.shipmentGroups.find(g => g.warehouseId === 'wh2');
    
    expect(group1.items[0].qty).toBe(10);
    expect(group2.items[0].qty).toBe(5);
  });

  test('TEST 6: Insufficient total inventory across all warehouses -> safe failure', () => {
    // Ask for more A than exists (10 + 5 = 15 total)
    const orderItems = [createItem('SKU-A', 20)];
    
    const result = evaluateMultiWarehouseFulfillment({
      warehouses: [WH1, WH2],
      orderItems
    });
    
    expect(result).not.toBeNull();
    expect(result.status).toBe('INSUFFICIENT_TOTAL_INVENTORY');
  });
});
