/**
 * CustomerOrderTrack — Order tracking with visual timeline
 *
 * NEVER displays warehouse scores, AI explainability, or routing internals.
 */
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as api from '../lib/apiClient';

function formatINR(n) { return '₹' + Number(n).toLocaleString('en-IN'); }

export default function CustomerOrderTrack() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    api.trackOrder(id)
      .then(d => setData(d))
      .catch(e => setError(e.message || 'Failed to load order'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!data || !data.shipments || !data.order || !mapContainerRef.current) return;
    
    const { order, shipments } = data;
    if (!order.customerLat || !order.customerLng) return;

    if (!mapRef.current) {
      mapRef.current = new maplibregl.Map({
        container: mapContainerRef.current,
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
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
              'line-width': isRoadRoute ? 3.5 : 2.5,
              'line-opacity': 0.9,
              ...(isRoadRoute ? {} : { 'line-dasharray': [2, 4] }),
            },
          });
        }

        // If road geometry wasn't pre-populated, fetch it dynamically
        if (!isRoadRoute && sh.warehouseLat && sh.warehouseLng && order.customerLat && order.customerLng) {
          api.getRoadGeometry(sh.warehouseLat, sh.warehouseLng, order.customerLat, order.customerLng)
            .then((res) => {
              if (res?.coordinates && res.coordinates.length > 2 && map.getSource(routeId)) {
                map.getSource(routeId).setData(makeGeojson(res.coordinates));
                if (map.getLayer(routeId)) {
                  map.setPaintProperty(routeId, 'line-width', 3.5);
                  map.setPaintProperty(routeId, 'line-opacity', 0.9);
                  map.setPaintProperty(routeId, 'line-dasharray', null);
                }
                if (map.getLayer(`${routeId}-glow`)) {
                  map.setPaintProperty(`${routeId}-glow`, 'line-width', 7);
                  map.setPaintProperty(`${routeId}-glow`, 'line-opacity', 0.25);
                }
              }
            })
            .catch(() => {
              // Silently keep straight line
            });
        }
      });
      
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 50, maxZoom: 10 });
      }
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
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-primary)', fontFamily: 'var(--font-sans)', color: '#e2e8f0', gap: 16 }}>
        <span style={{ fontSize: 48 }}>⚠️</span>
        <p style={{ color: '#f87171' }}>{error || 'Order not found'}</p>
        <button onClick={() => navigate('/customer/orders')} style={{
          padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', fontSize: 13, fontWeight: 700,
        }}>Back to Orders</button>
      </div>
    );
  }

  const { order, items, timeline, estimatedDays, deliveryFee } = data;
  const lastCompleted = timeline ? timeline.reduce((acc, step, i) => step.completed ? i : acc, -1) : -1;

  return (
    <div style={{ fontFamily: 'var(--font-sans)', color: '#e2e8f0', minHeight: '100vh', background: 'var(--color-bg-primary)', padding: '32px 24px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {/* Header */}
        <button onClick={() => navigate('/customer/orders')} style={{
          background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer',
          fontSize: 13, fontWeight: 500, padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Back to Orders
        </button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Order Tracking</h1>
            <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0', fontFamily: 'monospace' }}>#{id.slice(0, 8)}...{id.slice(-4)}</p>
          </div>
          {estimatedDays && (
            <div style={{
              background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: 10, padding: '8px 16px', textAlign: 'center',
            }}>
              <p style={{ fontSize: 10, color: '#64748b', margin: 0, fontWeight: 600, textTransform: 'uppercase' }}>Est. Delivery</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: '#10b981', margin: '2px 0 0' }}>{estimatedDays} day{estimatedDays > 1 ? 's' : ''}</p>
            </div>
          )}
        </div>

        {/* Timeline */}
        {timeline && (
          <div style={{
            background: 'rgba(15,22,41,0.65)', border: '1px solid rgba(51,65,85,0.35)',
            borderRadius: 14, padding: '28px 24px', marginBottom: 20,
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Delivery Progress</h3>
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
                        background: i <= lastCompleted - 1 ? '#10b981' : 'rgba(51,65,85,0.35)',
                        transition: 'background 0.3s',
                      }} />
                    )}
                  </div>
                  <div style={{ paddingBottom: i < timeline.length - 1 ? 16 : 0 }}>
                    <p style={{
                      fontSize: 13, fontWeight: step.completed ? 700 : 500, margin: 0,
                      color: step.completed ? '#e2e8f0' : '#475569',
                    }}>{step.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Map Container */}
        {data.order?.customerLat && data.shipments?.length > 0 && (
          <div style={{
            background: 'rgba(15,22,41,0.65)', border: '1px solid rgba(51,65,85,0.35)',
            borderRadius: 14, padding: 20, marginBottom: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Shipment Tracking</h3>
              {data.shipments.length > 1 && (
                <span style={{
                  fontSize: 10, fontWeight: 600, color: '#60a5fa',
                  background: 'rgba(59,130,246,0.12)', padding: '3px 10px', borderRadius: 6,
                }}>
                  {data.shipments.length} shipments
                </span>
              )}
            </div>
            <div ref={mapContainerRef} style={{ width: '100%', height: 350, borderRadius: 10, overflow: 'hidden' }} />
            {/* Route legend for split shipments */}
            {data.shipments.length > 1 && (
              <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                {data.shipments.map((sh, i) => {
                  const colors = ['#10b981', '#60a5fa', '#f59e0b', '#a78bfa', '#fb923c'];
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 16, height: 3, background: colors[i % colors.length], borderRadius: 2 }} />
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{sh.warehouseName}</span>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>You</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Split Shipment Breakdown */}
        {data.shipments?.length > 1 && (
          <div style={{
            background: 'rgba(15,22,41,0.65)', border: '1px solid rgba(51,65,85,0.35)',
            borderRadius: 14, padding: 22, marginBottom: 20,
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: '#e2e8f0' }}>Split Shipment Details</h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>
              Your order will arrive in {data.shipments.length} shipments from different warehouses
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.shipments.map((sh, i) => {
                const colors = ['#10b981', '#60a5fa', '#f59e0b', '#a78bfa', '#fb923c'];
                return (
                  <div key={sh.id || i} style={{
                    background: 'rgba(15,22,41,0.5)', border: `1px solid ${colors[i % colors.length]}30`,
                    borderRadius: 10, padding: '14px 16px',
                    borderLeft: `3px solid ${colors[i % colors.length]}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
                        📦 Shipment {i + 1}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 600, color: colors[i % colors.length],
                        background: `${colors[i % colors.length]}18`, padding: '3px 10px', borderRadius: 6,
                      }}>
                        🏭 {sh.warehouseName}
                      </span>
                    </div>
                    {sh.items?.length > 0 ? (
                      sh.items.map((item, j) => (
                        <div key={j} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '4px 0', fontSize: 12,
                        }}>
                          <span style={{ color: '#e2e8f0' }}>{item.name} × {item.qty}</span>
                          <span style={{ color: '#64748b' }}>{sh.distanceKm?.toFixed(1)}km</span>
                        </div>
                      ))
                    ) : (
                      <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                        {sh.distanceKm?.toFixed(1)}km from your location
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Single shipment message */}
        {data.shipments?.length === 1 && (
          <div style={{
            background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)',
            borderRadius: 14, padding: '14px 22px', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>🏭</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#34d399', margin: 0 }}>
                Fulfilled from {data.shipments[0].warehouseName}
              </p>
              <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>
                {data.shipments[0].distanceKm?.toFixed(1)}km from your location
              </p>
            </div>
          </div>
        )}

        {/* Order details */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Items */}
          <div style={{
            background: 'rgba(15,22,41,0.65)', border: '1px solid rgba(51,65,85,0.35)',
            borderRadius: 14, padding: 22,
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>Items</h3>
            {items?.map(item => (
              <div key={item.sku} style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 8, overflow: 'hidden', background: '#0a0f1a', flexShrink: 0 }}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📦</div>}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', margin: 0 }}>{item.name}</p>
                  <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>Qty: {item.qty} · {formatINR(item.price)} each</p>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{formatINR(item.lineTotal)}</span>
              </div>
            ))}
          </div>

          {/* Delivery Details */}
          <div style={{
            background: 'rgba(15,22,41,0.65)', border: '1px solid rgba(51,65,85,0.35)',
            borderRadius: 14, padding: 22,
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>Delivery Details</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
              {order?.customerName && (
                <div>
                  <p style={{ fontSize: 10, color: '#64748b', margin: 0, fontWeight: 600, textTransform: 'uppercase' }}>Name</p>
                  <p style={{ margin: '2px 0 0', color: '#e2e8f0' }}>{order.customerName}</p>
                </div>
              )}
              {order?.shippingAddress && (
                <div>
                  <p style={{ fontSize: 10, color: '#64748b', margin: 0, fontWeight: 600, textTransform: 'uppercase' }}>Address</p>
                  <p style={{ margin: '2px 0 0', color: '#e2e8f0' }}>{order.shippingAddress}</p>
                </div>
              )}
              {order?.customerPhone && (
                <div>
                  <p style={{ fontSize: 10, color: '#64748b', margin: 0, fontWeight: 600, textTransform: 'uppercase' }}>Phone</p>
                  <p style={{ margin: '2px 0 0', color: '#e2e8f0' }}>{order.customerPhone}</p>
                </div>
              )}
              <div style={{ height: 1, background: 'rgba(51,65,85,0.3)' }} />
              {deliveryFee != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Delivery Fee</span>
                  <span style={{ fontWeight: 600 }}>{formatINR(deliveryFee)}</span>
                </div>
              )}
              {order?.totalAmount && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700 }}>Total</span>
                  <span style={{ fontWeight: 800, color: '#10b981', fontSize: 16 }}>{formatINR(order.totalAmount)}</span>
                </div>
              )}
              <p style={{ fontSize: 11, color: '#64748b', margin: '8px 0 0' }}>
                Placed on {new Date(order?.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
