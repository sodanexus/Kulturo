// Isolated fictional catalogue for the standalone design preview only.
// Never imported by the production entry. All mutations stay in memory.
const demoUser = { id: '99999999-9999-4999-8999-999999999999', email: 'apercu@example.invalid' };
let signedIn = !new URLSearchParams(location.search).has('connexion');
let authListener;
const titles = ['Les heures bleues','Au-delà du silence','L’archipel','Soleil d’hiver','Les jardins de verre','Orbital','La dernière lumière','Les passagers','Une autre rive','Fragments du monde','L’été sans fin','Là où tout commence','La forêt invisible','Après la pluie','Les vagues'];
const colors = [['#243f53','#e8b9a0'],['#2e3935','#c4c99a'],['#ce6e42','#ece0b6'],['#ccc3a0','#33574c'],['#344336','#d0b8d2'],['#172e46','#de753e'],['#452e40','#e9bb7d'],['#b5c1b0','#22352a'],['#af523d','#f0dbb7'],['#272b42','#c4c8df'],['#c4a563','#793d2d'],['#32544e','#e3bfb0'],['#293e31','#beca9f'],['#819797','#e8d7b8'],['#1c3d52','#89b8b6']];
function poster(index) {
  const [bg, fg] = colors[index % colors.length];
  const title = titles[index % titles.length];
  const words = title.split(' '); const midpoint = Math.ceil(words.length / 2);
  const motif = index % 4 === 0
    ? `<circle cx="210" cy="220" r="116" fill="${fg}"/><path d="M0 320Q150 170 420 300V630H0" fill="${bg}"/><path d="M0 380Q180 200 420 360" stroke="${fg}" fill="none"/>`
    : index % 4 === 1
    ? Array.from({length:9},(_,n)=>`<ellipse cx="210" cy="235" rx="${25+n*17}" ry="${80+n*14}" fill="none" stroke="${fg}" stroke-opacity="${.9-n*.06}" transform="rotate(${n*9} 210 235)"/>`).join('')
    : index % 4 === 2
    ? `<path d="M60 380V200L210 96l150 104v180H60Z" fill="${fg}"/><path d="M120 380V230l90-64 90 64v150" fill="${bg}"/><circle cx="210" cy="272" r="42" fill="${fg}"/>`
    : `<circle cx="210" cy="240" r="146" fill="none" stroke="${fg}"/><circle cx="210" cy="240" r="106" fill="${fg}"/><path d="M0 240h420M210 0v420" stroke="${bg}" stroke-width="7"/>`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="420" height="630" viewBox="0 0 420 630"><rect width="420" height="630" fill="${bg}"/><rect x="18" y="18" width="384" height="594" rx="1" fill="none" stroke="${fg}" stroke-opacity=".3"/><text x="210" y="58" text-anchor="middle" fill="${fg}" font-family="sans-serif" font-size="10" letter-spacing="5">KULTURO · COLLECTION</text>${motif}<text x="210" y="472" text-anchor="middle" fill="${fg}" font-family="Georgia,serif" font-size="36">${words.slice(0,midpoint).join(' ')}</text><text x="210" y="517" text-anchor="middle" fill="${fg}" font-family="Georgia,serif" font-size="36">${words.slice(midpoint).join(' ')}</text><text x="210" y="580" text-anchor="middle" fill="${fg}" font-family="sans-serif" font-size="10" letter-spacing="3">UNE ŒUVRE FICTIVE</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
const now=new Date();
const dateAt=(days)=>{const d=new Date(now);d.setDate(d.getDate()+days);return d.toISOString().slice(0,10)};
let entries = titles.map((title,index)=>({
  id:`11111111-1111-4111-8111-${String(index+1).padStart(12,'0')}`, user_id:demoUser.id,
  title, media_type:['movie','book','game','movie'][index%4], subtype:index%4===3?'tv':index%4===0?'movie':null,
  status:index<10?'finished':index<13?'playing':'wishlist',rating:index<10?[9,8,9,7,10,8,9,7,8,9][index]:null,
  is_favorite:[0,4,6].includes(index),repeat_count:index===4?1:0,
  cover_url:poster(index),backdrop_url:null,genre:['Drame, Contemplatif','Aventure, Imaginaire','Exploration, Mystère'][index%3],
  author:'Camille Laurent',directors:'Alex Moreau',developer:'Atelier Horizon',platform:'PC',publisher:'Éditions du large',
  duration:104+index,page_count:240+index*8,release_year:2023+index%3,source_api:'manual',external_id:`demo-${index}`,
  description:'Cette œuvre fictive illustre la nouvelle collection Kulturo. Une rencontre inattendue ouvre une fenêtre sur un monde différent, entre souvenirs, paysages et nouvelles perspectives. Les personnages avancent à leur rythme, portés par une question : que reste-t-il des histoires que nous traversons ?\n\nLes titres, couvertures et informations de cet aperçu sont inventés. Votre véritable bibliothèque et vos comptes ne sont pas utilisés.',
  date_started:dateAt(-index-3),date_finished:index<10?dateAt(-index):null,
  created_at:dateAt(-index)+'T12:00:00Z',updated_at:dateAt(0)+'T12:00:00Z',_detailsFetched:true,
}));
let events=entries.filter(e=>e.status==='finished').map((e,i)=>({id:`event-${i}`,media_id:e.id,event_type:'finished',occurred_at:e.created_at,metadata:{}}));
const clone=value=>JSON.parse(JSON.stringify(value));
export function initSupabase(){return true}
export const Auth={getSessionUser:async()=>signedIn?demoUser:null,getUser:async()=>signedIn?demoUser:null,getAccessToken:async()=>'',onAuthChange(fn){authListener=fn},async signOut(){signedIn=false;await authListener?.('SIGNED_OUT',null)},async signIn(){signedIn=true;await authListener?.('SIGNED_IN',demoUser)}};
export const Media={getAll:async()=>clone(entries),async update(id,changes){const e=entries.find(e=>e.id===id);if(!e)throw new Error('Œuvre absente');Object.assign(e,changes);return clone(e)},async create(payload){const e={...payload,id:payload.id||crypto.randomUUID(),user_id:demoUser.id,created_at:new Date().toISOString()};entries.push(e);return clone(e)},async delete(id){entries=entries.filter(e=>e.id!==id)}};
export const Journal={getAll:async()=>clone(events),async hide(id){events=events.filter(e=>e.id!==id)}};
export const Profiles={get:async()=>({username:'Collection de démonstration'}),upsert:async(_id,username)=>({username})};
export const Activity={getFeed:async()=>clone(entries.slice(0,4).map(e=>({...e,user_id:'demo-other',username:'Le cercle Kulturo'})))};
export const Backup={restore:async()=>{throw new Error('Utilisez votre vraie application pour restaurer une sauvegarde.')}};
const upcoming=(type)=>titles.slice(0,8).map((title,i)=>({...clone(entries[i]),id:undefined,title,media_type:type,subtype:type==='movie'?(i%2?'tv':'movie'):null,upcoming_type:type==='movie'?(i%2?'tv':'movie'):type,status:undefined,external_id:`future-${type}-${i}`,source_api:type==='movie'?'tmdb':type==='game'?'igdb':'openlibrary',release_date:dateAt(5+i*7),date_precision:'day',popularity:20-i}));
export const TMDb={available:()=>true,upcoming:async()=>upcoming('movie'),search:async()=>[]};
export const IGDB={available:()=>true,upcoming:async()=>upcoming('game')};
export const GoogleBooks={available:()=>true,upcoming:async()=>upcoming('book')};
export const TMDbDetails={fetch:async()=>({})},IGDBDetails=TMDbDetails,OpenLibraryDetails=TMDbDetails;
export const apiAvailability=()=>({movie:true,game:true,book:true});
export const searchMedia=async(query,type)=>clone(entries.filter(e=>e.title.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr'))&&e.media_type===type));
