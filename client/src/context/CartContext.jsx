/**
 * CartContext — Persistent client-side shopping cart
 *
 * Backed by localStorage so the cart survives page refreshes.
 * Exposes: cartItems, addToCart, updateQty, removeFromCart,
 *          clearCart, cartCount, cartSubtotal
 */
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import storage from '../lib/storage';

const CartContext = createContext(null);
const STORAGE_KEY = 'sc_cart';

function loadCart() {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState(loadCart);

  // Persist on every change
  useEffect(() => {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(cartItems));
    } catch {
      // Ignore storage persistence errors
    }
  }, [cartItems]);

  const addToCart = useCallback((product, qty = 1) => {
    setCartItems(prev => {
      const idx = prev.findIndex(i => i.sku === product.sku);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], qty: updated[idx].qty + qty };
        return updated;
      }
      return [...prev, {
        sku: product.sku,
        name: product.name,
        price: product.price,
        imageUrl: product.imageUrl,
        qty,
      }];
    });
  }, []);

  const updateQty = useCallback((sku, qty) => {
    if (qty < 1) return;
    setCartItems(prev => prev.map(i => i.sku === sku ? { ...i, qty } : i));
  }, []);

  const removeFromCart = useCallback((sku) => {
    setCartItems(prev => prev.filter(i => i.sku !== sku));
  }, []);

  const clearCart = useCallback(() => setCartItems([]), []);

  const cartCount = useMemo(() => cartItems.reduce((s, i) => s + i.qty, 0), [cartItems]);
  const cartSubtotal = useMemo(() => cartItems.reduce((s, i) => s + i.price * i.qty, 0), [cartItems]);

  return (
    <CartContext.Provider value={{ cartItems, addToCart, updateQty, removeFromCart, clearCart, cartCount, cartSubtotal }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within <CartProvider>');
  return ctx;
}
