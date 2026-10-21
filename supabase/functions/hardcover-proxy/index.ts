import { normalizeHardcoverBook, selectHardcoverEdition, hardcoverIdentity } from '../../../features/hardcover.js';

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') || 'https://sodanexus.github.io',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, 'Content-Type': 'application/json' },
});
const BOOK = 'id title description release_year image { url } contributions { author { name } }';
const EDITION = 'id book_id title description pages isbn_13 isbn_10 release_year reading_format_id image { url } publisher { name } language { language }';
const cache = new Map<string, { until: number; items: unknown[] }>();
async function graphql(query: string, variables: Record<string, unknown>) {
  const token = Deno.env.get('HARDCOVER_TOKEN');
  if (!token) throw new Error('Hardcover non configuré');
  const response = await fetch('https://api.hardcover.app/v1/graphql', {
    method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.replace(/^Bearer\s+/i, '')}`, 'User-Agent': 'Kulturo/4.5.0' },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error('Hardcover indisponible');
  const data = await response.json();
  if (data.errors) throw new Error('Requête Hardcover refusée');
  return data.data;
}
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Méthode invalide' }, 405);
  // Vérifier une vraie session : la clé publique seule ne donne pas accès au jeton privé.
  const authorization = req.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return reply({ error: 'Connexion requise' }, 401);
  try {
    const auth = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey: Deno.env.get('SUPABASE_ANON_KEY') || '' },
      signal: AbortSignal.timeout(5000),
    });
    if (!auth.ok) return reply({ error: 'Session invalide' }, 401);
    const raw = await req.text();
    if (raw.length > 2048) return reply({ error: 'Requête trop longue' }, 400);
    const body = JSON.parse(raw);
    const query = typeof body.query === 'string' ? body.query.trim().slice(0, 200) : '';
    const identity = hardcoverIdentity(body.id);
    if (!['search', 'details'].includes(body.action) || (body.action === 'search' ? query.length < 2 : !identity)) return reply({ error: 'Requête invalide' }, 400);
    const key = JSON.stringify([body.action, query, identity]);
    const saved = cache.get(key);
    if (saved && saved.until > Date.now()) return reply({ items: saved.items });
    let items;
    if (body.action === 'details') {
      const data = await graphql(`query($id:Int!){books(where:{id:{_eq:$id}},limit:1){${BOOK}}}`, { id: identity!.bookId });
      const book = data.books?.[0];
      const editions = identity!.editionId ? await graphql(`query($id:Int!,$book:Int!){editions(where:{id:{_eq:$id},book_id:{_eq:$book}},limit:1){${EDITION}}}`, { id: identity!.editionId, book: identity!.bookId }) : { editions: [] };
      items = book ? [normalizeHardcoverBook(book, editions.editions?.[0])] : [];
    } else {
      const isbn = query.replace(/[-\s]/g, '');
      if (/^(\d{13}|\d{9}[\dXx])$/.test(isbn)) {
        const data = await graphql(`query($isbn:String!){editions(where:{_or:[{isbn_13:{_eq:$isbn}},{isbn_10:{_eq:$isbn}}]},limit:5){${EDITION}}}`, { isbn: isbn.toUpperCase() });
        const ids = [...new Set(data.editions.map((e: any) => e.book_id))];
        const books = ids.length ? await graphql(`query($ids:[Int!]!){books(where:{id:{_in:$ids}}){${BOOK}}}`, { ids }) : { books: [] };
        items = data.editions.flatMap((edition: any) => {
          const book = books.books.find((b: any) => b.id === edition.book_id);
          return book ? [normalizeHardcoverBook(book, edition)] : [];
        });
      } else {
        const found = await graphql('query($q:String!){search(query:$q,query_type:"Book",per_page:6,page:1){ids results}}', { q: query });
        const ids = (found.search?.ids || []).map(Number).filter((n: number) => Number.isSafeInteger(n) && n > 0).slice(0, 6);
        const data = ids.length ? await graphql(`query($ids:[Int!]!){books(where:{id:{_in:$ids}}){${BOOK} editions(limit:30,order_by:{users_count:desc}){${EDITION}}}}`, { ids }) : { books: [] };
        const result = typeof found.search?.results === 'string' ? JSON.parse(found.search.results) : found.search?.results;
        items = ids.flatMap((id: number) => {
          const book = data.books.find((b: any) => b.id === id);
          const hit = result?.hits?.find((h: any) => Number(h.document?.id) === id)?.document;
          return book ? [normalizeHardcoverBook({ ...book, genres: hit?.genres }, selectHardcoverEdition(book.editions))] : [];
        });
      }
    }
    if (cache.size >= 200) cache.delete(cache.keys().next().value!);
    cache.set(key, { until: Date.now() + 10 * 60_000, items });
    return reply({ items });
  } catch {
    return reply({ error: 'Hardcover momentanément indisponible' }, 503);
  }
});
