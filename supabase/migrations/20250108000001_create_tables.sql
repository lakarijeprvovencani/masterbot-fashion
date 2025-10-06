-- ===============================================
-- FASHION MODEL APP - DATABASE STRUCTURE
-- ===============================================

-- Kreiranje tabele za korisničke profile
CREATE TABLE IF NOT EXISTS profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Kreiranje tabele za modele
CREATE TABLE IF NOT EXISTS fashion_models (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    model_name TEXT NOT NULL,
    model_description TEXT,
    model_image_url TEXT,
    model_data JSONB, -- Za čuvanje podataka o modelu
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Kreiranje tabele za obućene modele
CREATE TABLE IF NOT EXISTS dressed_models (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    model_id UUID REFERENCES fashion_models(id) ON DELETE CASCADE NOT NULL,
    outfit_description TEXT NOT NULL,
    outfit_image_url TEXT,
    outfit_data JSONB, -- Za čuvanje podataka o outfit-u
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Kreiranje indeksa za bolje performanse
CREATE INDEX IF NOT EXISTS idx_fashion_models_user_id ON fashion_models(user_id);
CREATE INDEX IF NOT EXISTS idx_fashion_models_created_at ON fashion_models(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dressed_models_user_id ON dressed_models(user_id);
CREATE INDEX IF NOT EXISTS idx_dressed_models_model_id ON dressed_models(model_id);
CREATE INDEX IF NOT EXISTS idx_dressed_models_created_at ON dressed_models(created_at DESC);

-- Kreiranje funkcije za automatsko ažuriranje updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Kreiranje triggera za automatsko ažuriranje
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_fashion_models_updated_at BEFORE UPDATE ON fashion_models
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dressed_models_updated_at BEFORE UPDATE ON dressed_models
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Kreiranje funkcije za automatsko kreiranje profila
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Kreiranje triggera za automatsko kreiranje profila
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
