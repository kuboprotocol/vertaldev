# 🎬 Shortlinks System - Complete Documentation

## Overview

**Shortlinks** é um sistema completo de monetização de vídeos curtos integrado ao KUBO Vibe. Usuários podem fazer upload de vídeos de 5-7 segundos e ganhar créditos diáriamente.

### Key Features

| Feature | Details |
|---------|---------|
| **Duração** | 5-7 segundos (validação automática) |
| **Limite** | 10 shortlinks ativos por usuário |
| **Recompensa Base** | 5 créditos/dia por shortlink |
| **Bônus** | +5 créditos/dia para cada 10 shortlinks |
| **Cálculo** | Diário às 00:00 UTC (sem acumular) |
| **Débito** | Sistema integrado com aviso em português |
| **Armazenamento** | Supabase Storage (50MB max por vídeo) |
| **Analytics** | Contador de visualizações em tempo real |

---

## 🏗️ Architecture

### Database Layer

```
shortlinks (main table)
├── id: uuid (pk)
├── user_id: uuid (fk → auth.users)
├── title: text
├── description: text (optional)
├── video_url: text
├── video_duration_seconds: int (5-7 range)
├── status: text ('active' | 'archived')
├── view_count: int (auto-increment)
├── created_at, updated_at: timestamp

daily_shortlink_rewards (earnings tracking)
├── id: uuid (pk)
├── user_id: uuid (fk)
├── reward_date: date (unique per user)
├── base_reward: int (always 5)
├── bonus_reward: int (calculated)
├── total_reward: generated column
├── applied_at: timestamp

shortlink_views (analytics)
├── id: uuid (pk)
├── shortlink_id: uuid (fk)
├── ip_address: inet (optional)
├── user_agent: text (optional)
├── created_at: timestamp
```

### Key Functions

1. **calculate_shortlink_rewards(user_id, reward_date)**
   - Calcula recompensas diárias
   - Desconta débitos automaticamente
   - Atualiza user_credits balance

2. **record_shortlink_view(shortlink_id, ip_address, user_agent)**
   - Registra visualização
   - Incrementa view_count

3. **check_shortlink_limits(user_id)**
   - Verifica limites de criação
   - Retorna recompensas esperadas

4. **get_user_shortlinks_with_stats(user_id)**
   - Lista shortlinks com estatísticas
   - Ordenado por data de criação

---

## 🔧 Setup Instructions

### 1. Apply Migrations

```bash
# Apply all pending migrations
supabase migration up

# Verify migrations
supabase db list-migrations
```

**Files to apply:**
- `20260927060000_shortlinks_daily_rewards.sql` - Core tables and functions
- `20260927061000_setup_shortlinks_storage.sql` - Storage bucket and policies

### 2. Deploy Edge Functions

```bash
# Deploy shortlinks handler
supabase functions deploy shortlinks

# Deploy daily rewards calculator
supabase functions deploy calculate-shortlink-rewards

# Verify
supabase functions list
```

### 3. Configure Storage Bucket

Via Supabase Console:

```
Storage > Buckets > Create New

Name: shortlinks
Public: ✓ (checked)
File size limit: 50 MB
Allowed MIME types: video/* (or specific: mp4, webm, quicktime, x-msvideo, ogg)

Policies:
✓ Public (SELECT) - anyone can read
✓ Authenticated (INSERT/UPDATE/DELETE) - users can upload their own
```

### 4. Set Up Daily Cron Job

**Option A: Vercel Crons** (Recommended)

```json
// vercel.json or .vercel/crons.json
{
  "crons": [{
    "path": "/api/cron/shortlinks",
    "schedule": "0 0 * * *"
  }]
}
```

**Option B: EasyCron** (Free)
- URL: `https://your-project.supabase.co/functions/v1/calculate-shortlink-rewards`
- Method: POST
- Headers: `Authorization: Bearer SERVICE_ROLE_KEY`
- Schedule: `0 0 * * *` (Daily at midnight UTC)

**Option C: Supabase Cron** (Enterprise)
```sql
select cron.schedule(
  'shortlink-rewards-daily',
  '0 0 * * *',
  $$ select http_post(...) $$
);
```

---

## 🚀 Deployment Checklist

- [ ] Migrations applied
  ```bash
  supabase migration up
  ```

- [ ] Edge functions deployed
  ```bash
  supabase functions deploy shortlinks
  supabase functions deploy calculate-shortlink-rewards
  ```

