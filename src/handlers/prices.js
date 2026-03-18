import { fetchPrices } from '../lib/bitkub-client.js';

export async function handleGetPrices(c) {
  const prices = await fetchPrices();
  return c.json(prices);
}
