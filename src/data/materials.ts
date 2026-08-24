export type Material = {
  id: string;
  slug: string;
  name: string;
  searchTerm: string;
  trade: string;
  category: string;
  subcategory: string;
  aliases: string[];
  priceRange?: string;
  active: boolean;
};

export const materials: Material[] = [
  {
    id: "rigips_bauplatte_12_5mm",
    slug: "rigips-bauplatte-12-5mm",
    name: "Rigips Bauplatte 12,5 mm",
    searchTerm: "Gipskartonplatte 12,5 mm",
    trade: "Trockenbau",
    category: "Platten",
    subcategory: "Gipskartonplatten",
    aliases: [
      "rigips", "regips", "rigibs", "regipsplatte", "rigipsplatte",
      "gipsplatte", "gips platte", "gipskarton", "gips karton",
      "gipskartonplatte", "trockenbauplatte", "trockenbau platte",
      "bauplatte", "ausbauplatte", "wandplatte", "deckenplatte",
      "tb platte", "gips wand", "gips decke"
    ],
    priceRange: "Ca. 4–12 €",
    active: true
  },
  {
    id: "feuchtraumplatte_12_5mm",
    slug: "feuchtraumplatte-12-5mm",
    name: "Feuchtraumplatte 12,5 mm",
    searchTerm: "Feuchtraum Gipskartonplatte 12,5 mm",
    trade: "Trockenbau",
    category: "Platten",
    subcategory: "Feuchtraumplatten",
    aliases: [
      "feuchtraumplatte", "feuchtplatte", "greenboard", "grüne platte",
      "gruene platte", "badplatte", "bad rigips", "bad gipskarton",
      "grüne rigips", "gruene rigips", "feuchtraum rigips"
    ],
    priceRange: "Ca. 8–15 €",
    active: true
  },
  {
    id: "rotband",
    slug: "knauf-rotband",
    name: "Knauf Rotband",
    searchTerm: "Knauf Rotband 30 kg",
    trade: "Maler / Trockenbau",
    category: "Putz",
    subcategory: "Haftputz",
    aliases: [
      "rotband", "rot band", "rotbnd", "knauf rotband",
      "haftputz", "haftputzgips", "putzgips", "gipsputz",
      "innenputz", "wandputz", "deckenputz", "gips zum verputzen"
    ],
    priceRange: "Ca. 9–15 €",
    active: true
  },
  {
    id: "perlfix",
    slug: "knauf-perlfix",
    name: "Knauf Perlfix",
    searchTerm: "Knauf Perlfix 30 kg",
    trade: "Trockenbau",
    category: "Kleber",
    subcategory: "Ansetzgips",
    aliases: [
      "perlfix", "perflix", "knauf perlfix", "ansatzgips",
      "ansetzgips", "plattenkleber", "gipskleber",
      "gips karton kleber", "gipskarton kleber", "rigips kleber"
    ],
    priceRange: "Ca. 10–14 €",
    active: true
  },
  {
    id: "knauf_uniflott_25kg",
    slug: "knauf-uniflott-25kg",
    name: "Knauf Uniflott 25 kg",
    searchTerm: "Knauf Uniflott 25 kg",
    trade: "Trockenbau",
    category: "Spachtel",
    subcategory: "Fugenspachtel",
    aliases: [
      "uniflott", "uniflot", "uniflod", "knauf uniflott",
      "spachtel", "fugenspachtel", "fugenfüller", "fugenfueller",
      "trockenbauspachtel", "rigips spachtel", "gips spachtel",
      "fugenmasse", "gipsfugenfüller", "gipsfugenfueller"
    ],
    priceRange: "Ca. 17–22 €",
    active: true
  },
  {
    id: "acryl_weiss_310ml",
    slug: "acryl-weiss-310ml",
    name: "Acryl Weiß 310 ml",
    searchTerm: "Acryl Weiß 310 ml",
    trade: "Maler / Trockenbau",
    category: "Dichtstoffe",
    subcategory: "Acryl",
    aliases: [
      "acryl", "akryl", "acril", "maleracryl", "fugenacryl",
      "weißes acryl", "weisses acryl", "acryl weiss", "acryl weiß",
      "acryl kartusche", "weiße fugenmasse", "weisse fugenmasse"
    ],
    priceRange: "Ca. 2–5 €",
    active: true
  },
  {
    id: "cw_profil_50",
    slug: "cw-profil-50",
    name: "CW Profil 50",
    searchTerm: "CW Profil 50",
    trade: "Trockenbau",
    category: "Profile",
    subcategory: "Wandprofile",
    aliases: [
      "cw", "cw profil", "cw 50", "cw50", "ständer", "staender",
      "ständerprofil", "staenderprofil", "wandprofil", "metallprofil",
      "trockenbauprofil", "profil wand", "rigips profil wand"
    ],
    priceRange: "Ca. 4–7 €",
    active: true
  },
  {
    id: "uw_profil_50",
    slug: "uw-profil-50",
    name: "UW Profil 50",
    searchTerm: "UW Profil 50",
    trade: "Trockenbau",
    category: "Profile",
    subcategory: "Boden- und Deckenprofile",
    aliases: [
      "uw", "uw profil", "uw 50", "uw50", "u profil", "u-profil",
      "bodenprofil", "deckenprofil", "führungsprofil", "fuehrungsprofil",
      "wandprofil unten", "trockenbau schiene", "u schiene"
    ],
    priceRange: "Ca. 4–7 €",
    active: true
  },
  {
    id: "cd_profil_60_27",
    slug: "cd-profil-60-27",
    name: "CD Profil 60/27",
    searchTerm: "CD Profil 60/27",
    trade: "Trockenbau",
    category: "Profile",
    subcategory: "Deckenprofile",
    aliases: [
      "cd", "cd profil", "cd 60 27", "cd60", "cd60/27",
      "60/27", "deckenprofil", "cd deckenprofil", "trockenbauprofil",
      "metallprofil", "decken schiene", "deckenschiene",
      "profil decke", "rigips deckenprofil"
    ],
    priceRange: "Ca. 5–9 €",
    active: true
  },
  {
    id: "direktabhaenger",
    slug: "direktabhaenger",
    name: "Direktabhänger",
    searchTerm: "Direktabhänger",
    trade: "Trockenbau",
    category: "Abhängung",
    subcategory: "Deckenabhänger",
    aliases: [
      "direktabhänger", "direktabhaenger", "abhänger", "abhaenger",
      "abhänge", "abhaenge", "deckenabhänger", "deckenabhaenger",
      "cd abhänger", "cd abhaenger", "rigips abhänger",
      "deckenhalter", "profil abhänger"
    ],
    priceRange: "Ca. 5–10 €",
    active: true
  },
  {
    id: "schnellbauschrauben_25mm",
    slug: "schnellbauschrauben-25mm",
    name: "Schnellbauschrauben 25 mm",
    searchTerm: "Schnellbauschrauben 25 mm",
    trade: "Trockenbau",
    category: "Schrauben",
    subcategory: "Trockenbauschrauben",
    aliases: [
      "schnellbauschrauben", "trockenbauschrauben", "trockenbau schrauben",
      "rigipsschrauben", "rigips schrauben", "gipskartonschrauben",
      "gipskarton schrauben", "schrauben", "25mm schrauben",
      "25 mm schrauben", "tb schrauben", "schwarze schrauben",
      "ph2 schrauben", "feingewinde schrauben", "gips schrauben"
    ],
    priceRange: "Ca. 6–10 €",
    active: true
  },
  {
    id: "tiefengrund",
    slug: "tiefengrund",
    name: "Tiefengrund",
    searchTerm: "Tiefengrund",
    trade: "Maler / Trockenbau",
    category: "Grundierung",
    subcategory: "Tiefengrund",
    aliases: [
      "tiefengrund", "tiefgrund", "grundierung", "wand grundierung",
      "grundieren", "gipskarton grundierung", "rigips grundierung",
      "saugende untergründe grundierung", "saugende untergruende grundierung"
    ],
    priceRange: "Ca. 8–25 €",
    active: true
  },
  {
    id: "haftgrund",
    slug: "haftgrund",
    name: "Haftgrund",
    searchTerm: "Haftgrund",
    trade: "Maler / Trockenbau",
    category: "Grundierung",
    subcategory: "Haftgrund",
    aliases: [
      "haftgrund", "haftbrücke", "haftbruecke", "betonkontakt",
      "beton kontakt", "haft primer", "grundierung beton",
      "nicht saugende untergründe", "nicht saugende untergruende"
    ],
    priceRange: "Ca. 10–30 €",
    active: true
  },
  {
    id: "steinwolle_40mm",
    slug: "steinwolle-40mm",
    name: "Steinwolle / Mineralwolle 40 mm",
    searchTerm: "Steinwolle 40 mm",
    trade: "Trockenbau",
    category: "Dämmung",
    subcategory: "Trennwanddämmung",
    aliases: [
      "steinwolle", "mineralwolle", "dämmung", "daemmung",
      "wolle", "trennwanddämmung", "trennwanddaemmung",
      "trockenbau dämmung", "trockenbau daemmung",
      "wanddämmung", "wanddaemmung", "dämmwolle", "daemmwolle"
    ],
    priceRange: "Ca. 20–45 €",
    active: true
  }
];