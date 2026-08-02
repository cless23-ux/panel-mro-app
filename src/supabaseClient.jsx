import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://udunfsjpxivllbyboudm.supabase.co'
// '복사한_Publishable_key' 부분에 아까 복사해둔 키를 따옴표 안에 넣으세요
const supabaseKey = 'sb_publishable_CBUSenstWyQEHrJVa89AKg_-tnkzT7D'

export const supabase = createClient(supabaseUrl, supabaseKey)