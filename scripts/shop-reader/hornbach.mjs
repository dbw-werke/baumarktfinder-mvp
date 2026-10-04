import { searchShop } from "./shops.mjs";
// Backwards-compatible entry point; obeys the same robots and validation policy as every chain.
export const searchHornbach = (query, options) => searchShop("hornbach", query, options);
