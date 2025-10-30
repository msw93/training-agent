import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import {
  createTrainingEvent,
  updateTrainingEvent,
  deleteTrainingEvent,
  listPrimaryBusy,
  listTrainingEvents
} from './routes';
import { getAuthUrl, exchangeCodeForTokens, tokensExist, getUserCalendarClient } from './google';
import {
  listProposals,
  proposeCreate,
  proposeUpdate,
  proposeDelete,
  approveProposal,
  rejectProposal
} from './approvals';
import { planWeek } from './plan';

dotenv.config();

const app = express();
const port = process.env.PORT || 4100;

app.use(cors());
app.use(bodyParser.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Core endpoints
app.post('/api/calendar/create_training_event', createTrainingEvent);
app.post('/api/calendar/update_training_event', updateTrainingEvent);
app.post('/api/calendar/delete_training_event', deleteTrainingEvent);
app.get('/api/calendar/list_primary_busy', listPrimaryBusy);
app.get('/api/calendar/list_training_events', listTrainingEvents);

// Google OAuth: Step 1
app.get('/api/calendar/connect', (req, res) => {
  try {
    const url = getAuthUrl();
    res.redirect(url);
  } catch (e) {
    res.status(500).send('OAuth URL generation failed: ' + (e as any).message);
  }
});

// Google OAuth: Step 2
app.get('/api/calendar/oauth2callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');
  try {
    await exchangeCodeForTokens(code as string);
    res.send('Google Authenticated! You can close this tab.');
  } catch (e) {
    res.status(500).send('OAuth failed: ' + (e as any).message);
  }
});

// Check auth status
app.get('/api/calendar/auth_status', (req, res) => {
  res.json({ authenticated: tokensExist() });
});

// Simple test endpoint to list user calendars
app.get('/api/calendar/test_gcal', async (req, res) => {
  if (!tokensExist()) return res.status(401).send('Not authenticated. Go to /api/calendar/connect first.');
  try {
    const calendar = getUserCalendarClient();
    const result = await calendar.calendarList.list();
    res.json(result.data);
  } catch (e) {
    res.status(500).send('Failed to list calendars: ' + (e as any).message);
  }
});

// Approvals & Diff endpoints
app.get('/api/approvals/list', listProposals);
app.post('/api/approvals/propose_create', proposeCreate);
app.post('/api/approvals/propose_update', proposeUpdate);
app.post('/api/approvals/propose_delete', proposeDelete);
app.post('/api/approvals/approve', approveProposal);
app.post('/api/approvals/reject', rejectProposal);

// Weekly plan stub (proposals only)
app.post('/api/plan/week', planWeek);

// TODO: Add more (weather, holidays, notification etc.)

app.listen(port, () => {
  console.log(`Express API listening at http://localhost:${port}`);
});
