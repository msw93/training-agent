import dotenv from 'dotenv';
dotenv.config();
import OpenAI from 'openai';

// Provider-agnostic interface
export interface LlmPlanInput {
  prompt: string;
  // future: preferences, targets, commute days, etc.
}

export interface LlmPlanOutputItem {
  title_short: string;
  start_local: string;
  end_local: string;
  description: string;
}

export interface LlmPlanInput {
  prompt: string;
  // future: preferences, targets, commute days, etc.
}

export interface LlmModifyInput {
  instruction: string;
  existingEvents: Array<{
    event_id: string;
    title_short: string;
    start_local: string;
    end_local: string;
    description?: string;
  }>;
}

export interface LlmModifyOutputItem {
  action: 'update' | 'delete' | 'create';
  event_id?: string; // Required for update/delete
  title_short?: string;
  start_local?: string;
  end_local?: string;
  description?: string;
  reason?: string; // Why this modification was made
}

export interface LlmPlanner {
  generateWeekPlan(input: LlmPlanInput): Promise<LlmPlanOutputItem[]>;
  modifyWeekPlan(input: LlmModifyInput): Promise<LlmModifyOutputItem[]>;
}

// Simple rule-based fallback planner (no external API), used if no key present
class RuleBasedPlanner implements LlmPlanner {
  async generateWeekPlan(input: LlmPlanInput): Promise<LlmPlanOutputItem[]> {
    // Very simple heuristic mapping based on keywords in the prompt
    const base = new Date();
    const next = new Date(base);
    next.setDate(base.getDate() + ((8 - base.getDay()) % 7 || 7)); // next Mon 06:00
    next.setHours(6, 0, 0, 0);

    const mk = (dOffset: number, hour: number, min: number, title: string, desc: string) => {
      const s = new Date(next);
      s.setDate(next.getDate() + dOffset);
      s.setHours(hour, 0, 0, 0);
      const e = new Date(s.getTime() + min * 60 * 1000);
      return {
        title_short: title,
        start_local: s.toISOString(),
        end_local: e.toISOString(),
        description: desc
      };
    };

    const p = input.prompt.toLowerCase();
    const preferLongRideSat = p.includes('long ride saturday');
    const preferLongRunFri = p.includes('long run friday');

    const items: LlmPlanOutputItem[] = [];
    if (preferLongRunFri) {
      items.push(mk(4, 7, 90, 'Run — Long (90m)', 'Duration: 90 min\nDistance: 15 km\nTime: 90 min\nTargets: Z2 steady\nIntervals: 1x90m\nNotes: Vegan fueling: dates\nTSS: 80\nkcal: 900'));
    } else {
      items.push(mk(2, 7, 60, 'Run — Tempo (60m)', 'Duration: 60 min\nDistance: 10 km\nTime: 60 min\nTargets: Z3 tempo\nIntervals: 2x20m tempo\nNotes: Vegan fueling: dates\nTSS: 70\nkcal: 700'));
    }
    if (preferLongRideSat) {
      items.push(mk(5, 8, 150, 'Bike — Endurance (150m)', 'Duration: 150 min\nDistance: 60 km\nTime: 150 min\nTargets: Z2 endurance\nIntervals: 1x150m\nNotes: Vegan fueling: dates\nTSS: 120\nkcal: 1500'));
    } else {
      items.push(mk(3, 8, 90, 'Bike — Sweet Spot (90m)', 'Duration: 90 min\nDistance: 35 km\nTime: 90 min\nTargets: 3x15m @90% FTP\nIntervals: 3x15m @90% FTP\nNotes: Vegan fueling: dates\nTSS: 85\nkcal: 900'));
    }
    items.push(mk(6, 8, 45, 'Swim — Endurance (45m)', 'Duration: 45 min\nDistance: 1500 m\nTime: 45 min\nTargets: steady aerobic\nIntervals: 3x10m swim / 5m pull\nNotes: Vegan fueling: dates\nTSS: 45\nkcal: 400'));
    return items;
  }

  async modifyWeekPlan(input: LlmModifyInput): Promise<LlmModifyOutputItem[]> {
    // Rule-based fallback for modifications: very basic, just return empty array
    // Real implementation should use LLM
    console.warn('[RuleBasedPlanner] ModifyWeekPlan called but rule-based planner does not support modifications');
    return [];
  }
}

