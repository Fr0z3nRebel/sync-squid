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

interface PlatformSelectorProps {
  selectedPlatforms: Platform[];
  onPlatformsChange: (platforms: Platform[]) => void;
}

export default function PlatformSelector({
  selectedPlatforms,
  onPlatformsChange,
}: PlatformSelectorProps) {
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

  const isConnected = (platform: Platform): boolean => {
    return connections.some((conn) => conn.platform === platform);
  };

  const handlePlatformToggle = (platform: Platform) => {
    if (!isConnected(platform)) {
      // Redirect to connect if not connected
      window.location.href = `/api/platforms/${platform}/auth`;
      return;
    }

    if (selectedPlatforms.includes(platform)) {
      onPlatformsChange(selectedPlatforms.filter((p) => p !== platform));
    } else {
      onPlatformsChange([...selectedPlatforms, platform]);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-300 bg-white p-4">
        <p className="text-gray-600">Loading platforms...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Select Platforms <span className="text-red-500">*</span>
        </label>
        <p className="mt-1 text-xs text-gray-500">
          Choose which platforms to publish your video to
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(PLATFORMS) as Platform[]).map((platform) => {
          const platformInfo = PLATFORMS[platform];
          const connected = isConnected(platform);
          const selected = selectedPlatforms.includes(platform);

          return (
            <div
              key={platform}
              onClick={() => handlePlatformToggle(platform)}
              className={`cursor-pointer rounded-lg border-2 p-4 transition-all ${
                selected
                  ? 'border-indigo-500 bg-indigo-50'
                  : connected
                    ? 'border-gray-200 bg-white hover:border-gray-300'
                    : 'border-gray-200 bg-gray-100 opacity-60'
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => handlePlatformToggle(platform)}
                  disabled={!connected}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-2xl">{platformInfo.icon}</span>
                <span className="font-medium text-gray-900">
                  {platformInfo.name}
                </span>
              </div>

              {!connected && (
                <p className="mt-2 text-xs text-gray-500">
                  Connect to enable
                </p>
              )}
            </div>
          );
        })}
      </div>

      {selectedPlatforms.length === 0 && (
        <p className="text-sm text-amber-600">
          Please select at least one platform to publish to
        </p>
      )}
    </div>
  );
}

