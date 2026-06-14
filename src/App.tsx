/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { PhysicsParams, WeatherType, RouteType, CarSetup } from './types';
import CarSimulator from './components/CarSimulator';
import { generateCSharpScript } from './components/CSharpGenerator';
import Leaderboard from './components/Leaderboard';
import { audioEngine } from './components/AudioEngine';
import { 
  Sliders, 
  Code, 
  Trophy, 
  HelpCircle, 
  Copy, 
  Check, 
  Info, 
  User, 
  Flame, 
  Map, 
  CloudSun,
  Car,
  Wrench,
  Sparkles,
  Gauge
} from 'lucide-react';

// Preset Cars list
const PRESET_VEHICLES: CarSetup[] = [
  {
    id: 'silverstone_gt',
    name: 'Nissan GT-R R35 (Blender Metallic Spec)',
    weightClass: 'Balanced Sport Class S',
    visualColor: '#b0b5bc', // Sleek Metallic Gray/Silver matching the Blender image!
    baseParams: {
      mass: 1450,
      motorTorque: 680,
      maxSteerAngle: 42,
      brakeForce: 3200,
      suspensionSpring: 35000,
      suspensionDamper: 4500,
      suspensionDistance: 0.16,
      targetPosition: 0.5,
      tireCompound: 'Slick',
      rollStiffness: 5500,
    }
  },
  {
    id: 'tokyo_drift_jdm',
    name: 'Tokyo Spec RS (Drift Car)',
    weightClass: 'Active Lateral Tuner',
    visualColor: '#f43f5e', // Hot Rose Red
    baseParams: {
      mass: 1250,
      motorTorque: 580,
      maxSteerAngle: 42,
      brakeForce: 2600,
      suspensionSpring: 42000,
      suspensionDamper: 3600,
      suspensionDistance: 0.12,
      targetPosition: 0.4,
      tireCompound: 'Street',
      rollStiffness: 4200,
    }
  },
  {
    id: 'alpine_rally_rx',
    name: 'Apex Rally-Spec (AWD)',
    weightClass: 'Offroad Long-Travel Class B',
    visualColor: '#eab308', // Yellow
    baseParams: {
      mass: 1150,
      motorTorque: 520,
      maxSteerAngle: 38,
      brakeForce: 2800,
      suspensionSpring: 18000, // soft spring
      suspensionDamper: 2400,
      suspensionDistance: 0.32, // long travel
      targetPosition: 0.6,
      tireCompound: 'Offroad',
      rollStiffness: 2200,
    }
  },
  {
    id: 'alpine_electric_ev',
    name: 'Alpine Quad EV (Heavy Hypercar)',
    weightClass: 'Heavy High-Torque Class A',
    visualColor: '#10b981', // Emerald Green
    baseParams: {
      mass: 1980, // Heavy battery mass
      motorTorque: 1200, // Instant massive torque
      maxSteerAngle: 32,
      brakeForce: 4500,
      suspensionSpring: 55000, // stiff spring
      suspensionDamper: 6500,
      suspensionDistance: 0.18,
      targetPosition: 0.5,
      tireCompound: 'Rain',
      rollStiffness: 7500,
    }
  }
];

