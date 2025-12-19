# Sync Squid - Multi-Platform Video Scheduler

A Next.js application that allows users to upload videos once and schedule them for automatic distribution to YouTube, Facebook Reels, Instagram Reels, and TikTok. Videos are uploaded directly to platforms with scheduled publish dates.

## Features

- 🔐 **Authentication**: Secure user login using Supabase Auth
- 📤 **Video Upload**: Drag-and-drop video upload with preview and validation
- 📝 **Metadata Management**: Title, description, and tags for your videos
- 📅 **Scheduling**: Calendar UI for scheduling future video publications
- 🔗 **Multi-Platform Publishing**: Upload to YouTube, TikTok, Facebook Reels, and Instagram Reels
- 📊 **Dashboard**: Track scheduled posts, upload status, and publishing history
- 🎨 **Modern UI**: Responsive design with Tailwind CSS

## Tech Stack

- **Frontend**: Next.js 16+ (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **Deployment**: Vercel
- **APIs**: YouTube Data API, Facebook Graph API, Instagram Graph API, TikTok API

## Prerequisites

- Node.js 18+ and npm
- A Supabase account and project
- OAuth applications for each platform you want to use:
  - YouTube (Google Cloud Console)
  - Facebook/Instagram (Meta for Developers)
  - TikTok (TikTok for Developers)

## Getting Started

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd sync-squid
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to your project's SQL Editor
3. Run the migration files in order:
   - First, run `supabase/migrations/001_initial_schema.sql`
     - This creates the necessary tables: `platform_connections`, `scheduled_posts`, and `post_platforms`
     - It also sets up Row Level Security (RLS) policies
   - Then, run `supabase/migrations/002_create_storage_bucket.sql`
     - This creates the `videos` storage bucket for temporary video storage
     - Sets up storage policies so users can only access their own videos
     - Videos are automatically deleted after successful upload to platforms

### 4. Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp env.example .env.local
   ```

2. Fill in your environment variables (see [Environment Variables](#environment-variables) section below)

### 5. Set Up Platform OAuth Applications

#### YouTube (Google Cloud Console)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the YouTube Data API v3
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3000/api/platforms/youtube/callback` (for development)
   - Add production URL when deploying
5. Copy the Client ID and Client Secret

#### Facebook & Instagram (Meta for Developers)

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create a new app
3. Add Facebook Login and Instagram Graph API products
4. Configure OAuth redirect URIs:
   - `http://localhost:3000/api/platforms/facebook/callback`
   - `http://localhost:3000/api/platforms/instagram/callback`
5. Get your App ID and App Secret
6. **Note**: Instagram requires a Facebook Page connected to an Instagram Business Account

#### TikTok (TikTok for Developers)

1. Go to [TikTok for Developers](https://developers.tiktok.com/)
2. Create a new app
3. Configure OAuth redirect URI: `http://localhost:3000/api/platforms/tiktok/callback`
4. Get your Client Key and Client Secret
5. **Note**: TikTok API may have limitations and requires approval for production use

### 6. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# YouTube OAuth
YOUTUBE_CLIENT_ID=your_youtube_client_id
YOUTUBE_CLIENT_SECRET=your_youtube_client_secret

# Facebook OAuth
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret

# Instagram OAuth (uses Facebook credentials)
INSTAGRAM_APP_ID=your_instagram_app_id
INSTAGRAM_APP_SECRET=your_instagram_app_secret

# TikTok OAuth
TIKTOK_CLIENT_KEY=your_tiktok_client_key
TIKTOK_CLIENT_SECRET=your_tiktok_client_secret

# App URL (for OAuth callbacks)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

See `env.example` for a template.

## Project Structure

```
sync-squid/
├── app/                          # Next.js App Router
│   ├── (auth)/                  # Auth routes
│   │   ├── login/               # Login page
│   │   └── callback/            # OAuth callback handler
│   ├── dashboard/               # Main dashboard
│   ├── upload/                  # Video upload flow
│   └── api/                     # API routes
│       ├── platforms/           # Platform OAuth & upload endpoints
│       └── upload/              # Video upload handler
├── components/                  # React components
│   ├── ui/                      # Reusable UI components
│   ├── VideoUploader.tsx        # Video upload component
│   ├── MetadataForm.tsx          # Metadata form
│   ├── PlatformSelector.tsx     # Platform selection
│   ├── SchedulePicker.tsx        # Date/time picker
│   └── Dashboard.tsx            # Dashboard components
├── lib/                         # Utilities & services
│   ├── supabase/                # Supabase client & helpers
│   └── platforms/               # Platform API integrations
│       ├── youtube.ts
│       ├── tiktok.ts
│       ├── facebook.ts
│       └── instagram.ts
├── types/                       # TypeScript types
└── supabase/                    # Supabase migrations
    └── migrations/
```

## Usage

### 1. Sign Up / Login

Create an account or log in with your existing credentials.

### 2. Connect Platforms

Navigate to the Dashboard and connect your social media accounts:
- Click "Connect" for each platform you want to use
- Complete the OAuth flow for each platform
- Your tokens will be securely stored

### 3. Upload a Video

1. Click "Upload Video" from the dashboard
2. **Step 1**: Upload your video file (MP4 or MOV, up to 5GB)
3. **Step 2**: Enter video metadata (title, description, tags)
4. **Step 3**: Select a scheduled date and time
5. **Step 4**: Choose which platforms to publish to
6. Click "Upload & Schedule"

### 4. Monitor Your Posts

View all your scheduled posts in the Dashboard:
- See upload status for each platform
- View YouTube thumbnails
- Filter by status (pending, uploading, published, failed)
- Check for any errors

## Database Schema

The application uses three main tables:

- **platform_connections**: Stores OAuth tokens for each platform per user
- **scheduled_posts**: Stores video metadata and scheduling information
- **post_platforms**: Junction table tracking upload status for each platform

See `supabase/migrations/001_initial_schema.sql` for the complete schema.

## Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import your repository in [Vercel](https://vercel.com)
3. Add all environment variables in Vercel's project settings
4. Update OAuth redirect URIs in each platform's developer console to use your production URL
5. Deploy!

### Environment Variables for Production

Make sure to update:
- `NEXT_PUBLIC_APP_URL` to your production domain
- All OAuth redirect URIs in platform developer consoles
- Supabase RLS policies if needed

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## Troubleshooting

### OAuth Errors

#### Google/YouTube OAuth Error: "Access blocked: Authorization Error"

If you see "Error 400: invalid_request" or "doesn't comply with Google's OAuth 2.0 policy", follow these steps:

1. **Go to Google Cloud Console** → [APIs & Services](https://console.cloud.google.com/apis/credentials) → OAuth consent screen

2. **Configure OAuth Consent Screen**:
   - **User Type**: Choose "External" (unless you have a Google Workspace)
   - **App name**: Enter your app name (e.g., "Sync Squid")
   - **User support email**: Your email address
   - **Developer contact information**: Your email address
   - Click "Save and Continue"

3. **Add Scopes**:
   - Click "Add or Remove Scopes"
   - Add this scope:
     - `https://www.googleapis.com/auth/youtube` (includes upload, read, and update permissions)
   - Click "Update" then "Save and Continue"
   
   **Important**: If you already connected your YouTube account, you'll need to disconnect and reconnect it to get the updated permissions. The `prompt: 'consent'` parameter will ensure you see the consent screen again.

4. **Add Test Users** (if app is in Testing mode):
   - Click "Add Users"
   - Add your email address (`johneadams88@gmail.com`)
   - Add any other test user emails
   - Click "Save and Continue"

5. **Publishing Status**:
   - **For Development**: Keep app in "Testing" mode and ensure your email is in test users
   - **For Production**: You'll need to submit for verification (can take several days)

6. **Verify OAuth Credentials**:
   - Go to [Credentials](https://console.cloud.google.com/apis/credentials)
   - Click on your OAuth 2.0 Client ID
   - Verify "Authorized redirect URIs" includes:
     - `http://localhost:3000/api/platforms/youtube/callback` (for development)
     - `https://your-domain.com/api/platforms/youtube/callback` (for production)

7. **Common Issues**:
   - Make sure redirect URI matches **exactly** (including http vs https, trailing slashes, etc.)
   - If using localhost, ensure it's `http://localhost:3000` (not `http://127.0.0.1:3000`)
   - Clear browser cache and cookies, then try again
   - Wait a few minutes after making changes for them to propagate

#### Other OAuth Errors

- Ensure redirect URIs match exactly in platform developer consoles
- Check that environment variables are set correctly
- Verify OAuth apps are approved (some platforms require approval)

### Upload Failures

#### 413 Content Too Large Error

This has been resolved! The app now uses Supabase Storage as an intermediate step:

1. **Video Upload Flow**:
   - Videos are uploaded to Supabase Storage first (bypasses Vercel's 4.5MB limit)
   - Videos are then processed from storage and uploaded to platforms
   - Videos are automatically deleted from Supabase Storage after successful upload

2. **Storage Setup**:
   - Make sure you've run the `002_create_storage_bucket.sql` migration
   - The storage bucket is configured with a 5GB file size limit
   - Only authenticated users can upload/access their own videos

3. **If you still see this error**:
   - Verify the storage bucket was created successfully
   - Check Supabase Storage settings in your project dashboard
   - Ensure storage policies are correctly configured

#### Other Upload Issues

- Check video file format (MP4 or MOV)
- Verify file size is under platform limits (YouTube: 256GB, others vary)
- Ensure platform accounts are properly connected
- Check platform API status and rate limits

### Database Issues

- Verify Supabase migration has been run
- Check RLS policies are correctly configured
- Ensure service role key has proper permissions

## Security Notes

- Never commit `.env.local` to version control
- OAuth tokens are encrypted in the database
- Row Level Security (RLS) ensures users can only access their own data
- All API routes are protected with authentication

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

[Add your license here]

## Support

For issues and questions, please open an issue on GitHub.
