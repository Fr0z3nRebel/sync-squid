'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Platform, PlatformConnection } from '@/types/database';

interface PlatformInfo {
  name: string;
  icon: string;
  color: string;
}

const PLATFORMS: Record<Platform, PlatformInfo> = {
  youtube: { name: 'YouTube', icon: '▶️', color: 'bg-red-600' },
  facebook: { name: 'Facebook', icon: '📘', color: 'bg-blue-600' },
  instagram: { name: 'Instagram', icon: '📷', color: 'bg-pink-600' },
  tiktok: { name: 'TikTok', icon: '🎵', color: 'bg-black' },
};

export default function PlatformConnections() {
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    loadConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadConnections = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from('platform_connections')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error loading connections:', error);
      } else {
        setConnections(data || []);
      }
    } catch (error) {
      console.error('Error loading connections:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = (platform: Platform) => {
    window.location.href = `/api/platforms/${platform}/auth`;
  };

  const handleDisconnect = async (platform: Platform) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { error } = await supabase
        .from('platform_connections')
        .delete()
        .eq('user_id', user.id)
        .eq('platform', platform);

      if (error) {
        console.error('Error disconnecting:', error);
        alert('Failed to disconnect platform');
      } else {
        await loadConnections();
      }
    } catch (error) {
      console.error('Error disconnecting:', error);
      alert('Failed to disconnect platform');
    }
  };

  const isConnected = (platform: Platform) => {
    return connections.some((conn) => conn.platform === platform);
  };

  if (loading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <p className="text-gray-600">Loading platform connections...</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <h2 className="mb-4 text-xl font-semibold text-gray-900">
        Platform Connections
      </h2>
      <p className="mb-6 text-sm text-gray-600">
        Connect your social media accounts to schedule and publish videos
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(PLATFORMS) as Platform[]).map((platform) => {
          const platformInfo = PLATFORMS[platform];
          const connected = isConnected(platform);

          return (
            <div
              key={platform}
              className={`rounded-lg border-2 p-4 ${
                connected
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="text-2xl">{platformInfo.icon}</span>
                <h3 className="font-semibold text-gray-900">
                  {platformInfo.name}
                </h3>
              </div>

              <div className="mb-3">
                <span
                  className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${
                    connected
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {connected ? 'Connected' : 'Not Connected'}
                </span>
              </div>

              {connected ? (
                <button
                  onClick={() => handleDisconnect(platform)}
                  className="w-full rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={() => handleConnect(platform)}
                  className={`w-full rounded-md px-3 py-2 text-sm font-medium text-white hover:opacity-90 ${platformInfo.color}`}
                >
                  Connect
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

