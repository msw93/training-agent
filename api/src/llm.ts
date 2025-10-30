import dotenv from 'dotenv';
dotenv.config();

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

export interface LlmPlanner {
  generateWeekPlan(input: LlmPlanInput): Promise<LlmPlanOutputItem[]>;
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
      items.push(mk(4, 7, 90, 'Run — Long (90m)', 'Duration: 90 min\nTargets: Z2 steady\nIntervals: 1x90m\nNotes: Vegan fueling: dates\nTSS: 80, kcal: 900'));
    } else {
      items.push(mk(2, 7, 60, 'Run — Tempo (60m)', 'Duration: 60 min\nTargets: Z3 tempo\nIntervals: 2x20m tempo\nNotes: Vegan fueling: dates\nTSS: 70, kcal: 700'));
    }
    if (preferLongRideSat) {
      items.push(mk(5, 8, 150, 'Bike — Endurance (150m)', 'Duration: 150 min\nTargets: Z2 endurance\nIntervals: 1x150m\nNotes: Vegan fueling: dates\nTSS: 120, kcal: 1500'));
    } else {
      items.push(mk(3, 8, 90, 'Bike — Sweet Spot (90m)', 'Duration: 90 min\nTargets: 3x15m @90% FTP\nIntervals: 3x15m @90% FTP\nNotes: Vegan fueling: dates\nTSS: 85, kcal: 900'));
    }
    items.push(mk(6, 8, 45, 'Swim — Endurance (45m)', 'Duration: 45 min\nTargets: steady aerobic\nIntervals: 3x10m swim / 5m pull\nNotes: Vegan fueling: dates\nTSS: 45, kcal: 400'));
    return items;
  }
}

export function makePlanner(): LlmPlanner {
  const openaiKey = process.env.OPENAI_API_KEY;
  // Placeholder: in future, return an OpenAI-based planner if key present
  // For now, always use the rule-based fallback to avoid external calls.
  return new RuleBasedPlanner();
}


