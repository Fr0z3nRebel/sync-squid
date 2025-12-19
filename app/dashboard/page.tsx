import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import PlatformConnections from '@/components/PlatformConnections';
import ScheduledPostsList from '@/components/ScheduledPostsList';
import DashboardClient from '@/components/DashboardClient';
import Link from 'next/link';

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardClient />
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">Sync Squid</h1>
            <div className="flex items-center gap-4">
              <Link
                href="/upload"
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Upload Video
              </Link>
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Logout
                </button>
              </form>
            </div>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="mt-2 text-gray-600">
            Manage your scheduled video posts across all platforms
          </p>
        </div>

        <div className="mb-8">
          <PlatformConnections />
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">
            Scheduled Posts
          </h3>
          <ScheduledPostsList />
        </div>
      </div>
    </div>
  );
}

