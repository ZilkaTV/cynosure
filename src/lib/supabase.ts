// Legacy module name, kept so the many `import { supabase } from './supabase'` call sites keep working: the data
// client is now the Worker/D1 one in db.ts (Supabase is no longer used by the browser).
import { db } from './db'

export const supabase = db
export const hasBackend = true
