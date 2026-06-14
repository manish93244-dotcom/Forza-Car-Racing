/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

class CarAudioEngine {
  private ctx: AudioContext | null = null;
  private isRunning = false;
  private isMutedFlag = false;

  // Sound nodes
  private mainGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  
  // Oscillators for cylinder firing simulation
  private subOsc: OscillatorNode | null = null;
  private subGain: GainNode | null = null;
  
  private lowOsc: OscillatorNode | null = null;
  private lowGain: GainNode | null = null;
  
  private midOsc: OscillatorNode | null = null;
  private midGain: GainNode | null = null;
  
  private shaper: WaveShaperNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private highPassFilter: BiquadFilterNode | null = null; // Resonator filter for motor rasp/clarity

  // Imbalance LFO for V8 asymmetric cross-plane thrumming growl
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;

  // Turbo whistle or high-RPM shrieks
  private turboOsc: OscillatorNode | null = null;
  private turboGain: GainNode | null = null;

  // Tire squealing noise
  private squealOsc: OscillatorNode | null = null;
  private squealGain: GainNode | null = null;
  private squealFilter: BiquadFilterNode | null = null;

  // Active synthesizer configuration parameters
  private activeProfile: 'v8' | 'v6' | 'ev' | 'default' = 'v8';

  // State variables for engine tracking
  private currentRPM = 800;
  private currentThrottle = 0;
  private currentSqueal = 0;
  private lastThrottle = 0;
  private lastPopTime = 0;

  constructor() {
    // Lazy initialize to bypass browser autoplay policies
  }