- [ ] Storage bucket created with policies
  - Bucket name: `shortlinks`
  - Public read, authenticated write
  - File size: 50MB max
  - MIME types: video/*

- [ ] Cron job scheduled for daily rewards
  - Time: 00:00 UTC
  - Endpoint: `/functions/v1/calculate-shortlink-rewards`

- [ ] Environment variables set
  ```env
  SUPABASE_URL=https://your-project.supabase.co
  SUPABASE_ANON_KEY=your_anon_key
  SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
  ```

- [ ] Test with `/scripts/test-shortlinks.sh`
  ```bash
  export SUPABASE_URL=...
  export SUPABASE_ANON_KEY=...
  export USER_TOKEN=...
  bash scripts/test-shortlinks.sh
  ```

---

## 📱 Frontend Components

### ShortlinksPage
Main dashboard at `/shortlinks`

**Displays:**
- Overview cards: Active shortlinks, daily credits, balance
- Debt warning (if applicable)
- How it works explanation
- Upload section
- List of shortlinks

**Props:** None (uses useAuth)

### ShortlinksUploader
Upload new video component

**Props:**
- `onSuccess: () => void` - Callback after upload
- `canCreateMore: boolean` - Whether limit reached
- `activeCount: number` - Current active count

**Features:**
- File selection with validation
- Duration detection (5-7s)
- Progress feedback
- Error messages in Portuguese

### ShortlinksList
Display list of shortlinks

**Props:**
- `shortlinks: Shortlink[]` - List of videos
- `onDelete: () => void` - Callback after delete
- `dailyReward: number` - Expected daily earnings

**Features:**
- View statistics inline
- Play/delete actions
- Thumbnail preview
- Archive functionality

### ShortlinkPlayer
Fullscreen video player

**Props:**
- `shortlink: Shortlink` - Video to play
- `onClose: () => void` - Close callback

**Features:**
- 9:16 aspect ratio
- Auto-play and loop
- Auto-records view on open
- Close button and controls

---

## 🧪 Testing

### Manual Testing

```bash
# 1. Deploy all components
supabase migration up
supabase functions deploy shortlinks
supabase functions deploy calculate-shortlink-rewards

# 2. Create test user
# Sign up at http://localhost:3000/auth

# 3. Test upload
# Go to http://localhost:3000/shortlinks
# Create video 5-7 seconds
# Upload and verify in database

# 4. Test rewards (manual trigger)
curl -X POST https://your-project.supabase.co/functions/v1/calculate-shortlink-rewards \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# 5. Verify in database
# SELECT * FROM daily_shortlink_rewards 
# WHERE reward_date = CURRENT_DATE
```

### Automated Testing

```bash
# Run test suite
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_ANON_KEY=your_anon_key
export SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
export USER_TOKEN=$(supabase auth get-token)

bash scripts/test-shortlinks.sh
```

---

## 💰 Reward System

### Calculation Formula

```
Daily Rewards = Base (5) + Bonus
Bonus = floor(active_count / 10) × 5

Examples:
├─ 1 shortlink   → 5 credits
├─ 5 shortlinks  → 5 credits
├─ 10 shortlinks → 10 credits (5 + 5)
├─ 15 shortlinks → 10 credits
├─ 20 shortlinks → 15 credits (5 + 10)
└─ Max: 10 active, so max bonus = 5 → max 10/day
```

### Debt Management

When user has a debt balance:

1. **Display**: Red alert banner showing debt amount
2. **Message**: "Você tem um débito de X créditos. Os créditos ganhos com shortlinks serão descontados automaticamente."
3. **Deduction**: Automatic from daily rewards
4. **Timeline**: Debt decreases daily until paid off

Example:
```
Day 1: Balance -50 credits, 2 shortlinks (reward 5)
       After cron: -45 credits (debt reduced by 5)

Day 2: Balance -45 credits, 2 shortlinks (reward 5)
       After cron: -40 credits (debt reduced by 5)

Day 10: Balance 0 credits (debt fully paid)
```

---

## 🔐 Security

### Row Level Security (RLS)

- ✅ Users can only view their own shortlinks
- ✅ Users can only upload to their own folder
- ✅ Users can only delete their own shortlinks
- ✅ Views can be recorded anonymously
- ✅ Service role required for reward calculations

### Data Validation

- ✅ Duration: 5-7 seconds (enforced)
- ✅ File size: Max 50MB
- ✅ File type: video/* only
- ✅ Limit: 10 per user (enforced)
- ✅ Title: Max 200 characters
- ✅ Description: Max 1000 characters

### Privacy

- ✅ Only active shortlinks visible publicly
- ✅ IP addresses optional for analytics
- ✅ User agent tracking for analytics
- ✅ CORS headers on edge functions
- ✅ Bearer token authentication required

---

## 📊 Monitoring

### Database Queries

```sql
-- Daily rewards summary
SELECT 
  DATE(reward_date) as date,
  COUNT(*) as users,
  SUM(total_reward) as total_credits
FROM daily_shortlink_rewards
GROUP BY DATE(reward_date)
ORDER BY date DESC;

-- Top earning shortlinks
SELECT 
  s.title,
  s.user_id,
  s.view_count,
  COUNT(*) as total_views
FROM shortlinks s
LEFT JOIN shortlink_views sv ON s.id = sv.shortlink_id
WHERE s.status = 'active'
GROUP BY s.id
ORDER BY total_views DESC
LIMIT 10;

-- Users with pending debts
SELECT 
  user_id,
  balance as debt,
  COUNT(id) as active_shortlinks
FROM user_credits
JOIN shortlinks ON user_credits.user_id = shortlinks.user_id
WHERE user_credits.debt > 0 AND shortlinks.status = 'active'
GROUP BY user_id;
```

### Function Logs

```bash
# View shortlinks function logs
supabase functions logs shortlinks --limit 100

# View calculate-shortlink-rewards logs
supabase functions logs calculate-shortlink-rewards --limit 100
```

---

## 🐛 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| "shortlink_limit_reached" | User has 10 active. Archive some to create new ones. |
| Video won't upload | Check: size < 50MB, type is video/*, duration 5-7s |
| Rewards not calculating | Check: cron job running, SERVICE_ROLE_KEY correct, shortlinks exist |
| Duration validation fails | Ensure video is exactly 5-7 seconds. Try different format. |
| View counter not updating | Check: record-view endpoint working, JavaScript enabled |
| Storage bucket errors | Verify: bucket public, correct MIME types, RLS policies set |

### Debug Commands

```bash
# Test edge function
curl -X POST https://project.supabase.co/functions/v1/shortlinks \
  -H "Authorization: Bearer TOKEN" \
  -H "X-Action: get-limits" \
  -d '{}'

# Check storage bucket
supabase storage ls shortlinks

# View function logs
supabase functions logs shortlinks --tail

# Test reward calculation
curl -X POST https://project.supabase.co/functions/v1/calculate-shortlink-rewards \
  -H "Authorization: Bearer SERVICE_ROLE_KEY" \
  -d '{}'
```

---

## 📚 Related Documentation

- [SHORTLINKS_SETUP.md](./SHORTLINKS_SETUP.md) - Detailed setup guide
- [SHORTLINKS_DEPLOYMENT.md](./SHORTLINKS_DEPLOYMENT.md) - Step-by-step deployment
- [scripts/test-shortlinks.sh](./scripts/test-shortlinks.sh) - Automated tests
- [ANTI_FRAUD_RULES.md](./ANTI_FRAUD_RULES.md) - Fraud prevention (related system)

---

## 🎯 Next Steps

1. **Immediate:**
   - [ ] Apply migrations
   - [ ] Deploy functions
   - [ ] Configure storage
   - [ ] Set up cron job

2. **Testing:**
   - [ ] Run test suite
   - [ ] Manual user testing
   - [ ] Verify daily rewards

3. **Monitoring:**
   - [ ] Set up logging
   - [ ] Monitor cron execution
   - [ ] Track user adoption

4. **Future Enhancements:**
   - [ ] Social features (likes, comments)
   - [ ] Content discovery/trending
   - [ ] Creator analytics dashboard
   - [ ] Integration with affiliate program
   - [ ] Monetization of views

---

## 💡 Tips

✨ **Best Practices:**
1. Upload videos with clear thumbnails (first frame matters)
2. Keep descriptions engaging to encourage views
3. Create batches of shortlinks for better earnings
4. Archive old/low-performing content
5. Monitor daily earnings trend

⚡ **Performance Tips:**
1. Use compressed video formats (H.264 + AAC)
2. Keep file sizes < 10MB for faster upload
3. Test videos locally before uploading
4. Use WiFi for uploads (mobile data is slow)

🔧 **Admin Tips:**
1. Monitor cron job execution daily
2. Check for failed reward calculations
3. Review debt accounts regularly
4. Archive spam/low-quality shortlinks
5. Monitor storage usage

---

## 📞 Support

For issues:
1. Check [Troubleshooting](#troubleshooting) section
2. Review function logs: `supabase functions logs`
3. Test with: `scripts/test-shortlinks.sh`
4. Check database: Review migration status and table schemas

---

**Last Updated:** September 27, 2026  
**Version:** 1.0.0  
**Status:** ✅ Production Ready
