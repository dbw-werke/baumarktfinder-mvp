import test from 'node:test';
import assert from 'node:assert/strict';
import {rankObiCandidates,normalizeObiQuery} from '../scripts/shop-reader/obi-query-matcher.mjs';
// Synthetic identities only: no fixture prices enter the application catalog.
const names = [
 ['Acryl','Maleracryl weiß 310 ml'],['Armierungsgewebe','Armierungsgewebe 160 g/m² 1 x 50 m'],
 ['CD Profil 60/27','CD Profil 60/27 x 3000 mm'],['CW Profil 50','CW Profil 50 x 50 x 2600 mm'],
 ['Direktabhänger','Direktabhänger für CD Profile 125 mm'],['Feuchtraumplatte','Gipskartonplatte imprägniert 2000 x 1250 x 12,5 mm'],
 ['Haftgrund','Haftgrund 5 l'],['Perlfix','Knauf Perlfix 30 kg'],['Rotband','Knauf Rotband Haftputzgips 30 kg'],
 ['Uniflott','Knauf Uniflott 5 kg'],['PU-Schaum','PU-Schaum 750 ml'],['Rigips','Gipskartonplatte GKB 2000 x 1250 x 12,5 mm'],
 ['Gipskarton','Bauplatte GKB 2000 x 1250 x 12,5 mm'],['Rollputz','Rollputz 20 kg'],['Schleifpapier','Schleifpapier K120 230 x 280 mm 10 Stück'],
 ['Schnellbauschrauben','Schnellbauschrauben TN 3,5 x 25 mm 1.000 Stück'],['Silikon','Sanitär-Silikon weiß 310 ml'],['Sockelputz','Zement-Sockelputz 30 kg'],
 ['Dämmung','Rockwool Sonorock Steinwolle 40 mm 7,5 m²'],['Mineralwolle','Rockwool Sonorock Steinwolle 40 mm 7,5 m²'],
 ['Tiefengrund','Tiefgrund 10 l'],['UW Profil','UW Profil 50 x 40 x 4000 mm'],['Zement','Portlandzement 25 kg'],
 ['OSB','OSB/3 Verlegeplatte 2500 x 1250 x 18 mm'],['Fliesenkleber','Flex-Fliesenkleber 25 kg'],['Estrich','Beton-Estrich 30 kg'],
 ['Spachtelmasse','Knauf Uniflott Fugenspachtel 5 kg'],['Grundierung','Tiefengrund 5 l'],['Dämmplatte','XPS Dämmplatte 1250 x 600 x 40 mm'],
 ['Trockenbauschrauben','Schnellbauschrauben 3,5 x 35 mm 1000 Stück'],['Farbe','Wandfarbe weiß 10 l'],
 ['Mauersperrbahn','Mauersperrbahn 25 m Rolle'],
];
for (const [query,name] of names) test(`OBI generic identity: ${query}`,()=>{
 const result=rankObiCandidates(query,[{name,url:'https://www.obi.de/p/1000001/testprodukt'}]);
 assert.ok(result.selected,JSON.stringify(result.candidates));
});
test('OBI rejects lookalike families, technical contradictions and application-text contamination',()=>{
 const cases=[['Acryl',['Silikon 310 ml','Hybrid Acryl 310 ml','Acrylfarbe 1 l','Montagekleber 310 ml']],
 ['Zement',['Zement-Sockelputz 30 kg','Zementfarbe 5 l','Zementmörtel 25 kg']],
 ['Direktabhänger',['Noniusabhänger 125 mm','CD Profil 3000 mm','Universalverbinder 125 mm']],
 ['Rigips',['Feuchtraumplatte 2000 x 1250 x 12,5 mm','Gipskarton Brandschutzplatte 2000 x 1250 x 12,5 mm']],
 ['CD Profil 60/27',['CW Profil 60/27 x 3000 mm','CD Profil 50/27 x 3000 mm']]];
 for(const [query,bad] of cases) for(const name of bad) assert.equal(rankObiCandidates(query,[{name,description:`Für ${query} geeignet`}]).selected,null,`${query}: ${name}`);
});
test('OBI ranks actual package similarity before price without canonical IDs',()=>{
 const candidates=[{name:'Maleracryl weiß 280 ml',price:1,url:'c'},{name:'Anschlussacryl weiß 300 ml',price:4,url:'b'},{name:'Maleracryl weiß 310 ml',price:8,url:'a'}];
 const exact=rankObiCandidates('Acryl 310 ml',candidates).selected;
 assert.equal(exact.price,8);assert.equal(exact.actualSize,'310 ml');
 const fallback=rankObiCandidates('Acryl 310 ml',candidates.slice(0,2)).selected;
 assert.equal(fallback.price,4);assert.equal(fallback.packageQuantity,.3);
 assert.equal(normalizeObiQuery('  DÄMMUNG  '),'daemmung');
});
test('OBI CD section accepts retailer dimension order 27 x 60 x 3100 without a false width conflict',()=>{
 const result=rankObiCandidates('CD Profil 60/27',[{name:'Knauf Deckenprofil CD 27 mm x 60 mm x 3100 mm'}]);
 assert.ok(result.selected);assert.equal(result.selected.actualSize,'3.100 × 60 × 27 mm');
});

test('OBI preserves essential chemistry/application and does not confuse wet with dry screed',()=>{
 for(const [query,name] of [['XPS Dämmplatte 40 mm','EPS Dämmplatte 40 mm'],['Fassadenfarbe 10 l','Innen-Wandfarbe 10 l'],['Zementputz 25 kg','Gipsputz 25 kg'],['Portlandzement 25 kg','Trasszement 25 kg'],['Estrich','Fermacell Estrichelement 20 x 500 x 1500 mm']])
  assert.equal(rankObiCandidates(query,[{name}]).selected,null,query);
});

test('OBI explicit multipacks use the total content; ambiguous quantities fail closed',()=>{
 const multi=rankObiCandidates('Acryl',[{name:'Maleracryl 6 x 310 ml',price:18}]).selected;
 assert.ok(multi);assert.equal(multi.packageQuantity,1.86);assert.match(multi.actualSize,/6 Stück/);
 assert.equal(rankObiCandidates('Acryl',[{name:'Acryl 310 ml 6 Stück',price:18}]).selected,null);
});

test('OBI treats unit-qualified content attributes as identity evidence and ignores old shipping dimensions',()=>{
 assert.equal(rankObiCandidates('Tiefengrund',[{name:'Tiefgrund 5 l',attributes:[{name:'Inhalt (l)',value:'10 l'}]}]).selected,null);
 const old=rankObiCandidates('Direktabhänger',[{name:'Direktabhänger 125 mm',priceSource:'obi-rendered-product',attributes:[{name:'Höhe',value:'1 mm'},{name:'Breite',value:'3 cm'}]}]).selected;
 assert.equal(old.actualSize,'125 mm');
});