export function makePlanner(): LlmPlanner {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    class OpenAIPlanner implements LlmPlanner {
      private client: OpenAI;
      private debug: boolean;
      constructor(apiKey: string) {
        this.client = new OpenAI({ apiKey });
        this.debug = process.env.LLM_DEBUG === '1';
      }
      async generateWeekPlan(input: LlmPlanInput): Promise<LlmPlanOutputItem[]> {
        // Calculate next week's Monday for context
        const now = new Date();
        const nextMonday = new Date(now);
        nextMonday.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
        nextMonday.setHours(6, 0, 0, 0);
        const nextMondayIso = nextMonday.toISOString();
        const currentDate = now.toISOString().split('T')[0];
        const nextMondayDate = nextMonday.toISOString().split('T')[0];
        
        const system = `You are a training planner. Output strict JSON only: an array of items with keys title_short, start_local (ISO string), end_local (ISO string), description (multi-line string).

CRITICAL: The description field MUST contain ALL of these fields in this exact format:
- Duration: X min (where X is the duration in minutes)
- Distance: X km (for bike/run) or X m (for swim)
- Time: X min (same as duration, in minutes)
- Targets: Description of workout targets (e.g., "Z2 steady", "Z3 tempo")
- Intervals: Description of intervals (e.g., "1x90m", "3x15m @90% FTP")
- Notes: Additional notes (e.g., "Vegan fueling: dates")
- TSS: Numeric TSS value (e.g., "80")
- kcal: Numeric calorie estimate (e.g., "900")

EXAMPLE DESCRIPTION FORMAT:
Duration: 60 min
Distance: 10 km
Time: 60 min
Targets: Z3 tempo
Intervals: 2x20m tempo
Notes: Vegan fueling: dates
TSS: 70
kcal: 700

Do not include Markdown or commentary. Use CURRENT dates in ${currentDate} or later - never use past years like 2023.`;
        // Parse workout count from prompt
        const extractWorkoutCount = (prompt: string): number | null => {
          const lower = prompt.toLowerCase();
          // Look for patterns like "9 workouts", "9 sessions", "3 swims, 3 runs, 3 rides"
          const exactMatch = lower.match(/(\d+)\s*(workouts?|sessions?)/);
          if (exactMatch) {
            return parseInt(exactMatch[1], 10);
          }
          // Look for sport-specific counts
          const swimMatch = lower.match(/(\d+)\s*swims?/);
          const runMatch = lower.match(/(\d+)\s*runs?/);
          const rideMatch = lower.match(/(\d+)\s*(rides?|bikes?)/);
          if (swimMatch && runMatch && rideMatch) {
            return parseInt(swimMatch[1], 10) + parseInt(runMatch[1], 10) + parseInt(rideMatch[1], 10);
          }
          return null;
        };
        
        const requestedCount = extractWorkoutCount(input.prompt);
        console.log('[LLM Prompt] Extracted requested workout count:', requestedCount ?? 'none specified');
        const countInstruction = requestedCount 
          ? `\n\nCRITICAL: You MUST return EXACTLY ${requestedCount} workouts. Not ${requestedCount - 1}, not ${requestedCount + 1}, but EXACTLY ${requestedCount} workouts. Count them carefully before returning the JSON.`
          : '';
        if (requestedCount !== null) {
          console.log(`[LLM Prompt] Added strict count enforcement to prompt for ${requestedCount} workouts`);
        } else {
          console.log('[LLM Prompt] No explicit workout count found in prompt');
        }
        
        const user = `Today is ${currentDate}. Plan next week starting from ${nextMondayDate} given this prompt: "${input.prompt}". Use America/Toronto timezone (UTC-4 or UTC-5 depending on DST). All dates must be in ${now.getFullYear()} or later.${countInstruction} 

CRITICAL TIME SLOT REQUIREMENTS:

MONDAY TO FRIDAY (Weekdays):
- Morning workouts: MUST be between 6:30 AM and 9:30 AM (strict requirement for morning slots)
  * MANDATORY START TIME: 7:00 AM or later - DO NOT use 6:30 AM
  * FORBIDDEN: Do NOT schedule workouts at 6:30 AM unless user explicitly requests "6:30 AM", "before 7 AM", or "early morning"
  * REQUIRED START TIMES: Only use 7:00 AM, 7:30 AM, 8:00 AM, 8:30 AM, or 9:00 AM
  * If user says "morning workouts" without time, ALWAYS start at 7:00 AM or later
  * This is a STRICT rule - violating it will cause the workout to be rejected
- Evening workouts: Can be scheduled at 6:00 PM (18:00) or later
- DO NOT schedule workouts between 9:30 AM - 6:00 PM on weekdays (this is work hours)
- Weekday workouts must be EITHER morning (6:30-9:30 AM) OR evening (6:00 PM+)
- DISTRIBUTE workouts: Vary start times (e.g., 7:00 AM, 7:30 AM, 8:00 AM, 8:30 AM) to avoid conflicts

WEEKENDS (Saturday and Sunday):
- ANY time on weekends is acceptable
- REQUIRED START TIME: 7:00 AM or later for weekend workouts
  * DO NOT use 6:30 AM for weekend workouts unless user explicitly requests it
  * Exception: Long rides (4+ hours) may start earlier if needed to fit in morning window
  * DEFAULT: Use 7:00 AM, 7:30 AM, or 8:00 AM for weekend morning workouts
- Afternoon and evening workouts are allowed but mornings are preferred

MANDATORY TRAINING BASELINE:
- Total: 12 hours per week
- RUNNING: 3 hours total
  * Long Run: 2 hours (BIAS STRONGLY for Saturday morning 7:00-9:30 AM, may use 6:30 AM only if user requests)
  * Regular Runs: 2 runs × 1 hour each = 2 hours
- SWIMMING: 3 hours total
  * 3 swims × 1 hour each = 3 hours
- BIKING: 6 hours total
  * Long Ride: 4 hours (BIAS STRONGLY for Sunday morning, can start earlier if needed)
  * Regular Rides: 2 rides × 1 hour each = 2 hours
- All regular workouts (except long run/ride): 1 hour duration
- Long run: 2 hours duration
- Long ride: 4 hours duration

STRICT WORKOUT DISTRIBUTION RULES:

1. WEEKEND WORKOUTS (Saturday & Sunday):
   - CRITICAL BIAS: Saturday and Sunday should ALMOST ALWAYS have only ONE workout per day
   - Saturday: LONG RUN (2 hours, strongly preferred morning 7:00-9:30 AM, may start earlier if user specifies)
   - Sunday: LONG RIDE (4 hours, strongly preferred morning 7:00 AM or earlier if needed to avoid conflicts)
   - DO NOT schedule multiple workouts on Saturday or Sunday unless absolutely necessary for count requirements
   - These are recovery/focus days - keep them simple with just the long workout

2. WEEKDAY MORNINGS (Monday-Thursday):
   - Monday, Tuesday, Wednesday, Thursday can have TWO workouts per day
   - BIAS: Prefer pairing swim and run on the same day (morning + evening)
   - Distribute morning workouts across weekdays (Mon-Thu)
   - Vary between bike and swim mornings
   - NOT every weekday needs a morning workout - distribute based on total workout count
   - Prioritize swim and bike workouts in morning slots

3. WEEKDAY ORDERING (Monday-Thursday):
   - When scheduling TWO workouts on the same day (Monday-Thursday):
     * LONG workout must ALWAYS come BEFORE the shorter workout
     * Example: Long run in morning → swim in evening (NOT swim → long run)
     * Example: Long ride in morning → run in evening (if needed)
   - If both workouts are the same duration, order doesn't matter, but prefer swim before run

4. EVENING WORKOUTS (Weekdays 6:00 PM+):
   - Fill remaining workouts in evenings as needed
   - Running and Swimming CAN be on same day (Monday-Thursday preferred)
   - Biking days should be ISOLATED - don't mix biking with running/swimming on the same day

5. WORKOUT PATTERNS:
   - Weekend days (Saturday/Sunday): ONE workout only (long run or long ride)
   - Weekday days (Monday-Thursday): Can have TWO workouts (prefer swim + run pairing)
   - Biking days: ISOLATED (no other sports on same day)
   - Running/Swimming: Can be on same day (Monday-Thursday preferred)

EXAMPLE WEEK STRUCTURE FOR 9 WORKOUTS (with 7:00 AM start bias):
- Monday: Morning swim (1h) at 7:00 AM → Evening run (1h) at 6:00 PM
- Tuesday: Morning bike (1h) at 7:30 AM
- Wednesday: Morning swim (1h) at 8:00 AM → Evening run (1h) at 6:00 PM
- Thursday: Morning bike (1h) at 7:00 AM
- Friday: Morning swim (1h) at 7:30 AM
- Saturday: Long run (2h) at 7:00 AM (ONLY workout - no other workouts on Saturday)
- Sunday: Long ride (4h) at 7:00 AM (ONLY workout - no other workouts on Sunday)
= 9 total workouts (3 swims, 3 runs including long run, 3 rides including long ride)

NOTE: Saturday and Sunday each have only ONE workout. Monday and Wednesday have TWO workouts (swim + run pairing).

NOTE: Distribution should match the EXACT count requested. If 9 workouts are requested, generate exactly 9, not 10.

CRITICAL SPACING RULES:
- NEVER overlap events - each event must have clear start and end times
- ALWAYS maintain a gap between events (minimum 30 minutes recommended)
- Back-to-back events are FORBIDDEN with ONE exception: Brick workouts (bike immediately followed by run)
- Brick workouts: Bike → Run is the ONLY allowed back-to-back combination
- All other event combinations MUST have gaps:
  * Swim → anything: requires gap
  * Run → anything: requires gap (except after bike for bricks)
  * Bike → Run: OK (brick workout, no gap needed)
  * Bike → Swim: requires gap
  * Bike → Bike: requires gap
  * Run → Run: requires gap
  * Swim → Swim: requires gap
- When scheduling same-day workouts (Monday-Friday, morning + evening), ensure at least 30-60 minute gap between end of first and start of second
- LONG workouts should be scheduled FIRST when there are two workouts on the same day (e.g., long run in morning, swim in evening - NOT swim then long run)

REQUIRED DESCRIPTION FORMAT (MUST INCLUDE ALL FIELDS):
Every workout description MUST follow this exact format with all 8 fields:
Duration: X min
Distance: X km (bike/run) or X m (swim)
Time: X min
Targets: [workout target description]
Intervals: [interval description]
Notes: [additional notes]
TSS: [numeric value]
kcal: [numeric value]

EXAMPLES:
- Regular bike (1h): Duration: 60 min | Distance: 35 km | Time: 60 min | Targets: 3x15m @90% FTP | Intervals: 3x15m @90% FTP | Notes: Vegan fueling: dates | TSS: 85 | kcal: 900
- Long run (2h): Duration: 120 min | Distance: 20 km | Time: 120 min | Targets: Z2 steady | Intervals: 1x120m | Notes: Vegan fueling: dates | TSS: 150 | kcal: 1400
- Long ride (4h): Duration: 240 min | Distance: 120 km | Time: 240 min | Targets: Z2 endurance | Intervals: 1x240m | Notes: Vegan fueling: dates | TSS: 200 | kcal: 2400
- Swim (1h): Duration: 60 min | Distance: 2500 m | Time: 60 min | Targets: steady aerobic | Intervals: 3x15m swim / 5m pull | Notes: Vegan fueling: dates | TSS: 50 | kcal: 500

Start planning from next Monday ${nextMondayDate}. Every workout MUST have a complete description with ALL 8 required fields (Duration, Distance, Time, Targets, Intervals, Notes, TSS, kcal) in the format shown above.

${requestedCount ? `IMPORTANT: Return EXACTLY ${requestedCount} workout items in your JSON array. Verify the count before finalizing your response.` : ''}`;
        const reqPayload: any = {
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          response_format: { type: 'json_object' as any }
        };
        console.log('[LLM Prompt] Request payload prepared:', {
          model: reqPayload.model,
          messagesCount: reqPayload.messages.length,
          hasCountInstruction: Boolean(countInstruction)
        });
        let resp: any;
        try {
          const request = this.client.chat.completions.create(reqPayload);
          resp = await Promise.race([
            request,
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('LLM timeout')), Number(process.env.LLM_TIMEOUT_MS || 10000)))
          ]);
        } catch (err: any) {
          if (this.debug) console.error('[LLM] Error from OpenAI (first attempt):', err?.message || err);
          // Retry once without response_format in case model doesn't support it
          const retryPayload: any = { ...reqPayload };
          delete retryPayload.response_format;
          try {
            const request2 = this.client.chat.completions.create(retryPayload);
            resp = await Promise.race([
              request2,
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error('LLM timeout')), Number(process.env.LLM_TIMEOUT_MS || 10000)))
            ]);
          } catch (err2: any) {
            if (this.debug) console.error('[LLM] Error from OpenAI (retry):', err2?.message || err2);
            throw err2;
          }
        }
        const content = resp?.choices?.[0]?.message?.content || '[]';
        const preview = typeof content === 'string' ? content.slice(0, 500) : String(content).slice(0, 500);
        console.log('[LLM Response] Raw content preview (truncated to 500 chars):', preview);
        let parsed: any = [];
        try {
          // Some models wrap in an object; accept both array or various object keys
          const obj = JSON.parse(content);
          parsed = Array.isArray(obj) ? obj : (obj.items || obj.plan || obj.training_plan || obj.workouts || obj.events || []);
          console.log('[LLM Response] Parsed items count:', parsed.length);
        } catch (parseErr: any) {
          console.error('[LLM Response] JSON parse error:', parseErr?.message);
          // Fallback to empty; outer caller will validate
          parsed = [];
        }
        // Fix dates: replace 2023 with current year, and correct any past dates
        const currentYear = now.getFullYear();
        const currentYearStr = String(currentYear);
        const fixDate = (dateStr: string): string => {
          // Replace 2023 with current year
          let fixed = dateStr.replace(/2023-/g, `${currentYearStr}-`);
          // If still in the past or year < current year, update to current year
          const dateMatch = fixed.match(/(\d{4})-(\d{2})-(\d{2})/);
          if (dateMatch) {
            const year = parseInt(dateMatch[1], 10);
            if (year < currentYear) {
              fixed = fixed.replace(/\d{4}-/, `${currentYearStr}-`);
            }
          }
          return fixed;
        };
        
        // Basic shape enforcement and date correction
        const items: LlmPlanOutputItem[] = (parsed || []).map((it: any, idx: number) => {
          const item = {
            title_short: String(it.title_short || ''),
            start_local: fixDate(String(it.start_local || '')),
            end_local: fixDate(String(it.end_local || '')),
            description: String(it.description || '')
          };
          console.log(`[LLM Response] Item ${idx}: ${item.title_short} | ${item.start_local} → ${item.end_local} | desc length: ${item.description.length}`);
          return item;
        }).filter((i: LlmPlanOutputItem) => {
          const valid = i.title_short && i.start_local && i.end_local && i.description;
          if (!valid) {
            console.warn('[LLM Response] Filtered out invalid item (missing required fields):', i);
          }
          return valid;
        });
        console.log('[LLM Response] Final items count after filtering:', items.length);
        
        // If model produced nothing, fallback to rule-based
        if (!items.length) {
          console.warn('[LLM Response] No valid items produced by OpenAI response, falling back to rule-based planner');
          const fallback = new RuleBasedPlanner();
          return await fallback.generateWeekPlan(input);
        }
        return items;
      }

      async modifyWeekPlan(input: LlmModifyInput): Promise<LlmModifyOutputItem[]> {
        console.log('[LLM Modify] Starting modification request');
        console.log('[LLM Modify] Instruction:', input.instruction);
        console.log('[LLM Modify] Existing events count:', input.existingEvents.length);
        
        const now = new Date();
        const currentDate = now.toISOString().split('T')[0];
        const currentYear = now.getFullYear();
        
        // Format existing events for prompt
        const eventsContext = input.existingEvents.map((ev, idx) => {
          const startDate = new Date(ev.start_local);
          const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][startDate.getDay()];
          return `${idx + 1}. ${ev.title_short} - ${dayName} ${startDate.toLocaleDateString()} at ${startDate.toLocaleTimeString()} (ID: ${ev.event_id})`;
        }).join('\n');

        const system = `You are a training plan modification assistant. You interpret natural language instructions to modify existing workout schedules. Output strict JSON only: an array of modification actions. Each action must have: action ("update", "delete", or "create"), event_id (required for update/delete), and the fields to change. Use CURRENT dates in ${currentDate} or later.`;
        
        const user = `Today is ${currentDate}. You have the following scheduled workouts:

${eventsContext}

User instruction: "${input.instruction}"

Interpret this instruction and return a JSON array of modifications. Each item should have:
- action: "update" | "delete" | "create"
- event_id: (required for update/delete, the ID from the list above)
- title_short: (optional, for update/create)
- start_local: (optional ISO string, for update/create)
- end_local: (optional ISO string, for update/create)
- description: (optional, for update/create)
- reason: (optional, brief explanation of the change)

EXAMPLES:
- "Move Monday's swim to Tuesday morning" → [{"action": "update", "event_id": "...", "start_local": "2025-XX-XXT07:00:00-05:00", "reason": "Moved from Monday to Tuesday morning"}]
- "Cancel Friday's workout" → [{"action": "delete", "event_id": "...", "reason": "User requested cancellation"}]
- "Change Thursday's bike to a run" → [{"action": "update", "event_id": "...", "title_short": "Run - ...", "description": "...", "reason": "Changed from bike to run"}]
- "Reschedule all workouts 1 hour earlier" → Multiple update actions, each with adjusted start_local/end_local

CRITICAL RULES:
- For updates: Include ONLY the fields that are changing (event_id is always required)
- For time changes: Maintain duration unless user specifies otherwise
- For morning workouts: Prefer 7:00 AM or later start times
- All new/updated times must respect: weekdays 6:30-9:30 AM or 6 PM+, weekends any time
- For deletions: Only include event_id and reason
- Do NOT create new workouts unless explicitly requested in the instruction

Return the modifications as a JSON array:`;

        const reqPayload: any = {
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          response_format: { type: 'json_object' as any }
        };

        console.log('[LLM Modify] Request payload prepared:', {
          model: reqPayload.model,
          existingEventsCount: input.existingEvents.length,
          instructionLength: input.instruction.length
        });

        let resp: any;
        try {
          const request = this.client.chat.completions.create(reqPayload);
          resp = await Promise.race([
            request,
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('LLM timeout')), Number(process.env.LLM_TIMEOUT_MS || 10000)))
          ]);
        } catch (err: any) {
          console.error('[LLM Modify] Error from OpenAI:', err?.message || err);
          const retryPayload: any = { ...reqPayload };
          delete retryPayload.response_format;
          try {
            const request2 = this.client.chat.completions.create(retryPayload);
            resp = await Promise.race([
              request2,
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error('LLM timeout')), Number(process.env.LLM_TIMEOUT_MS || 10000)))
            ]);
          } catch (err2: any) {
            console.error('[LLM Modify] Error from OpenAI (retry):', err2?.message || err2);
            throw err2;
          }
        }

        const content = resp?.choices?.[0]?.message?.content || '[]';
        const preview = typeof content === 'string' ? content.slice(0, 500) : String(content).slice(0, 500);
        console.log('[LLM Modify] Raw content preview (truncated to 500 chars):', preview);

        let parsed: any = [];
        try {
          const obj = JSON.parse(content);
          parsed = Array.isArray(obj) ? obj : (obj.modifications || obj.changes || obj.items || []);
          console.log('[LLM Modify] Parsed modifications count:', parsed.length);
        } catch (parseErr: any) {
          console.error('[LLM Modify] JSON parse error:', parseErr?.message);
          return [];
        }

        // Validate and format modifications
        const modifications: LlmModifyOutputItem[] = [];
        for (const mod of parsed) {
          if (!mod.action || !['update', 'delete', 'create'].includes(mod.action)) {
            console.warn('[LLM Modify] Invalid action in modification:', mod);
            continue;
          }

          if ((mod.action === 'update' || mod.action === 'delete') && !mod.event_id) {
            console.warn('[LLM Modify] Missing event_id for update/delete:', mod);
            continue;
          }

          // Fix dates if needed
          const fixDate = (dateStr?: string): string | undefined => {
            if (!dateStr) return undefined;
            let fixed = dateStr.replace(/2023-/g, `${currentYear}-`);
            const dateMatch = fixed.match(/(\d{4})-(\d{2})-(\d{2})/);
            if (dateMatch) {
              const year = parseInt(dateMatch[1], 10);
              if (year < currentYear) {
                fixed = fixed.replace(/\d{4}-/, `${currentYear}-`);
              }
            }
            return fixed;
          };

          modifications.push({
            action: mod.action,
            event_id: mod.event_id,
            title_short: mod.title_short,
            start_local: fixDate(mod.start_local),
            end_local: fixDate(mod.end_local),
            description: mod.description,
            reason: mod.reason
          });

          console.log('[LLM Modify] Processed modification:', {
            action: mod.action,
            event_id: mod.event_id,
            hasTimeChange: !!(mod.start_local || mod.end_local),
            reason: mod.reason
          });
        }

        console.log('[LLM Modify] Final modifications count:', modifications.length);
        return modifications;
      }
    }
    return new OpenAIPlanner(openaiKey);
  }
  return new RuleBasedPlanner();
}


