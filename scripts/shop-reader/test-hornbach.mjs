import { searchHornbach } from "./hornbach.mjs";

const query = process.argv.slice(2).join(" ").trim();

const result = await searchHornbach(query);

console.log(JSON.stringify(result, null, 2));