export default function App() {
  const [selectedCarId, setSelectedCarId] = useState('silverstone_gt');
  const [physicsParams, setPhysicsParams] = useState<PhysicsParams>(PRESET_VEHICLES[0].baseParams);
  const [weather, setWeather] = useState<WeatherType>('Sunny');
  const [route, setRoute] = useState<RouteType>('Asphalt Circuit');
  
  // Dynamic Weather Cycle: changes weather every 60 seconds automatically
  const [isWeatherCycleEnabled, setIsWeatherCycleEnabled] = useState(true);
  const [weatherTimeLeft, setWeatherTimeLeft] = useState(60);

  const [activeSoundProfile, setActiveSoundProfile] = useState<'v8' | 'v6' | 'ev' | 'default'>('v8');

  // Sync initial sound profile on mount
  useEffect(() => {
    audioEngine.setProfile('v8');
  }, []);

  useEffect(() => {
    if (!isWeatherCycleEnabled) return;

    const timer = setInterval(() => {
      setWeatherTimeLeft((prev) => {
        if (prev <= 1) {
          setWeather((currentWeather) => {
            const weathers: WeatherType[] = ['Sunny', 'Rainy', 'Muddy', 'Snowy'];
            const currentIndex = weathers.indexOf(currentWeather);
            const nextIndex = (currentIndex + 1) % weathers.length;
            return weathers[nextIndex];
          });
          return 60; // Reset to 60s
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isWeatherCycleEnabled]);

  const handleManualWeatherChange = (newWeather: WeatherType) => {
    setWeather(newWeather);
    setWeatherTimeLeft(60); // Reset timer countdown
  };

  // Trigger sound engine update when profile changes
  const handleSoundProfileChange = (profile: 'v8' | 'v6' | 'ev' | 'default') => {
    setActiveSoundProfile(profile);
    audioEngine.setProfile(profile);
  };
  
  // Navigation tabs inside side drawer
  const [activeTab, setActiveTab] = useState<'tuner' | 'csharp' | 'leaderboard'>('tuner');
  
  // Copy to clipboard notification
  const [copiedCode, setCopiedCode] = useState(false);

  // New lap score completion tracking
  const [lastLapCompletedTime, setLastLapCompletedTime] = useState<number | null>(null);
  const [lastLapDriftScore, setLastLapDriftScore] = useState<number>(0);

  const formatTime = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    const hundredths = Math.floor((ms % 1000) / 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
  };

  // Sync sliders when preset car is toggled
  const handleCarSelect = (id: string) => {
    setSelectedCarId(id);
    const vehicle = PRESET_VEHICLES.find((car) => car.id === id);
    if (vehicle) {
      setPhysicsParams({ ...vehicle.baseParams });
      
      // Auto sound pairing
      let soundProfile: 'v8' | 'v6' | 'ev' | 'default' = 'v8';
      if (id === 'silverstone_gt') soundProfile = 'v8';
      else if (id === 'tokyo_drift_jdm') soundProfile = 'v6';
      else if (id === 'alpine_electric_ev') soundProfile = 'ev';
      else soundProfile = 'default';
      
      setActiveSoundProfile(soundProfile);
      audioEngine.setProfile(soundProfile);
    }
  };

  // Override preset selection into "Custom" once sliders are manipulated manually
  const updatePhysScalar = (key: keyof PhysicsParams, value: number | string) => {
    if (selectedCarId !== 'custom') {
      setSelectedCarId('custom');
    }
    setPhysicsParams((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handeLapFinished = (lapTime: number, totalDrift: number) => {
    setLastLapCompletedTime(lapTime);
    setLastLapDriftScore(totalDrift);
    // Switch side panel to Leaderboard immediately so they can claim their score!
    setActiveTab('leaderboard');
  };

  const activeCar = PRESET_VEHICLES.find((v) => v.id === selectedCarId) || {
    name: 'Bespoke Custom Build GT',
    visualColor: '#a855f7', // Purple
  };

  const generatedScript = generateCSharpScript(physicsParams, "Manish Kumar");

  const copyScriptToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedScript);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F0F0F0] flex flex-col font-sans selection:bg-[#FF3E00]/30 selection:text-white relative overflow-hidden">
      {/* Absolute Background Watermark */}
      <div className="absolute top-[-50px] md:top-[-100px] right-[-30px] md:right-[-50px] text-[120px] sm:text-[220px] md:text-[350px] font-black text-[#141414] leading-none z-0 select-none pointer-events-none uppercase italic">
        FORZA
      </div>

      {/* 1. Header Layout bar */}
      <header id="app_header" className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end p-6 md:p-8 border-b border-[#333] bg-[#0A0A0A]/90 backdrop-blur-md sticky top-0">
        <div className="flex flex-col">
          <span className="text-[#FF3E00] font-bold tracking-[0.4em] text-[10px] md:text-xs mb-2 block uppercase">PROJECT: SIMULATION ENGINE</span>
          <h1 className="text-4xl sm:text-6xl md:text-8xl font-black italic tracking-tighter leading-none m-0 text-white select-none">
            FORZA CAR RACING
          </h1>
          <p className="text-xs md:text-sm font-medium tracking-widest text-[#888] mt-2 uppercase">
            Developer: <span className="text-white font-semibold">Manish Kumar</span>
          </p>
        </div>

        <div className="text-left md:text-right mt-4 md:mt-0">
          <div className="text-3xl md:text-4xl font-bold font-mono text-[#FF3E00]">
            {lastLapCompletedTime !== null ? formatTime(lastLapCompletedTime) : "1:12.432"}
          </div>
          <div className="text-[10px] tracking-[0.2em] text-[#666] uppercase mt-1">
            {lastLapCompletedTime !== null ? `LAST LAP / ${route}` : "PRESET LAP / NÜRBURGRING"}
          </div>
        </div>
      </header>
      {/* 2. Main content framework */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 py-8 grid grid-cols-1 lg:grid-cols-5 gap-8 relative z-10">
        {/* Left Column: Drive Simulator Canvas + Car / Environment Customizers */}
        <section className="lg:col-span-3 space-y-6">
          {/* Quick Vehicle selection row with colorized indicators */}
          <div className="bg-[#111111] border border-[#222] rounded-sm p-5">
            <h3 className="text-xs font-bold text-[#FF3E00] font-mono tracking-widest uppercase mb-4 flex items-center gap-1.5">
              <Car className="w-4 h-4 text-[#FF3E00]" /> Choose Driving Supercar Model
            </h3>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {PRESET_VEHICLES.map((car) => {
                const isSelected = selectedCarId === car.id;
                return (
                  <button
                    key={car.id}
                    onClick={() => handleCarSelect(car.id)}
                    id={`vehicle_preset_${car.id}`}
                    className={`text-left p-3.5 rounded-sm border transition-all relative overflow-hidden active:scale-95 ${
                      isSelected 
                        ? "bg-[#1A1A1A] border-[#FF3E00] text-white shadow-[0_0_15px_rgba(255,62,0,0.15)]" 
                        : "bg-[#0A0A0A] hover:bg-[#151515] border-[#222] text-[#888]"
                    }`}
                  >
                    <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: car.visualColor }} />
                    <div className="font-sans font-bold text-xs text-white truncate pl-1">
                      {car.name.split(" (")[0]}
                    </div>
                    <p className="text-[10px] font-mono mt-1 text-slate-500 truncate pl-1">
                      {car.weightClass}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Route and Weather drop settings panel */}
          <div className="bg-[#111111] border border-[#222] rounded-sm p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="route_select_box" className="text-xs font-bold text-[#888] font-mono uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                <Map className="w-4 h-4 text-[#FF3E00]" /> Select Road Track Layout
              </label>
              <select
                id="route_select_box"
                value={route}
                onChange={(e) => setRoute(e.target.value as RouteType)}
                className="w-full bg-[#0A0A0A] border border-[#333] text-sm text-[#F0F0F0] rounded-sm p-3 outline-none focus:border-[#FF3E00] transition-colors font-sans"
              >
                <option value="Asphalt Circuit">Monza GP Circuit (Dry Fast Tarmac)</option>
                <option value="Harbor Loop">Marina Bay Harbour (Tight 90° Wet Grid)</option>
                <option value="Dusty Dunes">Sahara Rally (Desert Dirt & S-Curves)</option>
                <option value="Alpine Peak">Arctic Glacial Stadium (Continuous Ice Drifting)</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="weather_select_box" className="text-xs font-bold text-[#888] font-mono uppercase tracking-wider flex items-center gap-1.5">
                  <CloudSun className="w-4 h-4 text-[#FF3E00]" /> Weather Environment Systems
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-slate-500 uppercase">DYNAMIC CYCLE:</span>
                  <button
                    onClick={() => setIsWeatherCycleEnabled(!isWeatherCycleEnabled)}
                    id="weather_cycle_toggle"
                    className={`px-2 py-0.5 rounded-sm font-mono text-[9px] font-bold tracking-wider transition-all border ${
                      isWeatherCycleEnabled 
                        ? 'bg-[#FF3E00]/10 border-[#FF3E00]/40 text-[#FF3E00]' 
                        : 'bg-transparent border-[#222] text-slate-500 hover:text-[#FF3E00]'
                    }`}
                  >
                    {isWeatherCycleEnabled ? 'ACTIVE' : 'PAUSED'}
                  </button>
                </div>
              </div>
              <select
                id="weather_select_box"
                value={weather}
                onChange={(e) => handleManualWeatherChange(e.target.value as WeatherType)}
                className="w-full bg-[#0A0A0A] border border-[#333] text-sm text-[#F0F0F0] rounded-sm p-3 outline-none focus:border-[#FF3E00] transition-colors font-sans"
              >
                <option value="Sunny">Sunny Skies (Optimal Traction Coefficient: 1.0)</option>
                <option value="Rainy">Reflective Heavens Rain (Wet Hydroplaning: 0.65)</option>
                <option value="Muddy">Loose S-Dust Storm (Unpredictable Drift Sliding: 0.52)</option>
                <option value="Snowy">Siberian Whiteout Snow (Minimum Grip Ice: 0.35)</option>
              </select>

              {/* Dynamic Weather Timer Countdown Bar Visualizer */}
              {isWeatherCycleEnabled && (
                <div className="mt-2.5">
                  <div className="flex justify-between items-center text-[10px] font-mono mb-1">
                    <span className="text-slate-500">TRANSITIONING CLIMATE ZONE</span>
                    <span className="text-[#FF3E00] font-black animate-pulse font-mono">{weatherTimeLeft}s LEFT</span>
                  </div>
                  <div id="weather_duration_bar" className="h-[2px] bg-[#222] w-full relative rounded-full overflow-hidden">
                    <div 
                      className="absolute left-0 top-0 bottom-0 bg-[#FF3E00] transition-all duration-1000 ease-linear"
                      style={{ width: `${(weatherTimeLeft / 60) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* The Canvas Simulator */}
          <CarSimulator
            physicsParams={physicsParams}
            weather={weather}
            route={route}
            carColor={activeCar.visualColor}
            carName={activeCar.name}
            onLapCompleted={handeLapFinished}
          />
        </section>

        {/* Right Column: Tabbed mechanical inspector (Tuner Sliders, C# generator, Leaderboard) */}
        <section className="lg:col-span-2 flex flex-col gap-6">
          <div className="bg-[#111111] border border-[#222222] rounded-sm p-2 overflow-hidden flex flex-col shadow-xl">
            {/* Navigation Drawer Tabs header */}
            <div className="flex border-b border-[#222222] bg-[#0A0A0A] p-2 gap-1 rounded-t-sm">
              <button
                onClick={() => setActiveTab('tuner')}
                id="tab_trigger_tuner"
                className={`flex-1 py-3 rounded-sm text-xs font-mono font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 active:scale-95 ${
                  activeTab === 'tuner'
                    ? "bg-[#1A1A1A] text-[#FF3E00] border border-[#FF3E00]/30 shadow-[0_0_10px_rgba(255,62,0,0.08)]"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Sliders className="w-4 h-4" /> Physics Tuner
              </button>
              <button
                onClick={() => setActiveTab('csharp')}
                id="tab_trigger_csharp"
                className={`flex-1 py-3 rounded-sm text-xs font-mono font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 active:scale-95 ${
                  activeTab === 'csharp'
                    ? "bg-[#1A1A1A] text-[#FF3E00] border border-[#FF3E00]/30 shadow-[0_0_10px_rgba(255,62,0,0.08)]"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Code className="w-4 h-4" /> Unity C# Script
              </button>
              <button
                onClick={() => setActiveTab('leaderboard')}
                id="tab_trigger_leaderboard"
                className={`flex-1 py-3 rounded-sm text-xs font-mono font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 active:scale-95 ${
                  activeTab === 'leaderboard'
                    ? "bg-[#1A1A1A] text-[#FF3E00] border border-[#FF3E00]/30 shadow-[0_0_10px_rgba(255,62,0,0.08)]"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Trophy className="w-4 h-4" /> High Scores
              </button>
            </div>

            {/* TAB VIEWS */}
            <div className="p-5 flex-1 max-h-[720px] overflow-y-auto">
              
              {/* TAB 1: PHYSICS TUNER SLIDERS */}
              {activeTab === 'tuner' && (
                <div id="tuner_tab_panel" className="space-y-6 animate-fadeIn">
                  <div className="flex justify-between items-center mb-2 border-l-4 border-[#FF3E00] pl-3">
                    <h3 className="font-mono font-bold text-[#FF3E00] tracking-widest text-xs uppercase flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-[#FF3E00]" />
                      Dynamic Suspension Tuning
                    </h3>
                    {selectedCarId === 'custom' && (
                      <span className="text-[10px] font-mono bg-[#FF3E00]/20 border border-[#FF3E00]/40 text-[#FF3E00] px-2 py-0.5 rounded-sm tracking-wide font-bold uppercase">
                        Bespoke Setup
                      </span>
                    )}
                  </div>
                  
                  <p className="text-xs text-slate-400 font-sans leading-relaxed">
                    Adjusting these telemetry parameters immediately influences weight-transfer, tire slip, sliding decay, and body roll on the racetrack, as well as altering Unity's C# compiled constants!
                  </p>

                  <div className="border-t border-[#222222] pt-4 space-y-4">
                    
                    {/* Mass Slider */}
                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1 text-slate-300">
                        <span>Rigidbody Vehicle Mass</span>
                        <span className="text-white font-bold">{physicsParams.mass} kg</span>
                      </div>
                      <input
                        type="range"
                        id="slider_mass"
                        min="800"
                        max="2400"
                        step="50"
                        value={physicsParams.mass}
                        onChange={(e) => updatePhysScalar('mass', parseInt(e.target.value))}
                        className="w-full accent-[#FF3E00] h-1 bg-[#222222] rounded-sm mr-2"
                      />
                      <span className="text-[10px] text-slate-500 font-mono italic">Influences inertial momentum, lateral skid drift limits and suspension compression.</span>
                    </div>

                    {/* Motor Torque Slider */}
                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1 text-slate-300">
                        <span>Drivetrain Motor Torque</span>
                        <span className="text-white font-bold">{physicsParams.motorTorque} Nm</span>
                      </div>
                      <input
                        type="range"
                        id="slider_motortorque"
                        min="300"
                        max="1400"
                        step="20"
                        value={physicsParams.motorTorque}
                        onChange={(e) => updatePhysScalar('motorTorque', parseInt(e.target.value))}
                        className="w-full accent-[#FF3E00] h-1 bg-[#222222] rounded-sm mr-2"
                      />
                      <span className="text-[10px] text-slate-500 font-mono italic">Propelling wheel force. Higher torque encourages instant oversteer drifting!</span>
                    </div>

                    {/* Max Steer Angle Slider */}
                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1 text-slate-300">
                        <span>Maximum Steering Lock</span>
                        <span className="text-white font-bold">{physicsParams.maxSteerAngle}°</span>
                      </div>
                      <input
                        type="range"
                        id="slider_steerangle"
                        min="25"
                        max="48"
                        step="1"
                        value={physicsParams.maxSteerAngle}
                        onChange={(e) => updatePhysScalar('maxSteerAngle', parseInt(e.target.value))}
                        className="w-full accent-[#FF3E00] h-1 bg-[#222222] rounded-sm mr-2"
                      />
                      <span className="text-[10px] text-slate-500 font-mono italic">Front steering wheel reach. High angles yield extreme hairpins corner navigation.</span>
                    </div>

                    {/* Suspension Spring Const */}
                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1 text-slate-300">
                        <span>Hooke Spring Const (Stiffness)</span>
                        <span className="text-white font-bold">{physicsParams.suspensionSpring} N/m</span>
                      </div>
                      <input
                        type="range"
                        id="slider_spring"
                        min="12000"
                        max="65000"
                        step="1000"
                        value={physicsParams.suspensionSpring}
                        onChange={(e) => updatePhysScalar('suspensionSpring', parseInt(e.target.value))}
                        className="w-full accent-[#FF3E00] h-1 bg-[#222222] rounded-sm mr-2"
                      />
                      <span className="text-[10px] text-slate-300 italic block mt-0.5">High = Formula stiffness, low body roll. Low = Soft absorbing rally cushion.</span>
                    </div>

                    {/* Suspension Damper Const */}
                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1 text-slate-300">
                        <span>Suspension Damping Rate</span>
                        <span className="text-white font-bold">{physicsParams.suspensionDamper} N/m/s</span>
                      </div>
                      <input
                        type="range"
                        id="slider_damper"
                        min="1500"
                        max="7500"
                        step="100"
                        value={physicsParams.suspensionDamper}
                        onChange={(e) => updatePhysScalar('suspensionDamper', parseInt(e.target.value))}
                        className="w-full accent-[#FF3E00] h-1 bg-[#222222] rounded-sm mr-2"
                      />
                      <span className="text-[10px] text-slate-400 block mt-0.5 italic">Resists spring rebounds. High damping eliminates bouncy chaotic oscillations.</span>
                    </div>

                    {/* Brake Force */}
                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1 text-slate-300">
                        <span>Stopping Brake Force</span>
                        <span className="text-white font-bold">{physicsParams.brakeForce} N</span>
                      </div>
                      <input
                        type="range"
                        id="slider_brakeforce"
                        min="1500"
                        max="5000"
                        step="100"
                        value={physicsParams.brakeForce}
                        onChange={(e) => updatePhysScalar('brakeForce', parseInt(e.target.value))}
                        className="w-full accent-[#FF3E00] h-1 bg-[#222222] rounded-sm mr-2"
                      />
                    </div>

                    {/* Distance (Max Travel) */}
                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1 text-slate-300">
                        <span>Suspension Stroke (Travel)</span>
                        <span className="text-white font-bold">{physicsParams.suspensionDistance} m</span>
                      </div>
                      <input
                        type="range"
                        id="slider_distance"
                        min="0.10"
                        max="0.40"
                        step="0.01"
                        value={physicsParams.suspensionDistance}
                        onChange={(e) => updatePhysScalar('suspensionDistance', parseFloat(e.target.value))}
                        className="w-full accent-[#FF3E00] h-1 bg-[#222222] rounded-sm mr-2"
                      />
                    </div>

                    {/* Anti roll bar */}
                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1 text-slate-300">
                        <span>Anti-Roll Bar Rigidity</span>
                        <span className="text-white font-bold">{physicsParams.rollStiffness} N/m</span>
                      </div>
                      <input
                        type="range"
                        id="slider_rollstiffness"
                        min="1000"
                        max="10000"
                        step="200"
                        value={physicsParams.rollStiffness}
                        onChange={(e) => updatePhysScalar('rollStiffness', parseInt(e.target.value))}
                        className="w-full accent-[#FF3E00] h-1 bg-[#222222] rounded-sm mr-2"
                      />
                    </div>

                    {/* Acoustic Sound Profile Overrides */}
                    <div className="border-t border-[#222222] pt-4 mt-2">
                      <div className="flex justify-between text-xs font-mono mb-2 text-slate-300">
                        <span>Engine Acoustic Sound Profile</span>
                        <span className="text-[#FF3E00] font-black uppercase tracking-wider font-mono">
                          {activeSoundProfile === 'v8' ? 'Audi V8 Growl' : activeSoundProfile === 'v6' ? 'Brera V6 Rasp' : activeSoundProfile === 'ev' ? 'Electric Warp' : 'Rally Turbo'}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 mt-1.5">
                        <button
                          type="button"
                          onClick={() => handleSoundProfileChange('v8')}
                          className={`py-2 px-2 rounded-sm border text-[10px] font-mono font-bold tracking-wider uppercase text-center transition-all cursor-pointer active:scale-95 ${
                            activeSoundProfile === 'v8'
                              ? 'bg-[#FF3E00]/10 border-[#FF3E00] text-white shadow-[0_0_10px_rgba(255,62,0,0.1)]'
                              : 'bg-[#0A0A0A] border-[#222] text-slate-500 hover:text-white'
                          }`}
                        >
                          🔊 Audi V8 Growl
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSoundProfileChange('v6')}
                          className={`py-2 px-2 rounded-sm border text-[10px] font-mono font-bold tracking-wider uppercase text-center transition-all cursor-pointer active:scale-95 ${
                            activeSoundProfile === 'v6'
                              ? 'bg-[#FF3E00]/10 border-[#FF3E00] text-white shadow-[0_0_10px_rgba(255,62,0,0.1)]'
                              : 'bg-[#0A0A0A] border-[#222] text-slate-500 hover:text-white'
                          }`}
                        >
                          🔊 Brera V6 Rasp
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSoundProfileChange('default')}
                          className={`py-2 px-2 rounded-sm border text-[10px] font-mono font-bold tracking-wider uppercase text-center transition-all cursor-pointer active:scale-95 ${
                            activeSoundProfile === 'default'
                              ? 'bg-[#FF3E00]/10 border-[#FF3E00] text-white shadow-[0_0_10px_rgba(255,62,0,0.1)]'
                              : 'bg-[#0A0A0A] border-[#222] text-slate-500 hover:text-white'
                          }`}
                        >
                          🔊 Formula Turbo
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSoundProfileChange('ev')}
                          className={`py-2 px-2 rounded-sm border text-[10px] font-mono font-bold tracking-wider uppercase text-center transition-all cursor-pointer active:scale-95 ${
                            activeSoundProfile === 'ev'
                              ? 'bg-[#FF3E00]/10 border-[#FF3E00] text-white shadow-[0_0_10px_rgba(255,62,0,0.1)]'
                              : 'bg-[#0A0A0A] border-[#222] text-slate-500 hover:text-white'
                          }`}
                        >
                          ⚡ Electric EV
                        </button>
                      </div>
                      <span className="text-[9px] text-slate-500 font-mono italic block mt-1.5 pl-0.5">
                        Alters live synth oscillators dynamically. Features deceleration exhaust snap crackles!
                      </span>
                    </div>

                  </div>
                </div>
              )}

              {/* TAB 2: UNITY C# SYNTAX-HIGHLIGHTED SCRIPT */}
              {activeTab === 'csharp' && (
                <div id="csharp_tab_panel" className="space-y-4 animate-fadeIn">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-mono font-bold text-[#FF3E00] tracking-widest text-xs uppercase flex items-center gap-2">
                      <Code className="w-5 h-5 text-[#FF3E00]" />
                      Ready Unity Car Controller C#
                    </h3>
                    <button
                      onClick={copyScriptToClipboard}
                      id="copy_code_btn"
                      className="px-4 py-2 bg-[#FF3E00] hover:bg-[#E03600] active:scale-95 text-black font-black font-mono text-[10px] tracking-widest rounded-sm flex items-center gap-1.5 transition-all outline-none"
                    >
                      {copiedCode ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-black" />
                          COPIED!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          COPY C# CODE
                        </>
                      )}
                    </button>
                  </div>

                  <p className="text-xs text-slate-400">
                    This structured model script calculates dynamic lateral slip, Hooke suspension springs, and aeroforce downforce. Simply paste it directly inside a <code>ForzaCarController.cs</code> file in Unity. Includes developer comments perfect for beginner programmers!
                  </p>

                  <div className="bg-slate-950 rounded-lg border border-slate-850 p-3 h-[450px] overflow-auto shadow-inner relative">
                    <pre className="text-[11px] font-mono leading-relaxed text-slate-300 whitespace-pre">
                      {generatedScript}
                    </pre>
                  </div>
                </div>
              )}

              {/* TAB 3: LOCAL STORAGE COMPETITIVE LEADERBOARD */}
              {activeTab === 'leaderboard' && (
                <Leaderboard
                  currentRoute={route}
                  currentWeather={weather}
                  lastLapTime={lastLapCompletedTime}
                  lastDriftScore={lastLapDriftScore}
                  carName={activeCar.name}
                  onResetLastScore={() => {
                    setLastLapCompletedTime(null);
                    setLastLapDriftScore(0);
                  }}
                />
              )}

            </div>
          </div>
        </section>
      </main>

      {/* 3. bento educational section explaining physics */}
      <section id="educational_bento_sector" className="border-t border-[#222222] bg-[#0A0A0A] px-6 py-12 mt-12">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-xs font-mono font-bold text-[#FF3E00] tracking-widest uppercase mb-8 flex items-center gap-2">
            <Info className="w-5 h-5 text-[#FF3E00]" />
            Physics Methodology & Mechanical Calculation Models
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Box 1: Suspension springs */}
            <div className="bg-[#111111] border border-[#222222] rounded-sm p-5">
              <span className="font-mono text-[10px] font-bold text-[#FF3E00] uppercase tracking-widest block mb-1">
                Suspension Modeling
              </span>
              <h4 className="text-sm font-bold text-white mb-2 font-sans">Hooke's Force Calculation</h4>
              <p className="text-xs text-slate-400 leading-relaxed font-sans">
                Tuned suspension springs resist tire displacements matching Hooke's Law formula:
                <br />
                <code className="text-[10px] font-mono block p-2 bg-[#0A0A0A] border border-[#222222] rounded-sm text-[#FF3E00] my-2">
                  F_susp = (k * x) - (d * v)
                </code>
                Where <strong>k</strong> represents spring stiffness, <strong>x</strong> represents stroke movement, <strong>d</strong> is damper friction constant, and <strong>v</strong> is vertical movement speed of the chassis axle.
              </p>
            </div>

            {/* Box 2: Grip calculations */}
            <div className="bg-[#111111] border border-[#222222] rounded-sm p-5">
              <span className="font-mono text-[10px] font-bold text-[#FF3E00] uppercase tracking-widest block mb-1">
                Tire Friction Circle
              </span>
              <h4 className="text-sm font-bold text-white mb-2 font-sans">Frictional Grip Coeff</h4>
              <p className="text-xs text-slate-400 leading-relaxed font-sans">
                Dynamic tire handling limits lateral/longitudinal slips. Under damp rain or frozen snowy terrains, the frictional threshold drops considerably:
                <br />
                <code className="text-[10px] font-mono block p-2 bg-[#0A0A0A] border border-[#222222] rounded-sm text-[#FF3E00] my-2">
                  F_maxGrip = μ * NormalForce
                </code>
                Where <strong>μ</strong> ranges from 1.0 down to 0.35, resulting in spectacular sliding limits!
              </p>
            </div>

            {/* Box 3: Weight transfer */}
            <div className="bg-[#111111] border border-[#222222] rounded-sm p-5">
              <span className="font-mono text-[10px] font-bold text-[#FF3E00] uppercase tracking-widest block mb-1">
                Chassis Inertia
              </span>
              <h4 className="text-sm font-bold text-white mb-2 font-sans">Adhesion Weight Transfer</h4>
              <p className="text-xs text-slate-400 leading-relaxed font-sans">
                Acceleration commands pull structural normal weight onto the rear suspension springs, compressing them and multiplying RWD traction. Braking throws massive kinetic forces onto the front wheels, shifting normal tire grip!
              </p>
            </div>

            {/* Box 4: Aerodynamics */}
            <div className="bg-[#111111] border border-[#222222] rounded-sm p-5">
              <span className="font-mono text-[10px] font-bold text-[#FF3E00] uppercase tracking-widest block mb-1">
                Aerodynamics
              </span>
              <h4 className="text-sm font-bold text-white mb-2 font-sans">Downforce Calculations</h4>
              <p className="text-xs text-slate-400 leading-relaxed font-sans">
                Forza physics incorporates virtual downforce wings. As speeds escalate, vertical downward force compounds matching:
                <br />
                <code className="text-[10px] font-mono block p-2 bg-[#0A0A0A] border border-[#222222] rounded-sm text-[#FF3E00] my-2">
                  F_downforce = 0.5 * d * V²
                </code>
                This pushes tires firmly into track floor profiles, offsetting damp slides and supporting phenomenal lateral G corner navigation!
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* 4. Footer */}
      <footer className="border-t border-[#222222] py-8 px-6 text-[11px] text-[#666666] font-mono mt-auto flex flex-col md:flex-row justify-between max-w-7xl w-full mx-auto gap-3">
        <div>
          &copy; 2026 FORZA CAR RACING Sandbox Project. All physical calculations simulated in real-time.
        </div>
        <div className="flex items-center justify-center gap-1.5">
          <span>PROJECT ARCHITECT:</span>
          <strong className="text-white hover:text-[#FF3E00] transition-colors tracking-widest font-mono font-bold">MANISH KUMAR</strong>
        </div>
      </footer>
    </div>
  );
}
