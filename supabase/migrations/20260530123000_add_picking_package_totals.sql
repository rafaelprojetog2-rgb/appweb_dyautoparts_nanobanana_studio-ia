ALTER TABLE public.separacao
ADD COLUMN IF NOT EXISTS total_produtos_separados integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_pacotes_montados integer NOT NULL DEFAULT 0;

