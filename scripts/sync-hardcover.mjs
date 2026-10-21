import {copyFileSync} from 'node:fs';
copyFileSync(new URL('../features/hardcover.js',import.meta.url),new URL('../supabase/functions/hardcover-proxy/hardcover.js',import.meta.url));
