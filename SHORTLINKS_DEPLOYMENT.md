# 🎬 Shortlinks System - Deployment Guide

## Step-by-Step Setup

### ✅ Step 1: Apply Migrations

```bash
# Make sure you're in the project root
cd /home/user/kubovibe

# Apply all pending migrations
supabase migration up

# If using Supabase CLI v1.x
supabase db push

# Verify migrations applied
supabase db list-migrations
```

**Expected Output:**
- ✓ 20260927040000_mcp_api_keys.sql
- ✓ 20260927041000_affiliate_installs.sql
- ✓ 20260927050000_anti_fraud_measures.sql
- ✓ 20260927051000_update_referral_bonus_50_credits.sql
- ✓ 20260927060000_shortlinks_daily_rewards.sql
- ✓ 20260927061000_setup_shortlinks_storage.sql

---

### ✅ Step 2: Deploy Edge Functions

```bash
# Deploy shortlinks function
supabase functions deploy shortlinks

# Deploy daily rewards calculator
supabase functions deploy calculate-shortlink-rewards

# Verify deployment
supabase functions list
```

**Expected Functions:**
```
✓ shortlinks (POST)
✓ calculate-shortlink-rewards (POST)
```

---

### ✅ Step 3: Test Edge Functions

#### Test 1: Get Limits (No Auth Required)
```bash
curl -X POST https://your-project.supabase.co/functions/v1/shortlinks \
  -H "Authorization: Bearer YOUR_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Action: get-limits" \
  -d '{}'

# Expected Response:
# {
#   "active_count": 0,
#   "max_allowed": 10,
#   "can_create_more": true,
#   "daily_base_reward": 5,
#   "daily_bonus_reward": 0,
#   "total_daily_reward": 5
# }
```

#### Test 2: Create Shortlink (Requires Video URL)
```bash
curl -X POST https://your-project.supabase.co/functions/v1/shortlinks \
  -H "Authorization: Bearer YOUR_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Action: create" \
  -d '{
    "title": "Test Video",
    "description": "This is a test shortlink",
    "video_url": "https://example.com/test-video.mp4",
    "video_duration_seconds": 6
  }'

# Expected Response:
# {
#   "success": true,
#   "shortlink": {
#     "id": "uuid",
#     "title": "Test Video",
#     "video_url": "...",
#     "created_at": "...",
#     ...
#   }
# }
```

#### Test 3: List Shortlinks
```bash
curl -X POST https://your-project.supabase.co/functions/v1/shortlinks \
  -H "Authorization: Bearer YOUR_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Action: list" \
  -d '{}'

# Expected Response:
# {
#   "shortlinks": [
#     { "id": "...", "title": "...", ... }
#   ]
# }
```

#### Test 4: Record View (No Auth)
```bash
curl -X POST https://your-project.supabase.co/functions/v1/shortlinks \
  -H "Content-Type: application/json" \
  -H "X-Action: record-view" \
  -d '{
    "shortlink_id": "SHORTLINK_UUID"
  }'

# Expected Response:
# { "success": true }
```

#### Test 5: Calculate Rewards (Requires Service Role)
```bash
curl -X POST https://your-project.supabase.co/functions/v1/calculate-shortlink-rewards \
  -H "Authorization: Bearer SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected Response:
# {
#   "success": true,
#   "processed": 0,
#   "results": [],
#   "timestamp": "2026-09-27T..."
# }
```

---

### ✅ Step 4: Configure Daily Cron Job

#### Option A: Vercel Crons (Recommended)

1. Create `.vercel/crons.json`:
```json
{
  "crons": [{
    "path": "/api/cron/shortlink-rewards",
    "schedule": "0 0 * * *"
  }]
}
```

2. Create `api/cron/shortlink-rewards.js`:
```javascript
export default async function handler(req, res) {
  const response = await fetch(
    `${process.env.SUPABASE_URL}/functions/v1/calculate-shortlink-rewards`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: '{}'
    }
  );

  const data = await response.json();
  return res.status(response.status).json(data);
}
```

#### Option B: EasyCron (Free)

1. Go to https://www.easycron.com
2. Create new cron job:
   - **URL**: `https://your-project.supabase.co/functions/v1/calculate-shortlink-rewards`
   - **Method**: POST
   - **Headers**: 
     ```
     Authorization: Bearer YOUR_SERVICE_ROLE_KEY
     Content-Type: application/json
     ```
   - **Body**: `{}`
   - **Schedule**: `0 0 * * *` (Every day at midnight UTC)

#### Option C: Supabase Edge Functions Cron

If using Supabase with pg_cron enabled:

