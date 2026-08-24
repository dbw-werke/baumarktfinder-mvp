export type Store = {
  id: string;
  name: string;
  address: string;
};

export const stores: Store[] = [
  { id: "obi", name: "OBI", address: "OBI Frankfurt am Main" },
  { id: "hornbach", name: "Hornbach", address: "Hornbach Frankfurt am Main" },
  { id: "bauhaus", name: "Bauhaus", address: "Bauhaus Frankfurt am Main" },
  { id: "toom", name: "toom", address: "toom Frankfurt am Main" },
  { id: "hagebau", name: "hagebau", address: "hagebau Frankfurt am Main" },
  { id: "raabkarcher", name: "Raab Karcher", address: "Raab Karcher Frankfurt am Main" },
  { id: "baywa", name: "BayWa", address: "BayWa Baustoffe Frankfurt am Main" },
  { id: "wuerth", name: "Würth", address: "Würth Frankfurt am Main" }
];