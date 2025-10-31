import { useState, useCallback } from 'react';

export interface UndoableAction {
  type: 'approve' | 'delete' | 'create';
  timestamp: number;
  data: any;
  undo: () => Promise<void>;
  description: string;
}

export function useUndoRedo(maxHistory = 10) {
  const [history, setHistory] = useState<UndoableAction[]>([]);

  const addAction = useCallback((action: UndoableAction) => {
    setHistory((prev) => [...prev.slice(-maxHistory + 1), action]);
  }, [maxHistory]);

  const undo = useCallback(async () => {
    if (history.length === 0) return null;

    const lastAction = history[history.length - 1];
    try {
      await lastAction.undo();
      setHistory((prev) => prev.slice(0, -1));
      return lastAction;
    } catch (error) {
      console.error('Undo failed:', error);
      throw error;
    }
  }, [history]);

  const canUndo = history.length > 0;
  const lastAction = history[history.length - 1];

  return {
    addAction,
    undo,
    canUndo,
    lastAction,
    history,
    clearHistory: () => setHistory([]),
  };
}

