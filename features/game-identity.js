// Comparaison stricte : ponctuation et numérotation, jamais une recherche floue.
const roman = {ii:'2',iii:'3',iv:'4',v:'5',vi:'6',vii:'7',viii:'8',ix:'9',x:'10'};
export function gameIdentityKey(title) {
 return String(title || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/\b(ii|iii|iv|v|vi|vii|viii|ix|x)\b/g, n=>roman[n]).replace(/[^a-z0-9]/g,'');
}
export function exactGameMatch(entry, candidates) {
 const key=gameIdentityKey(entry?.title);
 if(!key) return null;
 const matches=new Map((candidates || []).filter(candidate=>
  Number.isSafeInteger(Number(candidate.external_id)) && Number(candidate.external_id)>0 &&
  gameIdentityKey(candidate.title)===key &&
  (!entry.release_year || Number(candidate.release_year)===Number(entry.release_year))
 ).map(candidate=>[String(candidate.external_id),candidate]));
 return matches.size===1 ? [...matches.values()][0] : null;
}

export function gameSearchQueries(title) {
 const text=String(title || '').trim();
 const numerals={2:'II',3:'III',4:'IV',5:'V',6:'VI',7:'VII',8:'VIII',9:'IX',10:'X'};
 const alternate=text.replace(/\b(10|[2-9])$/,n=>numerals[n]);
 return [...new Set([text,alternate])].filter(Boolean);
}
