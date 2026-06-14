/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { LeaderboardEntry, RouteType, WeatherType } from '../types';
import { Trophy, Clock, Zap, MapPin } from 'lucide-react';

const PRE_SEEDED_LEADERBOARD: LeaderboardEntry[] = [
  // Asphalt Circuit
  { id: '1', name: 'Manish Kumar (Dev)', route: 'Asphalt Circuit', weather: 'Sunny', carName: 'Silverstone GT', lapTime: 18450, driftScore: 4200, date: '2026-06-13' },
  { id: '2', name: 'Max V.', route: 'Asphalt Circuit', weather: 'Sunny', carName: 'Silverstone GT', lapTime: 19120, driftScore: 1500, date: '2026-06-12' },
  { id: '3', name: 'Lewis H.', route: 'Asphalt Circuit', weather: 'Sunny', carName: 'Tokyo Drift JDM', lapTime: 19800, driftScore: 3100, date: '2026-06-11' },
  { id: '4', name: 'Ayrton S.', route: 'Asphalt Circuit', weather: 'Sunny', carName: 'Apex Rally RX', lapTime: 20400, driftScore: 800, date: '2026-06-10' },

  // Alpine Peak (Snowy)
  { id: '5', name: 'Manish Kumar (Dev)', route: 'Alpine Peak', weather: 'Snowy', carName: 'Tokyo Drift JDM', lapTime: 24300, driftScore: 12500, date: '2026-06-13' },
  { id: '6', name: 'Sebastian O.', route: 'Alpine Peak', weather: 'Snowy', carName: 'Apex Rally RX', lapTime: 25800, driftScore: 7400, date: '2026-06-12' },
  { id: '7', name: 'Finn L.', route: 'Alpine Peak', weather: 'Snowy', carName: 'Alpine Electric', lapTime: 27100, driftScore: 5400, date: '2026-06-11' },

  // Harbor Loop (Rainy)
  { id: '8', name: 'Manish Kumar (Dev)', route: 'Harbor Loop', weather: 'Rainy', carName: 'Silverstone GT', lapTime: 21100, driftScore: 6200, date: '2026-06-13' },
  { id: '9', name: 'Charles L.', route: 'Harbor Loop', weather: 'Rainy', carName: 'Tokyo Drift JDM', lapTime: 22400, driftScore: 5120, date: '2026-06-12' },

  // Dusty Dunes (Muddy)
  { id: '10', name: 'Manish Kumar (Dev)', route: 'Dusty Dunes', weather: 'Muddy', carName: 'Apex Rally RX', lapTime: 20120, driftScore: 4100, date: '2026-06-13' },
  { id: '11', name: 'Carlos S.', route: 'Dusty Dunes', weather: 'Muddy', carName: 'Apex Rally RX', lapTime: 21900, driftScore: 2900, date: '2026-06-12' },
];

interface LeaderboardProps {
  currentRoute: RouteType;
  currentWeather: WeatherType;
  lastLapTime: number | null;
  lastDriftScore: number;
  carName: string;
  onResetLastScore: () => void;
}

