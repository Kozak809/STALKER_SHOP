# STALKER_SHOP
STALKERS SHOP has been the #1 shop on 6g6s.org Buy the highest quality kits and items on 6g6s.org for the cheapest prices!

## Backend API (Python)

Simple Flask server exposes `/kits` on port `8089`, returning JSON list of items with fields `name`, `price`, `type`, `photo`, `quantity`. Uses Supabase table `kits`.

### Setup

1. Install Python 3.9+
2. Create virtual environment (optional but recommended)
3. Set environment:

   - `SUPABASE_URL` – your Supabase project URL
   - `SUPABASE_KEY` – your Supabase anon or service role key

4. Install dependencies:

```bash
pip install -r requirements.txt
```

### Run

```bash
python server.py
```

Server listens on `http://localhost:8089/kits`.

### Database (Supabase)

Create a table `kits` with columns:

- `id` (bigint, primary key, default identity) – optional but recommended
- `name` (text, not null)
- `price` (numeric or float, not null)
- `type` (text, not null)
- `photo` (text)
- `quantity` (int4, not null, default 0)

The API selects: `name, price, type, photo, quantity` from `kits`. If `id` exists, results are ordered by `id` asc.

Environment override: `PORT` for server port (defaults to 8089).
