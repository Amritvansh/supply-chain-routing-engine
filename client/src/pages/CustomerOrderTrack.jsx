/**
 * CustomerOrderTrack — Order tracking with visual timeline,
 * Tax Invoice generation, Cancel Order, and Return / Refund features.
 *
 * NEVER displays warehouse scores, AI explainability, or routing internals.
 */
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as api from '../lib/apiClient';
import OSM_STYLE from '../lib/mapStyles';

function formatINR(n) { return '₹' + Number(n).toLocaleString('en-IN'); }

const CANCEL_REASONS = [
  'Ordered by mistake',
  'Found lower price elsewhere',
  'Delivery time is too long',
  'Need to change shipping address',
  'Changed mind / no longer needed',
  'Other reason',
];

const RETURN_REASONS = [
  'Item defective or not working properly',
  'Received wrong item or size',
  'Quality not as expected',
  'Missing parts or accessories',
  'Package arrived damaged',
  'Other reason',
];

export default function CustomerOrderTrack() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState(null);

  // Cancel & Return states
  const [actionModal, setActionModal] = useState(null); // { type: 'cancel' | 'return' }
  const [actionReason, setActionReason] = useState(CANCEL_REASONS[0]);
  const [actionRefundMethod, setActionRefundMethod] = useState('Original Payment Method');
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionToast, setActionToast] = useState(null);
  
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  const showToast = (message, type = 'success') => {
    setActionToast({ message, type });
    setTimeout(() => setActionToast(null), 4000);
  };

  useEffect(() => {
    api.trackOrder(id)
      .then(d => setData(d))
      .catch(e => setError(e.message || 'Failed to load order'))
      .finally(() => setLoading(false));

    try {
      const stored = localStorage.getItem(`order_payment_${id}`);
      if (stored) {
        setPaymentInfo(JSON.parse(stored));
      } else {
        setPaymentInfo({
          method: 'COD',
          label: 'Cash on Delivery (COD)',
          status: 'Pending on Delivery',
          txRef: `TXN-${id.slice(0, 8).toUpperCase()}`,
        });
      }
    } catch {
      setPaymentInfo({
        method: 'COD',
        label: 'Cash on Delivery (COD)',
        status: 'Pending on Delivery',
        txRef: `TXN-${id.slice(0, 8).toUpperCase()}`,
      });
    }
  }, [id]);

  const handleConfirmCancel = async () => {
    setActionSubmitting(true);
    try {
      await api.cancelOrder(id, actionReason);
      setData(prev => prev ? { ...prev, order: { ...prev.order, status: 'CANCELLED' } } : prev);
      showToast('Order cancelled successfully. Refund initiated.');
      setActionModal(null);
    } catch (err) {
      showToast(err.message || 'Failed to cancel order', 'error');
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleConfirmReturn = async () => {
    setActionSubmitting(true);
    try {
      await api.returnOrder(id, actionReason, actionRefundMethod);
      setData(prev => prev ? { ...prev, order: { ...prev.order, status: 'RETURN_REQUESTED' } } : prev);
      showToast('Return request submitted. Pickup scheduled within 2 business days.');
      setActionModal(null);
    } catch (err) {
      showToast(err.message || 'Failed to submit return request', 'error');
    } finally {
      setActionSubmitting(false);
    }
  };

  useEffect(() => {
    if (!data || !data.shipments || !data.order || !mapContainerRef.current) return;
    
    const { order, shipments } = data;
    if (!order.customerLat || !order.customerLng) return;

    if (!mapRef.current) {
      mapRef.current = new maplibregl.Map({
        container: mapContainerRef.current,
        style: OSM_STYLE,
        center: [order.customerLng, order.customerLat],
        zoom: 4,
        interactive: true,
      });
      mapRef.current.addControl(new maplibregl.NavigationControl(), 'top-right');
    }
    
    const map = mapRef.current;
    
    map.on('load', () => {
      // Customer Marker
      new maplibregl.Marker({ color: '#10b981' })
        .setLngLat([order.customerLng, order.customerLat])
        .setPopup(new maplibregl.Popup({ offset: 25 }).setText('Delivery Location'))
        .addTo(map);

      const bounds = new maplibregl.LngLatBounds();
      bounds.extend([order.customerLng, order.customerLat]);

      // Distinct route colors for split shipments
      const ROUTE_COLORS = ['#10b981', '#60a5fa', '#f59e0b', '#a78bfa', '#fb923c'];
      const MARKER_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6'];

      // Warehouse markers & lines
      shipments.forEach((sh, i) => {
        if (!sh.warehouseLat || !sh.warehouseLng) return;
        
        const markerColor = MARKER_COLORS[i % MARKER_COLORS.length];
        const routeColor = ROUTE_COLORS[i % ROUTE_COLORS.length];
        const itemList = sh.items?.map(it => `${it.name} ×${it.qty}`).join(', ') || '';
        const popupText = `${sh.warehouseName || 'Warehouse'}${itemList ? `\n${itemList}` : ''}`;

        new maplibregl.Marker({ color: markerColor })
          .setLngLat([sh.warehouseLng, sh.warehouseLat])
          .setPopup(new maplibregl.Popup({ offset: 25 }).setText(popupText))
          .addTo(map);
          
        bounds.extend([sh.warehouseLng, sh.warehouseLat]);
        
        const routeId = `route-${i}`;
        const initialCoords = (sh.coordinates && sh.coordinates.length > 1)
          ? sh.coordinates
          : [
              [sh.warehouseLng, sh.warehouseLat],
              [order.customerLng, order.customerLat]
            ];
        const isRoadRoute = initialCoords.length > 2;

        const makeGeojson = (coords) => ({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coords,
          },
        });

        if (!map.getSource(routeId)) {
          map.addSource(routeId, {
            type: 'geojson',
            data: makeGeojson(initialCoords),
          });

          // Glow layer underneath
          map.addLayer({
            id: `${routeId}-glow`,
            type: 'line',
            source: routeId,
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': routeColor,
              'line-width': isRoadRoute ? 7 : 4,
              'line-opacity': 0.25,
            },
          });

          // Main road route line
          map.addLayer({
            id: routeId,
            type: 'line',
            source: routeId,
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': routeColor,
              'line-width': isRoadRoute ? 3.5 : 2,
              'line-opacity': 0.9,
              'line-dasharray': isRoadRoute ? [1] : [2, 2],
            },
          });
        }

        // If coordinates weren't already provided as full OSRM road geometry, fetch dynamically
        if (!sh.coordinates || sh.coordinates.length <= 2) {
          api.getRoadGeometry(sh.warehouseLat, sh.warehouseLng, order.customerLat, order.customerLng)
            .then(res => {
              if (res && res.coordinates && res.coordinates.length > 2) {
                const src = map.getSource(routeId);
                if (src) {
                  src.setData(makeGeojson(res.coordinates));
                  if (map.getLayer(routeId)) {
                    map.setPaintProperty(routeId, 'line-width', 3.5);
                    map.setPaintProperty(routeId, 'line-dasharray', [1]);
                  }
                  if (map.getLayer(`${routeId}-glow`)) {
                    map.setPaintProperty(`${routeId}-glow`, 'line-width', 7);
                  }
                }
              }
            })
            .catch(() => {});
        }
      });

      map.fitBounds(bounds, { padding: 80, maxZoom: 12 });
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [data]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-primary)', fontFamily: 'var(--font-sans)' }}>
        <div className="auth-spinner" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-primary)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)', gap: 16 }}>
        <span style={{ fontSize: 48 }}>⚠️</span>
        <p style={{ color: 'var(--color-danger)' }}>{error || 'Order not found'}</p>
        <button onClick={() => navigate('/customer/orders')} style={{
          padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', fontSize: 13, fontWeight: 700,
        }}>Back to Orders</button>
      </div>
    );
  }

  const { order, items, shipments, timeline, estimatedDays, deliveryFee } = data;
  const lastCompleted = timeline ? timeline.reduce((acc, step, i) => step.completed ? i : acc, -1) : -1;

  const itemsSubtotal = items?.reduce((sum, it) => sum + (Number(it.lineTotal) || (it.price * it.qty)), 0) || 0;
  const deliveryCost = deliveryFee != null ? deliveryFee : (order?.totalAmount ? (order.totalAmount - itemsSubtotal) : 0);
  const totalAmount = order?.totalAmount || itemsSubtotal + deliveryCost;
  const invoiceNumber = `INV-${id.slice(0, 10).toUpperCase()}`;
  const orderDate = order?.createdAt ? new Date(order.createdAt) : new Date();

  const isCancelled = order?.status === 'CANCELLED';
  const isReturnRequested = order?.status === 'RETURN_REQUESTED';
  const canCancel = !['DELIVERED', 'FULFILLED', 'CANCELLED', 'RETURN_REQUESTED'].includes(order?.status);
  const canReturn = ['DELIVERED', 'FULFILLED'].includes(order?.status);

  return (
    <div style={{ fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)', minHeight: '100vh', background: 'var(--color-bg-primary)', padding: '32px 24px' }}>
      <div style={{ maxWidth: 840, margin: '0 auto' }}>
        {/* Toast Alert */}
        {actionToast && (
          <div style={{
            position: 'fixed', top: 24, right: 24, zIndex: 9999,
            padding: '12px 20px', borderRadius: 10,
            background: actionToast.type === 'error' ? '#ef4444' : '#10b981',
            color: '#ffffff', fontSize: 13, fontWeight: 700,
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span>{actionToast.type === 'error' ? '⚠️' : '✓'}</span>
            <span>{actionToast.message}</span>
          </div>
        )}

        {/* Top Header Navigation & Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <button onClick={() => navigate('/customer/orders')} style={{
            background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer',
            fontSize: 13, fontWeight: 500, padding: 0, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            Back to Orders
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {canCancel && (
              <button
                onClick={() => {
                  setActionReason(CANCEL_REASONS[0]);
                  setActionModal({ type: 'cancel' });
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 8,
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)',
                  color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.18)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
              >
                <span>✕</span>
                <span>Cancel Order</span>
              </button>
            )}

            {canReturn && (
              <button
                onClick={() => {
                  setActionReason(RETURN_REASONS[0]);
                  setActionRefundMethod('Original Payment Method');
                  setActionModal({ type: 'return' });
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 8,
                  background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)',
                  color: '#f59e0b', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.18)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,158,11,0.1)'}
              >
                <span>🔄</span>
                <span>Request Return / Refund</span>
              </button>
            )}

            <button
              onClick={() => setShowInvoiceModal(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8,
                background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)',
                color: '#60a5fa', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span>📄</span>
              <span>View Tax Invoice</span>
            </button>
          </div>
        </div>

        {/* Cancellation Notice Banner */}
        {isCancelled && (
          <div style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 12, padding: '14px 18px', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 24 }}>🛑</span>
            <div>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#f87171' }}>Order Cancelled</h4>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                This order was cancelled and inventory released back to warehouse stock. Any payment has been refunded to your original payment mode.
              </p>
            </div>
          </div>
        )}

        {/* Return Notice Banner */}
        {isReturnRequested && (
          <div style={{
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: 12, padding: '14px 18px', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 24 }}>📦</span>
            <div>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#fbbf24' }}>Return Requested</h4>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                Reverse logistics pickup is scheduled within 2 business days. Please keep the item packed in original packaging.
              </p>
            </div>
          </div>
        )}

        {/* Order Title & ETA Card */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>Order Tracking</h1>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 0', fontFamily: 'monospace' }}>#{id.slice(0, 8)}...{id.slice(-4)}</p>
          </div>
          {(data?.mlPrediction || estimatedDays) && !isCancelled && (
            <div style={{
              background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: 10, padding: '8px 16px', textAlign: 'right', minWidth: 160,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <p style={{ fontSize: 10, color: 'var(--color-text-muted)', margin: 0, fontWeight: 600, textTransform: 'uppercase' }}>Est. Delivery</p>
                {data?.mlPrediction && (
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: (data.mlPrediction.onTimeConfidence ?? 90) >= 80 ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
                    color: (data.mlPrediction.onTimeConfidence ?? 90) >= 80 ? '#10b981' : '#f59e0b',
                  }}>
                    {data.mlPrediction.onTimeConfidence ?? 90}% confidence
                  </span>
                )}
                {data?.mlPrediction?.delayRisk && data.mlPrediction.delayRisk !== 'LOW' && (
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '2px 5px',
                    borderRadius: 4,
                    background: data.mlPrediction.delayRisk === 'HIGH' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                    color: data.mlPrediction.delayRisk === 'HIGH' ? '#ef4444' : '#f59e0b',
                  }}>
                    {data.mlPrediction.delayRisk} RISK
                  </span>
                )}
              </div>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#10b981', margin: '2px 0 0' }}>
                {data?.mlPrediction?.predictedDeliveryFormatted || `${estimatedDays} day${estimatedDays > 1 ? 's' : ''}`}
              </p>
            </div>
          )}
        </div>

        {/* Timeline */}
        {timeline && !isCancelled && (
          <div style={{
            background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)',
            borderRadius: 14, padding: '28px 24px', marginBottom: 20,
            boxShadow: 'var(--shadow-card)',
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 24, color: 'var(--color-text-primary)' }}>Delivery Progress</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {timeline.map((step, i) => (
                <div key={step.step} style={{ display: 'flex', gap: 16 }}>
                  {/* Vertical line + dot */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      background: step.completed ? '#10b981' : 'rgba(51,65,85,0.5)',
                      border: step.completed ? '3px solid rgba(16,185,129,0.3)' : '3px solid rgba(51,65,85,0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.3s',
                    }}>
                      {step.completed && (
                        <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      )}
                    </div>
                    {i < timeline.length - 1 && (
                      <div style={{
                        width: 2, flex: 1, minHeight: 28,
                        background: i <= lastCompleted - 1 ? '#10b981' : 'var(--color-border-subtle)',
                        transition: 'background 0.3s',
                      }} />
                    )}
                  </div>
                  <div style={{ paddingBottom: i < timeline.length - 1 ? 16 : 0 }}>
                    <p style={{
                      fontSize: 13, fontWeight: step.completed ? 700 : 500, margin: 0,
                      color: step.completed ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                    }}>{step.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Map Container */}
        {data.order?.customerLat && data.shipments?.length > 0 && !isCancelled && (
          <div style={{
            background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)',
            borderRadius: 14, overflow: 'hidden', marginBottom: 20,
            boxShadow: 'var(--shadow-card)',
          }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>Live Transit Route</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Real Highway Trajectory</span>
            </div>
            <div ref={mapContainerRef} style={{ width: '100%', height: 320 }} />
          </div>
        )}

        {/* Split shipment indicator */}
        {shipments?.length > 1 && !isCancelled && (
          <div style={{
            background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)',
            borderRadius: 14, padding: '16px 22px', marginBottom: 20,
          }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa', margin: '0 0 10px' }}>
              📦 Order arriving in {shipments.length} separate packages
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {shipments.map((sh, i) => (
                <div key={sh.shipmentId || i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  <span>Package {i + 1}: {sh.items?.map(it => `${it.name} (${it.qty})`).join(', ') || 'Items'}</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>via {sh.warehouseName}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Single shipment message */}
        {shipments?.length === 1 && !isCancelled && (
          <div style={{
            background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)',
            borderRadius: 14, padding: '14px 22px', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>🏭</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#34d399', margin: 0 }}>
                Fulfilled from {shipments[0].warehouseName}
              </p>
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
                {shipments[0].distanceKm?.toFixed(1)}km from your location
              </p>
            </div>
          </div>
        )}

        {/* Order details */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Items */}
          <div style={{
            background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)',
            borderRadius: 14, padding: 22,
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--color-text-primary)' }}>Items</h3>
            {items?.map(item => (
              <div key={item.sku} style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 8, overflow: 'hidden', background: 'var(--color-bg-primary)', flexShrink: 0, border: '1px solid var(--color-glass-border)' }}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📦</div>}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>{item.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>Qty: {item.qty} · {formatINR(item.price)} each</p>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>{formatINR(item.lineTotal)}</span>
              </div>
            ))}
          </div>

          {/* Delivery Details */}
          <div style={{
            background: 'var(--color-glass)', border: '1px solid var(--color-glass-border)',
            borderRadius: 14, padding: 22,
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--color-text-primary)' }}>Delivery Details</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
              {order?.customerName && (
                <div>
                  <p style={{ fontSize: 10, color: 'var(--color-text-muted)', margin: 0, fontWeight: 600, textTransform: 'uppercase' }}>Name</p>
                  <p style={{ margin: '2px 0 0', color: 'var(--color-text-primary)' }}>{order.customerName}</p>
                </div>
              )}
              {order?.shippingAddress && (
                <div>
                  <p style={{ fontSize: 10, color: 'var(--color-text-muted)', margin: 0, fontWeight: 600, textTransform: 'uppercase' }}>Address</p>
                  <p style={{ margin: '2px 0 0', color: 'var(--color-text-primary)' }}>{order.shippingAddress}</p>
                </div>
              )}
              {order?.customerPhone && (
                <div>
                  <p style={{ fontSize: 10, color: 'var(--color-text-muted)', margin: 0, fontWeight: 600, textTransform: 'uppercase' }}>Phone</p>
                  <p style={{ margin: '2px 0 0', color: 'var(--color-text-primary)' }}>{order.customerPhone}</p>
                </div>
              )}
              <div style={{ height: 1, background: 'var(--color-glass-border)' }} />
              {deliveryFee != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Delivery Fee</span>
                  <span style={{ fontWeight: 600 }}>{formatINR(deliveryCost)}</span>
                </div>
              )}
              {order?.totalAmount && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700 }}>Total</span>
                  <span style={{ fontWeight: 800, color: 'var(--color-success)', fontSize: 16 }}>{formatINR(totalAmount)}</span>
                </div>
              )}
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '8px 0 0' }}>
                Placed on {orderDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
       *  CUSTOMER TAX INVOICE MODAL
       * ═══════════════════════════════════════════════════════ */}
      {showInvoiceModal && (
        <div
          id="printable-customer-invoice-modal"
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16, overflowY: 'auto',
          }}
          onClick={(e) => { if (e.target.id === 'printable-customer-invoice-modal') setShowInvoiceModal(false); }}
        >
          <div
            className="invoice-paper"
            style={{
              width: '100%', maxWidth: 780, maxHeight: '92vh', overflowY: 'auto',
              background: '#ffffff', color: '#0f172a',
              borderRadius: 14, padding: '36px 40px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
              position: 'relative', fontFamily: 'var(--font-sans, system-ui, sans-serif)',
            }}
          >
            {/* Modal Screen Action Bar */}
            <div className="no-print" style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #e2e8f0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  padding: '4px 10px', borderRadius: 6,
                  background: '#dcfce7', color: '#15803d',
                  fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                }}>Customer Copy</span>
                <span style={{ fontSize: 12, color: '#64748b' }}>Original Tax Invoice & Payment Receipt</span>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 18px', borderRadius: 6,
                    background: '#10b981', color: '#ffffff',
                    border: 'none', fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', boxShadow: '0 2px 4px rgba(16,185,129,0.2)',
                  }}
                >
                  🖨️ Print / Save as PDF
                </button>
                <button
                  type="button"
                  onClick={() => setShowInvoiceModal(false)}
                  style={{
                    padding: '8px 14px', borderRadius: 6,
                    background: '#f1f5f9', color: '#475569',
                    border: '1px solid #cbd5e1', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ✕ Close
                </button>
              </div>
            </div>

            {/* Invoice Top Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 24 }}>🚚</span>
                  <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em', color: '#0f172a' }}>Supply Chain Store</span>
                </div>
                <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>Hybrid Deterministic Logistics & Routing Engine</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>GSTIN: 07AAACH7409R1ZZ · FSSAI / E-Comm Lic: DL-2026-99201</p>
              </div>

              <div style={{ textAlign: 'right' }}>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#1e293b', letterSpacing: '-0.01em' }}>TAX INVOICE</h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 700, color: '#2563eb', fontFamily: 'monospace' }}>{invoiceNumber}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>
                  Date: {orderDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>

            {/* Billing & Payment Metadata Grid */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20,
              padding: '16px 20px', borderRadius: 10,
              background: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: 24,
            }}>
              <div>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em' }}>Billed & Shipped To</p>
                <p style={{ margin: '6px 0 2px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{order?.customerName || 'Customer'}</p>
                <p style={{ margin: 0, fontSize: 12, color: '#475569', lineHeight: 1.4 }}>{order?.shippingAddress || 'Standard Delivery Address'}</p>
                {order?.customerPhone && (
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: '#64748b' }}>Phone: {order.customerPhone}</p>
                )}
                {order?.pincode && (
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>PIN Code: {order.pincode}</p>
                )}
              </div>

              <div>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em' }}>Payment & Routing Details</p>
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Method:</span>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{paymentInfo?.label || 'Prepaid / Verified'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Transaction Ref:</span>
                    <span style={{ fontWeight: 600, color: '#2563eb', fontFamily: 'monospace' }}>{paymentInfo?.txRef || `TXN-${id.slice(0, 8).toUpperCase()}`}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Payment Status:</span>
                    <span style={{
                      fontWeight: 700,
                      color: paymentInfo?.method === 'COD' ? '#d97706' : '#15803d',
                    }}>
                      {paymentInfo?.method === 'COD' ? 'Pending on Delivery' : 'Paid & Settled'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Fulfillment Hubs:</span>
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>
                      {shipments?.map(s => s.warehouseName).filter(Boolean).join(', ') || 'Central Hub'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Itemized Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', color: '#475569' }}>
                  <th style={{ padding: '10px 12px' }}>#</th>
                  <th style={{ padding: '10px 12px' }}>Description</th>
                  <th style={{ padding: '10px 12px' }}>SKU</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Qty</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Unit Price</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {items?.map((it, idx) => (
                  <tr key={it.sku || idx} style={{ borderBottom: '1px solid #e2e8f0', fontSize: 12 }}>
                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{idx + 1}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0f172a' }}>{it.name}</td>
                    <td style={{ padding: '10px 12px', color: '#64748b', fontFamily: 'monospace', fontSize: 11 }}>{it.sku}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{it.qty}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#475569' }}>{formatINR(it.price)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                      {formatINR(Number(it.lineTotal) || (it.price * it.qty))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Summary & Tax Breakdown */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 28 }}>
              <div style={{ width: 280 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#475569', marginBottom: 6 }}>
                  <span>Subtotal:</span>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>{formatINR(itemsSubtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#475569', marginBottom: 6 }}>
                  <span>Delivery & Handling:</span>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>{formatINR(deliveryCost)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#475569', marginBottom: 8, paddingBottom: 8, borderBottom: '1px dashed #cbd5e1' }}>
                  <span>GST (18% Incl.):</span>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>{formatINR(totalAmount * 0.18 / 1.18)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                  <span>Grand Total:</span>
                  <span style={{ color: '#16a34a' }}>{formatINR(totalAmount)}</span>
                </div>
              </div>
            </div>

            {/* Footer Notice */}
            <div style={{
              borderTop: '1px solid #e2e8f0', paddingTop: 16, textAlign: 'center', fontSize: 11, color: '#64748b',
            }}>
              <p style={{ margin: 0 }}>This is a computer-generated tax invoice and requires no physical signature.</p>
              <p style={{ margin: '4px 0 0' }}>Thank you for shopping with Supply Chain Store! For support, email help@supplychainstore.com</p>
            </div>

            {/* Print CSS */}
            <style>{`
              @media print {
                body * {
                  visibility: hidden !important;
                }
                #printable-customer-invoice-modal, #printable-customer-invoice-modal * {
                  visibility: visible !important;
                }
                #printable-customer-invoice-modal {
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 100% !important;
                  height: auto !important;
                  background: #ffffff !important;
                  color: #0f172a !important;
                  padding: 0 !important;
                  margin: 0 !important;
                  z-index: 999999 !important;
                }
                .invoice-paper {
                  max-height: none !important;
                  box-shadow: none !important;
                  border: none !important;
                  padding: 20px 24px !important;
                  width: 100% !important;
                  max-width: 100% !important;
                }
                .no-print {
                  display: none !important;
                }
              }
            `}</style>
          </div>
        </div>
      )}

      {/* ─── Cancel Order Modal ───────────────────────────────── */}
      {actionModal?.type === 'cancel' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{
            background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)',
            borderRadius: 16, maxWidth: 480, width: '100%', padding: '24px 28px',
            boxShadow: '0 20px 40px -10px rgba(0,0,0,0.4)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 22, background: 'rgba(239,68,68,0.12)', padding: '8px 10px', borderRadius: 10 }}>🛑</span>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--color-text-primary)' }}>Cancel Order</h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>#{id.slice(0, 12)}</p>
              </div>
            </div>

            <div style={{
              background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 10, padding: '12px 14px', marginBottom: 18, fontSize: 12, color: '#f87171',
              lineHeight: 1.5,
            }}>
              <strong>Warning:</strong> Cancelling will instantly halt fulfillment and restore warehouse inventory. Any prepaid amount will be refunded to your original payment method.
            </div>

            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
              Reason for cancellation:
            </label>
            <select
              value={actionReason}
              onChange={e => setActionReason(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                background: 'var(--color-bg-primary)', border: '1px solid var(--color-glass-border)',
                color: 'var(--color-text-primary)', fontSize: 13, marginBottom: 20,
                outline: 'none', cursor: 'pointer',
              }}
            >
              {CANCEL_REASONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setActionModal(null)}
                disabled={actionSubmitting}
                style={{
                  padding: '9px 16px', borderRadius: 8, border: '1px solid var(--color-glass-border)',
                  background: 'transparent', color: 'var(--color-text-secondary)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={actionSubmitting}
                style={{
                  padding: '9px 20px', borderRadius: 8, border: 'none',
                  background: '#ef4444', color: '#ffffff',
                  fontSize: 13, fontWeight: 700, cursor: actionSubmitting ? 'not-allowed' : 'pointer',
                  opacity: actionSubmitting ? 0.7 : 1,
                }}
              >
                {actionSubmitting ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Return / Refund Modal ────────────────────────────── */}
      {actionModal?.type === 'return' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{
            background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)',
            borderRadius: 16, maxWidth: 500, width: '100%', padding: '24px 28px',
            boxShadow: '0 20px 40px -10px rgba(0,0,0,0.4)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 22, background: 'rgba(245,158,11,0.12)', padding: '8px 10px', borderRadius: 10 }}>🔄</span>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--color-text-primary)' }}>Request Return & Refund</h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>#{id.slice(0, 12)}</p>
              </div>
            </div>

            <div style={{
              background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: 10, padding: '12px 14px', marginBottom: 18, fontSize: 12, color: '#fbbf24',
              lineHeight: 1.5,
            }}>
              Doorstep reverse pickup will be scheduled within 2 business days. Please keep the item packed with all original tags and accessories.
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                Reason for return:
              </label>
              <select
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  background: 'var(--color-bg-primary)', border: '1px solid var(--color-glass-border)',
                  color: 'var(--color-text-primary)', fontSize: 13,
                  outline: 'none', cursor: 'pointer',
                }}
              >
                {RETURN_REASONS.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                Refund mode:
              </label>
              <select
                value={actionRefundMethod}
                onChange={e => setActionRefundMethod(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  background: 'var(--color-bg-primary)', border: '1px solid var(--color-glass-border)',
                  color: 'var(--color-text-primary)', fontSize: 13,
                  outline: 'none', cursor: 'pointer',
                }}
              >
                <option value="Original Payment Method">Original Payment Source (Bank / Card / UPI)</option>
                <option value="Store Credit">Store Credit / Wallet (Instant credit)</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setActionModal(null)}
                disabled={actionSubmitting}
                style={{
                  padding: '9px 16px', borderRadius: 8, border: '1px solid var(--color-glass-border)',
                  background: 'transparent', color: 'var(--color-text-secondary)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReturn}
                disabled={actionSubmitting}
                style={{
                  padding: '9px 20px', borderRadius: 8, border: 'none',
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#ffffff',
                  fontSize: 13, fontWeight: 700, cursor: actionSubmitting ? 'not-allowed' : 'pointer',
                  opacity: actionSubmitting ? 0.7 : 1,
                }}
              >
                {actionSubmitting ? 'Submitting...' : 'Submit Return Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