export default function Leaderboard({
  currentRoute,
  currentWeather,
  lastLapTime,
  lastDriftScore,
  carName,
  onResetLastScore,
}: LeaderboardProps) {
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [playerName, setPlayerName] = useState('');
  const [isSubmitEligible, setIsSubmitEligible] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('forza_leaderboard');
    if (saved) {
      try {
        setBoard(JSON.parse(saved));
      } catch (e) {
        setBoard(PRE_SEEDED_LEADERBOARD);
      }
    } else {
      setBoard(PRE_SEEDED_LEADERBOARD);
      localStorage.setItem('forza_leaderboard', JSON.stringify(PRE_SEEDED_LEADERBOARD));
    }
  }, []);

  useEffect(() => {
    if (lastLapTime !== null && lastLapTime > 0) {
      setIsSubmitEligible(true);
    }
  }, [lastLapTime]);

  const filteredBoard = board
    .filter((entry) => entry.route === currentRoute && entry.weather === currentWeather)
    .sort((a, b) => {
      // Primary sorting: Fastest Lap Time.
      return a.lapTime - b.lapTime;
    });

  const handleAddScore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim() || lastLapTime === null) return;

    const newEntry: LeaderboardEntry = {
      id: Date.now().toString(),
      name: playerName.trim(),
      route: currentRoute,
      weather: currentWeather,
      carName: carName,
      lapTime: lastLapTime,
      driftScore: lastDriftScore,
      date: new Date().toISOString().split('T')[0],
    };

    const updated = [...board, newEntry];
    setBoard(updated);
    localStorage.setItem('forza_leaderboard', JSON.stringify(updated));
    setPlayerName('');
    setIsSubmitEligible(false);
    onResetLastScore();
  };

  const formatTime = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    const hundredths = Math.floor((ms % 1000) / 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
  };

  return (
    <div id="leaderboard_panel" className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl">
      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          <Trophy className="w-5 h-5 text-amber-500 animate-pulse" />
          <h3 className="font-sans font-semibold text-white tracking-wide">Competitive Leaderboard</h3>
        </div>
        <span className="text-xs font-mono bg-indigo-900/40 text-indigo-400 border border-indigo-900/60 px-2 py-1 rounded">
          {currentRoute} ({currentWeather})
        </span>
      </div>

      {isSubmitEligible && lastLapTime !== null && (
        <form onSubmit={handleAddScore} className="mb-6 bg-slate-800/80 border border-indigo-500/30 rounded-lg p-4 animate-fadeIn">
          <div className="text-sm font-medium text-indigo-300 mb-2 flex items-center justify-between">
            <span>🏁 New Lap Record!</span>
            <span className="font-mono text-white text-base bg-indigo-950 px-2 py-0.5 rounded border border-indigo-500/20">
              {formatTime(lastLapTime)}
            </span>
          </div>
          <div className="text-xs text-slate-400 mb-3 block">
            Drift Score generated: <span className="text-rose-400 font-mono font-semibold">{lastDriftScore} pts</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              id="player_name_input"
              maxLength={20}
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Your Pilot Driver Name"
              className="flex-1 bg-slate-950 border border-slate-700 text-sm text-white px-3 py-2 rounded-lg outline-none focus:border-indigo-500 transition-colors"
              required
            />
            <button
              type="submit"
              id="submit_score_btn"
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm px-4 py-2 rounded-lg transition-all shadow-lg active:scale-95"
            >
              Submit Score
            </button>
          </div>
        </form>
      )}

      {/* Leaderboard Table */}
      <div className="max-h-68 overflow-y-auto pr-1">
        {filteredBoard.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500 tracking-wide font-mono">
            No entries on this track in {currentWeather} conditions yet.
            <br />
            Be the first to set a score!
          </div>
        ) : (
          <div className="space-y-2">
            {filteredBoard.map((entry, idx) => {
              const isDeveloper = entry.name.toLowerCase().includes('manish kumar');
              const isTop3 = idx < 3;
              const rankColor = idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-300' : idx === 2 ? 'text-amber-700' : 'text-slate-500';

              return (
                <div
                  key={entry.id}
                  className={`flex items-center justify-between p-2.5 rounded-lg border ${
                    isDeveloper
                      ? 'bg-amber-950/20 border-amber-500/30'
                      : 'bg-slate-950/40 border-slate-800'
                  } transition-all hover:bg-slate-800/30`}
                >
                  <div className="flex items-center space-x-3 truncate">
                    <span className={`font-mono font-bold text-sm w-5 text-right ${rankColor}`}>
                      #{idx + 1}
                    </span>
                    <div className="truncate">
                      <div className="flex items-center space-x-1.5">
                        <span className={`text-xs font-semibold ${isDeveloper ? 'text-amber-400' : 'text-slate-200'}`}>
                          {entry.name}
                        </span>
                        {isDeveloper && (
                          <span className="text-[9px] font-bold bg-amber-400 text-slate-950 px-1 py-0.2 rounded font-sans uppercase">
                            Dev
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 block truncate">
                        {entry.carName}
                      </span>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0 flex items-center space-x-3">
                    <div>
                      <span className="font-mono text-xs font-semibold text-emerald-400 block">
                        {formatTime(entry.lapTime)}
                      </span>
                      {entry.driftScore > 0 && (
                        <span className="text-[10px] font-mono text-rose-400/80 block">
                          ⚡ {entry.driftScore} drift
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-slate-800/60 pt-3 text-[10px] font-mono text-slate-500 flex justify-between">
        <span>Pre-seeded records included</span>
        <span>Developer: Manish Kumar</span>
      </div>
    </div>
  );
}
