import type { Campaign, Tier, Variant } from "./model";

export const campaignData: Campaign[] = [
  { id: "serum", name: "Renewal Serum multi-buy", products: "Renewal Serum", status: "Active", schedule: "No end date", updated: "12 min ago", tiers: [
    { quantity: 1, label: "Single", discountPercent: 0 },
    { quantity: 2, label: "Duo", tag: "Save 10%", discountPercent: 10 },
    { quantity: 3, label: "Ritual", tag: "Most popular", discountPercent: 20, recommended: true },
    { quantity: 5, label: "Stock up", tag: "Best value", discountPercent: 30 },
  ] },
  { id: "cleanser", name: "Daily Cleanser launch offer", products: "Daily Cleanser", status: "Scheduled", schedule: "Starts Oct 21, 09:00", updated: "Yesterday", tiers: [
    { quantity: 2, label: "Pair", discountPercent: 12 },
    { quantity: 4, label: "Set", tag: "Popular", discountPercent: 18, recommended: true },
  ] },
  { id: "cream", name: "Night Cream replenishment", products: "Night Cream", status: "Paused", schedule: "Ends Nov 5", updated: "Oct 8", tiers: [
    { quantity: 2, label: "Two jars", discountPercent: 15 },
    { quantity: 3, label: "Three jars", discountPercent: 22, recommended: true },
  ] },
];
export const defaultTiers: Tier[] = campaignData[0].tiers;

export const variants: Variant[] = [
  { id: "black-s", options: { Color: "Black", Size: "S" }, price: 98, inventory: 6, available: true, image: "https://images.unsplash.com/photo-1611930022073-b7a4ba5fcccd?auto=format&fit=crop&w=240&q=80" },
  { id: "black-m", options: { Color: "Black", Size: "M" }, price: 100, inventory: 2, available: true, image: "https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?auto=format&fit=crop&w=240&q=80" },
  { id: "black-l", options: { Color: "Black", Size: "L" }, price: 104, inventory: 3, available: true, image: "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=240&q=80" },
  { id: "white-s", options: { Color: "White", Size: "S" }, price: 110, inventory: 1, available: true, image: "https://images.unsplash.com/photo-1556229010-6c3f2c9ca5f8?auto=format&fit=crop&w=240&q=80" },
  { id: "white-m", options: { Color: "White", Size: "M" }, price: 112, inventory: 0, available: false, image: "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=240&q=80" },
  { id: "white-l", options: { Color: "White", Size: "L" }, price: 116, inventory: 4, available: true, image: "https://images.unsplash.com/photo-1612817288484-6f916006741a?auto=format&fit=crop&w=240&q=80" },
];
