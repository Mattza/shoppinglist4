-- Seed: recept för en specifik lista (veckomeny-bank).
-- Kör i Supabase SQL Editor eller: psql / supabase db execute (som postgres).
-- Idempotent: kör om utan dubbletter (on conflict do nothing).

insert into public.list_recipes (list_id, name, score)
values
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Köttbullar och potatismos', 3),
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Fiskpinnar', 3),
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Köttfärssås och spagetti', 3),
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Ärtpasta', 3),
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Korv', 3),
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Hamburgare', 3),
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Ugnspannkaka', 3),
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Potatisbullar', 3),
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Pannkakor', 3),
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Soppor', 3),
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Wok', 3),
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Indiskt', 3),
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Tacos', 3),
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Bowl', 3),
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Vietnamesiska vårrullar', 3),
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Linssoppa', 3),
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Pasta pesto', 3),
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Bahn mi', 3),
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Klyftpotatis', 3),
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Quesidillas', 3),
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Fried rice', 3),
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Pyttipanna', 3),
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Toast', 3),
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Libabröds pizza', 3),
  ('4aafd57d-533c-4742-a0e6-1449fa27f9ba'::uuid, 'Hemma pizza', 3)
on conflict (list_id, name_normalized) do nothing;
