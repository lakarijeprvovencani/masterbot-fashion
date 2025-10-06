# Fashion Model Creator

A modern React application for creating and styling fashion models using AI.

## Features

- 🔐 **User Authentication** - Sign up and login with Supabase
- 👤 **User Profiles** - Automatic profile creation
- 🤖 **AI Model Creation** - Generate fashion models
- 👗 **Model Styling** - Dress your models with different outfits
- 📱 **Responsive Design** - Works on all devices
- 🎨 **Modern UI** - Beautiful gradient design

## Tech Stack

- **Frontend**: React + TypeScript
- **Backend**: Supabase (PostgreSQL + Auth)
- **Styling**: Pure CSS with modern gradients
- **Build Tool**: Vite

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Supabase account

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/fashionnikolainemanja.git
cd fashionnikolainemanja
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Add your Supabase credentials to `.env`:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Run the development server:
```bash
npm run dev
```

5. Open http://localhost:5173 in your browser

## Database Schema

### Tables

- **profiles** - User profiles
- **fashion_models** - Generated fashion models
- **dressed_models** - Styled models with outfits

### Security

- Row Level Security (RLS) enabled
- Users can only access their own data
- Automatic profile creation on signup

## Project Structure

```
src/
├── components/          # React components
│   ├── Login.tsx       # Login form
│   ├── SignUp.tsx      # Registration form
│   └── Dashboard.tsx   # Main dashboard
├── contexts/           # React contexts
│   └── AuthContext.tsx # Authentication context
├── lib/               # Utilities
│   └── supabase.ts    # Supabase client
└── App.tsx            # Main app component
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the MIT License.

## Author

Created by Nemanja Lakic