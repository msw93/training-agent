import dotenv from 'dotenv';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

dotenv.config();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
export const TRAINING_CALENDAR_ID = process.env.TRAINING_CALENDAR_ID;
export const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || 'America/Toronto';

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  throw new Error('Google API credentials missing. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in your .env file.');
}

let TEMP_TOKEN_STORE: any = {};

// Simple token persistence to local file for dev
import fs from 'fs';
import path from 'path';
const TOKENS_PATH = path.join(process.cwd(), 'tokens.json');

function loadTokensFromDisk() {
  try {
    if (fs.existsSync(TOKENS_PATH)) {
      const raw = fs.readFileSync(TOKENS_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        TEMP_TOKEN_STORE.tokens = parsed;
      }
    }
  } catch (_e) {
    // ignore
  }
}

function saveTokensToDisk(tokens: any) {
  try {
    fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2), 'utf8');
  } catch (_e) {
    // ignore
  }
}

export function getOAuth2Client() {
  return new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export function getAuthUrl() {
  const oauth2Client = getOAuth2Client();
  const scopes = ['https://www.googleapis.com/auth/calendar'];
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  });
}

export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  // Save tokens to memory (for single-user dev)
  TEMP_TOKEN_STORE.tokens = tokens;
  saveTokensToDisk(tokens);
  return tokens;
}

export function getUserCalendarClient() {
  const oauth2Client = getOAuth2Client();
  if (!TEMP_TOKEN_STORE.tokens) throw new Error('No tokens in memory. Authenticate first!');
  oauth2Client.setCredentials(TEMP_TOKEN_STORE.tokens);
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

export function tokensExist() {
  if (!TEMP_TOKEN_STORE.tokens) loadTokensFromDisk();
  return !!TEMP_TOKEN_STORE.tokens;
}

export async function createEventOnTrainingCalendar(event: {
  summary: string;
  description: string;
  startIso: string;
  endIso: string;
}) {
  if (!TRAINING_CALENDAR_ID) throw new Error('TRAINING_CALENDAR_ID not set');
  const calendar = getUserCalendarClient();
  const response = await calendar.events.insert({
    calendarId: TRAINING_CALENDAR_ID,
    requestBody: {
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.startIso, timeZone: DEFAULT_TIMEZONE },
      end: { dateTime: event.endIso, timeZone: DEFAULT_TIMEZONE }
    }
  });
  return response.data;
}

export async function updateEventOnTrainingCalendar(eventId: string, updates: Partial<{ summary: string; description: string; startIso: string; endIso: string; }>) {
  if (!TRAINING_CALENDAR_ID) throw new Error('TRAINING_CALENDAR_ID not set');
  const calendar = getUserCalendarClient();
  const getResp = await calendar.events.get({ calendarId: TRAINING_CALENDAR_ID, eventId });
  const body = getResp.data;
  if (!body) throw new Error('Event not found');
  if (updates.summary) body.summary = updates.summary;
  if (updates.description) body.description = updates.description;
  if (updates.startIso) body.start = { dateTime: updates.startIso, timeZone: DEFAULT_TIMEZONE };
  if (updates.endIso) body.end = { dateTime: updates.endIso, timeZone: DEFAULT_TIMEZONE };
  const updateResp = await calendar.events.update({ calendarId: TRAINING_CALENDAR_ID, eventId, requestBody: body });
  return updateResp.data;
}

export async function deleteEventFromTrainingCalendar(eventId: string) {
  if (!TRAINING_CALENDAR_ID) throw new Error('TRAINING_CALENDAR_ID not set');
  const calendar = getUserCalendarClient();
  await calendar.events.delete({ calendarId: TRAINING_CALENDAR_ID, eventId });
  return { ok: true };
}

export async function listTrainingCalendarEvents(params?: { timeMinIso?: string; timeMaxIso?: string; q?: string; maxResults?: number }) {
  if (!TRAINING_CALENDAR_ID) throw new Error('TRAINING_CALENDAR_ID not set');
  const calendar = getUserCalendarClient();
  
  const allEvents: any[] = [];
  let pageToken: string | undefined = undefined;
  const maxResults = params?.maxResults || 20;
  
  // If no timeMin provided, default to 30 days ago to include past events
  let timeMin = params?.timeMinIso;
  if (!timeMin) {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 30);
    timeMin = pastDate.toISOString();
  }
  
  do {
    const requestParams: any = {
      calendarId: TRAINING_CALENDAR_ID,
      timeMin: timeMin,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250, // Google Calendar max per page
      pageToken: pageToken
    };
    
    if (params?.timeMaxIso) {
      requestParams.timeMax = params.timeMaxIso;
    }
    if (params?.q) {
      requestParams.q = params.q;
    }
    
    const resp = await calendar.events.list(requestParams);
    
    const items = resp.data.items || [];
    console.log(`[listTrainingCalendarEvents] Page ${pageToken ? 'next' : 'first'}: received ${items.length} events, total so far: ${allEvents.length + items.length}`);
    allEvents.push(...items);
    
    // Check if there are more pages
    pageToken = resp.data.nextPageToken || undefined;
    console.log(`[listTrainingCalendarEvents] Has next page: ${!!pageToken}, collected: ${allEvents.length}, target: ${maxResults}`);
    
    // Stop if we've collected enough or no more pages
    if (allEvents.length >= maxResults || !pageToken) break;
  } while (pageToken);
  
  const finalEvents = allEvents.slice(0, maxResults);
  console.log(`[listTrainingCalendarEvents] Returning ${finalEvents.length} events (requested ${maxResults})`);
  console.log(`[listTrainingCalendarEvents] Full events array:`, JSON.stringify(finalEvents.map((e: any) => ({
    id: e.id,
    summary: e.summary,
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    created: e.created,
    updated: e.updated,
    status: e.status
  })), null, 2));
  
  return finalEvents;
}

export async function fetchPrimaryBusy(timeMinIso: string, timeMaxIso: string) {
  const authCalendar = getUserCalendarClient();
  const resp = await authCalendar.freebusy.query({
    requestBody: {
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
      items: [{ id: 'primary' }]
    }
  });
  const calendars = resp.data.calendars || {} as any;
  const primary = calendars['primary'];
  return (primary?.busy || []) as Array<{ start: string; end: string }>;
}

export async function fetchPrimaryEvents(timeMinIso: string, timeMaxIso: string) {
  const calendar = getUserCalendarClient();
  const resp = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMinIso,
    timeMax: timeMaxIso,
    singleEvents: true,
    orderBy: 'startTime'
  });
  return resp.data.items || [];
}

export async function fetchTrainingEvent(eventId: string) {
  if (!TRAINING_CALENDAR_ID) throw new Error('TRAINING_CALENDAR_ID not set');
  const calendar = getUserCalendarClient();
  const resp = await calendar.events.get({ calendarId: TRAINING_CALENDAR_ID, eventId });
  return resp.data;
}
