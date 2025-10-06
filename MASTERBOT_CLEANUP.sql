-- ===============================================
-- MASTERBOT 2.0 - KOMPLETNO BRISANJE BAZE PODATAKA
-- ===============================================
-- 
-- ⚠️  UPOZORENJE: Ovo će obrisati SVE podatke iz baze!
-- ⚠️  Koristite samo ako ste 100% sigurni!
--
-- Instrukcije:
-- 1. Idite na Supabase Dashboard
-- 2. Odaberite vaš "Masterbot 2.0" projekat
-- 3. Idite na SQL Editor
-- 4. Kopirajte i pokrenite ovaj skript
-- ===============================================

-- Privremeno isključujemo foreign key constraints
SET session_replication_role = replica;

-- ===============================================
-- BRISANJE SVIH TABELA
-- ===============================================
DO $$ 
DECLARE
    r RECORD;
    table_count INTEGER := 0;
BEGIN
    RAISE NOTICE '=== POČINJE BRISANJE TABELA ===';
    
    -- Brojimo tabele pre brisanja
    SELECT COUNT(*) INTO table_count FROM pg_tables WHERE schemaname = 'public';
    RAISE NOTICE 'Pronađeno tabela za brisanje: %', table_count;
    
    -- Brisemo sve tabele u public schema
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename) 
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
        RAISE NOTICE '✅ Obrisana tabela: %', r.tablename;
    END LOOP;
    
    RAISE NOTICE '=== ZAVRŠENO BRISANJE TABELA ===';
END $$;

-- ===============================================
-- BRISANJE SVIH SEKVENCI
-- ===============================================
DO $$ 
DECLARE
    r RECORD;
    seq_count INTEGER := 0;
BEGIN
    RAISE NOTICE '=== POČINJE BRISANJE SEKVENCI ===';
    
    -- Brojimo sekvence pre brisanja
    SELECT COUNT(*) INTO seq_count FROM information_schema.sequences WHERE sequence_schema = 'public';
    RAISE NOTICE 'Pronađeno sekvenci za brisanje: %', seq_count;
    
    -- Brisemo sve sekvence
    FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public' ORDER BY sequence_name)
    LOOP
        EXECUTE 'DROP SEQUENCE IF EXISTS public.' || quote_ident(r.sequence_name) || ' CASCADE';
        RAISE NOTICE '✅ Obrisana sekvenca: %', r.sequence_name;
    END LOOP;
    
    RAISE NOTICE '=== ZAVRŠENO BRISANJE SEKVENCI ===';
END $$;

-- ===============================================
-- BRISANJE SVIH FUNKCIJA
-- ===============================================
DO $$ 
DECLARE
    r RECORD;
    func_count INTEGER := 0;
BEGIN
    RAISE NOTICE '=== POČINJE BRISANJE FUNKCIJA ===';
    
    -- Brojimo funkcije pre brisanja
    SELECT COUNT(*) INTO func_count FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';
    RAISE NOTICE 'Pronađeno funkcija za brisanje: %', func_count;
    
    -- Brisemo sve funkcije
    FOR r IN (SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type = 'FUNCTION' ORDER BY routine_name)
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS public.' || quote_ident(r.routine_name) || ' CASCADE';
        RAISE NOTICE '✅ Obrisana funkcija: %', r.routine_name;
    END LOOP;
    
    RAISE NOTICE '=== ZAVRŠENO BRISANJE FUNKCIJA ===';
END $$;

-- ===============================================
-- BRISANJE SVIH VIEW-OVA
-- ===============================================
DO $$ 
DECLARE
    r RECORD;
    view_count INTEGER := 0;
BEGIN
    RAISE NOTICE '=== POČINJE BRISANJE VIEW-OVA ===';
    
    -- Brojimo view-ove pre brisanja
    SELECT COUNT(*) INTO view_count FROM information_schema.views WHERE table_schema = 'public';
    RAISE NOTICE 'Pronađeno view-ova za brisanje: %', view_count;
    
    -- Brisemo sve view-ove
    FOR r IN (SELECT table_name FROM information_schema.views WHERE table_schema = 'public' ORDER BY table_name)
    LOOP
        EXECUTE 'DROP VIEW IF EXISTS public.' || quote_ident(r.table_name) || ' CASCADE';
        RAISE NOTICE '✅ Obrisan view: %', r.table_name;
    END LOOP;
    
    RAISE NOTICE '=== ZAVRŠENO BRISANJE VIEW-OVA ===';
END $$;

-- ===============================================
-- BRISANJE SVIH TIPOVA
-- ===============================================
DO $$ 
DECLARE
    r RECORD;
    type_count INTEGER := 0;
BEGIN
    RAISE NOTICE '=== POČINJE BRISANJE TIPOVA ===';
    
    -- Brojimo tipove pre brisanja
    SELECT COUNT(*) INTO type_count FROM pg_type WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') AND typtype = 'c';
    RAISE NOTICE 'Pronađeno tipova za brisanje: %', type_count;
    
    -- Brisemo sve tipove
    FOR r IN (SELECT typname FROM pg_type WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') AND typtype = 'c' ORDER BY typname)
    LOOP
        EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
        RAISE NOTICE '✅ Obrisan tip: %', r.typname;
    END LOOP;
    
    RAISE NOTICE '=== ZAVRŠENO BRISANJE TIPOVA ===';
END $$;

-- ===============================================
-- UKLJUČIVANJE FOREIGN KEY CONSTRAINTS
-- ===============================================
SET session_replication_role = DEFAULT;

-- ===============================================
-- FINALNA VERIFIKACIJA
-- ===============================================
SELECT '=== FINALNA VERIFIKACIJA ===' as status;

-- Prikazujemo sve preostale tabele (trebalo bi da bude prazno)
SELECT 
    'Preostale tabele:' as tip,
    tablename as naziv
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- Prikazujemo sve preostale sekvence
SELECT 
    'Preostale sekvence:' as tip,
    sequence_name as naziv
FROM information_schema.sequences 
WHERE sequence_schema = 'public'
ORDER BY sequence_name;

-- Prikazujemo sve preostale funkcije
SELECT 
    'Preostale funkcije:' as tip,
    routine_name as naziv
FROM information_schema.routines 
WHERE routine_schema = 'public' AND routine_type = 'FUNCTION'
ORDER BY routine_name;

-- Prikazujemo sve preostale view-ove
SELECT 
    'Preostale view-ove:' as tip,
    table_name as naziv
FROM information_schema.views 
WHERE table_schema = 'public'
ORDER BY table_name;

-- Prikazujemo sve preostale tipove
SELECT 
    'Preostali tipovi:' as tip,
    typname as naziv
FROM pg_type 
WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') AND typtype = 'c'
ORDER BY typname;

SELECT '=== BAZA PODATAKA JE OČIŠĆENA ===' as status;
