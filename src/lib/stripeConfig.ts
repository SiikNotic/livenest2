/*
Plan único de membresía de LiveNest: $7.99 USD / mes, recurrente.

El producto y el precio ya están creados en tu cuenta de Stripe
("LiveNest Membresía Premium", price_1U6WVSFDp1hyRiGt5gpXD5ib).

Si algún día cambias el precio, NO edites el precio existente en Stripe
(los precios son inmutables una vez creados) — crea un precio nuevo para
el mismo producto y actualiza el ID de abajo.
*/

export const MEMBERSHIP_PRICE_ID = "price_1U6WVSFDp1hyRiGt5gpXD5ib";
export const MEMBERSHIP_PRICE_LABEL = "$7.99 / mes";
export const MEMBERSHIP_DURATION = "30" as const; // mensual, coincide con PRICE_MAP en stripe-checkout