```sql
-- Run as postgres in Supabase SQL editor
select
  cron.schedule(
    'calculate-shortlink-rewards-daily',
    '0 0 * * *', -- Every day at midnight UTC
    $$
    select http_post(
      'https://your-project.supabase.co/functions/v1/calculate-shortlink-rewards',
      json_build_object()::jsonb,
      ('Authorization: Bearer ' || current_setting('app.supabase_service_role_key'))::text
    );
    $$
  );
```

---

### ✅ Step 5: Environment Variables

Make sure these are set in your `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

---

### ✅ Step 6: Full User Flow Test

#### Test Scenario:

1. **Sign up a test user**
   - Email: `shortlink-test@example.com`
   - Password: `TestPassword123!`

2. **Navigate to `/shortlinks`**
   - Should show: 0/10 shortlinks, 5 credits/day

3. **Create a test video** (5-7 seconds)
   - Use online tools to create short video
   - Or use existing video and trim to 5-7s

4. **Upload to shortlinks**
   - Click "Upload & Criar Shortlink"
   - Verify: duration validated, upload successful
   - Should see shortlink in list

5. **View shortlink**
   - Click "Assistir"
   - Player should open fullscreen (9:16)
   - Close and verify view counter increased

6. **Wait for cron job** (or test manually)
   - Manually call: `POST /functions/v1/calculate-shortlink-rewards`
   - Check user_credits table:
     ```sql
     SELECT * FROM user_credits WHERE user_id = 'test_user_id';
     ```
   - Should see: balance increased by 5

7. **Create debt scenario** (optional)
   - Manually set: `UPDATE user_credits SET debt = 50 WHERE user_id = '...';`
   - Verify: Dashboard shows debt warning
   - Run rewards again: debt should decrease

---

### ✅ Step 7: Verify in Database

```sql
-- Check shortlinks table
SELECT COUNT(*) FROM shortlinks;

-- Check daily rewards
SELECT * FROM daily_shortlink_rewards ORDER BY created_at DESC LIMIT 10;

-- Check views
SELECT * FROM shortlink_views ORDER BY created_at DESC LIMIT 10;

-- Check user credits
SELECT user_id, balance, debt FROM user_credits LIMIT 10;
```

---

### 🚀 Monitoring & Maintenance

#### Monitor Daily Rewards
```sql
-- Check if rewards were calculated today
SELECT COUNT(*) as rewards_today 
FROM daily_shortlink_rewards 
WHERE DATE(created_at) = CURRENT_DATE;

-- Check for errors
SELECT * FROM shortlink_views 
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

#### Debugging Edge Functions
```bash
# View function logs
supabase functions list --verbose

# Test with verbose output
supabase functions invoke shortlinks --headers "x-action: list" --verbose
```

#### Check Storage
```bash
# List uploaded videos
supabase storage ls shortlinks

# Check file size
supabase storage info shortlinks
```

---

### ⚠️ Troubleshooting

#### Issue: "shortlink_limit_reached"
```
✓ User already has 10 active shortlinks
✓ Solution: Archive some to create new ones
```

#### Issue: Video won't upload
```
✓ Check file size < 50MB
✓ Check MIME type is video/*
✓ Check Supabase Storage bucket is public
✓ Check RLS policies allow authenticated write
```

#### Issue: Rewards not calculating
```
✓ Check cron job runs at correct time
✓ Verify SERVICE_ROLE_KEY is correct
✓ Check if shortlinks exist (need at least 1)
✓ View function logs for errors
```

#### Issue: Duration validation fails
```
✓ Ensure video is between 5-7 seconds
✓ Check browser can detect video metadata
✓ Try with different video format
```

---

### 📊 Database Schema Summary

```sql
-- Main tables
shortlinks(id, user_id, title, description, video_url, video_duration_seconds, status, view_count, created_at)
daily_shortlink_rewards(id, user_id, reward_date, base_reward, bonus_reward, total_reward, applied_at)
shortlink_views(id, shortlink_id, ip_address, user_agent, created_at)

-- Related tables (pre-existing)
user_credits(user_id, balance, debt, updated_at)
auth.users(id, email, created_at)
```

---

### ✨ Success Checklist

- [ ] Migrations applied successfully
- [ ] Edge functions deployed
- [ ] Edge functions respond to POST requests
- [ ] Storage bucket created with correct policies
- [ ] Cron job scheduled
- [ ] Test user created and can upload video
- [ ] Rewards calculated correctly
- [ ] View counter works
- [ ] Debt warning displays in UI
- [ ] Daily rewards appear in database

---

### 🎉 You're Live!

Once all steps are complete:
1. Users can upload shortlinks at `/shortlinks`
2. System tracks views and calculates daily rewards
3. Cron job runs automatically at midnight
4. Debts are deducted from earnings

**Celebrate! 🚀**
