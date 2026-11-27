import { APP_NAME } from '@/config/brand'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy, Flame, Crown, Medal } from 'lucide-react'
import AppShell, { AppTopBar, PanelHeader } from '@/components/site/AppShell'
import { Brand, primaryButton, secondaryButton, surface } from '@/components/site/siteUi'
import { motion } from 'framer-motion'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/integrations/supabase/client'

interface LeaderboardEntry {
  user_id: string
  current_streak: number
  longest_streak: number
  display_name: string | null
  avatar_url: string | null
}

const RANK_STYLES = [
  { icon: Crown, color: 'text-yellow-500' },
  { icon: Medal, color: 'text-slate-400' },
  { icon: Medal, color: 'text-amber-600' },
]

export default function LeaderboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [userRank, setUserRank] = useState<number | null>(null)

  useEffect(() => {
    async function fetchLeaderboard() {
      const { data: streaks } = await supabase
        .from('user_streaks')
        .select('user_id, current_streak, longest_streak')
        .order('longest_streak', { ascending: false })
        .limit(50)

      if (!streaks || streaks.length === 0) {
        setLoading(false)
        return
      }

      const userIds = streaks.map((s) => s.user_id)
      const { data: profilesRaw } = await supabase
        .from('public_profiles' as any)
        .select('id, display_name, avatar_url')
        .in('id', userIds)
      const profiles = ((profilesRaw ?? []) as unknown) as Array<{ id: string; display_name: string | null; avatar_url: string | null }>

      const profileMap = new Map(profiles.map(p => [p.id, p]))

      const merged: LeaderboardEntry[] = streaks.map((s) => {
        const profile = profileMap.get(s.user_id)
        return {
          user_id: s.user_id,
          current_streak: s.current_streak,
          longest_streak: s.longest_streak,
          display_name: profile?.display_name || 'Anonymous',
          avatar_url: profile?.avatar_url || null,
        }
      })

      setEntries(merged)

      if (user) {
        const rank = merged.findIndex(e => e.user_id === user.id)
        setUserRank(rank >= 0 ? rank + 1 : null)
      }

      setLoading(false)
    }

    fetchLeaderboard()
  }, [user])

  if (!user) { navigate('/auth'); return null }

  return (
    <AppShell width="narrow" topBar={<AppTopBar back={{ to: '/recompensas', label: 'Rewards' }} title="Leaderboard" />}>
      <PanelHeader
        icon={<Trophy className="h-7 w-7" aria-hidden />}
        title="Streak leaderboard"
        description={<>The longest daily streaks in the <Brand>{APP_NAME}</Brand> community.</>}
        actions={userRank ? <span className="text-[15px] font-medium text-primary">Your rank: #{userRank}</span> : undefined}
      />

      {loading ? (
        <div className="py-12 text-center">
          <Flame className="mx-auto mb-3 h-7 w-7 animate-pulse text-primary" aria-hidden />
          <p className="text-[15px] text-muted-foreground">Loading leaderboard...</p>
        </div>
      ) : entries.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${surface.panel} px-6 py-12 text-center`}>
          <p className="text-[15px] text-muted-foreground">No streaks yet.</p>
          <button type="button" className={`${primaryButton} mt-5`} onClick={() => navigate('/recompensas')}>
            Start my streak
          </button>
        </motion.div>
      ) : (
        <ol className={`${surface.panel} divide-y divide-white/[0.06]`}>
          {entries.map((entry, i) => {
            const isCurrentUser = entry.user_id === user?.id
            const rankStyle = i < 3 ? RANK_STYLES[i] : null
            const RankIcon = rankStyle?.icon || null

            return (
              <li
                key={entry.user_id}
                className={`flex items-center gap-4 px-4 py-3.5 ${isCurrentUser ? 'bg-primary/[0.06]' : ''}`}
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center text-[15px] font-semibold tabular-nums ${rankStyle ? rankStyle.color : 'text-muted-foreground'}`}>
                  {RankIcon ? <RankIcon className="h-5 w-5" aria-label={`Rank ${i + 1}`} /> : i + 1}
                </div>

                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted">
                  {entry.avatar_url ? (
                    <img src={entry.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-muted-foreground">
                      {(entry.display_name || '?')[0].toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className={`truncate text-[15px] font-medium ${isCurrentUser ? 'text-primary' : 'text-foreground'}`}>
                    {entry.display_name || 'Anonymous'}
                    {isCurrentUser && <span className="ml-1 text-xs opacity-70">(you)</span>}
                  </p>
                  <p className="text-[13px] text-muted-foreground">Current streak: {entry.current_streak} days</p>
                </div>

                <div className="shrink-0 text-right">
                  <div className={`text-lg font-semibold tabular-nums ${rankStyle ? rankStyle.color : 'text-foreground'}`}>
                    {entry.longest_streak}
                  </div>
                  <span className="text-[12px] text-muted-foreground">Best</span>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <div className="mt-8 text-center">
        <button type="button" className={secondaryButton} onClick={() => navigate('/recompensas')}>
          <Flame className="h-4 w-4" aria-hidden />
          Back to rewards
        </button>
      </div>
    </AppShell>
  )
}
