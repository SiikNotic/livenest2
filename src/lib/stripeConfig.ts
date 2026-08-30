/*
Plan único de membresía de LiveNest: $7.99 USD / mes, recurrente.

El producto y el precio ya están creados en tu cuenta de Stripe
("LiveNest Membership Payment", price_1U5rhIFARVVAQecmdoBfi5PQ).

El ID que estaba antes acá (price_1U6WVSFDp1hyRiGt5gpXD5ib) nunca existió
en la cuenta real de Stripe — cualquiera que intentara suscribirse recibía
"No such price" de Stripe. Verificado directo contra la cuenta live: el
único precio recurrente activo es el de abajo, ligado al producto
"LiveNest Membership Payment" ($7.99/mes).

Si algún día cambias el precio, NO edites el precio existente en Stripe
(los precios son inmutables una vez creados) — crea un precio nuevo para
el mismo producto, actualiza el ID de abajo, Y agregá ese nuevo ID a
PRICE_CONFIG en supabase/functions/stripe-checkout/index.ts. Ese mapa es
la única fuente de verdad de qué duración/modo le corresponde a cada
priceId — el edge function ya NO confía en nada que mande el cliente para
decidir cuánto dura la licencia, así que un ID que falte ahí simplemente
no deja pagar (mejor eso a que alguien pague un mes y quede con acceso de
por vida).
*/

export const MEMBERSHIP_PRICE_ID = "price_1U5rhIFARVVAQecmdoBfi5PQ";
export const MEMBERSHIP_PRICE_LABEL = "$7.99 / mes";
