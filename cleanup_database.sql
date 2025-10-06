-- SQL skript za brisanje svih tabela iz Masterbot 2.0 baze podataka
-- OVO ĆE OBRISATI SVE PODATKE - KORISTI SAMO AKO SI SIGURAN!

-- Isključujemo foreign key constraints privremeno
SET session_replication_role = replica;

-- Dobijamo listu svih tabela u public schema
DO $$ 
DECLARE
    r RECORD;
BEGIN
    -- Brisemo sve tabele u public schema
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') 
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
        RAISE NOTICE 'Obrisana tabela: %', r.tablename;
    END LOOP;
    
    -- Brisemo sve sekvence
    FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public')
    LOOP
        EXECUTE 'DROP SEQUENCE IF EXISTS public.' || quote_ident(r.sequence_name) || ' CASCADE';
        RAISE NOTICE 'Obrisana sekvenca: %', r.sequence_name;
    END LOOP;
    
    -- Brisemo sve funkcije
    FOR r IN (SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type = 'FUNCTION')
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS public.' || quote_ident(r.routine_name) || ' CASCADE';
        RAISE NOTICE 'Obrisana funkcija: %', r.routine_name;
    END LOOP;
    
    -- Brisemo sve view-ove
    FOR r IN (SELECT table_name FROM information_schema.views WHERE table_schema = 'public')
    LOOP
        EXECUTE 'DROP VIEW IF EXISTS public.' || quote_ident(r.table_name) || ' CASCADE';
        RAISE NOTICE 'Obrisan view: %', r.table_name;
    END LOOP;
    
    -- Brisemo sve tipove
    FOR r IN (SELECT typname FROM pg_type WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') AND typtype = 'c')
    LOOP
        EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
        RAISE NOTICE 'Obrisan tip: %', r.typname;
    END LOOP;
END $$;

-- Ukljucujemo foreign key constraints nazad
SET session_replication_role = DEFAULT;

-- Prikazujemo sve preostale tabele (trebalo bi da bude prazno)
SELECT 'Preostale tabele:' as status;
SELECT tablename FROM pg_tables WHERE schemaname = 'public';

-- Prikazujemo sve preostale sekvence
SELECT 'Preostale sekvence:' as status;
SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public';

-- Prikazujemo sve preostale funkcije
SELECT 'Preostale funkcije:' as status;
SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';