  private init() {
    if (this.ctx) return;
    
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
      
      this.mainGain = this.ctx.createGain();
      this.mainGain.gain.setValueAtTime(this.isMutedFlag ? 0 : 0.25, this.ctx.currentTime);
      this.mainGain.connect(this.ctx.destination);

      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
      this.engineGain.connect(this.mainGain);

      // Create distortion curve
      this.shaper = this.ctx.createWaveShaper();
      this.shaper.curve = this.makeDistortionCurve(45);
      this.shaper.connect(this.engineGain);

      // Create lowpass filter to mimic exhaust dampening
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.setValueAtTime(500, this.ctx.currentTime);
      this.filter.Q.setValueAtTime(2.0, this.ctx.currentTime);
      this.filter.connect(this.shaper);

      // Create secondary dynamic peaking resonator filter to express metallic raspiness
      this.highPassFilter = this.ctx.createBiquadFilter();
      this.highPassFilter.type = 'peaking';
      this.highPassFilter.frequency.setValueAtTime(1400, this.ctx.currentTime);
      this.highPassFilter.Q.setValueAtTime(1.5, this.ctx.currentTime);
      this.highPassFilter.gain.setValueAtTime(3.0, this.ctx.currentTime);
      this.highPassFilter.connect(this.filter);

      // Sub oscillator for exhaust thrum (frequencies 20 - 70 Hz)
      this.subOsc = this.ctx.createOscillator();
      this.subOsc.type = 'sawtooth';
      this.subOsc.frequency.setValueAtTime(30, this.ctx.currentTime);
      this.subGain = this.ctx.createGain();
      this.subGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
      this.subOsc.connect(this.subGain);
      this.subGain.connect(this.highPassFilter);

      // Low oscillator for cylinder harmonics (frequencies 40 - 200 Hz)
      this.lowOsc = this.ctx.createOscillator();
      this.lowOsc.type = 'sawtooth';
      this.lowOsc.frequency.setValueAtTime(60, this.ctx.currentTime);
      this.lowGain = this.ctx.createGain();
      this.lowGain.gain.setValueAtTime(0.4, this.ctx.currentTime);
      this.lowOsc.connect(this.lowGain);
      this.lowGain.connect(this.highPassFilter);

      // Mid oscillator for throatiness and exhaust noise
      this.midOsc = this.ctx.createOscillator();
      this.midOsc.type = 'triangle';
      this.midOsc.frequency.setValueAtTime(120, this.ctx.currentTime);
      this.midGain = this.ctx.createGain();
      this.midGain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      this.midOsc.connect(this.midGain);
      this.midGain.connect(this.highPassFilter);

      // Imbalance LFO for V8 off-beat thrumming throb
      this.lfo = this.ctx.createOscillator();
      this.lfo.type = 'sine';
      this.lfo.frequency.setValueAtTime(8, this.ctx.currentTime);
      this.lfoGain = this.ctx.createGain();
      this.lfoGain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      this.lfo.connect(this.lfoGain);
      this.lfoGain.connect(this.subGain.gain);

      // High pitched Turbo charger whistle node
      this.turboOsc = this.ctx.createOscillator();
      this.turboOsc.type = 'sine';
      this.turboOsc.frequency.setValueAtTime(1800, this.ctx.currentTime);
      this.turboGain = this.ctx.createGain();
      this.turboGain.gain.setValueAtTime(0.0, this.ctx.currentTime); // Off initially
      this.turboOsc.connect(this.turboGain);
      this.turboGain.connect(this.mainGain);

      // Tire squeal synth (bandpass filtered noise-like square wave)
      this.squealOsc = this.ctx.createOscillator();
      this.squealOsc.type = 'sawtooth';
      this.squealOsc.frequency.setValueAtTime(850, this.ctx.currentTime);
      this.squealFilter = this.ctx.createBiquadFilter();
      this.squealFilter.type = 'bandpass';
      this.squealFilter.frequency.setValueAtTime(1200, this.ctx.currentTime);
      this.squealFilter.Q.setValueAtTime(4, this.ctx.currentTime);
      this.squealGain = this.ctx.createGain();
      this.squealGain.gain.setValueAtTime(0.0, this.ctx.currentTime); // Silent initially
      
      this.squealOsc.connect(this.squealFilter);
      this.squealFilter.connect(this.squealGain);
      this.squealGain.connect(this.mainGain);

      // Start the oscillators
      this.subOsc.start(0);
      this.lowOsc.start(0);
      this.midOsc.start(0);
      this.lfo.start(0);
      this.turboOsc.start(0);
      this.squealOsc.start(0);

      this.isRunning = true;
      
      // Sync on startup matching default setup
      this.setProfile(this.activeProfile);
    } catch (e) {
      console.error("Failed to start AudioContext:", e);
    }
  }

  private makeDistortionCurve(amount: number): Float32Array {
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      // High-precision asymmetric distortion curve simulating single-sided exhaust backpressure
      if (x < 0) {
        curve[i] = Math.tanh(x * amount * 0.45);
      } else {
        curve[i] = Math.tanh(x * amount * 1.35) * 0.75;
      }
    }
    return curve;
  }

  public start() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public toggleMute(): boolean {
    this.isMutedFlag = !this.isMutedFlag;
    if (this.mainGain && this.ctx) {
      this.mainGain.gain.setTargetAtTime(this.isMutedFlag ? 0 : 0.25, this.ctx.currentTime, 0.1);
    }
    return this.isMutedFlag;
  }

  public isMuted(): boolean {
    return this.isMutedFlag;
  }

  public setProfile(profile: 'v8' | 'v6' | 'ev' | 'default') {
    this.activeProfile = profile;
    if (!this.ctx || !this.isRunning) return;
    const t = this.ctx.currentTime;

    // Direct oscillator wave shape mapping for custom resonance growls
    if (profile === 'v8') {
      // Audi V8 layout: Heavy exhaust saw pulse clusters
      if (this.subOsc) this.subOsc.type = 'sawtooth';
      if (this.lowOsc) this.lowOsc.type = 'sawtooth';
      if (this.midOsc) this.midOsc.type = 'sawtooth';
      if (this.turboOsc) this.turboOsc.type = 'triangle';
      if (this.shaper) this.shaper.curve = this.makeDistortionCurve(95); // Extremely aggressive throatiness
      if (this.highPassFilter) {
        this.highPassFilter.type = 'peaking';
        this.highPassFilter.frequency.setTargetAtTime(180, t, 0.05); // low exhaust backpressure peaks
        this.highPassFilter.gain.setTargetAtTime(9.0, t, 0.05);
        this.highPassFilter.Q.setTargetAtTime(2.2, t, 0.05);
      }
    } else if (profile === 'v6') {
      // Alfa Romeo Brera V6: Resonant high-rev metallic raspiness
      if (this.subOsc) this.subOsc.type = 'triangle';
      if (this.lowOsc) this.lowOsc.type = 'sawtooth';
      if (this.midOsc) this.midOsc.type = 'sawtooth'; // Searing metallic mid band
      if (this.turboOsc) this.turboOsc.type = 'sawtooth';
      if (this.shaper) this.shaper.curve = this.makeDistortionCurve(65); // Crispy bite
      if (this.highPassFilter) {
        this.highPassFilter.type = 'peaking';
        this.highPassFilter.frequency.setTargetAtTime(1480, t, 0.05); // High metallic piping resonance frequency
        this.highPassFilter.gain.setTargetAtTime(14.0, t, 0.05); // Huge singing metallic resonance boost
        this.highPassFilter.Q.setTargetAtTime(4.5, t, 0.05);
      }
    } else if (profile === 'ev') {
      // Quiet, pure mathematical EV electric sweep whine
      if (this.subOsc) this.subOsc.type = 'sine';
      if (this.lowOsc) this.lowOsc.type = 'sine';
      if (this.midOsc) this.midOsc.type = 'sine';
      if (this.turboOsc) this.turboOsc.type = 'sine';
      
      // Zero distortion curve
      const cleanCurve = new Float32Array(2);
      cleanCurve[0] = -1.0;
      cleanCurve[1] = 1.0;
      if (this.shaper) this.shaper.curve = cleanCurve;
      
      if (this.highPassFilter) {
        this.highPassFilter.type = 'lowpass';
        this.highPassFilter.frequency.setTargetAtTime(2500, t, 0.05);
        this.highPassFilter.Q.setTargetAtTime(0.8, t, 0.05);
      }
    } else {
      // Default Rally RX Formula turbo
      if (this.subOsc) this.subOsc.type = 'sine';
      if (this.lowOsc) this.lowOsc.type = 'sawtooth';
      if (this.midOsc) this.midOsc.type = 'triangle';
      if (this.turboOsc) this.turboOsc.type = 'sine';
      if (this.shaper) this.shaper.curve = this.makeDistortionCurve(50);
      if (this.highPassFilter) {
        this.highPassFilter.type = 'peaking';
        this.highPassFilter.frequency.setTargetAtTime(800, t, 0.05);
        this.highPassFilter.gain.setTargetAtTime(1.0, t, 0.05);
        this.highPassFilter.Q.setTargetAtTime(1.2, t, 0.05);
      }
    }
  }

  public getProfile() {
    return this.activeProfile;
  }

  public setRPM(rpm: number, maxRPM = 8000) {
    if (!this.ctx || !this.isRunning) return;

    this.currentRPM = rpm;
    const t = this.ctx.currentTime;
    const rpmPct = rpm / maxRPM;
    const isAccelerating = this.currentThrottle > 0.05;

    // Rapid off-throttle overrun crackle trigger:
    // If running at high speed and we fully lift off, automatically populate the exhaust with bubbling micro-pops
    if (!isAccelerating && rpm > 2600 && Math.random() < 0.22) {
      const now = Date.now();
      if (now - this.lastPopTime > 180) {
        this.playSinglePop(t + Math.random() * 0.03);
        this.lastPopTime = now;
      }
    }

    if (this.activeProfile === 'v8') {
      // --- AUDI 4.2L V8 THROATY COLD RUMBLE ACCELERATION SYNTHESIS ---
      // Real Audi V8 exhausts have immense asymmetric load thumping
      const baseFreq = 16.0 + (rpmPct * 78.0); // Super deep throb root

      // Sub-octave imbalances: cross-plane V8 bank rumble (1-8-4-3-6-5-7-2 layout causes deep 4.5Hz - 16Hz loping cycles)
      if (this.lfo && this.lfoGain) {
        this.lfo.frequency.setTargetAtTime(4.2 + (rpmPct * 12.0), t, 0.05);
        // Increases dramatically based on throttle combustion chambers load
        const dynamicImbalance = 0.45 + (this.currentThrottle * 0.35);
        this.lfoGain.gain.setTargetAtTime(dynamicImbalance, t, 0.05);
      }

      // Harmonic 1: 0.5x crankshaft - Heavy exhaust asymmetric pulses
      if (this.subOsc && this.subGain) {
        this.subOsc.frequency.setTargetAtTime(baseFreq * 0.5, t, 0.03);
        const subLevel = (isAccelerating ? 0.90 : 0.65) * (0.6 + rpmPct * 0.4);
        this.subGain.gain.setTargetAtTime(subLevel, t, 0.03);
      }

      // Harmonic 2: 2.0x crankshaft - Dominant split-bank low-order roar
      if (this.lowOsc && this.lowGain) {
        this.lowOsc.frequency.setTargetAtTime(baseFreq * 2.0, t, 0.03);
        const lowLevel = (isAccelerating ? 0.75 : 0.42) * (0.5 + rpmPct * 0.5);
        this.lowGain.gain.setTargetAtTime(lowLevel, t, 0.03);
      }

      // Harmonic 3: 4.0x crankshaft - Primary cylinder firing rate
      if (this.midOsc && this.midGain) {
        this.midOsc.frequency.setTargetAtTime(baseFreq * 4.0, t, 0.03);
        const midLevel = (isAccelerating ? 0.48 : 0.22) * (0.4 + rpmPct * 0.6);
        this.midGain.gain.setTargetAtTime(midLevel, t, 0.03);
      }

      // Harmonic 4: 8.0x crankshaft - High mechanical clatter & metallic cylinder ring
      if (this.turboOsc && this.turboGain) {
        // We use triangle for heavy load growl harmonics
        this.turboOsc.type = 'triangle';
        this.turboOsc.frequency.setTargetAtTime(baseFreq * 8.0, t, 0.04);
        const turboGrowlVolume = (isAccelerating ? 0.28 : 0.03) * (0.2 + rpmPct * 0.8);
        this.turboGain.gain.setTargetAtTime(turboGrowlVolume, t, 0.04);
      }

      // Muffler acoustics low-pass sweep: opens wide when exhaust pressure bursts
      if (this.filter) {
        const filterCutoff = 180 + (rpmPct * 1150) + (this.currentThrottle * 850);
        this.filter.frequency.setTargetAtTime(filterCutoff, t, 0.05);
        this.filter.Q.setTargetAtTime(2.6 + (this.currentThrottle * 2.2), t, 0.05);
      }

      // Secondary peak resonator: accentuates the deep throat 150 - 320 Hz growl of empty mufflers
      if (this.highPassFilter) {
        const resonancePeak = 140 + (rpmPct * 180);
        this.highPassFilter.frequency.setTargetAtTime(resonancePeak, t, 0.06);
        this.highPassFilter.gain.setTargetAtTime(isAccelerating ? 12.0 : 4.0, t, 0.06);
        this.highPassFilter.Q.setTargetAtTime(2.5, t, 0.06);
      }

      // Aggressive roaring volume factor
      if (this.engineGain) {
        const vol = isAccelerating 
          ? (0.48 + (this.currentThrottle * 0.72) + (rpmPct * 0.28)) 
          : (0.35 + (rpmPct * 0.22)); // High compression engine braking noise on decelerations
        this.engineGain.gain.setTargetAtTime(this.isMutedFlag ? 0 : vol, t, 0.04);
      }

    } else if (this.activeProfile === 'v6') {
      // --- ALFA ROMEO BRERA RASPY V6 SPORT ACCELERATION ---
      // Legendary exotic scream: high frequency metallic, crispy rasp
      const baseFreq = 22.0 + (rpmPct * 98.0); // Higher pitch screaming foundation

      // Balance crankshaft imbalance LFO to focus on tight, high-revving metallic roar
      if (this.lfo && this.lfoGain) {
        this.lfo.frequency.setTargetAtTime(32.0, t, 0.1);
        this.lfoGain.gain.setTargetAtTime(0.015, t, 0.1);
      }

      // Harmonic 1: 1.5x crankshaft - Uneven manifold cylinder splits
      if (this.subOsc && this.subGain) {
        this.subOsc.frequency.setTargetAtTime(baseFreq * 1.5, t, 0.03);
        const subLevel = (isAccelerating ? 0.55 : 0.32) * (0.7 + rpmPct * 0.3);
        this.subGain.gain.setTargetAtTime(subLevel, t, 0.03);
      }

      // Harmonic 2: 3.0x crankshaft - Main dominant firing pulse frequency (6 cylinders, 3 pulses per rev)
      if (this.lowOsc && this.lowGain) {
        this.lowOsc.frequency.setTargetAtTime(baseFreq * 3.0, t, 0.03);
        const lowLevel = (isAccelerating ? 0.85 : 0.45) * (0.6 + rpmPct * 0.4);
        this.lowGain.gain.setTargetAtTime(lowLevel, t, 0.03);
      }

      // Harmonic 3: 6.0x crankshaft - Intense secondary upper range scream
      if (this.midOsc && this.midGain) {
        this.midOsc.frequency.setTargetAtTime(baseFreq * 6.0, t, 0.03);
        const midLevel = (isAccelerating ? 0.58 : 0.18) * (0.4 + rpmPct * 0.6);
        this.midGain.gain.setTargetAtTime(midLevel, t, 0.03);
      }

      // Harmonic 4: 9.0x crankshaft - Manifold piping/valves high-pitch metallic singing
      if (this.turboOsc && this.turboGain) {
        this.turboOsc.type = 'sawtooth'; // Extremely crispy metal teeth
        this.turboOsc.frequency.setTargetAtTime(baseFreq * 9.0, t, 0.03);
        // Howls aggressively as RPM flies towards the redline
        const extremeHighScream = (isAccelerating ? 0.32 : 0.02) * (rpmPct * rpmPct);
        this.turboGain.gain.setTargetAtTime(extremeHighScream, t, 0.03);
      }

      // Dynamic lowpass sweeps: opens extremely wide up to 4kHz in the high rev range
      if (this.filter) {
        const filterCutoff = 650 + (rpmPct * 2900) + (this.currentThrottle * 1250);
        this.filter.frequency.setTargetAtTime(filterCutoff, t, 0.04);
        this.filter.Q.setTargetAtTime(1.8 + (rpmPct * 1.2), t, 0.04);
      }

      // Secondary peaking resonator: Locked around 1350hHz - 1650Hz to emulate Alfa Busso metallic rasp!
      if (this.highPassFilter) {
        const metallicPipePeak = 1380 + (rpmPct * 250);
        this.highPassFilter.frequency.setTargetAtTime(metallicPipePeak, t, 0.04);
        this.highPassFilter.gain.setTargetAtTime(isAccelerating ? 15.0 : 3.0, t, 0.04); // Searing resonance under load
        this.highPassFilter.Q.setTargetAtTime(5.5, t, 0.04);
      }

      if (this.engineGain) {
        const vol = isAccelerating
          ? (0.42 + (this.currentThrottle * 0.68) + (rpmPct * 0.35))
          : (0.28 + (rpmPct * 0.18));
        this.engineGain.gain.setTargetAtTime(this.isMutedFlag ? 0 : vol, t, 0.03);
      }

    } else if (this.activeProfile === 'ev') {
      // --- HYPERCAR EV FUTURISTIC SONIC SPEED WARP ---
      const baseFreq = 50.0 + (rpmPct * 300.0);

      if (this.lfo && this.lfoGain) {
        this.lfoGain.gain.setTargetAtTime(0.0, t, 0.1);
      }

      // Deep electric sub thrum (stators humming)
      if (this.subOsc && this.subGain) {
        this.subOsc.frequency.setTargetAtTime(baseFreq, t, 0.04);
        const subLevel = 0.15 * (0.1 + this.currentThrottle * 0.9);
        this.subGain.gain.setTargetAtTime(subLevel, t, 0.04);
      }

      // Intense clean high rise whine (up to 4.5kHz)
      if (this.lowOsc && this.lowGain) {
        const primaryWhine = 150.0 + (rpmPct * 2800.0);
        this.lowOsc.frequency.setTargetAtTime(primaryWhine, t, 0.03);
        const lowLevel = 0.02 + (this.currentThrottle * 0.12) * (0.2 + rpmPct * 0.8);
        this.lowGain.gain.setTargetAtTime(lowLevel, t, 0.03);
      }

      // Harmonic electric magnet warp pulse
      if (this.midOsc && this.midGain) {
        const harmonicBeam = 300.0 + (rpmPct * 4800.0);
        this.midOsc.frequency.setTargetAtTime(harmonicBeam, t, 0.03);
        const midLevel = (0.01 + this.currentThrottle * 0.06) * (0.2 + rpmPct * 0.8);
        this.midGain.gain.setTargetAtTime(midLevel, t, 0.03);
      }

      if (this.turboOsc && this.turboGain) {
        this.turboGain.gain.setTargetAtTime(0.0, t, 0.1);
      }

      if (this.filter) {
        this.filter.frequency.setTargetAtTime(3600, t, 0.1);
        this.filter.Q.setTargetAtTime(1.0, t, 0.1);
      }

      if (this.engineGain) {
        const vol = 0.14 + (this.currentThrottle * 0.24) + (rpmPct * 0.14);
        this.engineGain.gain.setTargetAtTime(this.isMutedFlag ? 0 : vol, t, 0.04);
      }

    } else {
      // --- STANDARD HIGH SPEC RALLY RX TURBO ---
      const baseFreq = 22 + (rpmPct * 110.0);

      if (this.lfo && this.lfoGain) {
        this.lfoGain.gain.setTargetAtTime(0.0, t, 0.1);
      }

      if (this.subOsc && this.subGain) {
        this.subOsc.frequency.setTargetAtTime(baseFreq, t, 0.05);
        this.subGain.gain.setTargetAtTime(0.6, t, 0.05);
      }
      if (this.lowOsc && this.lowGain) {
        this.lowOsc.frequency.setTargetAtTime(baseFreq * 2.5, t, 0.05);
        this.lowGain.gain.setTargetAtTime(0.35, t, 0.05);
      }
      if (this.midOsc && this.midGain) {
        this.midOsc.frequency.setTargetAtTime(baseFreq * 4.0, t, 0.05);
        this.midGain.gain.setTargetAtTime(0.15, t, 0.05);
      }

      // High Whistling blow-off turbocharger
      if (this.turboOsc && this.turboGain) {
        this.turboOsc.type = 'sine';
        const turboPitch = 1500 + (rpmPct * 2500);
        this.turboOsc.frequency.setTargetAtTime(turboPitch, t, 0.1);
        const turboVolume = Math.max(0, (this.currentThrottle - 0.25) * 0.06 * rpmPct);
        this.turboGain.gain.setTargetAtTime(turboVolume, t, 0.15);
      }

      if (this.filter) {
        const filterFreq = 320 + (rpmPct * 1550) + (this.currentThrottle * 550);
        this.filter.frequency.setTargetAtTime(filterFreq, t, 0.08);
        this.filter.Q.setTargetAtTime(2.0, t, 0.08);
      }

      if (this.engineGain) {
        const scaleVolume = 0.22 + (this.currentThrottle * 0.38) + (rpmPct * 0.4);
        this.engineGain.gain.setTargetAtTime(this.isMutedFlag ? 0 : scaleVolume, t, 0.05);
      }
    }
  }

  public setThrottle(throttle: number) {
    if (this.currentThrottle > 0.55 && throttle === 0 && this.currentRPM > 3800) {
      const now = Date.now();
      // Backfire triggers with random delays under decelerations on lifting throttle
      if (now - this.lastPopTime > 1600 && this.activeProfile !== 'ev') {
        this.triggerBackfire();
        this.lastPopTime = now;
      }
    }
    this.currentThrottle = throttle;
  }

  public triggerBackfire() {
    if (!this.ctx || this.isMutedFlag || !this.isRunning) return;
    const t = this.ctx.currentTime;
    
    // Play between 2 to 4 rapid anti-lag combustion pops
    const isV8 = this.activeProfile === 'v8';
    const numPops = isV8 ? Math.floor(Math.random() * 3) + 2 : Math.floor(Math.random() * 2) + 1;
    
    for (let i = 0; i < numPops; i++) {
      const delay = i * (0.07 + Math.random() * 0.10);
      this.playSinglePop(t + delay);
    }
  }

  private playSinglePop(time: number) {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const bandpass = this.ctx.createBiquadFilter();

      // Exhaust overrun pop is modeled by a massive low-frequency ignition thud mixed with sawtooth grit
      const isV8 = this.activeProfile === 'v8';
      osc.type = Math.random() > 0.4 ? 'sawtooth' : 'triangle';
      
      const startFreq = isV8 ? (75 + Math.random() * 60) : (110 + Math.random() * 80);
      osc.frequency.setValueAtTime(startFreq, time);
      osc.frequency.exponentialRampToValueAtTime(30, time + 0.08);

      bandpass.type = 'bandpass';
      const bpFreq = isV8 ? (160 + Math.random() * 180) : (260 + Math.random() * 240);
      bandpass.frequency.setValueAtTime(bpFreq, time);
      bandpass.Q.setValueAtTime(isV8 ? 2.5 : 4.0, time);

      // Rapid envelope crackle spikes
      gain.gain.setValueAtTime(0.0, time);
      gain.gain.linearRampToValueAtTime(isV8 ? 0.22 : 0.16, time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

      osc.connect(bandpass);
      bandpass.connect(gain);
      gain.connect(this.mainGain || this.ctx.destination);

      osc.start(time);
      osc.stop(time + 0.12);
    } catch(e) {
      // Ignored
    }
  }

  public setDrift(slipAmount: number) {
    if (!this.ctx || !this.isRunning) return;

    this.currentSqueal = slipAmount; // value between 0 and 1
    const t = this.ctx.currentTime;

    if (this.squealGain && this.squealOsc) {
      // Squeal activates heavily above a certain slip threshold
      const squealIntensity = Math.max(0, slipAmount - 0.15) * 1.25;
      const targetGain = Math.min(0.08, squealIntensity * 0.08); // cap squeal volume
      this.squealGain.gain.setTargetAtTime(this.isMutedFlag ? 0 : targetGain, t, 0.05);

      if (this.squealFilter) {
        // Change feedback pitch of squeal under speeds/skids
        const filterCenter = 1000 + (slipAmount * 1200);
        this.squealFilter.frequency.setTargetAtTime(filterCenter, t, 0.05);
      }
    }
  }

  public playCheckpointSound() {
    if (!this.ctx || this.isMutedFlag) return;
    
    try {
      const t = this.ctx.currentTime;
      // Synthesize a brief dual-tone arcade beep
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();

      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(523.25, t); // C5
      osc1.frequency.setValueAtTime(659.25, t + 0.08); // E5
      osc1.frequency.setValueAtTime(783.99, t + 0.16); // G5
      osc1.frequency.setValueAtTime(1046.50, t + 0.24); // C6

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1046.50, t);
      
      gainNode.gain.setValueAtTime(0.12, t);
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + 0.5);
      osc2.stop(t + 0.5);
    } catch (e) {
      console.warn("Could not play checkpoint chime", e);
    }
  }

  public playCrashSound(impactForce: number) {
    if (!this.ctx || this.isMutedFlag) return;

    try {
      const t = this.ctx.currentTime;
      const noise = this.ctx.createOscillator(); // Or filtered noise source
      const filter = this.ctx.createBiquadFilter();
      const gainNode = this.ctx.createGain();

      noise.type = 'sawtooth';
      // Low thud frequency for crash
      noise.frequency.setValueAtTime(100, t);
      noise.frequency.exponentialRampToValueAtTime(10, t + 0.3);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300, t);

      const vol = Math.min(0.2, (impactForce / 100) * 0.15);
      gainNode.gain.setValueAtTime(vol, t);
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

      noise.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      noise.start(t);
      noise.stop(t + 0.45);
    } catch (e) {
      // Ignored
    }
  }
}

export const audioEngine = new CarAudioEngine();
