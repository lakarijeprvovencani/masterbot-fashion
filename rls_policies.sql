-- ===============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ===============================================

-- Omogućavanje RLS na tabelama
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fashion_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE dressed_models ENABLE ROW LEVEL SECURITY;

-- ===============================================
-- PROFILES TABLE POLICIES
-- ===============================================

-- Korisnik može da vidi samo svoj profil
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

-- Korisnik može da ažurira samo svoj profil
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- Korisnik može da kreira samo svoj profil
CREATE POLICY "Users can insert own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Korisnik može da obriše samo svoj profil
CREATE POLICY "Users can delete own profile" ON profiles
    FOR DELETE USING (auth.uid() = id);

-- ===============================================
-- FASHION MODELS TABLE POLICIES
-- ===============================================

-- Korisnik može da vidi samo svoje modele
CREATE POLICY "Users can view own models" ON fashion_models
    FOR SELECT USING (auth.uid() = user_id);

-- Korisnik može da kreira modele samo za sebe
CREATE POLICY "Users can create own models" ON fashion_models
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Korisnik može da ažurira samo svoje modele
CREATE POLICY "Users can update own models" ON fashion_models
    FOR UPDATE USING (auth.uid() = user_id);

-- Korisnik može da obriše samo svoje modele
CREATE POLICY "Users can delete own models" ON fashion_models
    FOR DELETE USING (auth.uid() = user_id);

-- ===============================================
-- DRESSED MODELS TABLE POLICIES
-- ===============================================

-- Korisnik može da vidi samo svoje obućene modele
CREATE POLICY "Users can view own dressed models" ON dressed_models
    FOR SELECT USING (auth.uid() = user_id);

-- Korisnik može da kreira obućene modele samo za sebe
CREATE POLICY "Users can create own dressed models" ON dressed_models
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Korisnik može da ažurira samo svoje obućene modele
CREATE POLICY "Users can update own dressed models" ON dressed_models
    FOR UPDATE USING (auth.uid() = user_id);

-- Korisnik može da obriše samo svoje obućene modele
CREATE POLICY "Users can delete own dressed models" ON dressed_models
    FOR DELETE USING (auth.uid() = user_id);

-- ===============================================
-- HELPER FUNCTIONS
-- ===============================================

-- Funkcija za proveru da li korisnik ima kreirane modele
CREATE OR REPLACE FUNCTION user_has_models(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM fashion_models 
        WHERE user_id = user_uuid 
        AND status = 'completed'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Funkcija za brojanje modela korisnika
CREATE OR REPLACE FUNCTION count_user_models(user_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER 
        FROM fashion_models 
        WHERE user_id = user_uuid 
        AND status = 'completed'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
